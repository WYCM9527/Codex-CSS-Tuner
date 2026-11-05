import {
  cssImageUrls,
  dataUrlMime,
  extForMime,
  fileNameOf,
  largestCandidate,
  parseColor,
  parseSrcset,
  sanitizeFileName,
  toHex,
  unwrapOptimizer,
  type AssetItem,
  type AssetKind,
  type AssetList,
  type BridgeMethods,
  type SrcCandidate,
} from '@css-tuner/protocol';
import { isOwnNode, uidOf } from './util';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const OPEN: Box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };

/** 收集到的一条：同一个 key 出现几次合并成一条 */
interface Hit {
  key: string;
  kind: AssetKind;
  url: string | null;
  shown: string | null;
  name: string;
  el: Element;
  /** 要下载的那项和正在显示的那项在 srcset 里的描述符：算原图尺寸用 */
  pick?: SrcCandidate;
  shownPick?: SrcCandidate;
  streaming?: boolean;
  count: number;
}

type Found = Omit<Hit, 'key' | 'count'>;

/** 不往里走的元素：不渲染的、别的文档、这一版不管的音频和画布；SVG 和视频整个算一条 */
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'IFRAME', 'FRAME', 'CANVAS', 'AUDIO', 'OBJECT', 'EMBED', 'LINK', 'META', 'SOURCE', 'TRACK']);
const LAZY_SRC = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy'];
const LAZY_SET = ['data-srcset', 'data-lazy-srcset'];
/** 页面脚本读 blob: 字节的上限：base64 之后要在 32MB 的 WebSocket 消息里放得下 */
const MAX_BLOB = 22 * 1024 * 1024;
const MAX_ITEMS = 300;

function abs(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u, document.baseURI).href;
  } catch {
    return null;
  }
}

function resolveSet(srcset: string): SrcCandidate[] {
  return parseSrcset(srcset).map((c) => ({ ...c, url: abs(c.url) ?? c.url }));
}

/** 没有文件名可取（data:、blob: 地址）时按类型起名 */
function nameFor(url: string | null, kind: AssetKind): string {
  const fromUrl = url ? fileNameOf(url) : '';
  if (fromUrl) return fromUrl;
  const ext = url?.startsWith('data:') ? extForMime(dataUrlMime(url)) : null;
  return ext ? `${kind}.${ext}` : kind;
}

/** 懒加载还没换上真图：显示的是占位用的小 data: 图或 1px 图 */
function isPlaceholder(img: HTMLImageElement, shown: string): boolean {
  return !shown || (shown.startsWith('data:') && shown.length < 4096) || (img.complete && img.naturalWidth <= 2);
}

function imageHit(img: HTMLImageElement): Found | null {
  let shown = img.currentSrc || img.src || '';
  const sets: SrcCandidate[][] = [];
  const pic = img.parentElement?.tagName === 'PICTURE' ? img.parentElement : null;
  if (pic) for (const s of Array.from(pic.querySelectorAll(':scope > source[srcset]'))) sets.push(resolveSet(s.getAttribute('srcset') ?? ''));
  const own = img.getAttribute('srcset');
  if (own) sets.push(resolveSet(own));
  // 响应式图片：在包含当前显示的那张的那组里挑最大的（<picture> 各组可能是不同裁切或格式）
  let set = sets.find((c) => c.some((x) => x.url === shown)) ?? (own ? sets[sets.length - 1] : null);
  if (isPlaceholder(img, shown)) {
    const lazySet = LAZY_SET.map((a) => img.getAttribute(a)).find(Boolean);
    const lazySrc = abs(LAZY_SRC.map((a) => img.getAttribute(a)).find(Boolean));
    if (lazySet) set = resolveSet(lazySet);
    else if (lazySrc) set = null;
    if (lazySet || lazySrc) shown = lazySrc ?? largestCandidate(set ?? [])?.url ?? shown;
  }
  const pick = set ? largestCandidate(set) : null;
  const best = pick?.url ?? shown;
  if (!best) return null;
  const url = unwrapOptimizer(best) ?? best;
  return { kind: 'image', url, shown: shown || null, name: nameFor(url, 'image'), el: img, pick: pick ?? undefined, shownPick: set?.find((c) => c.url === shown) };
}

function videoHits(v: HTMLVideoElement): Found[] {
  const out: Found[] = [];
  const src = v.currentSrc || v.src || abs(v.querySelector('source[src]')?.getAttribute('src')) || '';
  if (v.srcObject || src) {
    const streaming = !!v.srcObject || /\.(m3u8|mpd)(?:[?#]|$)/i.test(src);
    out.push({ kind: 'video', url: src || null, shown: src || null, name: nameFor(src || null, 'video'), el: v, streaming: streaming || undefined });
  }
  const poster = abs(v.getAttribute('poster'));
  if (poster) {
    const url = unwrapOptimizer(poster) ?? poster;
    out.push({ kind: 'poster', url, shown: poster, name: nameFor(url, 'poster'), el: v });
  }
  return out;
}

function cssHits(el: Element, cs: CSSStyleDeclaration): Found[] {
  const urls = cssImageUrls(cs.backgroundImage);
  for (const pseudo of ['::before', '::after']) {
    const ps = getComputedStyle(el, pseudo);
    if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
    urls.push(...cssImageUrls(ps.backgroundImage), ...cssImageUrls(ps.content));
  }
  return urls.map((u) => {
    const shown = abs(u) ?? u;
    const url = unwrapOptimizer(shown) ?? shown;
    return { kind: 'background' as const, url, shown, name: nameFor(url, 'background'), el };
  });
}

/** 图标库常见的类名：lucide-star、fa-star、icon-star */
const ICON_CLASS = /^(?:lucide|fa|bi|ri|ti|mdi|heroicons?|icon|iconify|ph)-[\w-]+$/i;

/** SVG 的文件名：aria-label、<title>、title、data-icon、雪碧图引用的 symbol、id、图标库类名，都没有时按大小叫 icon / illustration */
export function svgNameOf(svg: SVGSVGElement): string {
  const use = svg.querySelector('use');
  const ref = use?.getAttribute('href') ?? use?.getAttribute('xlink:href') ?? '';
  const candidates = [
    svg.getAttribute('aria-label'),
    svg.querySelector(':scope > title')?.textContent,
    svg.getAttribute('title'),
    svg.getAttribute('data-icon'),
    ref.includes('#') ? ref.slice(ref.indexOf('#') + 1) : null,
    svg.id,
    Array.from(svg.classList).find((c) => ICON_CLASS.test(c) && !/^fa-(solid|regular|light|thin|duotone|brands|fw|lg|xl|\dx)$/.test(c)),
  ];
  for (const c of candidates) {
    const name = c ? sanitizeFileName(c) : '';
    if (name) return `${name}.svg`;
  }
  const r = svg.getBoundingClientRect();
  return Math.max(r.width, r.height) <= 64 ? 'icon.svg' : 'illustration.svg';
}

/** 元素属于哪个最外层 <svg>（选中的是图标里的 path 时按整个图标算） */
function svgRoot(el: Element): SVGSVGElement | null {
  if (!(el instanceof SVGElement)) return null;
  let s: SVGSVGElement | null = el instanceof SVGSVGElement ? el : el.ownerSVGElement;
  while (s?.ownerSVGElement) s = s.ownerSVGElement;
  return s;
}

function parentOf(el: Element): Element | null {
  return el.parentElement ?? (el.parentNode instanceof ShadowRoot ? el.parentNode.host : null);
}

const clips = (v: string) => v === 'hidden' || v === 'clip';
const scrolls = (v: string) => v === 'auto' || v === 'scroll';

/**
 * 子元素受到的裁切：overflow 是 hidden / clip 的方向裁到内边距盒；能滚动的方向不裁（滚过去就看得见），
 * 也不再受外层的裁切。html 和 body 的 overflow 作用在视口上，视口不算裁切
 */
function childClip(el: Element, cs: CSSStyleDeclaration, r: DOMRect, clip: Box): Box {
  if (el === document.documentElement || el === document.body) return clip;
  const ox = cs.overflowX;
  const oy = cs.overflowY;
  if (ox === 'visible' && oy === 'visible') return clip;
  const n = (v: string) => parseFloat(v) || 0;
  const left = r.left + n(cs.borderLeftWidth);
  const right = r.right - n(cs.borderRightWidth);
  const top = r.top + n(cs.borderTopWidth);
  const bottom = r.bottom - n(cs.borderBottomWidth);
  return {
    left: scrolls(ox) ? -Infinity : clips(ox) ? Math.max(clip.left, left) : clip.left,
    right: scrolls(ox) ? Infinity : clips(ox) ? Math.min(clip.right, right) : clip.right,
    top: scrolls(oy) ? -Infinity : clips(oy) ? Math.max(clip.top, top) : clip.top,
    bottom: scrolls(oy) ? Infinity : clips(oy) ? Math.min(clip.bottom, bottom) : clip.bottom,
  };
}

function initialClip(root: Element): Box {
  const chain: Element[] = [];
  for (let p = parentOf(root); p && p !== document.documentElement; p = parentOf(p)) chain.unshift(p);
  let clip = OPEN;
  for (const p of chain) {
    const cs = getComputedStyle(p);
    if (cs.display !== 'contents') clip = childClip(p, cs, p.getBoundingClientRect(), clip);
  }
  return clip;
}

/** 看得见：有尺寸、没被 visibility 藏起来、没被外层的溢出裁掉（滚出屏幕的照样算） */
function visible(cs: CSSStyleDeclaration, r: DOMRect, clip: Box): boolean {
  return r.width > 0 && r.height > 0 && cs.visibility === 'visible' && r.right > clip.left && r.left < clip.right && r.bottom > clip.top && r.top < clip.bottom;
}

function collect(root: Element, budgetMs: number): { hits: Hit[]; more: boolean } {
  const deadline = performance.now() + budgetMs;
  const byKey = new Map<string, Hit>();
  const add = (f: Found, key: string) => {
    const had = byKey.get(key);
    if (had) had.count++;
    else byKey.set(key, { ...f, key, count: 1 });
  };
  const start = svgRoot(root) ?? root;
  const stack: Array<[Element, Box]> = [[start, initialClip(start)]];
  let n = 0;
  let more = false;
  while (stack.length) {
    if ((++n & 15) === 0 && performance.now() > deadline) {
      more = true;
      break;
    }
    if (byKey.size >= MAX_ITEMS) {
      more = true;
      break;
    }
    const [el, clip] = stack.pop()!;
    if (SKIP.has(el.tagName) || isOwnNode(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const box = cs.display !== 'contents';
    const r = el.getBoundingClientRect();
    if (box && visible(cs, r, clip)) {
      if (el instanceof HTMLImageElement) {
        const f = imageHit(el);
        if (f) add(f, f.url!);
      } else if (el instanceof HTMLVideoElement) {
        for (const f of videoHits(el)) add(f, f.url ?? `video|${uidOf(el)}`);
      } else if (el instanceof SVGSVGElement) {
        add({ kind: 'svg', url: null, shown: null, name: svgNameOf(el), el }, `svg|${el.outerHTML}`);
      }
      if (!(el instanceof SVGElement)) for (const f of cssHits(el, cs)) add(f, f.url!);
    }
    if (el instanceof SVGElement || el instanceof HTMLVideoElement) continue;
    const next = box ? childClip(el, cs, r, clip) : clip;
    const kids = el.shadowRoot ? [...Array.from(el.shadowRoot.children), ...Array.from(el.children)] : Array.from(el.children);
    for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], next]);
  }
  return { hits: [...byKey.values()], more };
}

/** 快照里带的数量：限时数，数不完时 more 为真 */
export function countAssets(root: Element): { count: number; more: boolean } {
  const { hits, more } = collect(root, 25);
  return { count: hits.length, more };
}

/* ---------- 完整清单 ---------- */

/** 最近几份清单里的条目：取内容（SVG 代码、blob: 字节）时按 id 找回元素 */
const known = new Map<string, Hit>();
let listSeq = 0;

function resourceBytes(url: string | null): number | null {
  if (!url) return null;
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const body = url.slice(comma + 1);
    if (/;base64$/i.test(url.slice(0, comma))) return Math.floor((body.length * 3) / 4) - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0);
    try {
      return new TextEncoder().encode(decodeURIComponent(body)).length;
    } catch {
      return null;
    }
  }
  const e = performance.getEntriesByName(url).at(-1) as PerformanceResourceTiming | undefined;
  return e ? e.decodedBodySize || e.encodedBodySize || null : null;
}

/** 载入一张图量固有尺寸：页面已经显示过的走缓存，不会重新下载 */
function loadImage(url: string, ms = 1500): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    const timer = setTimeout(() => resolve(null), ms);
    im.onload = () => {
      clearTimeout(timer);
      resolve(im.naturalWidth ? im : null);
    };
    im.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    im.src = url;
  });
}

/** 画一张小缩略图：跨域没授权的图画不出来（画布被污染），返回 null 让面板直接用地址 */
function thumbOf(src: CanvasImageSource, w: number, h: number): string | null {
  if (!w || !h) return null;
  const s = Math.min(1, 96 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  try {
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.8);
  } catch {
    return null;
  }
}

async function readBlob(url: string): Promise<Blob | null> {
  try {
    return await (await fetch(url)).blob();
  } catch {
    return null;
  }
}

async function enrich(id: string, h: Hit): Promise<AssetItem> {
  const base = { id, kind: h.kind, url: h.url, shown: h.shown, name: h.name, count: h.count, uid: uidOf(h.el) };
  if (h.kind === 'svg') {
    const svg = h.el as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const text = svg.getElementsByTagName('*').length > 400 ? null : svgMarkup(svg, 'file');
    return {
      ...base,
      width: Math.round(r.width) || null,
      height: Math.round(r.height) || null,
      bytes: text ? new TextEncoder().encode(text).length : null,
      thumb: text && text.length < 24000 ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}` : null,
    };
  }
  if (h.kind === 'video') {
    const v = h.el as HTMLVideoElement;
    let streaming = !!h.streaming;
    let bytes: number | null = null;
    let name = h.name;
    // MediaSource 的 blob: 地址读不出字节，读得出的是整个文件
    if (!streaming && h.url?.startsWith('blob:')) {
      const blob = await readBlob(h.url);
      streaming = !blob;
      bytes = blob?.size ?? null;
      if (blob?.type && !name.includes('.')) name = `${name}.${extForMime(blob.type) ?? 'bin'}`;
    }
    const frame = v.readyState >= 2 ? thumbOf(v, v.videoWidth, v.videoHeight) : null;
    return { ...base, name, streaming: streaming || undefined, width: v.videoWidth || null, height: v.videoHeight || null, bytes, thumb: frame };
  }
  const shown = h.shown ?? h.url!;
  const im = await loadImage(shown);
  let width = im?.naturalWidth ?? null;
  let height = im?.naturalHeight ?? null;
  if (h.url !== shown) {
    // 下载的不是显示的那张：按 srcset 描述符推算，推不出来（优化服务还原的原图）就不标
    if (h.pick?.w && width && height) {
      height = Math.round((h.pick.w * height) / width);
      width = h.pick.w;
    } else if (h.pick?.x && width && height) {
      const k = h.pick.x / (h.shownPick?.x ?? 1);
      width = Math.round(width * k);
      height = Math.round(height * k);
    } else {
      width = height = null;
    }
  }
  let thumb = im ? thumbOf(im, im.naturalWidth, im.naturalHeight) : null;
  if (!thumb && !shown.startsWith('blob:')) thumb = shown.startsWith('data:') && shown.length > 24000 ? null : shown;
  return { ...base, width, height, bytes: resourceBytes(h.url), thumb };
}

export async function listAssets(root: Element): Promise<AssetList> {
  const { hits, more } = collect(root, 1500);
  const seq = ++listSeq;
  for (const k of [...known.keys()]) if (Number(k.split('.')[0]) < seq - 2) known.delete(k);
  const items = await Promise.all(
    hits.map((h, i) => {
      const id = `${seq}.${i}`;
      known.set(id, h);
      return enrich(id, h);
    }),
  );
  return { items, count: items.length, more };
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).replace(/^data:[^,]*,/, ''));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export async function assetData(id: string, as: 'file' | 'copy'): Promise<BridgeMethods['assetData']['r']> {
  const h = known.get(id);
  if (!h || !h.el.isConnected) return { error: 'gone' };
  if (h.kind === 'svg') return { text: svgMarkup(h.el as SVGSVGElement, as), mime: 'image/svg+xml' };
  if (h.url?.startsWith('blob:')) {
    const blob = await readBlob(h.url);
    if (!blob) return { error: 'streaming' };
    if (blob.size > MAX_BLOB) return { error: 'too-large' };
    return { base64: await toBase64(blob), mime: blob.type || undefined };
  }
  return { error: 'unsupported' };
}

/* ---------- SVG 存成独立文件 ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 会继承的绘制属性：和父元素算出来的不同、或者元素自己写了（可能是 currentColor、var()）时写成实际值 */
const INHERITED = ['color', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'paint-order'];
const FONTS = ['font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing'];
/** 不继承的：和初始值不同时写上 */
const OWN = ['opacity', 'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'lighting-color'];
const INITIAL: Record<string, string> = {
  fill: 'rgb(0, 0, 0)',
  'fill-opacity': '1',
  'fill-rule': 'nonzero',
  stroke: 'none',
  'stroke-width': '1px',
  'stroke-opacity': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0px',
  'paint-order': 'normal',
  opacity: '1',
  'stop-color': 'rgb(0, 0, 0)',
  'stop-opacity': '1',
  'flood-color': 'rgb(0, 0, 0)',
  'flood-opacity': '1',
  'lighting-color': 'rgb(255, 255, 255)',
};

/** oklch()、oklab()、color() 这些新写法换成 sRGB：不少设计工具和看图软件只认 #hex 和 rgb() */
export function srgbColor(value: string): string {
  if (!/^(oklch|oklab|color)\(/i.test(value.trim())) return value;
  const c = parseColor(value);
  if (!c) return value;
  if (c.a >= 0.999) return toHex(c);
  const ch = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255);
  return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${Number(c.a.toFixed(3))})`;
}

/** 计算值里指向本页的 url(http://页面#id) 改回 url(#id)，独立文件里才找得到 */
export function localUrl(value: string, pageUrl: string): string {
  const base = pageUrl.split('#')[0];
  return value.replace(/url\(\s*(["']?)([^"')]*)\1\s*\)/g, (m, _q: string, u: string) => {
    const i = u.indexOf('#');
    return i >= 0 && (i === 0 || u.slice(0, i) === base) ? `url("${u.slice(i)}")` : m;
  });
}

/** 属性值里引用的本文档 id：href="#a"、url(#b) */
export function idRefs(attr: string, value: string): string[] {
  const out: string[] = [];
  if (attr === 'href' && value.startsWith('#')) out.push(value.slice(1));
  for (const m of value.matchAll(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g)) out.push(m[1]);
  return out;
}

/** 元素自己写的这个属性（属性或内联样式），没写为空 */
function ownValue(e: Element, p: string): string {
  return e.getAttribute(p) || (e as SVGElement).style?.getPropertyValue(p) || '';
}

/**
 * 把页面 CSS 决定的绘制属性写进副本的内联样式。
 * svg：这个 <svg> 自己，颜色按页面上算出来的写死；
 * ref：从外面复制进来的 symbol、渐变，它们的颜色要跟着引用它的 <use> 走，只解开 var()，currentColor 留着
 */
function inlineStyles(orig: Element, copy: Element, mode: 'svg' | 'ref') {
  const a = [orig, ...Array.from(orig.querySelectorAll('*'))];
  const b = [copy, ...Array.from(copy.querySelectorAll('*'))];
  const props = orig.querySelector('text') ? [...INHERITED, ...FONTS] : INHERITED;
  const styles = new Map<Element, CSSStyleDeclaration>();
  a.forEach((e, i) => {
    const cs = getComputedStyle(e);
    styles.set(e, cs);
    const c = b[i] as SVGElement;
    if (!c?.style) return;
    const parent = i === 0 ? null : (styles.get(e.parentElement!) ?? null);
    for (const p of props) {
      const v = cs.getPropertyValue(p);
      if (!v) continue;
      const own = ownValue(e, p);
      const keep =
        mode === 'ref' ? own.includes('var(') : parent ? !!own || v !== parent.getPropertyValue(p) : p === 'color' || v !== INITIAL[p];
      if (keep) c.style.setProperty(p, srgbColor(localUrl(v, location.href)));
    }
    for (const p of OWN) {
      const v = cs.getPropertyValue(p);
      if (v && v !== INITIAL[p]) c.style.setProperty(p, srgbColor(localUrl(v, location.href)));
    }
  });
}

/** 没写死像素宽高（靠 CSS 定大小、写的 1em / 100%）时按页面上显示的尺寸补上 */
function sizeFromPage(orig: SVGSVGElement, copy: SVGSVGElement) {
  const fixed = (v: string | null) => !!v && /^\s*\d+(\.\d+)?(px)?\s*$/.test(v);
  if (fixed(orig.getAttribute('width')) && fixed(orig.getAttribute('height'))) return;
  const r = orig.getBoundingClientRect();
  if (!r.width || !r.height) return;
  copy.setAttribute('width', String(Math.round(r.width * 100) / 100));
  copy.setAttribute('height', String(Math.round(r.height * 100) / 100));
}

/** 把引用到的、在这个 <svg> 外面的元素（雪碧图里的 symbol、共用的渐变）复制进 <defs> */
function copyRefs(orig: SVGSVGElement, copy: SVGSVGElement, as: 'file' | 'copy') {
  const scope = orig.getRootNode() as Document | ShadowRoot;
  const have = new Set(Array.from(copy.querySelectorAll('[id]'), (e) => e.id));
  if (copy.id) have.add(copy.id);
  const defs = document.createElementNS(SVG_NS, 'defs');
  const queue: Element[] = [copy];
  for (let guard = 0; queue.length && guard < 300; guard++) {
    const node = queue.shift()!;
    for (const e of [node, ...Array.from(node.querySelectorAll('*'))]) {
      for (const at of Array.from(e.attributes)) {
        for (const id of idRefs(at.localName, at.value)) {
          if (have.has(id)) continue;
          have.add(id);
          const target = scope.getElementById(id) ?? document.getElementById(id);
          if (!(target instanceof SVGElement)) continue;
          const dup = target.cloneNode(true) as SVGElement;
          if (as === 'file') inlineStyles(target, dup, 'ref');
          defs.appendChild(dup);
          queue.push(dup);
        }
      }
    }
  }
  if (defs.firstChild) copy.insertBefore(defs, copy.firstChild);
}

/** 存成独立文件的 SVG 代码：file 把颜色等换成页面上算出来的值，copy 原样保留 currentColor；两种都带上引用到的 symbol 和渐变 */
export function svgMarkup(svg: SVGSVGElement, as: 'file' | 'copy'): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  if (as === 'file') {
    inlineStyles(svg, copy, 'svg');
    sizeFromPage(svg, copy);
  }
  copyRefs(svg, copy, as);
  return new XMLSerializer().serializeToString(copy);
}
