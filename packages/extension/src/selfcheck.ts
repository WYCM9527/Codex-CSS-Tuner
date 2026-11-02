import * as vscode from 'vscode';
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
}

const REQUIRED = ['open', 'exec', 'cdp', 'tabs'] as const;
const OPTIONAL: Array<{ key: keyof typeof BROWSER_COMMANDS; effect: string }> = [
  { key: 'navigate', effect: '换地址时会新开标签页' },
  { key: 'reload', effect: '“刷新”按钮不可用' },
  { key: 'getUrl', effect: '每次打开页面都会重新加载' },
  { key: 'focus', effect: '选取元素时不会自动切到浏览器标签' },
];
const CHAT = ['workbench.action.chat.open', 'composer.createNew'];
const PAGE_TITLE = 'CSS Tuner 自检';

/** 内部命令还在不在：启动时跑，不打开任何页面 */
export async function commandCheck(): Promise<CheckItem[]> {
  const all = new Set(await vscode.commands.getCommands(true));
  return [
    ...REQUIRED.map((k) => ({ name: `内置浏览器命令 ${BROWSER_COMMANDS[k]}`, ok: all.has(BROWSER_COMMANDS[k]), required: true })),
    ...OPTIONAL.map(({ key, effect }) => {
      const ok = all.has(BROWSER_COMMANDS[key]) || (key === 'focus' && all.has(BROWSER_COMMANDS.select));
      return { name: `内置浏览器命令 ${BROWSER_COMMANDS[key]}`, ok, required: false, detail: ok ? undefined : effect };
    }),
    {
      name: '预填 Agent 对话',
      ok: CHAT.some((c) => all.has(c)),
      required: false,
      detail: CHAT.some((c) => all.has(c)) ? undefined : '交给 Agent 时提示词只复制到剪贴板',
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
      items.push({ name, ok, required: true, detail: `${Date.now() - t0}ms${note ? `，${note(v)}` : ''}` });
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
      '打开内置浏览器标签页',
      async () => {
        await d.browser.open(`${origin}/index.html`, browserId);
        return d.browser.waitReady(browserId, 15000);
      },
      (h) => !!h && !h.startsWith('chrome-error://'),
    );
    if (!href) return items;
    if (!(await step('注入调参脚本', () => session.inject().then(() => true), (v) => v))) return items;
    if (!(await step('页面连回扩展', () => session.waitConnected(8000), (v) => v, () => (session.mode === 'ws' ? 'WebSocket' : 'executeJavaScript 通道')))) return items;

    const el = await step('选中元素、读出命中的样式规则', () => session.call('select', { selector: '#probe' }), (s) => !!s?.rules.some((r) => r.selector === '.probe'));
    const rule = el?.rules.find((r) => r.selector === '.probe');
    if (!el || !rule) return items;
    await step(
      '实时预览（改 CSSOM 规则）',
      () => session.call('preview', { id: 'selfcheck', target: { kind: 'rule', rule, uid: el.uid }, decls: { 'padding-left': '21px' } }),
      (r) => r.computed['padding-left'] === '21px',
    );
    await step(
      '清除预览',
      async () => {
        await session.call('clearPreview', { id: 'selfcheck' });
        return session.call('snapshot', {});
      },
      (s) => s?.computed['padding-left'] === '12px',
    );
    await step(
      '刷新页面后自动重新注入',
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
    for (const t of g.tabs) {
      if (t.label === PAGE_TITLE || t.label.startsWith(`${PAGE_TITLE} `)) await vscode.window.tabGroups.close(t).then(undefined, () => undefined);
    }
  }
}

export function summarizeCheck(items: CheckItem[]): { ok: boolean; degraded: boolean; text: string } {
  const failed = items.filter((i) => !i.ok);
  const ok = !failed.some((i) => i.required);
  const lines = items.map((i) => `${i.ok ? '✓' : i.required ? '✗' : '!'} ${i.name}${i.detail ? `（${i.detail}）` : ''}`);
  return { ok, degraded: ok && failed.length > 0, text: lines.join('\n') };
}
