import { createReadStream, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, relative, sep } from 'node:path';
import { t } from '@css-tuner/protocol';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
};

function statOf(p: string) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

/**
 * 没有开发服务器的静态页：在 127.0.0.1 上起一个不缓存的文件服务。
 * 没有热更新，写回 CSS 后由扩展让页面重新加载对应的 <link> 样式表。
 */
export class StaticServer {
  private readonly servers = new Map<string, { server: Server; origin: string }>();

  async serve(root: string): Promise<string> {
    const known = this.servers.get(root);
    if (known) return known.origin;
    const base = normalize(root);
    let port = 0;
    const server = createServer((req, res) => {
      // 防 DNS 重绑定：别的域名解析到 127.0.0.1 时浏览器会当成同源，读到项目里的文件
      if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
        res.writeHead(403).end();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      let path: string;
      try {
        path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
      } catch {
        res.writeHead(400).end();
        return;
      }
      let file = normalize(join(base, path));
      if (file !== base && !file.startsWith(base.endsWith(sep) ? base : base + sep)) {
        res.writeHead(403).end();
        return;
      }
      let st = statOf(file);
      if (st?.isDirectory()) {
        file = join(file, 'index.html');
        st = statOf(file);
      }
      if (!st?.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end(t('ext.static.notFound', { path }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).pipe(res);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server.address() as AddressInfo).port;
    const origin = `http://127.0.0.1:${port}`;
    this.servers.set(root, { server, origin });
    return origin;
  }

  /** 根目录下文件对应的页面地址 */
  urlFor(root: string, file: string): string | null {
    const s = this.servers.get(root);
    if (!s) return null;
    const rel = relative(root, file);
    if (rel.startsWith('..')) return null;
    return `${s.origin}/${rel.split(sep).map(encodeURIComponent).join('/')}`;
  }

  dispose() {
    for (const { server } of this.servers.values()) server.close();
    this.servers.clear();
  }
}
