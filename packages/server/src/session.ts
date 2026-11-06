import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import { t, type BridgeEvent, type BridgeMethod, type BridgeMethods, type BridgeReply, type PageInfo } from '@css-tuner/protocol';
import { Emitter, type Disposable } from './events';

export type ChannelState = 'idle' | 'opening' | 'connected' | 'lost';
export type Params<M extends BridgeMethod> = BridgeMethods[M]['p'];
export type Result<M extends BridgeMethod> = BridgeMethods[M]['r'];

/** 同一个站点在另一个标签页里连上了：旧页面收到这个关闭码就不再重连 */
export const SUPERSEDED = 4409;
/** 站点被关掉了（close_page）：页面收起面板，不再重连 */
export const CLOSED = 4410;
/** 服务要退出（空闲、升级）：页面过一会儿重连，服务重新起来以后接着用 */
export const GOING_AWAY = 1001;

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
  /** 请求发在哪条连接上：这条连接断了，回复就不会来了 */
  ws: WebSocket;
}

/**
 * 一个站点（代理或静态服务）上的桥接会话：页面里的桥接脚本经同源的 WebSocket 连回来，
 * 刷新、跳转后重新连上的还是这个会话；同时只认最后连上的那个标签页
 */
export class PageSession implements Disposable {
  readonly id = randomBytes(8).toString('hex');
  state: ChannelState = 'idle';
  page: PageInfo | null = null;

  private socket: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private disposed = false;
  private readonly events = new Emitter<BridgeEvent>();
  private readonly states = new Emitter<ChannelState>();
  readonly onEvent = this.events.event;
  readonly onState = this.states.event;

  constructor(private readonly log: (msg: string) => void) {}

  /** 页面连上来了；之前连着的（另一个标签页）让它退下 */
  attach(ws: WebSocket) {
    if (this.disposed) {
      ws.close(CLOSED, 'closed');
      return;
    }
    const old = this.socket;
    if (old && old !== ws) old.close(SUPERSEDED, 'superseded');
    this.socket = ws;
    if (this.state !== 'connected') this.setState('opening');
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
      if (!this.disposed) this.setState('lost');
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

  call<M extends BridgeMethod>(m: M, p: Params<M>, timeoutMs = 8000): Promise<Result<M>> {
    const ws = this.socket;
    if (!ws || ws.readyState !== ws.OPEN) return Promise.reject(new Error(t('session.notConnected')));
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

  /** 等页面连上（hello 到了） */
  waitConnected(timeoutMs = 10000): Promise<boolean> {
    if (this.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        sub.dispose();
        resolve(this.connected);
      }, timeoutMs);
      const sub = this.onState((s) => {
        if (s !== 'connected') return;
        clearTimeout(timer);
        sub.dispose();
        resolve(true);
      });
    });
  }

  dispose(code = CLOSED) {
    this.disposed = true;
    this.socket?.close(code, code === CLOSED ? 'closed' : 'shutdown');
    this.socket = null;
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    this.events.dispose();
    this.states.dispose();
  }
}
