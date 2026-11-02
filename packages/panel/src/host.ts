import type { ExtToPanel, PanelState, PanelToExt } from '@css-tuner/protocol';

interface VsApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare const acquireVsCodeApi: undefined | (() => VsApi);

export interface Host {
  send(msg: PanelToExt): void;
  subscribe(cb: (state: PanelState) => void): () => void;
  /** 面板自身的界面状态（折叠、分边模式等），webview 隐藏再显示时保留 */
  load<T>(key: string, fallback: T): T;
  save(key: string, value: unknown): void;
}

function vscodeHost(api: VsApi): Host {
  const subs = new Set<(s: PanelState) => void>();
  let last: PanelState | null = null;
  const report = (message: string) => api.postMessage({ t: 'error', message } satisfies PanelToExt);
  window.addEventListener('error', (e) => report(`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => report(String((e.reason as Error)?.stack ?? e.reason)));
  window.addEventListener('message', (e: MessageEvent<ExtToPanel>) => {
    const m = e.data;
    if (m && m.t === 'state') {
      last = m.state;
      for (const cb of subs) cb(m.state);
    }
  });
  const ui = () => ((api.getState() as Record<string, unknown> | undefined) ?? {});
  return {
    send: (msg) => api.postMessage(msg),
    subscribe(cb) {
      subs.add(cb);
      if (last) cb(last);
      return () => subs.delete(cb);
    },
    load<T>(key: string, fallback: T): T {
      const v = ui()[key];
      return v === undefined ? fallback : (v as T);
    },
    save(key, value) {
      api.setState({ ...ui(), [key]: value });
    },
  };
}

let host: Host | null = null;

export async function getHost(): Promise<Host> {
  if (host) return host;
  if (typeof acquireVsCodeApi === 'function') host = vscodeHost(acquireVsCodeApi());
  else host = (await import('./mock')).createMockHost();
  return host;
}
