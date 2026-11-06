/** 图片和视频清单用的纯函数：页面脚本挑原图、服务端存文件时起名都用这里的 */

/** 协议包不带 DOM / Node 的类型；URL 在浏览器和 Node 里都有，这里只声明用到的部分 */
declare const URL: new (url: string, base?: string) => {
  href: string;
  origin: string;
  protocol: string;
  pathname: string;
  searchParams: { get(name: string): string | null; has(name: string): boolean };
};

/** srcset / image-set 里的一项：w 是宽度描述符，x 是像素密度 */
export interface SrcCandidate {
  url: string;
  w?: number;
  x?: number;
}

/** 按 HTML 规范的切法解析 srcset：地址里可以有逗号（data: 地址），地址以逗号结尾时这一项没有描述符 */
export function parseSrcset(srcset: string): SrcCandidate[] {
  const out: SrcCandidate[] = [];
  const n = srcset.length;
  let i = 0;
  while (i < n) {
    while (i < n && /[\s,]/.test(srcset[i])) i++;
    if (i >= n) break;
    let j = i;
    while (j < n && !/\s/.test(srcset[j])) j++;
    let url = srcset.slice(i, j);
    let desc = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
      i = j;
    } else {
      let k = j;
      let depth = 0;
      for (; k < n; k++) {
        const ch = srcset[k];
        if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (ch === ',' && depth === 0) break;
      }
      desc = srcset.slice(j, k);
      i = k + 1;
    }
    if (!url) continue;
    const c: SrcCandidate = { url };
    for (const d of desc.trim().split(/\s+/)) {
      const m = /^(\d+(?:\.\d+)?)([wx])$/i.exec(d);
      if (!m) continue;
      if (m[2].toLowerCase() === 'w') c.w = Number(m[1]);
      else c.x = Number(m[1]);
    }
    out.push(c);
  }
  return out;
}

/** 最大的一项：有宽度描述符的按宽度比，否则按像素密度比（没写算 1x） */
export function largestCandidate(list: SrcCandidate[]): SrcCandidate | null {
  if (!list.length) return null;
  const byW = list.filter((c) => c.w !== undefined);
  if (byW.length) return byW.reduce((a, b) => (b.w! > a.w! ? b : a));
  return list.reduce((a, b) => ((b.x ?? 1) > (a.x ?? 1) ? b : a));
}

/** 从 open 处的左括号起找配对的右括号（跳过引号里的），找不到返回字符串末尾 */
function closeParen(s: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return s.length;
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).replace(/\\(.)/g, '$1');
  return t;
}

/** 按顶层逗号切开（括号和引号里的逗号不算） */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

const RES_UNITS: Record<string, number> = { x: 1, dppx: 1, dpi: 1 / 96, dpcm: 2.54 / 96 };

/** image-set 里的一项：url("a.png") 2x、"a.png" 1x，可以带 type("image/avif") */
function setEntry(s: string): SrcCandidate | null {
  let url: string | null = null;
  let rest = s;
  const u = /^url\(/i.exec(s);
  if (u) {
    const end = closeParen(s, 3);
    url = unquote(s.slice(4, end));
    rest = s.slice(end + 1);
  } else if (s.startsWith('"') || s.startsWith("'")) {
    const q = s[0];
    let end = 1;
    while (end < s.length && s[end] !== q) end += s[end] === '\\' ? 2 : 1;
    url = unquote(s.slice(0, end + 1));
    rest = s.slice(end + 1);
  }
  if (!url) return null;
  const m = /(\d+(?:\.\d+)?)(x|dppx|dpi|dpcm)\b/i.exec(rest.replace(/type\([^)]*\)/gi, ''));
  return { url, x: m ? Number(m[1]) * RES_UNITS[m[2].toLowerCase()] : 1 };
}

/**
 * CSS 图片值（计算后的 background-image、content）里引用的图片地址：
 * 每个 url() 一项；image-set() 里取像素密度最大的那项
 */
export function cssImageUrls(value: string): string[] {
  const out: string[] = [];
  if (!value || value === 'none') return out;
  let i = 0;
  while (i < value.length) {
    const rest = value.slice(i, i + 20);
    const set = /^(-webkit-)?image-set\(/i.exec(rest);
    if (set) {
      const open = i + set[0].length - 1;
      const end = closeParen(value, open);
      const best = largestCandidate(splitTop(value.slice(open + 1, end)).map(setEntry).filter((c): c is SrcCandidate => !!c));
      if (best) out.push(best.url);
      i = end + 1;
      continue;
    }
    if (/^url\(/i.test(rest) && (i === 0 || !/[\w-]/.test(value[i - 1]))) {
      const end = closeParen(value, i + 3);
      const url = unquote(value.slice(i + 4, end));
      if (url) out.push(url);
      i = end + 1;
      continue;
    }
    i++;
  }
  return out;
}

/**
 * 图片优化服务包出来的地址还原成原图：Next.js / Vercel 的 /_next/image?url=、Astro 的 /_image?href=、Nuxt 的 /_ipx/修饰/路径。
 * 不是这类地址返回 null
 */
export function unwrapOptimizer(url: string): string | null {
  let u: InstanceType<typeof URL>;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const resolve = (inner: string | null) => {
    if (!inner) return null;
    try {
      return new URL(inner, u.origin).href;
    } catch {
      return null;
    }
  };
  if (/\/_(next|vercel)\/image\/?$/.test(u.pathname)) return resolve(u.searchParams.get('url'));
  if (/\/_image\/?$/.test(u.pathname) && u.searchParams.has('href')) return resolve(u.searchParams.get('href'));
  const ipx = /\/_ipx\/[^/]+\/(.+)$/.exec(u.pathname);
  if (ipx) {
    const path = decodeURIComponent(ipx[1]);
    return resolve(/^https?:\/\//.test(path) ? path : `/${path}`);
  }
  return null;
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/apng': 'apng',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/jxl': 'jxl',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/mp2t': 'ts',
};

const KNOWN_EXT = new Set([...Object.values(MIME_EXT), 'jpeg', 'jfif', 'tif', 'svgz', 'm4v', 'ogg', 'avi']);

/** Content-Type 对应的扩展名（不认识的返回 null） */
export function extForMime(mime: string | null | undefined): string | null {
  if (!mime) return null;
  return MIME_EXT[mime.split(';')[0].trim().toLowerCase()] ?? null;
}

/** 文件名里不能用的字符换成连字符，去掉首尾的点和空白，限制长度 */
export function sanitizeFileName(s: string): string {
  const clean = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s-]+|[.\s]+$/g, '');
  if (clean.length <= 120) return clean;
  const dot = clean.lastIndexOf('.');
  const ext = dot > 0 && clean.length - dot <= 6 ? clean.slice(dot) : '';
  return clean.slice(0, 120 - ext.length) + ext;
}

/** 地址里的文件名（解码、去掉查询串）；data: 和 blob: 地址、路径以 / 结尾时为空 */
export function fileNameOf(url: string): string {
  if (/^(data|blob):/i.test(url)) return '';
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  const last = path.split('/').pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    /* 留原样 */
  }
  return sanitizeFileName(name);
}

/** data: 地址里写的类型 */
export function dataUrlMime(url: string): string | null {
  const m = /^data:([^;,]*)/i.exec(url);
  return m ? m[1].toLowerCase() || 'text/plain' : null;
}

/** 文件名已经有认识的扩展名就不动，否则按类型补上 */
export function withExtension(name: string, mime: string | null | undefined): string {
  const dot = name.lastIndexOf('.');
  if (dot > 0 && KNOWN_EXT.has(name.slice(dot + 1).toLowerCase())) return name;
  const ext = extForMime(mime);
  return ext ? `${name}.${ext}` : name;
}

/** 同一个文件夹里重名时加序号：hero.png、hero-2.png、hero-3.png（不分大小写，macOS 和 Windows 都这样认） */
export function uniqueFileName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let out = name;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${base}-${n}${ext}`;
  taken.add(out.toLowerCase());
  return out;
}
