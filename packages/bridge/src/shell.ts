import { OWN_ATTR } from './util';

/** 页面上的几句话由本地服务按当前语言给出 */
export interface ShellText {
  pill: string;
  pillTitle: string;
  superseded: string;
  resize: string;
}

export interface PanelState {
  side: 'left' | 'right';
  width: number;
  collapsed: boolean;
}

export interface PanelHostApi {
  state(): PanelState;
  collapse(): void;
  expand(): void;
  toggle(): void;
  dock(side: 'left' | 'right'): void;
}

const KEY = 'css-tuner:panel';
const MIN = 300;
const MAX = 720;
const DEFAULT: PanelState = { side: 'right', width: 380, collapsed: false };

const STYLE = `
.panel { position: fixed; top: 0; bottom: 0; display: block; background: #181818; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), 0 8px 30px rgba(0, 0, 0, 0.3); }
.panel.right { right: 0; }
.panel.left { left: 0; }
.panel.hidden { display: none; }
iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
.grip { position: absolute; top: 0; bottom: 0; width: 7px; cursor: ew-resize; touch-action: none; }
.right .grip { left: -3px; }
.left .grip { right: -3px; }
.grip:hover, .grip.on { background: rgba(77, 144, 254, 0.5); }
.shield { position: fixed; inset: 0; cursor: ew-resize; display: none; }
.shield.on { display: block; }
.pill { position: fixed; bottom: 16px; display: none; align-items: center; gap: 7px; max-width: min(420px, calc(100vw - 32px)); padding: 8px 13px; border: 1px solid #3a3a3a; border-radius: 999px; background: #1f1f1f; color: #f0f0f0; font: 600 12px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; text-align: left; cursor: pointer; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3); }
.pill:hover { background: #2a2a2a; }
.pill.right { right: 16px; }
.pill.left { left: 16px; }
.pill.on { display: inline-flex; }
.dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #3fb950; }
.pill.warn .dot { background: #d29922; }
`;

function load(): PanelState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PanelState> | null;
    if (!v || typeof v !== 'object') return { ...DEFAULT };
    return {
      side: v.side === 'left' ? 'left' : 'right',
      width: clampWidth(Number(v.width) || DEFAULT.width),
      collapsed: v.collapsed === true,
    };
  } catch {
    return { ...DEFAULT };
  }
}

function clampWidth(w: number): number {
  return Math.round(Math.max(MIN, Math.min(MAX, w, Math.max(MIN, innerWidth - 120))));
}

/**
 * 页面里的浮动面板：一个带影子根的元素，里面是同源的面板 iframe、调宽度的把手和收起后的小胶囊。
 * 位置、宽度、收起状态按站点记在 localStorage 里；页面框架把它删掉时自己挂回去
 */
export class PanelShell implements PanelHostApi {
  private host: HTMLElement | null = null;
  private panel!: HTMLDivElement;
  private frame!: HTMLIFrameElement;
  private grip!: HTMLDivElement;
  private shield!: HTMLDivElement;
  private pill!: HTMLButtonElement;
  private label!: HTMLSpanElement;
  private st: PanelState = load();
  private note: { text: string; onClick: () => void } | null = null;
  private observer: MutationObserver | null = null;

  constructor(
    private readonly src: string,
    private readonly text: ShellText,
  ) {}

  mount() {
    if (this.host || !document.documentElement) return;
    const host = document.createElement('css-tuner-panel');
    host.setAttribute(OWN_ATTR, '');
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; display: block;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);

    this.panel = document.createElement('div');
    this.frame = document.createElement('iframe');
    this.frame.title = 'CSS Tuner';
    this.frame.allow = 'clipboard-read; clipboard-write';
    this.frame.src = this.src;
    this.grip = document.createElement('div');
    this.grip.className = 'grip';
    this.grip.title = this.text.resize;
    this.panel.append(this.frame, this.grip);
    this.shield = document.createElement('div');
    this.shield.className = 'shield';
    this.pill = document.createElement('button');
    this.pill.type = 'button';
    const dot = document.createElement('span');
    dot.className = 'dot';
    this.label = document.createElement('span');
    this.pill.append(dot, this.label);
    root.append(this.panel, this.shield, this.pill);

    this.pill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.note) this.note.onClick();
      else this.expand();
    });
    this.wireGrip();
    addEventListener('resize', () => this.render());

    this.host = host;
    document.documentElement.appendChild(host);
    this.observer = new MutationObserver(() => {
      if (this.host && !this.host.isConnected && document.documentElement) document.documentElement.appendChild(this.host);
    });
    this.observer.observe(document.documentElement, { childList: true });
    this.render();
  }

  remove() {
    this.observer?.disconnect();
    this.observer = null;
    this.host?.remove();
    this.host = null;
    const w = window as unknown as { __CSS_TUNER_PANEL_HOST__?: PanelHostApi };
    if (w.__CSS_TUNER_PANEL_HOST__ === this) delete w.__CSS_TUNER_PANEL_HOST__;
    this.st = { ...this.st, collapsed: true };
    this.emit();
  }

  state(): PanelState {
    return { ...this.st };
  }

  collapse() {
    this.update({ collapsed: true });
  }

  expand() {
    this.update({ collapsed: false });
  }

  toggle() {
    this.update({ collapsed: !this.st.collapsed });
  }

  dock(side: 'left' | 'right') {
    this.update({ side });
  }

  /** 面板退下时（同一个站点在另一个标签页里用着）只留一个提示，点了以后接回来 */
  notice(text: string | null, onClick?: () => void) {
    this.note = text && onClick ? { text, onClick } : null;
    this.render();
  }

  superseded(onResume: () => void) {
    this.frame.src = 'about:blank';
    this.notice(this.text.superseded, () => {
      this.notice(null);
      this.frame.src = this.src;
      onResume();
    });
  }

  private update(patch: Partial<PanelState>) {
    this.st = { ...this.st, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.st));
    } catch {
      /* 存不了就只管这一次 */
    }
    this.render();
  }

  private render() {
    if (!this.host) return;
    const { side, collapsed } = this.st;
    const width = clampWidth(this.st.width);
    const hidden = collapsed || !!this.note;
    this.panel.className = `panel ${side}${hidden ? ' hidden' : ''}`;
    this.panel.style.width = `${width}px`;
    this.pill.className = `pill ${side}${hidden ? ' on' : ''}${this.note ? ' warn' : ''}`;
    this.label.textContent = this.note?.text ?? this.text.pill;
    this.pill.title = this.note ? '' : this.text.pillTitle;
    this.emit();
  }

  private emit() {
    const detail = { ...this.st, width: clampWidth(this.st.width), collapsed: this.st.collapsed || !!this.note || !this.host };
    dispatchEvent(new CustomEvent('css-tuner-panel', { detail }));
  }

  private wireGrip() {
    let drag: { pointer: number } | null = null;
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      const w = this.st.side === 'right' ? innerWidth - e.clientX : e.clientX;
      this.st = { ...this.st, width: clampWidth(w) };
      this.render();
    };
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      drag = null;
      this.grip.classList.remove('on');
      this.shield.classList.remove('on');
      this.update({});
    };
    this.grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      drag = { pointer: e.pointerId };
      this.grip.classList.add('on');
      // 拖过 iframe 时指针事件会被里面的文档吃掉，盖一层透明的挡板接着收
      this.shield.classList.add('on');
      try {
        this.shield.setPointerCapture(e.pointerId);
      } catch {
        /* 合成的指针事件捕获不了，挡板照样能收到移动 */
      }
    });
    this.shield.addEventListener('pointermove', move);
    this.shield.addEventListener('pointerup', end);
    this.shield.addEventListener('pointercancel', end);
  }
}
