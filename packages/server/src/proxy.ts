import http, { type IncomingHttpHeaders, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from 'node:http';
import https from 'node:https';
import type { Duplex, Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { injectHead } from './inject';

/** 逐跳的头只管这一段连接，不往下传 */
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

/** 页面的 HTML 改过了：长度、缓存校验、CSP（会拦掉注入的脚本）、不许被框住（设备框）都不再适用 */
const DROP_ON_HTML = ['content-length', 'content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'etag', 'last-modified', 'content-encoding'];

export interface ProxySite {
  /** 本地服务的源，如 http://localhost:15173 */
  origin: string;
  target: URL;
}

function swapOrigin(value: string, from: string, to: string): string {
  return value === from || value.startsWith(`${from}/`) ? to + value.slice(from.length) : value;
}

/** 发给开发服务器的请求头：Host、Origin、Referer 换成开发服务器自己的（Vite 查 Host，Next 查跨源的开发请求） */
export function upstreamHeaders(req: IncomingMessage, site: ProxySite, upgrade: boolean): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (!upgrade && HOP.has(k)) continue;
    out[k] = v;
  }
  out.host = site.target.host;
  if (typeof req.headers.origin === 'string') out.origin = swapOrigin(req.headers.origin, site.origin, site.target.origin);
  if (typeof req.headers.referer === 'string') out.referer = swapOrigin(req.headers.referer, site.origin, site.target.origin);
  // HTML 要插脚本，不要压缩；本机之间也不在乎这点流量
  out['accept-encoding'] = 'identity';
  if (isDocument(req)) {
    delete out['if-none-match'];
    delete out['if-modified-since'];
  }
  return out;
}

/** 浏览器要的是一个页面（顶层或 iframe），不是脚本里的 fetch */
export function isDocument(req: IncomingMessage): boolean {
  const dest = req.headers['sec-fetch-dest'];
  if (typeof dest === 'string') return dest === 'document' || dest === 'iframe' || dest === 'frame';
  return req.method === 'GET' && /text\/html/.test(String(req.headers.accept ?? ''));
}

/** 开发服务器回的头：去掉逐跳的，跳转地址换回本地服务的源 */
export function downstreamHeaders(headers: IncomingHttpHeaders, site: ProxySite, html: boolean): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || HOP.has(k)) continue;
    if (html && DROP_ON_HTML.includes(k)) continue;
    out[k] = v;
  }
  if (typeof headers.location === 'string') out.location = swapOrigin(headers.location, site.target.origin, site.origin);
  if (html) out['cache-control'] = 'no-store';
  return out;
}

function decoded(res: IncomingMessage): Readable {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(createGunzip());
  if (enc === 'br') return res.pipe(createBrotliDecompress());
  if (enc === 'deflate') return res.pipe(createInflate());
  return res;
}

/** HTML 边收边转：攒到能插脚本的位置就插上，后面的原样流过去（流式渲染的页面不会被憋住） */
function pipeInjected(src: Readable, res: ServerResponse) {
  let head = '';
  let done = false;
  const flush = (final: boolean) => {
    const out = injectHead(head, final);
    if (out === null) return;
    done = true;
    head = '';
    res.write(Buffer.from(out, 'latin1'));
  };
  src.on('data', (chunk: Buffer) => {
    if (done) {
      res.write(chunk);
      return;
    }
    // latin1 一个字节对一个字符，改完再按 latin1 写回，非 UTF-8 的页面也不会乱码
    head += chunk.toString('latin1');
    flush(false);
  });
  src.on('end', () => {
    if (!done) flush(true);
    res.end();
  });
  src.on('error', () => res.destroy());
}

export interface ProxyHooks {
  /** 开发服务器连不上时的页面 */
  unreachable(res: ServerResponse, error: Error): void;
}

export function proxyRequest(req: IncomingMessage, res: ServerResponse, site: ProxySite, hooks: ProxyHooks) {
  const secure = site.target.protocol === 'https:';
  const doc = isDocument(req);
  const upstream = (secure ? https : http).request(
    {
      host: site.target.hostname,
      port: site.target.port || (secure ? 443 : 80),
      method: req.method,
      path: req.url,
      headers: upstreamHeaders(req, site, false),
      // 本地开发服务器的自签证书
      rejectUnauthorized: false,
    },
    (pres) => {
      const html = doc && /text\/html/i.test(String(pres.headers['content-type'] ?? '')) && req.method !== 'HEAD';
      res.writeHead(pres.statusCode ?? 502, pres.statusMessage, downstreamHeaders(pres.headers, site, html));
      if (html) pipeInjected(decoded(pres), res);
      else pres.pipe(res);
    },
  );
  upstream.on('error', (e) => {
    if (res.headersSent) res.destroy();
    else hooks.unreachable(res, e);
  });
  res.on('close', () => {
    if (!res.writableFinished) upstream.destroy();
  });
  req.pipe(upstream);
}

function rawHeaderBlock(res: IncomingMessage): string {
  const lines: string[] = [];
  for (let i = 0; i < res.rawHeaders.length; i += 2) lines.push(`${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}`);
  return lines.join('\r\n');
}

/** 热更新的 WebSocket（Vite、Next 的 HMR）原样接到开发服务器 */
export function proxyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, site: ProxySite) {
  const secure = site.target.protocol === 'https:';
  const upstream = (secure ? https : http).request({
    host: site.target.hostname,
    port: site.target.port || (secure ? 443 : 80),
    method: req.method,
    path: req.url,
    headers: upstreamHeaders(req, site, true),
    rejectUnauthorized: false,
  });
  upstream.on('upgrade', (pres, psocket, phead) => {
    socket.write(`HTTP/1.1 ${pres.statusCode ?? 101} ${pres.statusMessage ?? 'Switching Protocols'}\r\n${rawHeaderBlock(pres)}\r\n\r\n`);
    if (phead.length) socket.write(phead);
    if (head.length) psocket.write(head);
    psocket.pipe(socket).pipe(psocket);
    const close = () => {
      psocket.destroy();
      socket.destroy();
    };
    psocket.on('error', close);
    socket.on('error', close);
    psocket.on('close', close);
    socket.on('close', close);
  });
  upstream.on('response', (pres) => {
    // 开发服务器不肯升级：把它的回复原样给浏览器
    socket.write(`HTTP/1.1 ${pres.statusCode} ${pres.statusMessage}\r\n${rawHeaderBlock(pres)}\r\n\r\n`);
    pres.pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  upstream.end();
}
