import { createReadStream, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, relative, sep } from 'node:path';
import { t } from '@css-tuner/protocol';
import { injectHead } from './inject';

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
 * 没有开发服务器的静态页：直接读项目里的文件，不缓存，HTML 里插上桥接脚本。
 * 没有热更新，CSS 文件改了以后由 CSS Tuner 让页面重新加载对应的 <link> 样式表
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, root: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const base = normalize(root);
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
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  if (type.startsWith('text/html')) {
    const html = Buffer.from(injectHead(readFileSync(file).toString('latin1'), true)!, 'latin1');
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': html.length, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : html);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}

/** 根目录下文件对应的路径（/a/b.html），不在根目录下返回 null */
export function staticPath(root: string, file: string): string | null {
  const rel = relative(root, file);
  if (rel.startsWith('..') || rel.includes(':')) return null;
  return `/${rel.split(sep).map(encodeURIComponent).join('/')}`;
}
