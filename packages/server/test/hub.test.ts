import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http, { request, type IncomingHttpHeaders, type OutgoingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { Hub, targetScope, type Site } from '../src/hub';
import { BRIDGE_TAG } from '../src/inject';

interface Res {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** 用原始请求路径发请求（fetch 会先把 ../ 规范掉），请求头可以随便填 */
function get(port: number, path: string, opts: { method?: string; headers?: OutgoingHttpHeaders } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers = { host: `127.0.0.1:${port}`, ...opts.headers };
    const req = request({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const DOC = { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none', accept: 'text/html' };

function connect(url: string, origin?: string): Promise<WebSocket | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, origin ? { origin } : {});
    ws.on('open', () => resolve(ws));
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('error', () => resolve(0));
  });
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'css-tuner-hub-'));
  const data = join(dir, 'data');
  const pub = join(dir, 'public');
  mkdirSync(join(pub, 'panel'), { recursive: true });
  writeFileSync(join(pub, 'bridge.js'), 'var __cssTunerBridge={boot(){}};');
  writeFileSync(join(pub, 'panel', 'index.js'), 'console.log("panel")');
  const panels: WebSocket[] = [];
  const make = () => new Hub({ data, publicDir: pub, version: '9.9.9', log: () => undefined, onPanel: (_s, ws) => panels.push(ws) });
  return { dir, data, pub, panels, make };
}

describe('Hub：静态站点', () => {
  const env = setup();
  const root = join(env.dir, 'site');
  let hub: Hub;
  let site: Site;

  beforeAll(async () => {
    mkdirSync(join(root, 'sub dir'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<!doctype html><html><head><title>home</title></head><body><h1>home</h1></body></html>');
    writeFileSync(join(root, 'sub dir', 'a.css'), '.a{color:red}');
    writeFileSync(join(env.dir, 'secret.txt'), 'top secret');
    hub = env.make();
    site = await hub.ensureStatic(root, env.dir);
  });
  afterAll(async () => {
    await hub.dispose();
    rmSync(env.dir, { recursive: true, force: true });
  });

  it('同一个目录复用同一个站点，地址用 localhost', async () => {
    expect(site.origin).toMatch(/^http:\/\/localhost:\d+$/);
    expect(await hub.ensureStatic(root, env.dir)).toBe(site);
    expect(hub.find(`${site.origin}/index.html`)).toBe(site);
    expect(hub.find(`http://127.0.0.1:${site.port}/`)).toBe(site);
    expect(hub.find('http://localhost:1/')).toBeUndefined();
  });

  it('HTML 在 <head> 后面插上桥接脚本，不缓存', async () => {
    const r = await get(site.port, '/', { headers: DOC });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toBe(`<!doctype html><html><head>${BRIDGE_TAG}<title>home</title></head><body><h1>home</h1></body></html>`);
  });

  it('按扩展名给类型，找不到给 404，只接受 GET/HEAD', async () => {
    const css = await get(site.port, '/sub%20dir/a.css');
    expect(css).toMatchObject({ status: 200, body: '.a{color:red}' });
    expect(css.headers['content-type']).toBe('text/css; charset=utf-8');
    expect((await get(site.port, '/missing.css')).status).toBe(404);
    expect((await get(site.port, '/index.html', { method: 'POST' })).status).toBe(405);
  });

  it('不能读到根目录外面的文件', async () => {
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/sub%20dir/..%2f..%2fsecret.txt', '/%2E%2E%5Csecret.txt']) {
      const r = await get(site.port, path);
      expect(r.body, path).not.toContain('top secret');
      expect([403, 404], path).toContain(r.status);
    }
    expect((await get(site.port, '/%E0%A4%A')).status).toBe(400);
  });

  it('Host 不是本站地址时拒绝（防 DNS 重绑定）', async () => {
    expect((await get(site.port, '/index.html', { headers: { host: `evil.example:${site.port}` } })).status).toBe(403);
    expect((await get(site.port, '/index.html', { headers: { host: '127.0.0.1:1' } })).status).toBe(403);
    expect((await get(site.port, '/index.html', { headers: { host: `localhost:${site.port}` } })).status).toBe(200);
    expect((await get(site.port, '/index.html', { headers: { host: `[::1]:${site.port}` } })).status).toBe(200);
  });

  it('根目录下的文件换成页面地址，目录外的返回 null', () => {
    expect(hub.staticUrl(site, join(root, 'sub dir', 'a.css'))).toBe(`${site.origin}/sub%20dir/a.css`);
    expect(hub.staticUrl(site, join(env.dir, 'secret.txt'))).toBeNull();
  });

  it('bridge.js 带上本站的令牌和会话；别的网站引用时拒绝', async () => {
    const r = await get(site.port, '/__css_tuner__/bridge.js', { headers: { 'sec-fetch-site': 'same-origin' } });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(r.body).toContain('var __cssTunerBridge=');
    expect(r.body).toContain(`"token":"${site.rec.token}"`);
    expect(r.body).toContain(`"session":"${site.session.id}"`);
    expect((await get(site.port, '/__css_tuner__/bridge.js', { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await get(site.port, '/__css_tuner__/panel/', { headers: { 'sec-fetch-site': 'same-site' } })).status).toBe(403);
  });

  it('面板页带连接参数，只许本站框住；面板资源不能越出目录', async () => {
    const page = await get(site.port, '/__css_tuner__/panel/');
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toBe("frame-ancestors 'self'");
    expect(page.body).toContain(`"token":"${site.rec.token}"`);
    expect((await get(site.port, '/__css_tuner__/panel/index.js')).body).toBe('console.log("panel")');
    expect((await get(site.port, '/__css_tuner__/panel/..%2f..%2fbridge.js')).status).toBe(404);
    expect((await get(site.port, '/__css_tuner__/frame?u=%2F')).headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('health 不查来源，报版本和站点', async () => {
    const r = await get(site.port, '/__css_tuner__/health', { headers: { 'sec-fetch-site': 'cross-site' } });
    expect(JSON.parse(r.body)).toEqual({ ok: true, version: '9.9.9', site: site.key });
  });

  it('桥接和面板的 WebSocket：本站页面发起、令牌对才放行', async () => {
    const ws = `ws://127.0.0.1:${site.port}/__css_tuner__/ws`;
    const token = site.rec.token;
    expect(await connect(`${ws}/bridge?token=${'0'.repeat(token.length)}`, site.origin)).toBe(403);
    expect(await connect(`${ws}/bridge?token=${token}`, 'http://evil.example')).toBe(403);
    expect(await connect(`${ws}/bridge?token=${token}`)).toBe(403);
    expect(await connect(`ws://127.0.0.1:${site.port}/other?token=${token}`, site.origin)).toBe(0);

    const bridge = await connect(`${ws}/bridge?token=${token}`, site.origin);
    expect(bridge).toBeInstanceOf(WebSocket);
    const panel = await connect(`${ws}/panel?token=${token}`, `http://127.0.0.1:${site.port}`);
    expect(panel).toBeInstanceOf(WebSocket);
    await new Promise((r) => setTimeout(r, 20));
    expect(env.panels).toHaveLength(1);
    expect(site.panels.size).toBe(1);

    // 另一个标签页连上来：先前那个收到 4409，不再重连
    const closed = new Promise<number>((r) => (bridge as WebSocket).on('close', (code) => r(code)));
    const second = (await connect(`${ws}/bridge?token=${token}`, site.origin)) as WebSocket;
    expect(await closed).toBe(4409);
    second.close();
    (panel as WebSocket).close();
  });
});

describe('targetScope：只代理本机和局域网', () => {
  const resolvesTo =
    (...addresses: string[]) =>
    async () =>
      addresses.map((address) => ({ address }));

  it('localhost、回环和内网 IP 不查 DNS 直接算本地', async () => {
    for (const u of ['http://localhost:5173', 'http://app.localhost:3000', 'http://127.0.0.1:8080', 'http://[::1]:5173', 'http://0.0.0.0:3000', 'http://192.168.1.20:5173', 'http://10.0.0.5', 'http://172.20.3.4:8000', 'http://100.101.102.103:3000', 'http://[fd12::1]:5173'])
      expect(await targetScope(new URL(u), resolvesTo('8.8.8.8')), u).toBe('local');
  });

  it('公网 IP 不算', async () => {
    for (const u of ['http://8.8.8.8', 'http://172.32.0.1:3000', 'https://[2606:4700::1111]']) expect(await targetScope(new URL(u)), u).toBe('public');
  });

  it('主机名看解析出的地址：都在内网才算，有一个公网地址就不算', async () => {
    expect(await targetScope(new URL('http://myapp.test:3000'), resolvesTo('127.0.0.1'))).toBe('local');
    expect(await targetScope(new URL('http://devbox:3000'), resolvesTo('192.168.1.8', 'fe80::1'))).toBe('local');
    expect(await targetScope(new URL('https://example.com'), resolvesTo('93.184.215.14'))).toBe('public');
    expect(await targetScope(new URL('http://mixed.test'), resolvesTo('127.0.0.1', '93.184.215.14'))).toBe('public');
  });

  it('解析不出来的主机名', async () => {
    const fail = async () => {
      throw new Error('ENOTFOUND');
    };
    expect(await targetScope(new URL('http://nowhere.invalid'), fail)).toBe('unknown');
    expect(await targetScope(new URL('http://empty.test'), resolvesTo())).toBe('unknown');
  });
});

describe('Hub：代理开发服务器', () => {
  const env = setup();
  let upstream: http.Server;
  let up = 0;
  let hub: Hub;
  let site: Site;
  const PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src \'self\'"><title>dev</title></head><body>hi</body></html>';

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      const url = req.url ?? '/';
      if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "script-src 'self'", 'X-Frame-Options': 'DENY', ETag: '"abc"', 'Content-Length': Buffer.byteLength(PAGE) });
        res.end(PAGE);
      } else if (url === '/gz') {
        const body = gzipSync(PAGE);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip', 'Content-Length': body.length });
        res.end(body);
      } else if (url === '/app.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', ETag: '"js"' });
        res.end('export const x = "<head>";');
      } else if (url === '/echo') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ host: req.headers.host, origin: req.headers.origin, referer: req.headers.referer, enc: req.headers['accept-encoding'], inm: req.headers['if-none-match'] }));
      } else if (url === '/redirect') {
        res.writeHead(302, { Location: `http://127.0.0.1:${up}/login?next=%2F` });
        res.end();
      } else {
        res.writeHead(404).end();
      }
    });
    const hmr = new WebSocketServer({ server: upstream, path: '/hmr' });
    hmr.on('connection', (ws, req) => {
      ws.send(`origin=${req.headers.origin}`);
      ws.on('message', (m) => ws.send(`echo:${m}`));
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
    up = (upstream.address() as { port: number }).port;
    hub = env.make();
    site = await hub.ensureProxy(new URL(`http://127.0.0.1:${up}/some/page`), env.dir);
  });
  afterAll(async () => {
    await hub.dispose();
    upstream.closeAllConnections();
    await new Promise((r) => upstream.close(r));
    rmSync(env.dir, { recursive: true, force: true });
  });

  it('公网网站不代理', async () => {
    await expect(hub.ensureProxy(new URL('http://8.8.8.8/'), env.dir)).rejects.toThrow(/8\.8\.8\.8/);
    expect(hub.list()).toEqual([site]);
  });

  it('按开发服务器的源复用站点；开发服务器用 127.0.0.1 时地址也用它', async () => {
    expect(site.key).toBe(`proxy:http://127.0.0.1:${up}`);
    expect(site.origin).toBe(`http://127.0.0.1:${site.port}`);
    expect(await hub.ensureProxy(new URL(`http://127.0.0.1:${up}/other`), env.dir)).toBe(site);
    expect(site.toLocal(`http://127.0.0.1:${up}/a?b=1#c`)).toBe(`${site.origin}/a?b=1#c`);
    expect(site.toTarget(`${site.origin}/a?b=1`)).toBe(`http://127.0.0.1:${up}/a?b=1`);
  });

  it('页面插上桥接脚本，去掉 CSP、X-Frame-Options 和缓存校验', async () => {
    const r = await get(site.port, '/', { headers: DOC });
    expect(r.status).toBe(200);
    expect(r.body).toBe(PAGE.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace('<head>', `<head>${BRIDGE_TAG}`));
    expect(r.headers['content-security-policy']).toBeUndefined();
    expect(r.headers['x-frame-options']).toBeUndefined();
    expect(r.headers.etag).toBeUndefined();
    expect(r.headers['content-length']).toBeUndefined();
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('压缩过的页面先解压再插', async () => {
    const r = await get(site.port, '/gz', { headers: DOC });
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.body).toContain(`<head>${BRIDGE_TAG}<meta charset="utf-8">`);
  });

  it('脚本、接口请求原样转发', async () => {
    const r = await get(site.port, '/app.js', { headers: { 'sec-fetch-dest': 'script' } });
    expect(r.body).toBe('export const x = "<head>";');
    expect(r.headers.etag).toBe('"js"');
  });

  it('Host、Origin、Referer 换成开发服务器的；跳转地址换回本地的', async () => {
    const r = await get(site.port, '/echo', { headers: { origin: site.origin, referer: `${site.origin}/page`, 'accept-encoding': 'gzip, br' } });
    expect(JSON.parse(r.body)).toEqual({ host: `127.0.0.1:${up}`, origin: `http://127.0.0.1:${up}`, referer: `http://127.0.0.1:${up}/page`, enc: 'identity' });
    const doc = await get(site.port, '/echo', { headers: { ...DOC, 'if-none-match': '"abc"' } });
    expect(JSON.parse(doc.body).inm).toBeUndefined();
    const redirect = await get(site.port, '/redirect');
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toBe(`${site.origin}/login?next=%2F`);
  });

  it('热更新的 WebSocket 接到开发服务器', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${site.port}/hmr`, { origin: site.origin });
    const got: string[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on('message', (m) => {
        got.push(String(m));
        if (got.length === 1) ws.send('ping');
        else resolve();
      });
      ws.on('error', reject);
    });
    expect(got).toEqual([`origin=http://127.0.0.1:${up}`, 'echo:ping']);
    ws.close();
  });

  it('开发服务器没开：页面给一个会自己刷新的提示，脚本请求给 502', async () => {
    const free = http.createServer();
    await new Promise<void>((r) => free.listen(0, '127.0.0.1', () => r()));
    const port = (free.address() as { port: number }).port;
    await new Promise((r) => free.close(r));
    const dead = await hub.ensureProxy(new URL(`http://127.0.0.1:${port}`), env.dir);
    const doc = await get(dead.port, '/', { headers: DOC });
    expect(doc.status).toBe(502);
    expect(doc.body).toContain('http-equiv="refresh"');
    expect(doc.body).toContain(`http://127.0.0.1:${port}`);
    expect((await get(dead.port, '/main.js', { headers: { 'sec-fetch-dest': 'script' } })).status).toBe(502);
    await hub.close(dead);
    expect(hub.get(dead.key)).toBeUndefined();
  });
});

describe('Hub：重启以后', () => {
  const env = setup();
  afterAll(() => rmSync(env.dir, { recursive: true, force: true }));

  it('上次开着的站点用同样的端口和令牌恢复，关掉的不恢复', async () => {
    const root = join(env.dir, 'site');
    const other = join(env.dir, 'other');
    mkdirSync(root);
    mkdirSync(other);
    const first = env.make();
    const site = await first.ensureStatic(root, env.dir);
    const closed = await first.ensureStatic(other, env.dir);
    const { port, token } = site.rec;
    await first.close(closed);
    await first.dispose();

    const second = env.make();
    const restored = await second.restore();
    expect(restored.map((s) => s.key)).toEqual([site.key]);
    expect(restored[0].rec).toMatchObject({ port, token });
    // 关掉的站点再打开时还用原来的端口
    const again = await second.ensureStatic(other, env.dir);
    expect(again.port).toBe(closed.port);
    await second.dispose();
  });
});
