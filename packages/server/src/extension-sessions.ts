import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { getLocale } from '@css-tuner/protocol';
import type { Batch } from './applier';
import { Controller } from './controller';
import { ExtensionTransport } from './extension-transport';
import { Site, type Hub } from './hub';
import { projectDir } from './paths';
import { summarize, type RpcMethods } from './rpc';
import type { Settings } from './settings';
import { codexLink, openCodexLink, THREAD_ID } from './system';

interface ActiveSession {
  transport: ExtensionTransport;
  controller: Controller;
  site: Site;
  url: URL;
  chat: string;
  expires: NodeJS.Timeout;
}

function localPage(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password) {
    throw new Error('Use an HTTP development page on localhost or 127.0.0.1.');
  }
  return url;
}

export function existingChat(raw: string): string {
  const match = /^codex:\/\/threads\/([^/?#]+)\/?$/.exec(raw);
  if (!match || !THREAD_ID.test(match[1])) throw new Error('Use the deep link copied from an existing local Codex chat.');
  return match[1].toLowerCase();
}

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export function extensionDraft(batch: Pick<Batch, 'id' | 'prompt'>, session: string, cliPath: string, root: string, short = false, data?: string): string {
  const dataEnv = data ? `CSS_TUNER_EXTENSION_DATA=${shellQuote(data)} ` : '';
  const cli = `${dataEnv}${shellQuote(process.execPath)} ${shellQuote(cliPath)} extension`;
  const target = `--session ${shellQuote(session)} --batch ${shellQuote(batch.id)}`;
  const zh = getLocale() === 'zh-CN';
  const project = zh ? `只修改这个项目目录中的源码：${root}` : `Edit source files only in this project directory: ${root}`;
  const verify = `${cli} verify ${target}`;
  if (short) {
    const handoff = `${cli} handoff ${target}`;
    return zh
      ? `${project}\n\n请读取 CSS Tuner 批次 ${batch.id} 并按输出修改源码。\n\n${handoff}\n\n改完后核对。\n\n${verify}`
      : `${project}\n\nRead CSS Tuner batch ${batch.id} and apply its instructions.\n\n${handoff}\n\nThen verify the changes.\n\n${verify}`;
  }
  return `${project}\n\n${batch.prompt}\n\n${zh ? '改完后核对这个批次。' : 'After editing the code, verify this batch.'}\n\n${verify}`;
}

export class ExtensionSessions {
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly roots = new Set<string>();
  private disposed = false;

  constructor(private readonly deps: { data: string; hub: Hub; settings: Settings; log: (message: string) => void }) {}

  async open({ root: input, url: raw, chat: link, cliPath }: RpcMethods['extensionOpen']['p']): Promise<RpcMethods['extensionOpen']['r']> {
    const url = localPage(raw);
    const thread = existingChat(link);
    const chat = `codex://threads/${thread}`;
    if (process.platform !== 'darwin') throw new Error('This preview requires Codex desktop on macOS.');
    if (!isAbsolute(cliPath)) throw new Error('Expected the absolute path to the companion CLI.');
    const root = realpathSync(input);
    if (!statSync(root).isDirectory()) throw new Error('The project root must be a directory.');
    if (this.disposed || this.roots.has(root)) throw new Error('Close the current extension session for this project before opening another.');
    this.roots.add(root);
    let transport: ExtensionTransport | undefined;
    try {
      let active: ActiveSession | undefined;
      transport = await ExtensionTransport.listen({
        pageOrigin: url.origin,
        chat,
        onBridge: (ws) => active?.site.session.attach(ws),
        onPanel: (ws) => active?.controller.attachPanel(ws),
      });
      if (this.disposed) throw new Error('The companion is stopping.');
      const session = transport.sessionId;
      const site = new Site({ key: session, kind: 'proxy', project: root, target: url.origin, port: transport.port, token: '' }, this.deps.log, url.origin);
      const controller = new Controller({
        ...this.deps,
        root,
        data: projectDir(this.deps.data, root),
        extension: {
          session,
          deliver: async (batch) => {
            const prompt = extensionDraft(batch, session, cliPath, root, false, this.deps.data);
            const uri = codexLink(thread, prompt) ?? codexLink(thread, extensionDraft(batch, session, cliPath, root, true, this.deps.data));
            const zh = getLocale() === 'zh-CN';
            if (uri && (await openCodexLink(uri))) {
              controller.notify('info', zh ? '已请求打开绑定的 Codex 对话。请检查草稿后发送。' : 'Requested the bound Codex chat. Review the draft and send it there.');
              return;
            }
            controller.notify('warn', zh ? '无法打开绑定的 Codex 对话。可重试此批次或复制改动说明。' : 'Could not open the bound Codex chat. Retry this batch or copy its instructions.');
            controller.showPrompt(prompt, batch.mode);
          },
        },
      });
      controller.project.register(url.origin, root);
      controller.adopt(site);
      const expires = setTimeout(() => {
        if (!transport?.paired) void this.close(session);
      }, Math.max(0, transport.pairingExpiresAt - Date.now()));
      expires.unref();
      active = { transport, controller, site, url, chat, expires };
      this.sessions.set(session, active);
      return { session, url: url.href, port: transport.port, pairingCode: transport.pairingCode, expiresAt: transport.pairingExpiresAt, chat };
    } catch (error) {
      this.roots.delete(root);
      await transport?.close();
      throw error;
    }
  }

  private requireSession(session: string): ActiveSession {
    const active = this.sessions.get(session);
    if (!active) throw new Error('Unknown extension session. Start and pair a session first.');
    return active;
  }

  private requireBatch(session: string, id: string) {
    const { controller } = this.requireSession(session);
    const batch = controller.applier.batch(id);
    if (!batch || batch.session !== session) throw new Error('This batch does not belong to the extension session.');
    return { controller, batch };
  }

  status(session: string): RpcMethods['extensionStatus']['r'] {
    const { controller, site, url, chat, transport } = this.requireSession(session);
    return { session, project: controller.root, url: controller.page?.url ?? url.href, chat, connected: site.session.connected, paired: transport.paired };
  }

  handoff(session: string, id: string): RpcMethods['extensionHandoff']['r'] {
    const { controller, batch } = this.requireBatch(session, id);
    const { prompt, ...meta } = batch;
    return { project: controller.root, batch: meta, prompt, changes: this.changes(controller, batch) };
  }

  async verify(session: string, id: string, waitMs = 6000): Promise<RpcMethods['extensionVerify']['r']> {
    const { controller, batch } = this.requireBatch(session, id);
    if (controller.session?.connected) await controller.applier.verify(Math.min(30000, Math.max(500, waitMs)), batch.ids);
    return {
      project: controller.root,
      batch: id,
      connected: controller.session?.connected ?? false,
      page: controller.page?.url ?? null,
      changes: this.changes(controller, batch),
    };
  }

  private changes(controller: Controller, batch: Batch) {
    return batch.ids.flatMap((id) => {
      const record = controller.journal.get(id);
      return record ? [summarize(record)] : [];
    });
  }

  get active(): boolean {
    return [...this.sessions.values()].some(({ site }) => site.session.connected);
  }

  async close(session: string): Promise<RpcMethods['extensionClose']['r']> {
    const active = this.sessions.get(session);
    if (!active) return { closed: false };
    this.sessions.delete(session);
    clearTimeout(active.expires);
    try {
      await active.site.session.call('clearAllPreviews', {}, 1000).catch(() => undefined);
      active.site.session.dispose();
      active.controller.dispose();
      await active.transport.close();
    } finally {
      this.roots.delete(active.controller.root);
    }
    return { closed: true };
  }

  async dispose() {
    this.disposed = true;
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }
}
