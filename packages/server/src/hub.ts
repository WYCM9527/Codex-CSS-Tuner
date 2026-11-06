import { randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { BlockList, isIP } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { t } from '@css-tuner/protocol';
import { Emitter } from './events';
import { BRIDGE_PATH, BRIDGE_WS, FRAME_PATH, PANEL_PATH, PANEL_WS, PREFIX, bridgeScript } from './inject';
import { frameHtml, panelHtml, unreachableHtml } from './pages';
import { isDocument, proxyRequest, proxyUpgrade } from './proxy';
import { CLOSED, GOING_AWAY, PageSession } from './session';
import { serveStatic, staticPath } from './static';
import { JsonStore } from './store';

export type SiteKind = 'proxy' | 'static';

/** 记在 sites.json 里：同一个开发服务器下次还用同一个端口和令牌，页面开着时服务重启也能直接连回来 */
export interface SiteRecord {
  key: string;
  kind: SiteKind;
  /** 代理：开发服务器的源，如 http://localhost:5173 */
  target?: string;
  /** 静态：网站根目录 */
  root?: string;
  port: number;
  token: string;
  /** 打开它的项目（项目根目录） */
  project: string;
}

/** 本机、局域网和 Tailscale 这类内网的地址 */
const LOCAL_NETS = new BlockList();
for (const [net, bits] of [['0.0.0.0', 32], ['127.0.0.0', 8], ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['169.254.0.0', 16], ['100.64.0.0', 10]] as const)
  LOCAL_NETS.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::1', 128], ['fc00::', 7], ['fe80::', 10]] as const) LOCAL_NETS.addSubnet(net, bits, 'ipv6');

function localAddress(address: string): boolean {
  const family = isIP(address);
  return family !== 0 && LOCAL_NETS.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export type LookupAll = (host: string) => Promise<Array<{ address: string }>>;

/**
 * 只代理本机和局域网里的开发服务器：公网网站经过代理会被去掉 CSP，还会收到浏览器给 localhost 的 Cookie。
 * 主机名按系统解析（认 /etc/hosts），解析出的地址都在内网才算
 */
export async function targetScope(target: URL, lookupAll: LookupAll = (host) => lookup(host, { all: true })): Promise<'local' | 'public' | 'unknown'> {
  const host = target.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return 'local';
  if (isIP(host)) return localAddress(host) ? 'local' : 'public';
  try {
    const all = await lookupAll(host);
    if (!all.length) return 'unknown';
    return all.every((a) => localAddress(a.address)) ? 'local' : 'public';
  } catch {
    return 'unknown';
  }
}

/** 一个本地站点：一个端口，代理一个开发服务器或者服务一个静态目录，带一个页面会话 */
export class Site {
  readonly session: PageSession;
  readonly panels = new Set<WebSocket>();
  /** 升级过的连接（桥接、面板、HMR）不归 HTTP 服务管，关站点时要自己断 */
  readonly sockets = new Set<Duplex>();
  servers: Server[] = [];

  constructor(
    readonly rec: SiteRecord,
    log: (msg: string) => void,
  ) {
    this.session = new PageSession(log);
  }

  get key() {
    return this.rec.key;
  }
  get kind() {
    return this.rec.kind;
  }
  get port() {
    return this.rec.port;
  }
  get project() {
    return this.rec.project;
  }
  get target(): URL | null {
    return this.rec.target ? new URL(this.rec.target) : null;
  }
  get root(): string | null {
    return this.rec.root ?? null;
  }

  /** 给出去的地址用 localhost（内置浏览器的注释接口要求安全上下文）；开发服务器本身用 127.0.0.1 时跟着它 */
  get hostname(): string {
    return this.target?.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
  }
  get origin(): string {
    return `http://${this.hostname}:${this.port}`;
  }

  /** 浏览器可能用的几个写法：localhost、127.0.0.1、[::1] 加端口 */
  hosts(): string[] {
    return ['localhost', '127.0.0.1', '[::1]'].map((h) => `${h}:${this.port}`);
  }

  owns(url: string): boolean {
    try {
      const u = new URL(url);
      return u.protocol === 'http:' && this.hosts().includes(u.host.toLowerCase());
    } catch {
      return false;
    }
  }

  /** 开发服务器上的地址换成本地站点上的；静态站点给根目录下的路径或文件 */
  toLocal(url: string): string {
    const target = this.target;
    if (target) {
      const u = new URL(url, target);
      return `${this.origin}${u.pathname}${u.search}${u.hash}`;
    }
    return new URL(url, `${this.origin}/`).href;
  }

  /** 本地站点上的地址换回开发服务器的（交给 Codex 的提示词里写原来的地址） */
  toTarget(url: string): string {
    const target = this.target;
    if (!target || !this.owns(url)) return url;
    const u = new URL(url);
    return `${target.origin}${u.pathname}${u.search}${u.hash}`;
  }
}

function tokenOk(given: string | null, want: string): boolean {
  if (!given || given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

const PANEL_MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export interface HubOptions {
  data: string;
  /** 构建好的 bridge.js 和 panel/ 所在目录 */
  publicDir: string;
  version: string;
  log: (msg: string) => void;
  /** 面板连上来了 */
  onPanel: (site: Site, ws: WebSocket) => void;
}

interface Saved {
  known: Record<string, SiteRecord>;
  open: string[];
}

/**
 * 本地站点的管理：每个开发服务器（或静态目录）一个端口。页面、桥接脚本、面板都在同一个源上，
 * 所以页面里的桥接脚本和面板连回来不受页面 CSP 和跨源限制
 */
export class Hub {
  private readonly sites = new Map<string, Site>();
  private readonly store: JsonStore;
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
  private readonly changed = new Emitter<Site>();
  readonly onSite = this.changed.event;
  private bridgeBundle: { mtime: number; text: string } | null = null;

  constructor(private readonly opts: HubOptions) {
    this.store = new JsonStore(join(opts.data, 'sites.json'));
  }

  private saved(): Saved {
    const v = this.store.get<Saved>('sites');
    return v && typeof v === 'object' ? { known: v.known ?? {}, open: v.open ?? [] } : { known: {}, open: [] };
  }

  private persist() {
    const s = this.saved();
    for (const site of this.sites.values()) s.known[site.key] = site.rec;
    s.open = [...this.sites.keys()];
    void this.store.update('sites', s);
  }

  list(): Site[] {
    return [...this.sites.values()];
  }

  get(key: string): Site | undefined {
    return this.sites.get(key);
  }

  /** 地址是哪个本地站点上的 */
  find(url: string): Site | undefined {
    return this.list().find((s) => s.owns(url));
  }

  /** 代理这个开发服务器（已经在代理就直接用） */
  async ensureProxy(target: URL, project: string): Promise<Site> {
    const origin = target.origin;
    const scope = await targetScope(target);
    if (scope !== 'local') throw new Error(t(scope === 'public' ? 'ext.open.notLocal' : 'ext.open.unknownHost', { target: origin }));
    const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
    const preferred = port + 10000 <= 65535 ? [port + 10000] : [];
    return this.ensure(`proxy:${origin}`, { kind: 'proxy', target: origin, project }, preferred);
  }

  /** 服务一个静态目录 */
  ensureStatic(root: string, project: string): Promise<Site> {
    const abs = resolve(root);
    return this.ensure(`static:${abs}`, { kind: 'static', root: abs, project }, []);
  }

  private async ensure(key: string, init: Omit<SiteRecord, 'key' | 'port' | 'token'>, preferred: number[]): Promise<Site> {
    const live = this.sites.get(key);
    if (live) {
      if (live.rec.project !== init.project) {
        live.rec.project = init.project;
        this.persist();
        this.changed.fire(live);
      }
      return live;
    }
    const known = this.saved().known[key];
    const rec: SiteRecord = { ...init, key, port: known?.port ?? 0, token: known?.token ?? randomBytes(24).toString('hex') };
    const site = new Site(rec, this.opts.log);
    await this.listen(site, [rec.port, ...preferred, ...preferred.flatMap((p) => [p + 1, p + 2, p + 3])]);
    this.sites.set(key, site);
    this.persist();
    this.opts.log(`site ${key} → ${site.origin}`);
    this.changed.fire(site);
    return site;
  }

  /** 上次开着的站点（服务重启、升级以后）：页面还开着的话会自己连回来 */
  async restore(): Promise<Site[]> {
    const s = this.saved();
    const out: Site[] = [];
    for (const key of s.open) {
      const rec = s.known[key];
      if (!rec) continue;
      try {
        if (rec.kind === 'proxy' && rec.target) out.push(await this.ensureProxy(new URL(rec.target), rec.project));
        else if (rec.kind === 'static' && rec.root && existsSync(rec.root)) out.push(await this.ensureStatic(rec.root, rec.project));
      } catch (e) {
        this.opts.log(`restore ${key} failed: ${(e as Error).message}`);
      }
    }
    return out;
  }

  private async listen(site: Site, ports: number[]) {
    const tried = new Set<number>();
    for (const port of [...ports.filter((p) => p > 0 && p < 65536), 0, 0, 0]) {
      if (port && tried.has(port)) continue;
      tried.add(port);
      const v4 = this.server(site);
      const got = await bind(v4, port, '127.0.0.1');
      if (got === null) continue;
      // 浏览器把 localhost 先解析成 ::1 时也要连到这里；::1 上的这个端口被别人占着就换一个端口
      const v6 = this.server(site);
      const six = await bind(v6, got, '::1');
      if (six === null && (v6 as Server & { bindError?: string }).bindError === 'EADDRINUSE') {
        v4.close();
        continue;
      }
      site.rec.port = got;
      site.servers = six === null ? [v4] : [v4, v6];
      return;
    }
    throw new Error('no free port');
  }

  private server(site: Site): Server {
    const server = http.createServer((req, res) => this.request(site, req, res));
    server.on('upgrade', (req, socket, head) => this.upgrade(site, req, socket, head));
    server.on('clientError', (_e, socket) => socket.destroy());
    return server;
  }

  /** 防 DNS 重绑定：只认 localhost、127.0.0.1、[::1] 加本站端口这几种 Host */
  private hostOk(site: Site, host: string | undefined): boolean {
    return !!host && site.hosts().includes(host.toLowerCase());
  }

  /** 页面里的脚本标签和 iframe 是同源请求；别的网站引用这些地址时浏览器会标成跨站 */
  private sameSite(req: IncomingMessage): boolean {
    const v = req.headers['sec-fetch-site'];
    return v === undefined || v === 'same-origin' || v === 'none';
  }

  private request(site: Site, req: IncomingMessage, res: ServerResponse) {
    if (!this.hostOk(site, req.headers.host)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('forbidden host');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith(PREFIX)) {
      this.internal(site, url, req, res);
      return;
    }
    const origin = `http://${req.headers.host!.toLowerCase()}`;
    if (site.kind === 'proxy') {
      proxyRequest(req, res, { origin, target: site.target! }, { unreachable: (r, e) => this.unreachable(site, req, r, e) });
    } else {
      serveStatic(req, res, site.root!);
    }
  }

  private unreachable(site: Site, req: IncomingMessage, res: ServerResponse, e: Error) {
    const code = (e as NodeJS.ErrnoException).code ?? e.message;
    if (isDocument(req)) {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(unreachableHtml(site.target!.origin, code));
    } else {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`css-tuner: ${site.target!.origin} ${code}`);
    }
  }

  private readBridge(): string | null {
    const file = join(this.opts.publicDir, 'bridge.js');
    try {
      const mtime = statSync(file).mtimeMs;
      if (!this.bridgeBundle || this.bridgeBundle.mtime !== mtime) this.bridgeBundle = { mtime, text: readFileSync(file, 'utf8') };
      return this.bridgeBundle.text;
    } catch {
      return null;
    }
  }

  private internal(site: Site, url: URL, req: IncomingMessage, res: ServerResponse) {
    const path = url.pathname;
    const noStore = { 'Cache-Control': 'no-store' };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (path === `${PREFIX}health`) {
      res.writeHead(200, { 'Content-Type': 'application/json', ...noStore }).end(JSON.stringify({ ok: true, version: this.opts.version, site: site.key }));
      return;
    }
    if (!this.sameSite(req)) {
      res.writeHead(403).end();
      return;
    }
    if (path === BRIDGE_PATH) {
      const bundle = this.readBridge();
      if (!bundle) {
        res.writeHead(500, { 'Content-Type': 'text/javascript', ...noStore }).end('console.warn("[css-tuner] bridge.js is missing; run pnpm build")');
        return;
      }
      const text = { pill: t('bridge.pill'), pillTitle: t('bridge.pill.title'), superseded: t('bridge.superseded'), resize: t('bridge.resize') };
      const js = bridgeScript(bundle, { token: site.rec.token, session: site.session.id, ws: BRIDGE_WS, panel: PANEL_PATH, frame: FRAME_PATH, text });
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', ...noStore }).end(js);
      return;
    }
    const framing = { 'Content-Security-Policy': "frame-ancestors 'self'", 'X-Frame-Options': 'SAMEORIGIN' };
    if (path === FRAME_PATH) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...noStore, ...framing }).end(frameHtml());
      return;
    }
    if (path === PANEL_PATH || path === `${PANEL_PATH}index.html`) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...noStore, ...framing }).end(panelHtml({ ws: PANEL_WS, token: site.rec.token }));
      return;
    }
    if (path.startsWith(PANEL_PATH)) {
      const base = normalize(join(this.opts.publicDir, 'panel'));
      const file = normalize(join(base, decodeURIComponent(path.slice(PANEL_PATH.length))));
      if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': PANEL_MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404).end();
  }

  private upgrade(site: Site, req: IncomingMessage, socket: Duplex, head: Buffer) {
    socket.on('error', () => socket.destroy());
    if (!this.hostOk(site, req.headers.host)) {
      socket.destroy();
      return;
    }
    site.sockets.add(socket);
    socket.on('close', () => site.sockets.delete(socket));
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === BRIDGE_WS || url.pathname === PANEL_WS) {
      // 只认本站页面发起的连接（浏览器填的 Origin 页面改不了）
      const origin = String(req.headers.origin ?? '');
      if (!site.owns(`${origin}/`) || !tokenOk(url.searchParams.get('token'), site.rec.token)) {
        socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        if (url.pathname === BRIDGE_WS) {
          site.session.attach(ws);
          return;
        }
        site.panels.add(ws);
        ws.on('close', () => site.panels.delete(ws));
        this.opts.onPanel(site, ws);
      });
      return;
    }
    if (site.kind === 'proxy') proxyUpgrade(req, socket, head, { origin: `http://${req.headers.host!.toLowerCase()}`, target: site.target! });
    else socket.destroy();
  }

  /** 静态站点上这个文件的地址 */
  staticUrl(site: Site, file: string): string | null {
    const p = site.root ? staticPath(site.root, file) : null;
    return p ? `${site.origin}${p}` : null;
  }

  /** 有页面或面板连着的站点数 */
  active(): number {
    return this.list().filter((s) => s.session.state === 'connected' || s.panels.size > 0).length;
  }

  /** 不再服务这个站点：页面收起面板，端口释放 */
  async close(site: Site) {
    this.sites.delete(site.key);
    this.persist();
    await this.shut(site, CLOSED);
    this.changed.fire(site);
  }

  /** 服务退出：站点还记着是开着的，下次起来时恢复，页面会自己连回来 */
  async dispose() {
    const sites = this.list();
    this.sites.clear();
    this.store.flush();
    await Promise.all(sites.map((s) => this.shut(s, GOING_AWAY)));
    this.wss.close();
  }

  private async shut(site: Site, code: number) {
    site.session.dispose(code);
    for (const ws of site.panels) ws.close(code, code === CLOSED ? 'closed' : 'shutdown');
    const closed = site.servers.map((s) => new Promise<void>((r) => s.close(() => r())));
    // 关闭握手给一点时间，然后连同长连接（HMR、空闲的 keep-alive）一起断掉
    await new Promise((r) => setTimeout(r, 100));
    for (const s of site.sockets) s.destroy();
    for (const s of site.servers) s.closeAllConnections();
    await Promise.all(closed);
  }
}

/** 在 host:port 上监听，返回实际端口；端口被占用或地址不可用时返回 null（原因记在 server.bindError） */
function bind(server: Server, port: number, host: string): Promise<number | null> {
  return new Promise((resolve) => {
    const onError = (e: NodeJS.ErrnoException) => {
      (server as Server & { bindError?: string }).bindError = e.code;
      resolve(null);
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      const addr = server.address();
      resolve(addr && typeof addr === 'object' ? addr.port : null);
    });
  });
}
