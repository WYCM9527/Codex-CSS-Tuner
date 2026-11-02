import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { BridgeServer } from '../src/server';
import { StaticServer } from '../src/static';

function connect(url: string): Promise<'open' | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => {
      ws.close();
      resolve('open');
    });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('error', () => resolve(0));
  });
}

interface Res {
  status: number;
  type: string | undefined;
  cache: string | undefined;
  body: string;
}

/** 用原始请求路径发请求（fetch 会先把 ../ 规范掉），可以改 Host 头 */
function get(origin: string, path: string, opts: { method?: string; host?: string } = {}): Promise<Res> {
  const u = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = request({ host: u.hostname, port: u.port, path, method: opts.method ?? 'GET', headers: opts.host ? { host: opts.host } : {} }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'], cache: res.headers['cache-control'], body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('BridgeServer', () => {
  const server = new BridgeServer();
  let base = '';

  beforeAll(async () => {
    const port = await server.start();
    base = `ws://127.0.0.1:${port}/bridge`;
    server.register('s1', () => undefined);
  });
  afterAll(() => server.dispose());

  it('每次启动生成随机 token', () => {
    expect(server.token).toMatch(/^[0-9a-f]{48}$/);
    expect(new BridgeServer().token).not.toBe(server.token);
  });

  it('token、会话、路径都对才放行', async () => {
    expect(await connect(`${base}?token=${server.token}&session=s1`)).toBe('open');
    expect(await connect(`${base}?token=${'0'.repeat(48)}&session=s1`)).toBe(401);
    expect(await connect(`${base}?token=${server.token.slice(1)}&session=s1`)).toBe(401);
    expect(await connect(`${base}?token=${server.token}&session=nope`)).toBe(401);
    expect(await connect(`${base.replace('/bridge', '/other')}?token=${server.token}&session=s1`)).toBe(401);
  });

  it('注销会话后拒绝；模拟 CSP 时全部拒绝', async () => {
    const off = server.register('s2', () => undefined);
    expect(await connect(`${base}?token=${server.token}&session=s2`)).toBe('open');
    off();
    expect(await connect(`${base}?token=${server.token}&session=s2`)).toBe(401);
    server.refuseAll = true;
    expect(await connect(`${base}?token=${server.token}&session=s1`)).toBe(401);
    server.refuseAll = false;
  });
});

describe('StaticServer', () => {
  const statics = new StaticServer();
  const outer = mkdtempSync(join(tmpdir(), 'css-tuner-static-'));
  const root = join(outer, 'site');
  let origin = '';

  beforeAll(async () => {
    mkdirSync(join(root, 'sub dir'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<h1>home</h1>');
    writeFileSync(join(root, 'sub dir', 'a.css'), '.a{color:red}');
    writeFileSync(join(outer, 'secret.txt'), 'top secret');
    origin = await statics.serve(root);
  });
  afterAll(() => {
    statics.dispose();
    rmSync(outer, { recursive: true, force: true });
  });

  it('只监听 127.0.0.1，同一个目录复用同一个服务', async () => {
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await statics.serve(root)).toBe(origin);
  });

  it('按扩展名给类型、不缓存，目录取 index.html', async () => {
    const css = await get(origin, '/sub%20dir/a.css');
    expect(css).toMatchObject({ status: 200, type: 'text/css; charset=utf-8', cache: 'no-store', body: '.a{color:red}' });
    expect(await get(origin, '/')).toMatchObject({ status: 200, body: '<h1>home</h1>' });
    expect((await get(origin, '/missing.css')).status).toBe(404);
    expect((await get(origin, '/index.html', { method: 'POST' })).status).toBe(405);
  });

  it('不能读到根目录外面的文件', async () => {
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/sub%20dir/..%2f..%2fsecret.txt', '/%2E%2E%5Csecret.txt']) {
      const r = await get(origin, path);
      expect(r.body, path).not.toContain('top secret');
      expect([403, 404], path).toContain(r.status);
    }
    expect((await get(origin, '/%E0%A4%A')).status).toBe(400);
  });

  it('Host 不是本机地址时拒绝（防 DNS 重绑定）', async () => {
    const port = new URL(origin).port;
    expect((await get(origin, '/index.html', { host: `evil.example:${port}` })).status).toBe(403);
    expect((await get(origin, '/index.html', { host: '127.0.0.1:1' })).status).toBe(403);
    expect((await get(origin, '/index.html', { host: `localhost:${port}` })).status).toBe(200);
  });

  it('根目录下的文件换成页面地址，目录外的返回 null', () => {
    expect(statics.urlFor(root, join(root, 'sub dir', 'a.css'))).toBe(`${origin}/sub%20dir/a.css`);
    expect(statics.urlFor(root, join(outer, 'secret.txt'))).toBeNull();
    expect(statics.urlFor(join(outer, 'other'), join(root, 'index.html'))).toBeNull();
  });
});
