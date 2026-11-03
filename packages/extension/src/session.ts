import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import { t, type BridgeEvent, type BridgeMethod, type BridgeMethods, type BridgeReply, type PageInfo } from '@css-tuner/protocol';
import type { BrowserAdapter } from './browser';
import type { BridgeServer } from './server';

export type ChannelState = 'idle' | 'opening' | 'connected' | 'lost';
export type Params<M extends BridgeMethod> = BridgeMethods[M]['p'];
export type Result<M extends BridgeMethod> = BridgeMethods[M]['r'];

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
  /** 请求发在哪条连接上：这条连接断了，回复就不会来了 */
  ws: WebSocket;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(t('session.timeout', { what }))), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * 一个浏览器标签上的桥接会话。主通道是 WebSocket（页面主动连回扩展）；
 * 页面 CSP 拦掉 WebSocket 时退回 executeJavaScript 通道：请求直接执行，事件轮询拉取。
 */
export class PageSession implements vscode.Disposable {
  readonly id = randomBytes(8).toString('hex');
  state: ChannelState = 'idle';
  page: PageInfo | null = null;
  mode: 'ws' | 'exec' = 'ws';

  private socket: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private scriptId: string | null = null;
  private poll: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private unregister: () => void;
  private disposed = false;
  private readonly events = new vscode.EventEmitter<BridgeEvent>();
  private readonly states = new vscode.EventEmitter<ChannelState>();
  readonly onEvent = this.events.event;
  readonly onState = this.states.event;

  constructor(
    readonly browserId: string,
    private readonly browser: BrowserAdapter,
    private readonly server: BridgeServer,
    private readonly bundle: string,
    private readonly log: (msg: string) => void,
  ) {
    this.unregister = server.register(this.id, (ws) => this.onSocket(ws));
  }

  private bootScript(): string {
    const cfg = { port: this.server.port, token: this.server.token, session: this.id };
    return `${this.bundle}\n;try{__cssTunerBridge.boot(${JSON.stringify(cfg)})}catch(e){console.warn('[css-tuner]',e)}`;
  }

  /**
   * 注册“每个新文档开头执行”的脚本（刷新、跳转后自动重新注入）。打开页面前先注册，
   * 桥接脚本就赶在 React 初始化之前挂上 DevTools 钩子，组件属性才能在页面上预览
   */
  async register(): Promise<void> {
    const { browser: b, browserId: id } = this;
    await b.cdp(id, 'Page.enable');
    await b.cdp(id, 'Page.setBypassCSP', { enabled: true }).catch(() => undefined);
    if (this.scriptId) {
      await b.cdp(id, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: this.scriptId }).catch(() => undefined);
    }
    const reg = await b.cdp<{ identifier?: string }>(id, 'Page.addScriptToEvaluateOnNewDocument', { source: this.bootScript() });
    this.scriptId = reg?.identifier ?? null;
  }

  /** 注册新文档脚本，并在当前文档里执行一次 */
  async inject(): Promise<void> {
    if (!this.socket) this.setState('opening');
    await this.register();
    await withTimeout(this.browser.exec(this.browserId, `${this.bootScript()};true`), 10000, t('session.inject'));
    if (this.socket && this.socket.readyState === this.socket.OPEN) this.setState('connected');
    else this.armWatchdog();
  }

  /** 注入后一段时间还没连上 WebSocket，就检查页面里的桥接脚本是否在，在的话改走 executeJavaScript 通道 */
  private armWatchdog(ms = 3500) {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(async () => {
      this.watchdog = null;
      if (this.disposed || this.socket) return;
      try {
        const alive = await withTimeout(
          this.browser.exec<boolean>(this.browserId, '!!(window.__CSS_TUNER__ && window.__CSS_TUNER__.call)'),
          3000,
          t('session.checkBridge'),
        );
        if (alive) this.startExecMode();
        else this.setState('lost');
      } catch {
        this.setState('lost');
      }
    }, ms);
  }

  private startExecMode() {
    if (this.poll || this.disposed) return;
    this.mode = 'exec';
    this.log(t('session.wsFallback'));
    let failures = 0;
    let instance: string | null = null;
    const tick = async () => {
      if (this.disposed || this.mode !== 'exec') return;
      try {
        const batch = await withTimeout(
          this.browser.exec<{ i: string; e: BridgeEvent[] } | null>(
            this.browserId,
            'window.__CSS_TUNER__ ? { i: window.__CSS_TUNER__.instance, e: window.__CSS_TUNER__.drain() } : null',
          ),
          3000,
          t('session.poll'),
        );
        if (batch === null) {
          if (++failures > 6) this.setState('lost');
        } else {
          failures = 0;
          if (batch.i !== instance) {
            instance = batch.i;
            const page = await this.call('pageInfo', {});
            this.dispatch({ t: 'hello', session: this.id, page });
          }
          for (const ev of batch.e) this.dispatch(ev);
        }
      } catch {
        if (++failures > 6) this.setState('lost');
      }
      if (this.mode === 'exec') this.poll = setTimeout(tick, 200);
    };
    this.poll = setTimeout(tick, 0);
  }

  private onSocket(ws: WebSocket) {
    if (this.socket && this.socket !== ws) this.socket.terminate();
    this.socket = ws;
    if (this.poll) {
      clearTimeout(this.poll);
      this.poll = null;
    }
    this.mode = 'ws';
    ws.on('message', (raw) => {
      let msg: BridgeReply | BridgeEvent;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t === 'res') {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.data);
        else p.reject(new Error(msg.error ?? t('session.callFailed')));
        return;
      }
      // 换了新连接（页面刷新、换了地址）以后旧连接上还没处理的事件说的是旧页面
      if (this.socket !== ws) return;
      this.dispatch(msg);
    });
    ws.on('close', () => {
      // 整页刷新时新页面可能比旧连接的 close 先连上，旧连接上没回的请求也要在这里结束
      for (const [id, p] of this.pending) {
        if (p.ws !== ws) continue;
        clearTimeout(p.timer);
        p.reject(new Error(t('session.lost')));
        this.pending.delete(id);
      }
      if (this.socket !== ws) return;
      this.socket = null;
      if (!this.disposed) {
        this.setState('lost');
        this.armWatchdog(5000);
      }
    });
  }

  private dispatch(ev: BridgeEvent) {
    if (ev.t === 'hello') {
      this.page = ev.page;
      this.setState('connected');
    } else if (ev.t === 'page') {
      this.page = ev.page;
    } else if (ev.t === 'log') {
      this.log(`[page:${ev.level}] ${ev.msg}`);
    }
    this.events.fire(ev);
  }

  private setState(s: ChannelState) {
    if (this.state === s) return;
    this.state = s;
    this.states.fire(s);
  }

  get connected(): boolean {
    return this.state === 'connected';
  }

  async call<M extends BridgeMethod>(m: M, p: Params<M>, timeoutMs = 8000): Promise<Result<M>> {
    const ws = this.socket;
    if (ws && ws.readyState === ws.OPEN) {
      const id = ++this.seq;
      return new Promise<Result<M>>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(t('session.timeout', { what: m })));
        }, timeoutMs);
        this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer, ws });
        ws.send(JSON.stringify({ t: 'req', id, m, p }));
      });
    }
    if (this.mode === 'exec') {
      const script = `window.__CSS_TUNER__ ? window.__CSS_TUNER__.call(${JSON.stringify(m)}, ${JSON.stringify(p)}) : Promise.reject(new Error('bridge missing'))`;
      return withTimeout(this.browser.exec<Result<M>>(this.browserId, script), timeoutMs, m);
    }
    throw new Error(t('session.notConnected'));
  }

  /** 等 WebSocket 或 exec 通道握手完成 */
  waitConnected(timeoutMs = 10000): Promise<boolean> {
    if (this.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        sub.dispose();
        resolve(this.connected);
      }, timeoutMs);
      const sub = this.onState((s) => {
        if (s === 'connected') {
          clearTimeout(timer);
          sub.dispose();
          resolve(true);
        }
      });
    });
  }

  async detach(): Promise<void> {
    if (this.scriptId) {
      await this.browser
        .cdp(this.browserId, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: this.scriptId })
        .catch(() => undefined);
      this.scriptId = null;
    }
    await this.browser
      .exec(this.browserId, 'window.__CSS_TUNER__ && window.__CSS_TUNER__.shutdown && window.__CSS_TUNER__.shutdown()')
      .catch(() => undefined);
  }

  dispose() {
    this.disposed = true;
    if (this.poll) clearTimeout(this.poll);
    if (this.watchdog) clearTimeout(this.watchdog);
    this.unregister();
    this.socket?.terminate();
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    this.events.dispose();
    this.states.dispose();
  }
}
