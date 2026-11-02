import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

/**
 * 唯一接触 Cursor 内部浏览器命令的模块。Cursor 升级改了命令时只需要改这里，
 * 自检（selfcheck.ts）也通过这里判断能力是否还在。
 */
export const BROWSER_COMMANDS = {
  open: 'workbench.action.openBrowserEditor',
  exec: 'cursor.browserView.executeJavaScript',
  cdp: 'cursor.browserView.sendCDPCommand',
  tabs: 'cursor.browserView.listTabs',
  navigate: 'cursor.browserView.navigate',
  reload: 'cursor.browserView.reload',
  getUrl: 'cursor.browserView.getURL',
  focus: 'cursor.browserView.focusOrShowTab',
  select: 'cursor.browserView.selectTab',
} as const;

const REQUIRED = [BROWSER_COMMANDS.open, BROWSER_COMMANDS.exec, BROWSER_COMMANDS.cdp, BROWSER_COMMANDS.tabs];

export interface TabList {
  tabs: string[];
  activeTab?: string;
}

export class BrowserAdapter {
  async check(): Promise<{ ok: boolean; missing: string[] }> {
    const all = new Set(await vscode.commands.getCommands(true));
    const missing = REQUIRED.filter((c) => !all.has(c));
    return { ok: missing.length === 0, missing };
  }

  newId(): string {
    return randomBytes(3).toString('hex');
  }

  async open(url: string, browserId = this.newId()): Promise<string> {
    await vscode.commands.executeCommand(BROWSER_COMMANDS.open, { url, browserId });
    return browserId;
  }

  async exec<T = unknown>(browserId: string, script: string): Promise<T> {
    return (await vscode.commands.executeCommand(BROWSER_COMMANDS.exec, script, browserId)) as T;
  }

  async cdp<T = unknown>(browserId: string, method: string, params: object = {}): Promise<T> {
    return (await vscode.commands.executeCommand(BROWSER_COMMANDS.cdp, method, params, browserId)) as T;
  }

  async tabs(): Promise<TabList> {
    const r = (await vscode.commands.executeCommand(BROWSER_COMMANDS.tabs)) as TabList | undefined;
    return r && Array.isArray(r.tabs) ? r : { tabs: [] };
  }

  async isOpen(browserId: string): Promise<boolean> {
    try {
      return (await this.tabs()).tabs.includes(browserId);
    } catch {
      return false;
    }
  }

  async navigate(browserId: string, url: string): Promise<void> {
    await vscode.commands.executeCommand(BROWSER_COMMANDS.navigate, url, browserId);
  }

  async reload(browserId: string): Promise<void> {
    await vscode.commands.executeCommand(BROWSER_COMMANDS.reload, browserId);
  }

  async focus(browserId: string): Promise<boolean> {
    for (const cmd of [BROWSER_COMMANDS.select, BROWSER_COMMANDS.focus]) {
      try {
        const r = (await vscode.commands.executeCommand(cmd, browserId)) as { success?: boolean } | undefined;
        if (r?.success !== false) return true;
      } catch {
        /* 换下一个命令 */
      }
    }
    return false;
  }

  async url(browserId: string): Promise<string | null> {
    try {
      return ((await vscode.commands.executeCommand(BROWSER_COMMANDS.getUrl, browserId)) as string) ?? null;
    } catch {
      return null;
    }
  }

  /** 等页面加载完成（readyState complete 且已离开 about:blank） */
  async waitReady(browserId: string, timeoutMs = 20000): Promise<string | null> {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        const v = await this.exec<string>(browserId, 'document.readyState + "|" + location.href');
        if (typeof v === 'string' && v.startsWith('complete|') && !v.includes('|about:blank')) return v.slice(9);
      } catch {
        /* 标签还没就绪 */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }
}
