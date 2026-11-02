/**
 * Next.js 开发态栈帧的纯函数：把 React / Turbopack 给的 URL 换成开发服务器
 * /__nextjs_original-stack-frames 接口认的模块 URL，并从中认出构建目录和项目根。
 */

/** React 把服务端组件的调用栈伪造成 about://React/Server/<服务端模块 URL>?<序号> */
export const SERVER_URL = /^(?:about|rsc):\/\/React\/[^/]+\/(.+?)(?:\?\d+)?$/;

export function decodeOnce(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 服务端热更新后 React 伪造的文件 URL 会被多编码一层（%2520），一直解到不变为止 */
export function decodeAll(s: string): string {
  for (let i = 0; i < 4; i++) {
    const next = decodeOnce(s);
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * 服务端组件帧发给接口的模块 URL：去掉伪造的前缀和末尾的 ?N 计数，
 * 否则路径带空格或方括号时接口会判成“项目外的文件”；热更新后的 ?id= 要保留，多出来的那层编码解掉
 */
export function serverModuleUrl(url: string): string | null {
  const s = SERVER_URL.exec(url);
  if (!s) return null;
  return s[1].includes('%25') ? decodeOnce(s[1]) : s[1];
}

/** 从服务端组件帧里认出 Next 构建目录（本地路径，默认 <项目>/.next/dev） */
export function distDirOf(url: string): string | null {
  const m = SERVER_URL.exec(url);
  const d = m && /^file:\/\/(.+?)\/server\/(?:chunks|app|pages)\//.exec(m[1]);
  if (!d) return null;
  const p = decodeAll(d[1]);
  return /^\/[A-Za-z]:\//.test(p) ? p.slice(1) : p;
}

/** 客户端 chunk 帧照 Next 自己的做法换成 file://<构建目录>/static/…；接口只解一层编码，路径部分给原样的本地路径 */
export function clientModuleUrl(url: string, dist: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const m = /\/_next(\/static\/.+)$/.exec(u.pathname);
  if (!m) return null;
  return `file://${dist.startsWith('/') ? '' : '/'}${dist}${m[1]}${u.search}`;
}

/** 接口返回相对项目根的路径；项目根是构建目录（默认 .next/dev）的上级 */
export function projectRootOf(dist: string): string {
  const std = /^(.*)\/\.next(?:\/dev)?$/.exec(dist);
  if (std) return std[1];
  const parts = dist.split('/');
  return parts.slice(0, parts.length - (parts[parts.length - 1] === 'dev' ? 2 : 1)).join('/');
}

export function joinPath(root: string, rel: string): string {
  const out = root.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
}
