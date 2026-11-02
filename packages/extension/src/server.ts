import { createServer, type Server } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';

export interface Connection {
  session: string;
  socket: WebSocket;
}

/**
 * 桥接脚本连回扩展的 WebSocket 服务：只监听 127.0.0.1，随机端口，
 * 每次启动生成一次性 token，握手时校验，不带正确 token 的连接直接拒绝。
 */
export class BridgeServer {
  readonly token = randomBytes(24).toString('hex');
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;
  private handlers = new Map<string, (socket: WebSocket) => void>();
  port = 0;
  /** 自测用：模拟页面 CSP 拦截 WebSocket */
  refuseAll = false;

  async start(): Promise<number> {
    if (this.http) return this.port;
    this.http = createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
    this.http.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const token = url.searchParams.get('token') ?? '';
      const session = url.searchParams.get('session') ?? '';
      const ok = !this.refuseAll && url.pathname === '/bridge' && this.checkToken(token) && this.handlers.has(session);
      if (!ok) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.handlers.get(session)?.(ws));
    });
    await new Promise<void>((resolve, reject) => {
      this.http!.once('error', reject);
      this.http!.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = this.http.address();
    this.port = typeof addr === 'object' && addr ? addr.port : 0;
    return this.port;
  }

  private checkToken(token: string): boolean {
    const a = Buffer.from(token);
    const b = Buffer.from(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  register(session: string, onSocket: (socket: WebSocket) => void): () => void {
    this.handlers.set(session, onSocket);
    return () => this.handlers.delete(session);
  }

  dispose() {
    this.wss?.close();
    this.http?.close();
    this.wss = null;
    this.http = null;
  }
}
