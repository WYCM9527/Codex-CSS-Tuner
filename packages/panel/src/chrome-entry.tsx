import { createRoot, type Root } from 'react-dom/client';
import { localeFrom, setLocale, type ExtToPanel, type PanelState } from '@css-tuner/protocol';
import { App } from './App';
import type { Host, PromptRequest } from './host';
import panelCss from './styles.css?inline';

type Incoming =
  | { type: 'bind'; session: string; chat: string }
  | { type: 'bridge'; action: 'open' | 'offline' | 'close' | 'message'; text?: string }
  | { type: 'panel'; text: string }
  | { type: 'panelOffline' }
  | { type: 'closed' };

interface Port {
  postMessage(value: unknown): void;
  onMessage: { addListener(listener: (message: Incoming) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

const { runtime } = (globalThis as unknown as { chrome: { runtime: { connect(options: { name: string }): Port; lastError?: unknown } } }).chrome;
const CHANNEL = 'css-tuner-extension';
const PREFIX = `${CHANNEL}:ui:`;
let port: Port | null = null;
let view: ReturnType<typeof mount> | null = null;
let retry = 0;

function post(message: unknown) {
  port?.postMessage(message);
}

function page(type: 'open' | 'offline' | 'close' | 'message', text?: string) {
  window.postMessage({ channel: CHANNEL, direction: 'to-page', type, text }, location.origin);
}

function mount(chat: string) {
  const host = document.createElement('css-tuner-extension');
  host.setAttribute('data-css-tuner', '');
  host.setAttribute('aria-label', 'CSS Tuner');
  host.lang = navigator.language;
  setLocale(localeFrom(host.lang));
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all:initial; display:block; margin:12px auto; width:min(410px,calc(100% - 24px));
      height:min(70dvh,700px); contain:layout style;
      border-radius:10px; box-shadow:0 10px 42px #0005; overflow:hidden; }
    :host([data-collapsed]) { width:auto; height:auto; }
    .tuner-layout { display:flex; flex-direction:column; height:100%; }
    .tuner-head { display:flex; justify-content:space-between; align-items:center; padding:6px 12px;
      border-bottom:1px solid var(--line); }
    .tuner-layout > #root { flex:1; min-height:0; }
    :host([data-collapsed]) #root { display:none; }
    @media (min-width:760px) {
      :host { position:fixed; right:12px; top:12px; width:calc(var(--css-tuner-dock-width, 434px) - 24px);
        height:calc(100dvh - 24px); margin:0; z-index:2147483647; }
      :host([data-collapsed]) { right:6px; width:32px; }
      :host([data-collapsed]) .tuner-head { padding:2px; justify-content:center; }
      :host([data-collapsed]) .tuner-head strong { display:none; }
    }
  ` + panelCss.replace(/^\s*html,\s*$/gm, '').replace(/^(\s*)body(?=[\s.,{])/gm, '$1.tuner-layout').replaceAll(':root:lang(en)', ':host(:lang(en))');
  const layout = document.createElement('div');
  layout.className = 'tuner-layout';
  const header = document.createElement('header');
  header.className = 'tuner-head';
  const title = document.createElement('strong');
  title.textContent = 'CSS Tuner';
  const collapse = document.createElement('button');
  const refreshButton = () => {
    const closed = host.hasAttribute('data-collapsed');
    collapse.setAttribute('aria-expanded', String(!closed));
    collapse.setAttribute('aria-label', closed ? 'Show CSS Tuner' : 'Hide CSS Tuner');
    collapse.textContent = closed ? '+' : '−';
  };
  collapse.addEventListener('click', () => { host.toggleAttribute('data-collapsed'); refreshButton(); });
  refreshButton();
  const app = document.createElement('div');
  app.id = 'root';
  header.append(title, collapse);
  layout.append(header, app);
  shadow.append(style, layout);
  document.body.append(host);
  const states = new Set<(state: PanelState) => void>();
  const prompts = new Set<(prompt: PromptRequest) => void>();
  let current: PanelState | null = null;
  const panelHost: Host = {
    extension: { chat },
    shell: null,
    send: (message) => post({ type: 'panel', text: JSON.stringify(message) }),
    subscribe(listener) {
      states.add(listener);
      if (current) listener(current);
      return () => states.delete(listener);
    },
    onPrompt(listener) {
      prompts.add(listener);
      return () => prompts.delete(listener);
    },
    load<T>(key: string, fallback: T): T {
      try { return JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null') ?? fallback; }
      catch { return fallback; }
    },
    save(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); }
      catch { /* Local storage can be disabled by the browser. */ }
    },
  };
  const react: Root = createRoot(app);
  react.render(<App host={panelHost} />);
  function update(state: PanelState) {
    current = state;
    if (state.locale) host.lang = state.locale;
    for (const listener of states) listener(state);
  }
  return {
    receive(text: string) {
      const message: ExtToPanel = JSON.parse(text);
      if (message.t === 'state') update(message.state);
      if (message.t === 'prompt') for (const listener of prompts) listener({ text: message.text, mode: message.mode });
    },
    offline() { if (current) update({ ...current, connection: 'lost' }); },
    remove() { react.unmount(); host.remove(); },
  };
}

function connect() {
  const next = runtime.connect({ name: CHANNEL });
  port = next;
  next.onMessage.addListener((message) => {
    if (port !== next) return;
    if (message.type === 'bind') {
      retry = 0;
      if (sessionStorage.getItem(CHANNEL) !== message.session) {
        sessionStorage.setItem(CHANNEL, message.session);
        location.reload();
        return;
      }
      view ??= mount(message.chat);
      post({ type: 'ready' });
    } else if (message.type === 'panel') {
      view?.receive(message.text);
    } else if (message.type === 'bridge') {
      page(message.action, message.text);
    } else if (message.type === 'panelOffline') {
      view?.offline();
    } else if (message.type === 'closed') {
      sessionStorage.removeItem(CHANNEL);
      page('close');
      view?.remove();
      view = null;
    }
  });
  next.onDisconnect.addListener(() => {
    void runtime.lastError;
    if (port !== next) return;
    port = null;
    page('offline');
    view?.offline();
    if (retry++ < 5) setTimeout(connect, Math.min(5000, 400 * 2 ** retry));
  });
}

window.addEventListener('message', (event) => {
  if (!view) return;
  if (event.source !== window || event.origin !== location.origin || event.data?.channel !== CHANNEL || event.data?.direction !== 'from-page') return;
  if (typeof event.data.text === 'string') post({ type: 'bridge', text: event.data.text });
});
connect();
