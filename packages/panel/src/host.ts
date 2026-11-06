import type { ExtToPanel, PanelState, PanelToExt } from '@css-tuner/protocol';

/** 服务端要面板把一段文字给用户复制（剪贴板写不进去时） */
export interface PromptRequest {
  text: string;
  mode: 'apply' | 'revert' | 'text';
}

export interface AnnotateRequest {
  comment: string;
  metadata?: Record<string, string | number | boolean | null>;
  uids?: string[];
}

/** 页面里的面板外壳（bridge 的 shell.ts）和注释接口；单独在浏览器里调试面板时没有 */
export interface Shell {
  side(): 'left' | 'right';
  collapse(): void;
  dock(side: 'left' | 'right'): void;
  /** 浮在页面上；否则停靠，页面在面板旁边剩下的地方排版 */
  floating(): boolean;
  setFloating(on: boolean): void;
  canAnnotate(): boolean;
  /** 必须在点击处理里同步调用：注释接口要求在用户操作当中 */
  annotate(req: AnnotateRequest): boolean;
}

export interface Host {
  send(msg: PanelToExt): void;
  subscribe(cb: (state: PanelState) => void): () => void;
  onPrompt(cb: (p: PromptRequest) => void): () => void;
  /** 面板自身的界面状态（折叠、分边模式等），刷新页面后保留 */
  load<T>(key: string, fallback: T): T;
  save(key: string, value: unknown): void;
  shell: Shell | null;
}

interface Boot {
  ws: string;
  token: string;
}

declare global {
  interface Window {
    __CSS_TUNER_PANEL__?: Boot;
  }
}

type ParentApi = Window & {
  __CSS_TUNER_PANEL_HOST__?: {
    state(): { side: 'left' | 'right'; float: boolean };
    collapse(): void;
    dock(side: 'left' | 'right'): void;
    setFloat(on: boolean): void;
  };
  __CSS_TUNER_ANNOTATE__?: (req: AnnotateRequest) => { ok: boolean };
  __CSS_TUNER_CAN_ANNOTATE__?: () => boolean;
};

function parentApi(): ParentApi | null {
  try {
    const p = window.parent as ParentApi;
    return p !== window && p.location.origin === location.origin ? p : null;
  } catch {
    return null;
  }
}

function pageShell(): Shell | null {
  const p = parentApi();
  if (!p) return null;
  return {
    side: () => p.__CSS_TUNER_PANEL_HOST__?.state().side ?? 'right',
    collapse: () => p.__CSS_TUNER_PANEL_HOST__?.collapse(),
    dock: (side) => p.__CSS_TUNER_PANEL_HOST__?.dock(side),
    floating: () => p.__CSS_TUNER_PANEL_HOST__?.state().float === true,
    setFloating: (on) => p.__CSS_TUNER_PANEL_HOST__?.setFloat(on),
    canAnnotate: () => p.__CSS_TUNER_CAN_ANNOTATE__?.() === true,
    annotate: (req) => {
      try {
        return p.__CSS_TUNER_ANNOTATE__?.(req).ok === true;
      } catch {
        return false;
      }
    },
  };
}

/** 本地服务关掉这个站点（4410）或页面被另一个标签页顶替（4409）时不再重连 */
const FINAL = new Set([4409, 4410]);
const PREFIX = 'css-tuner:ui:';

function wsHost(boot: Boot): Host {
  const subs = new Set<(s: PanelState) => void>();
  const prompts = new Set<(p: PromptRequest) => void>();
  let last: PanelState | null = null;
  let ws: WebSocket | null = null;
  let retry = 0;
  let done = false;
  /** 连上之前（或者断线重连期间）发的消息，连上后补发；只留最近几条 */
  const outbox: string[] = [];
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${boot.ws}?token=${encodeURIComponent(boot.token)}`;

  const connect = () => {
    const sock = new WebSocket(url);
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      for (const m of outbox.splice(0)) sock.send(m);
      sock.send(JSON.stringify({ t: 'ready' } satisfies PanelToExt));
    };
    sock.onmessage = (e) => {
      let m: ExtToPanel;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === 'state') {
        last = m.state;
        for (const cb of subs) cb(m.state);
      } else if (m.t === 'prompt') {
        for (const cb of prompts) cb({ text: m.text, mode: m.mode });
      }
    };
    sock.onclose = (e) => {
      if (ws !== sock) return;
      ws = null;
      if (FINAL.has(e.code)) {
        done = true;
        return;
      }
      setTimeout(connect, Math.min(3000, 300 * 2 ** retry++));
    };
  };

  const send = (msg: PanelToExt) => {
    const text = JSON.stringify(msg);
    if (ws?.readyState === WebSocket.OPEN) ws.send(text);
    else if (!done) {
      outbox.push(text);
      if (outbox.length > 20) outbox.shift();
    }
  };
  const report = (message: string) => send({ t: 'error', message });
  window.addEventListener('error', (e) => report(`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => report(String((e.reason as Error)?.stack ?? e.reason)));
  connect();

  return {
    send,
    subscribe(cb) {
      subs.add(cb);
      if (last) cb(last);
      return () => subs.delete(cb);
    },
    onPrompt(cb) {
      prompts.add(cb);
      return () => prompts.delete(cb);
    },
    load<T>(key: string, fallback: T): T {
      try {
        const v = localStorage.getItem(PREFIX + key);
        return v === null ? fallback : (JSON.parse(v) as T);
      } catch {
        return fallback;
      }
    },
    save(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        /* 存不了就只管这一次 */
      }
    },
    shell: pageShell(),
  };
}

let host: Host | null = null;

export async function getHost(): Promise<Host> {
  if (host) return host;
  const boot = window.__CSS_TUNER_PANEL__;
  if (boot) host = wsHost(boot);
  else host = (await import('./mock')).createMockHost();
  return host;
}
