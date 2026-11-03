import * as vscode from 'vscode';
import { getLocale, t, type MsgKey } from '@css-tuner/protocol';
import { BROWSER_COMMANDS, type BrowserAdapter } from './browser';
import type { BridgeServer } from './server';
import { PageSession } from './session';
import type { StaticServer } from './static';

export interface CheckItem {
  name: string;
  ok: boolean;
  /** 必需项失败时调参功能不可用；可选项失败只影响部分体验 */
  required: boolean;
  detail?: string;
  /** 检查的是哪条内置浏览器命令 */
  command?: string;
}

const REQUIRED = ['open', 'exec', 'cdp', 'tabs'] as const;
const OPTIONAL: Array<{ key: keyof typeof BROWSER_COMMANDS; effect: MsgKey }> = [
  { key: 'navigate', effect: 'check.effect.navigate' },
  { key: 'reload', effect: 'check.effect.reload' },
  { key: 'getUrl', effect: 'check.effect.getUrl' },
  { key: 'focus', effect: 'check.effect.focus' },
];
const CHAT = ['workbench.action.chat.open', 'composer.createNew'];
/** 和 media/selfcheck/index.html 的 <title> 一致，检查完按标题关掉标签页 */
const PAGE_TITLE = 'CSS Tuner Self-check';

/** 内部命令还在不在：启动时跑，不打开任何页面 */
export async function commandCheck(): Promise<CheckItem[]> {
  const all = new Set(await vscode.commands.getCommands(true));
  const named = (cmd: string) => ({ name: t('check.browserCommand', { cmd }), command: cmd });
  return [
    ...REQUIRED.map((k) => ({ ...named(BROWSER_COMMANDS[k]), ok: all.has(BROWSER_COMMANDS[k]), required: true })),
    ...OPTIONAL.map(({ key, effect }) => {
      const ok = all.has(BROWSER_COMMANDS[key]) || (key === 'focus' && all.has(BROWSER_COMMANDS.select));
      return { ...named(BROWSER_COMMANDS[key]), ok, required: false, detail: ok ? undefined : t(effect) };
    }),
    {
      name: t('check.prefill'),
      ok: CHAT.some((c) => all.has(c)),
      required: false,
      detail: CHAT.some((c) => all.has(c)) ? undefined : t('check.prefillMissing'),
    },
  ];
}

export interface LiveDeps {
  browser: BrowserAdapter;
  server: BridgeServer;
  statics: StaticServer;
  bundle: string;
  /** 自检页所在目录 */
  root: string;
  log: (msg: string) => void;
}

/** 完整自检：新开一个标签页打开内置测试页，走一遍注入、连接、选中、预览、刷新后重连，最后关掉标签页 */
export async function liveCheck(d: LiveDeps): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  const step = async <T>(name: string, run: () => Promise<T>, pass: (v: T) => boolean, note?: (v: T) => string): Promise<T | null> => {
    const t0 = Date.now();
    try {
      const v = await run();
      const ok = pass(v);
      items.push({ name, ok, required: true, detail: `${Date.now() - t0}ms${note ? `${t('common.comma')}${note(v)}` : ''}` });
      return ok ? v : null;
    } catch (e) {
      items.push({ name, ok: false, required: true, detail: (e as Error).message });
      return null;
    }
  };

  const origin = await d.statics.serve(d.root);
  await d.server.start();
  const browserId = d.browser.newId();
  const session = new PageSession(browserId, d.browser, d.server, d.bundle, d.log);
  try {
    const href = await step(
      t('check.openTab'),
      async () => {
        await d.browser.open(`${origin}/index.html?lang=${getLocale()}`, browserId);
        return d.browser.waitReady(browserId, 15000);
      },
      (h) => !!h && !h.startsWith('chrome-error://'),
    );
    if (!href) return items;
    if (!(await step(t('check.inject'), () => session.inject().then(() => true), (v) => v))) return items;
    if (!(await step(t('check.connect'), () => session.waitConnected(8000), (v) => v, () => (session.mode === 'ws' ? 'WebSocket' : t('check.channelExec'))))) return items;

    const el = await step(t('check.select'), () => session.call('select', { selector: '#probe' }), (s) => !!s?.rules.some((r) => r.selector === '.probe'));
    const rule = el?.rules.find((r) => r.selector === '.probe');
    if (!el || !rule) return items;
    await step(
      t('check.preview'),
      () => session.call('preview', { id: 'selfcheck', target: { kind: 'rule', rule, uid: el.uid }, decls: { 'padding-left': '21px' } }),
      (r) => r.computed['padding-left'] === '21px',
    );
    await step(
      t('check.clearPreview'),
      async () => {
        await session.call('clearPreview', { id: 'selfcheck' });
        return session.call('snapshot', {});
      },
      (s) => s?.computed['padding-left'] === '12px',
    );
    await step(
      t('check.reinject'),
      () =>
        new Promise<boolean>((resolve, reject) => {
          const timer = setTimeout(() => {
            sub.dispose();
            resolve(false);
          }, 10000);
          const sub = session.onEvent((ev) => {
            if (ev.t !== 'hello') return;
            clearTimeout(timer);
            sub.dispose();
            resolve(true);
          });
          d.browser.reload(browserId).catch((e) => {
            clearTimeout(timer);
            sub.dispose();
            reject(e);
          });
        }),
      (v) => v,
    );
    return items;
  } finally {
    await session.detach().catch(() => undefined);
    session.dispose();
    await closeTab();
  }
}

async function closeTab() {
  for (const g of vscode.window.tabGroups.all) {
    for (const tab of g.tabs) {
      if (tab.label === PAGE_TITLE || tab.label.startsWith(`${PAGE_TITLE} `)) await vscode.window.tabGroups.close(tab).then(undefined, () => undefined);
    }
  }
}

export function summarizeCheck(items: CheckItem[]): { ok: boolean; degraded: boolean; text: string } {
  const failed = items.filter((i) => !i.ok);
  const ok = !failed.some((i) => i.required);
  const lines = items.map((i) => `${i.ok ? '✓' : i.required ? '✗' : '!'} ${i.name}${i.detail ? t('common.paren', { text: i.detail }) : ''}`);
  return { ok, degraded: ok && failed.length > 0, text: lines.join('\n') };
}
