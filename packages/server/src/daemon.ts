import { randomBytes, timingSafeEqual } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { getLocale, setLocale, t, type ChangeStatus } from '@css-tuner/protocol';
import { disposeCompletions } from './completions';
import { Controller } from './controller';
import { isAlive, readInfo } from './daemon-info';
import { Hub, type Site } from './hub';
import { bundleDir, dataDir, projectDir } from './paths';
import { summarize, type DaemonInfo, type RpcMethod, type RpcMethods, type SiteSummary } from './rpc';
import { Settings, type SettingsData } from './settings';
import { JsonStore } from './store';
import { VERSION } from './version';

/** 没有页面连着、也没有 Codex 来调用，这么久以后退出 */
const IDLE_MS = 30 * 60 * 1000;

/**
 * 同一个数据目录只跑一个后台服务：锁文件里是持有者的进程号，持有者已经不在了就接过来。
 * 持有者还在但没有它的 daemon.json：它正在启动或者正在退出（还占着站点的端口），等一会儿再看
 */
async function acquireLock(data: string): Promise<boolean> {
  const lock = join(data, 'daemon.lock');
  const deadline = Date.now() + 8000;
  for (;;) {
    try {
      const fd = openSync(lock, 'wx', 0o600);
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    let pid = 0;
    try {
      pid = Number.parseInt(readFileSync(lock, 'utf8'), 10);
    } catch {
      continue;
    }
    if (!pid || pid === process.pid || !isAlive(pid)) {
      rmSync(lock, { force: true });
      continue;
    }
    if (readInfo(data)?.pid === pid || Date.now() > deadline) return false;
    await sleep(100);
  }
}

function readBody(req: IncomingMessage, limit = 1 << 20): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function reachable(url: URL): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2500) });
    await res.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 后台服务：本地站点（代理、静态服务）和各项目的调参状态都在这里，
 * 每个 Codex 对话起的 MCP 前端都经本机 RPC 来调用它，页面和面板一直连着它
 */
export class Daemon {
  readonly data = dataDir();
  readonly settings: Settings;
  readonly hub: Hub;
  private readonly controllers = new Map<string, Controller>();
  private readonly token = randomBytes(24).toString('hex');
  private rpcServer: Server | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private lastCall = Date.now();
  private browserLang: string | null = null;
  private stopping = false;

  constructor() {
    mkdirSync(this.data, { recursive: true, mode: 0o700 });
    this.settings = new Settings(new JsonStore(join(this.data, 'settings.json')));
    setLocale(this.settings.locale());
    this.hub = new Hub({
      data: this.data,
      publicDir: join(bundleDir(), 'public'),
      version: VERSION,
      log: (m) => this.log(m),
      onPanel: (site, ws) => this.controllerFor(site.project, site).attachPanel(ws),
    });
    this.hub.onSite((site) => this.siteChanged(site));
    this.settings.onChange((key) => {
      if (key === 'language') this.relocalize();
    });
  }

  log(msg: string) {
    console.error(`[${new Date().toISOString()}] ${msg}`);
  }

  async start(): Promise<boolean> {
    if (!(await acquireLock(this.data))) {
      this.log('another CSS Tuner service is running');
      return false;
    }
    const port = await this.listenRpc();
    const info: DaemonInfo = { pid: process.pid, port, token: this.token, version: VERSION, startedAt: Date.now() };
    writeFileSync(join(this.data, 'daemon.json'), JSON.stringify(info), { mode: 0o600 });
    this.log(`CSS Tuner ${VERSION} service on 127.0.0.1:${port} (pid ${process.pid}, data ${this.data})`);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => void this.stop());
    process.on('uncaughtException', (e) => this.log(`uncaught: ${e.stack ?? e}`));
    process.on('unhandledRejection', (e) => this.log(`unhandled: ${(e as Error)?.stack ?? e}`));
    await this.hub.restore();
    this.idleTimer = setInterval(() => this.checkIdle(), 60 * 1000);
    return true;
  }

  private listenRpc(): Promise<number> {
    const server = createServer((req, res) => void this.serveRpc(req, res));
    this.rpcServer = server;
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        resolve(addr && typeof addr === 'object' ? addr.port : 0);
      });
    });
  }

  private async serveRpc(req: IncomingMessage, res: ServerResponse) {
    const addr = this.rpcServer?.address();
    const port = addr && typeof addr === 'object' ? addr.port : 0;
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    };
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(403, { ok: false, error: 'forbidden host' });
    if (req.method !== 'POST' || req.url !== '/rpc') return reply(404, { ok: false, error: 'not found' });
    if (this.stopping) return reply(503, { ok: false, error: 'stopping' });
    const auth = String(req.headers.authorization ?? '');
    const want = `Bearer ${this.token}`;
    if (auth.length !== want.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(want))) return reply(401, { ok: false, error: 'unauthorized' });
    let msg: { method: RpcMethod; params?: unknown };
    try {
      msg = JSON.parse(await readBody(req));
    } catch (e) {
      return reply(400, { ok: false, error: (e as Error).message });
    }
    this.lastCall = Date.now();
    try {
      const result = await this.call(msg.method, (msg.params ?? {}) as never);
      reply(200, { ok: true, result });
    } catch (e) {
      reply(200, { ok: false, error: (e as Error).message });
    }
  }

  async call<M extends RpcMethod>(method: M, p: RpcMethods[M]['p']): Promise<RpcMethods[M]['r']> {
    const handler = this.handlers[method] as unknown as (p: RpcMethods[M]['p']) => Promise<RpcMethods[M]['r']> | RpcMethods[M]['r'];
    if (!handler) throw new Error(`unknown method ${method}`);
    return handler(p);
  }

  /* ---------- 项目 ---------- */

  controllerFor(root: string, site?: Site): Controller {
    const abs = resolve(root);
    let c = this.controllers.get(abs);
    if (!c) {
      c = new Controller({
        root: abs,
        data: projectDir(this.data, abs),
        settings: this.settings,
        hub: this.hub,
        log: (m) => this.log(m),
        onBrowserLang: (lang) => {
          this.browserLang = lang;
          this.relocalize();
        },
      });
      this.controllers.set(abs, c);
    }
    if (site) c.adopt(site);
    return c;
  }

  /** 没说哪个项目时：最近有动静的那个。说了项目时，调用工具的 Codex 对话记给它 */
  private pick(root?: string, thread?: string): Controller {
    if (root) {
      const c = this.controllerFor(root);
      c.useThread(thread);
      return c;
    }
    const list = [...this.controllers.values()].sort((a, b) => b.lastActive - a.lastActive);
    if (!list.length) throw new Error(t('mcp.noProject'));
    return list[0];
  }

  /** 站点换了项目或者关掉了：从别的项目那里摘掉 */
  private siteChanged(site: Site) {
    const live = this.hub.get(site.key) === site;
    for (const [root, c] of this.controllers) if (!live || root !== site.project) c.release(site);
    if (live) this.controllerFor(site.project, site);
  }

  private relocalize() {
    const next = this.settings.locale(this.browserLang);
    if (next === getLocale()) return;
    setLocale(next);
    for (const c of this.controllers.values()) c.applyLocale(next);
  }

  private siteSummary(site: Site): SiteSummary {
    return {
      url: `${site.origin}/`,
      target: site.target?.origin ?? null,
      root: site.root,
      kind: site.kind,
      connected: site.session.connected,
    };
  }

  private readonly handlers: { [M in RpcMethod]: (p: RpcMethods[M]['p']) => Promise<RpcMethods[M]['r']> | RpcMethods[M]['r'] } = {
    ping: () => ({ version: VERSION, pid: process.pid, projects: [...this.controllers.keys()] }),

    open: async ({ root, url, thread }) => {
      if (!root) throw new Error(t('mcp.rootRequired'));
      const c = this.pick(root, thread);
      c.lastActive = Date.now();
      const connected = c.session?.connected ?? false;
      const { url: local, site } = await c.openPage(url, { navigate: connected });
      const target = site.target;
      return {
        project: c.root,
        url: local,
        target: target ? site.toTarget(local) : null,
        kind: site.kind,
        reachable: target ? await reachable(target) : null,
        connected: site.session.connected,
      };
    },

    status: async ({ root, waitMs, thread }) => {
      const c = this.pick(root, thread);
      const deadline = Date.now() + Math.min(Math.max(waitMs ?? 0, 0), 60000);
      while (!c.session?.connected && Date.now() < deadline) await sleep(250);
      const counts: Partial<Record<ChangeStatus, number>> = {};
      for (const r of c.journal.all()) counts[r.status] = (counts[r.status] ?? 0) + 1;
      const page = c.page && c.site ? { url: c.page.url, target: c.site.toTarget(c.page.url), title: c.page.title } : null;
      return {
        project: c.root,
        connection: c.state.connection,
        page,
        sites: c.ownSites().map((s) => this.siteSummary(s)),
        counts,
        notice: c.state.notice?.text ?? null,
      };
    },

    handoff: async ({ root, batch, pending, thread }) => {
      const c = this.pick(root, thread);
      c.lastActive = Date.now();
      const b = await c.takeHandoff(batch, pending ?? false);
      if (batch && !b) throw new Error(t('mcp.noBatch', { batch }));
      const ids = new Set(b?.ids ?? []);
      const changes = b ? c.journal.all().filter((r) => ids.has(r.id)).map(summarize) : c.journal.waiting().map(summarize);
      const { prompt, ...meta } = b ?? { prompt: null };
      return { project: c.root, batch: b ? (meta as Omit<NonNullable<typeof b>, 'prompt'>) : null, prompt, changes };
    },

    verify: async ({ root, waitMs, thread }) => {
      const c = this.pick(root, thread);
      c.lastActive = Date.now();
      const wait = Math.min(Math.max(waitMs ?? 6000, 500), 30000);
      const ids = c.session?.connected ? await c.applier.verify(wait) : c.journal.waiting().map((r) => r.id);
      const summaries = (list: string[]) =>
        list.flatMap((id) => {
          const r = c.journal.get(id);
          return r ? [summarize(r)] : [];
        });
      const changes = summaries(ids);
      const last = changes.length ? undefined : c.applier.batches()[0];
      return {
        project: c.root,
        connected: c.session?.connected ?? false,
        page: c.page && c.site ? c.site.toTarget(c.page.url) : null,
        changes,
        ...(last ? { latest: { batch: last.id, changes: summaries(last.ids) } } : {}),
      };
    },

    changes: ({ root, status, thread }) => {
      const c = this.pick(root, thread);
      return { project: c.root, changes: c.journal.all().filter((r) => !status || r.status === status).map(summarize) };
    },

    close: async ({ root, all }) => {
      const sites = all ? this.hub.list() : this.pick(root).ownSites();
      for (const s of sites) await this.hub.close(s);
      return { closed: sites.map((s) => s.key) };
    },

    settings: ({ set }) => {
      for (const [k, v] of Object.entries(set ?? {})) this.settings.set(k as keyof SettingsData, v as never);
      return this.settings.all();
    },

    shutdown: () => {
      setTimeout(() => void this.stop(), 50);
      return true;
    },
  };

  /* ---------- 退出 ---------- */

  private checkIdle() {
    const now = Date.now();
    if (this.hub.active() > 0) return;
    const recent = Math.max(this.lastCall, ...[...this.controllers.values()].map((c) => c.lastActive));
    if (now - recent > IDLE_MS) {
      this.log('idle, exiting');
      void this.stop();
    }
  }

  /** 先撤掉 daemon.json、不再接新的调用（别的对话会另起一个，等这边放掉锁和端口），再关站点 */
  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    if (this.idleTimer) clearInterval(this.idleTimer);
    if (readInfo(this.data)?.pid === process.pid) rmSync(join(this.data, 'daemon.json'), { force: true });
    this.rpcServer?.close();
    this.rpcServer?.closeIdleConnections();
    for (const c of this.controllers.values()) c.dispose();
    await this.hub.dispose();
    disposeCompletions();
    const lock = join(this.data, 'daemon.lock');
    try {
      if (Number.parseInt(readFileSync(lock, 'utf8'), 10) === process.pid) rmSync(lock, { force: true });
    } catch {
      /* 锁文件已经没了 */
    }
    setTimeout(() => process.exit(0), 100).unref();
  }
}
