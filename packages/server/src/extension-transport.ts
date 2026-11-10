import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';
import { bindingTokens, EXTENSION_ORIGIN, type Binding } from './extension-bindings';
import { CLOSED, SUPERSEDED } from './session';

const HOST = '127.0.0.1';
export const EXTENSION_CONNECT_PATH = '/_css_tuner/connect';
const PAIRING_TTL = 5 * 60 * 1000;
const AUTH_TIMEOUT = 5000;
const MAX_PAIRING_BODY = 1024;
const MAX_CONNECTIONS = 8;
// Asset replies can carry a 22 MiB blob encoded as base64.
const MAX_PAYLOAD = 32 * 1024 * 1024;

type Role = 'bridge' | 'panel';

export interface ExtensionTransportOptions {
  /** Canonical origin of the page authorized by the local CLI. */
  pageOrigin: string;
  pageUrl?: string;
  chat?: string;
  root?: string;
  remember?(extension: string): { binding: Binding; port: number };
  onBridge(ws: WebSocket): void;
  onPanel(ws: WebSocket): void;
}

function secret(): string {
  return randomBytes(32).toString('hex');
}

function matches(value: unknown, expected: string): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
}

function connectPage(res: ServerResponse, zh: boolean): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  }).end(`<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CSS Tuner</title><style>
:root{color-scheme:light dark;font:16px/1.55 system-ui}body{margin:0;padding:8vh 20px}main{margin:auto;max-width:38rem}h1{line-height:1.2}code{overflow-wrap:anywhere}button{font:inherit;padding:.55rem 1rem;cursor:pointer}button:disabled{cursor:default}
</style></head><body><main>
<h1>${zh ? '连接 CSS Tuner' : 'Connect CSS Tuner'}</h1>
<p>${zh ? '即将打开的本地预览' : 'Local preview to open'}<br><code id="css-tuner-target"></code></p>
<p id="css-tuner-project" hidden>${zh ? '项目目录' : 'Project folder'}<br><code id="css-tuner-root"></code></p>
<p id="css-tuner-conversation" hidden>${zh ? 'Codex 对话' : 'Codex chat'}<br><code id="css-tuner-chat"></code></p>
<p id="css-tuner-disclosure">${zh ? 'CSS Tuner 使用本地页面的地址、内容和编辑操作来预览改动。本机程序读取相关源码并保留本地编辑记录。草稿由你在 Codex 中决定是否发送。' : 'CSS Tuner uses the local page address, content and editing interactions to preview changes. Its companion reads relevant source files and keeps edit history on this computer. You decide whether to send the draft in Codex.'}</p>
<p id="css-tuner-remember" hidden>${zh ? '同意后会保存此绑定。下次可在扩展菜单中连接此项目，也可以在那里忘记绑定。' : 'This saves the binding. Use the extension menu to connect to this project next time or forget the binding.'}</p>
<button id="css-tuner-connect" aria-describedby="css-tuner-disclosure" disabled>${zh ? '同意并打开预览' : 'Agree and open preview'}</button>
<p id="css-tuner-connect-status" role="status">${zh ? '请在已安装新版 CSS Tuner 扩展的浏览器中打开此链接。' : 'Open this link in a browser with the updated CSS Tuner extension installed.'}</p>
</main></body></html>`);
}

/** Consume transport messages before handing application frames to PageSession or Controller. */
class ExtensionSocket extends WebSocket {
  authenticated = false;
  private retired = false;

  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'message') {
      if (this.retired) return true;
      const [data, binary] = args;
      if (this.authenticated && !binary && Buffer.isBuffer(data) && data.length <= 128) {
        let frame: { type?: unknown } | null = null;
        try {
          frame = JSON.parse(data.toString('utf8'));
        } catch {
          // Application handlers decide how to handle their own frames.
        }
        if (frame?.type === 'ping') {
          this.send(JSON.stringify({ type: 'pong' }));
          return true;
        }
      }
    }
    return super.emit(event, ...args);
  }

  retire(code: number, reason: string): void {
    if (this.retired) return;
    this.retired = true;
    this.close(code, reason);
    const deadline = setTimeout(() => this.terminate(), 100);
    this.once('close', () => clearTimeout(deadline));
  }
}

export class ExtensionTransport {
  readonly sessionId = randomBytes(16).toString('hex');
  readonly pairingCode = secret();
  readonly pairingExpiresAt = Date.now() + PAIRING_TTL;

  private pairing: { origin: string; tokens: Record<Role, string> } | null = null;
  private listeningPort = 0;
  private closing: Promise<void> | null = null;
  private readonly channels = new Map<Role, ExtensionSocket>();
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, WebSocket: ExtensionSocket });
  private readonly server = createServer(
    { headersTimeout: 5000, requestTimeout: 5000, connectionsCheckingInterval: 1000 },
    (req, res) => void this.request(req, res),
  );

  private constructor(private readonly options: ExtensionTransportOptions) {
    this.server.on('upgrade', (req, socket, head) => this.upgrade(req, socket, head));
    this.server.on('clientError', (_error, socket) => socket.destroy());
  }

  static async listen(options: ExtensionTransportOptions): Promise<ExtensionTransport> {
    const url = new URL(options.pageOrigin);
    if (url.origin !== options.pageOrigin || !['http:', 'https:'].includes(url.protocol)) throw new Error('Expected a canonical HTTP(S) page origin');
    if (options.pageUrl && new URL(options.pageUrl).origin !== options.pageOrigin) throw new Error('The preview must match its authorized origin');
    const transport = new ExtensionTransport(options);
    const { server } = transport;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, HOST, () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Extension transport has no TCP address');
    transport.listeningPort = address.port;
    return transport;
  }

  get port(): number {
    return this.listeningPort;
  }

  get paired(): boolean {
    return this.pairing !== null;
  }

  activate(binding: Binding): void {
    this.pairing = { origin: binding.extension, tokens: bindingTokens(binding, this.sessionId) };
  }

  private async request(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.host !== `${HOST}:${this.port}`) return json(res, 403, { error: 'Forbidden host' });
    if (this.closing) return json(res, 503, { error: 'Session closed' });
    try {
      if (req.method === 'GET' && req.url === EXTENSION_CONNECT_PATH && this.options.pageUrl) {
        if (this.pairing || Date.now() >= this.pairingExpiresAt) return json(res, 410, { error: 'Pairing link unavailable' });
        return connectPage(res, /^zh\b/i.test(req.headers['accept-language'] ?? ''));
      }
      if (req.url === '/pair') return await this.pair(req, res);
      if (req.url === `${EXTENSION_CONNECT_PATH}/details` && this.options.pageUrl) return await this.pair(req, res, this.options.pageUrl);
      json(res, 404, { error: 'Not found' });
    } catch {
      if (res.headersSent) res.destroy();
      else json(res, 500, { error: 'Request failed' });
    }
  }

  private async pair(req: IncomingMessage, res: ServerResponse, previewUrl?: string): Promise<void> {
    const origin = req.headers.origin;
    if (!origin || !EXTENSION_ORIGIN.test(origin) || (this.pairing && this.pairing.origin !== origin)) {
      return json(res, 403, { error: 'Forbidden extension origin' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }).end();
      return;
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json(res, 415, { error: 'Expected application/json' });
    }
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > MAX_PAIRING_BODY) {
        res.setHeader('Connection', 'close');
        return json(res, 413, { error: 'Pairing request too large' });
      }
      chunks.push(chunk);
    }
    let body: { code?: unknown; pageOrigin?: unknown; pageUrl?: unknown; remember?: unknown } | null;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return json(res, 400, { error: 'Invalid JSON' });
    }
    // Check after reading the request so concurrent attempts cannot both consume the code.
    if (this.closing) return json(res, 503, { error: 'Session closed' });
    if (this.pairing || Date.now() >= this.pairingExpiresAt) return json(res, 410, { error: 'Pairing code unavailable' });
    if (!matches(body?.code, this.pairingCode)) return json(res, 403, { error: 'Pairing not authorized' });
    if (previewUrl) return json(res, 200, { url: previewUrl, root: this.options.root, chat: this.options.chat, canRemember: this.options.remember ? true : undefined });
    if (body?.pageOrigin !== this.options.pageOrigin || (body.pageUrl !== undefined && body.pageUrl !== this.options.pageUrl)) {
      return json(res, 403, { error: 'Pairing not authorized' });
    }
    const saved = body.remember === true ? this.options.remember?.(origin) : undefined;
    const tokens = saved ? bindingTokens(saved.binding, this.sessionId) : { bridge: secret(), panel: secret() };
    this.pairing = { origin, tokens };
    json(res, 200, {
      sessionId: this.sessionId, bridgeToken: tokens.bridge, panelToken: tokens.panel, chat: this.options.chat,
      binding: saved ? { id: saved.binding.id, key: saved.binding.key, port: saved.port, root: saved.binding.root } : undefined,
    });
  }

  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on('error', () => socket.destroy());
    const role = req.url === '/ws/bridge' ? 'bridge' : req.url === '/ws/panel' ? 'panel' : null;
    if (this.closing || req.headers.host !== `${HOST}:${this.port}` || !role || !this.pairing || req.headers.origin !== this.pairing.origin) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    if (this.wss.clients.size >= MAX_CONNECTIONS) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.authenticate(ws, role));
  }

  private authenticate(ws: ExtensionSocket, role: Role): void {
    const timeout = setTimeout(() => ws.retire(1008, 'Authentication timed out'), AUTH_TIMEOUT);
    ws.on('error', () => ws.terminate());
    ws.on('close', () => {
      clearTimeout(timeout);
      if (this.channels.get(role) === ws) this.channels.delete(role);
    });
    ws.once('message', (data, binary) => {
      clearTimeout(timeout);
      let auth: { type?: unknown; token?: unknown } | null = null;
      if (!binary && Buffer.isBuffer(data) && data.length <= MAX_PAIRING_BODY) {
        try {
          auth = JSON.parse(data.toString('utf8'));
        } catch {
          // An invalid first frame is an authentication failure.
        }
      }
      if (this.closing || !this.pairing || auth?.type !== 'auth' || !matches(auth.token, this.pairing.tokens[role])) {
        ws.retire(1008, 'Authentication failed');
        return;
      }
      this.channels.get(role)?.retire(SUPERSEDED, 'superseded');
      this.channels.set(role, ws);
      ws.authenticated = true;
      ws.send(JSON.stringify({ type: 'authenticated' }));
      try {
        if (role === 'bridge') this.options.onBridge(ws);
        else this.options.onPanel(ws);
      } catch {
        ws.retire(1011, 'Channel attach failed');
      }
    });
  }

  close(): Promise<void> {
    return (this.closing ??= this.shutdown());
  }

  private async shutdown(): Promise<void> {
    this.pairing = null;
    const closed = new Promise<void>((resolve) => this.server.close(() => resolve()));
    const socketsClosed = new Promise<void>((resolve) => this.wss.close(() => resolve()));
    for (const ws of this.wss.clients) ws.retire(CLOSED, 'closed');
    const deadline = setTimeout(() => this.server.closeAllConnections(), 100);
    try {
      await Promise.all([closed, socketsClosed]);
    } finally {
      clearTimeout(deadline);
    }
  }
}
