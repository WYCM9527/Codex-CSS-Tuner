import type { CallerLoc, SourceLoc } from '@css-tuner/protocol';
import { clientModuleUrl, distDirOf, joinPath, projectRootOf, SERVER_URL, serverModuleUrl } from './next';
import { decodeDataUrl, extractMapUrl, filePathOf, originalPosition, type SourceMap } from './sourcemap';
import { stripQuery } from './util';

/** fiber，或服务端组件的调试信息（React Server Components 渲染的元素，owner 不是 fiber） */
export interface DebugNode {
  /** fiber 的种类：7 是片段（.map() 和别的子节点混在一起时 React 把数组包在片段里） */
  tag?: number;
  type?: unknown;
  name?: unknown;
  /** fiber 的 props；服务端组件的调试信息里叫 props */
  memoizedProps?: unknown;
  props?: unknown;
  index?: number;
  return?: DebugNode | null;
  alternate?: DebugNode | null;
  child?: DebugNode | null;
  /** 宿主 fiber 是 DOM 节点；根和 portal 的 fiber 带着 containerInfo（挂载到的容器） */
  stateNode?: unknown;
  _debugStack?: { stack?: string } | null;
  debugStack?: { stack?: string } | null;
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null;
  _debugOwner?: DebugNode | null;
  owner?: DebugNode | null;
}

interface RawFrame {
  url: string;
  line: number;
  col: number;
}

interface Resolved {
  path: string;
  file: string | null;
  line: number;
  column: number;
  /** 映射到了 node_modules、框架运行时或 sourcemap 的 ignoreList */
  library: boolean;
}

interface Picked {
  node: DebugNode;
  url: string;
  hops: number;
  loc: Resolved;
}

let fiberKey: string | null = null;

/** 元素或文本节点的 React fiber（React 把创建它的 fiber 挂在节点上） */
export function fiberOf(el: Node): DebugNode | null {
  if (fiberKey && fiberKey in el) return (el as unknown as Record<string, DebugNode>)[fiberKey];
  for (const k in el) {
    if (k.startsWith('__reactFiber$')) {
      fiberKey = k;
      return (el as unknown as Record<string, DebugNode>)[k];
    }
  }
  return null;
}

export function hasReact(): boolean {
  return !!(window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__ || !!fiberKey;
}

const stackOf = (n: DebugNode) => n._debugStack?.stack ?? n.debugStack?.stack;
export const ownerOf = (n: DebugNode) => n._debugOwner ?? n.owner ?? null;

export function nameOf(n: DebugNode | null | undefined): string | null {
  if (!n) return null;
  if (n.type === undefined) return typeof n.name === 'string' && n.name ? n.name : null;
  const t = n.type as { displayName?: string; name?: string } | string | null;
  if (!t) return null;
  if (typeof t === 'string') return t;
  return t.displayName || t.name || null;
}

/** 渲染出这个 DOM 元素的组件名（React 开发态 fiber 的 owner），不是 React 页面时为 null */
export function ownerName(el: Element): string | null {
  const f = fiberOf(el);
  return f ? nameOf(ownerOf(f)) : null;
}

const FRAME_RE = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
const BOTTOM = /react[-_]stack[-_]bottom[-_]frame/;
const LIB_PATH = /\/node_modules\/|__nextjs-internal-proxy|^\/?\[(?:turbopack|externals)\]/;

function maybeUser(url: string): boolean {
  if (SERVER_URL.test(url)) return true;
  return url.startsWith(location.origin) && !/\/node_modules\/|\/\.vite\/|\/@vite\/|\/@react-refresh|\/@id\//.test(url);
}

/** Next.js 的构建目录（本地路径），从服务端组件的栈帧里认出来 */
let nextDist: string | null = null;

function noteServerFrame(url: string) {
  if (!nextDist) nextDist = distDirOf(url);
}

const framesCache = new Map<string, RawFrame[]>();

/** _debugStack 里可能是业务代码的帧：第一帧是 jsx() 调用本身（React 自己也这样丢掉），到 react-stack-bottom-frame 为止 */
function framesOf(stack: string | undefined): RawFrame[] {
  if (!stack) return [];
  let out = framesCache.get(stack);
  if (out) return out;
  out = [];
  let first = true;
  for (const raw of stack.split('\n')) {
    const t = raw.trim();
    if (!t.startsWith('at ')) continue;
    if (BOTTOM.test(t)) break;
    if (first) {
      first = false;
      continue;
    }
    const m = FRAME_RE.exec(t);
    if (!m || !maybeUser(m[2])) continue;
    noteServerFrame(m[2]);
    out.push({ url: m[2], line: +m[3], col: +m[4] });
  }
  if (framesCache.size > 5000) framesCache.clear();
  framesCache.set(stack, out);
  return out;
}

let scannedAt = 0;

function scanForNextDist() {
  if (Date.now() - scannedAt < 2000) return;
  scannedAt = Date.now();
  const nodes = [document.documentElement, document.body, ...Array.from(document.body?.querySelectorAll('*') ?? []).slice(0, 300)];
  for (const el of nodes) {
    for (let n = el ? fiberOf(el) : null, i = 0; n && i < 8 && !nextDist; n = ownerOf(n), i++) framesOf(stackOf(n));
    if (nextDist) return;
  }
}

interface LoadedMap {
  map: SourceMap;
  /** 开发态 JSX 转换写进模块的绝对路径（Vite 单模块） */
  jsxFile: string | null;
}

/** 开发态 JSX 转换会把模块的绝对路径写进代码（_jsxFileName / fileName），扩展据此直接定位文件 */
function jsxFileName(code: string): string | null {
  const m = /(?:var|const|let)\s+_jsxFileName\s*=\s*("(?:[^"\\]|\\.)*")/.exec(code) ?? /fileName:\s*("(?:[^"\\]|\\.)*")/.exec(code);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]) as string;
    return v.startsWith('/') || /^[A-Za-z]:[\\/]/.test(v) ? v : null;
  } catch {
    return null;
  }
}

async function fetchDirect(url: string): Promise<LoadedMap | null> {
  const code = await (await fetch(url)).text();
  const ref = extractMapUrl(code);
  if (!ref) return null;
  const json = ref.startsWith('data:') ? decodeDataUrl(ref) : await (await fetch(new URL(ref, url))).text();
  return { map: JSON.parse(json) as SourceMap, jsxFile: jsxFileName(code) };
}

const maps = new Map<string, Promise<LoadedMap | null>>();

function mapFor(url: string): Promise<LoadedMap | null> {
  let p = maps.get(url);
  if (!p) {
    p = fetchDirect(url).catch(() => null);
    maps.set(url, p);
  }
  return p;
}

function basename(p: string): string {
  return p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
}

async function viaMap(fr: RawFrame): Promise<Resolved | null> {
  const m = await mapFor(fr.url);
  const pos = m && originalPosition(m.map, fr.line, fr.col);
  if (!m || !pos) return null;
  const abs = filePathOf(pos.source);
  let path = abs;
  if (!path) {
    try {
      path = decodeURIComponent(new URL(pos.source, fr.url).pathname);
    } catch {
      path = pos.source;
    }
  }
  const file = abs ?? (m.jsxFile && basename(m.jsxFile) === basename(path) ? m.jsxFile : null);
  return { path, file, line: pos.line, column: pos.column, library: pos.ignored || LIB_PATH.test(path) };
}

/**
 * Next.js 开发态交给开发服务器解析（和它的错误浮层同一个接口）：服务端组件的帧在 Node 里执行，
 * 热更新后执行的是 eval 进去的新模块，行号和磁盘上的 chunk 对不上，只有服务端知道；
 * 客户端帧照它的做法换成构建目录里的 file:// 路径，热更新后的 chunk.js?id=… 也认。
 * 这个接口不是公开 API，接口不在或格式变了就退回直接读 sourcemap。
 */
function nextFileOf(url: string): string | null {
  const server = serverModuleUrl(url);
  if (server) return server;
  if (!/\/_next\/static\//.test(url)) return null;
  if (!nextDist) scanForNextDist();
  return nextDist ? clientModuleUrl(url, nextDist) : null;
}

interface Traced {
  file: string;
  line1: number | null;
  column1: number | null;
  ignored?: boolean;
}

let batch: Array<{ frame: { file: string; methodName: string; arguments: never[]; line1: number; column1: number }; done: (t: Traced | null) => void }> = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function nextTrace(file: string, line: number, col: number): Promise<Traced | null> {
  return new Promise((done) => {
    batch.push({ frame: { file, methodName: '<unknown>', arguments: [], line1: line, column1: col }, done });
    batchTimer ??= setTimeout(flushTrace, 0);
  });
}

async function flushTrace() {
  const items = batch;
  batch = [];
  batchTimer = null;
  for (let i = 0; i < items.length; i += 200) {
    const part = items.slice(i, i + 200);
    let out: Array<{ status: string; value?: { originalStackFrame?: Traced } }> = [];
    try {
      const r = await fetch('/__nextjs_original-stack-frames', {
        method: 'POST',
        body: JSON.stringify({ frames: part.map((p) => p.frame), isServer: false, isEdgeServer: false, isAppDirectory: true }),
      });
      if (r.ok) out = await r.json();
    } catch {
      /* 接口不在就当解析不了 */
    }
    part.forEach((p, k) => {
      const f = out[k]?.status === 'fulfilled' ? out[k].value?.originalStackFrame : null;
      p.done(f && f.file && f.line1 ? f : null);
    });
  }
}

async function viaNext(file: string, fr: RawFrame): Promise<Resolved | null> {
  const t = await nextTrace(file, fr.line, fr.col);
  if (!t) return null;
  const root = nextDist ? projectRootOf(nextDist) : null;
  const abs = filePathOf(t.file) ?? (t.file.startsWith('/') ? t.file : root ? joinPath(root, t.file) : null);
  const path = abs ?? t.file;
  return { path, file: abs, line: t.line1 ?? 1, column: t.column1 ?? 1, library: !!t.ignored || LIB_PATH.test(path) };
}

/** 按帧缓存：fiber 复用时栈帧停在它创建时的代码版本，第一次解析时的结果就是最准的 */
const resolved = new Map<string, Promise<Resolved | null>>();

function resolveFrame(fr: RawFrame): Promise<Resolved | null> {
  const key = `${fr.url}:${fr.line}:${fr.col}`;
  let p = resolved.get(key);
  if (!p) {
    const next = nextFileOf(fr.url);
    p = next ? viaNext(next, fr).then((r) => r ?? (SERVER_URL.test(fr.url) || fr.url.includes('?') ? null : viaMap(fr))) : viaMap(fr);
    resolved.set(key, p);
  }
  return p;
}

/** 这个节点自己的调用栈里第一个业务代码帧 */
async function ownFrame(n: DebugNode, hops: number): Promise<Picked | null> {
  const s = n._debugSource;
  if (s && s.fileName && !s.fileName.includes('/node_modules/')) {
    const loc = { path: s.fileName, file: s.fileName, line: s.lineNumber, column: s.columnNumber ?? 1, library: false };
    return { node: n, url: s.fileName, hops, loc };
  }
  for (const fr of framesOf(stackOf(n))) {
    const loc = await resolveFrame(fr);
    if (loc && !loc.library) return { node: n, url: fr.url, hops, loc };
  }
  return null;
}

/** 元素自己的 JSX 位置；元素由库组件渲染时沿 owner 链回到业务代码的调用处 */
async function pick(el: Element): Promise<Picked | null> {
  let n = fiberOf(el);
  for (let hops = 0; n && hops < 16; hops++) {
    const p = await ownFrame(n, hops);
    if (p) return p;
    n = ownerOf(n);
  }
  return null;
}

function toLoc(p: Picked): SourceLoc {
  const { loc } = p;
  return { url: stripQuery(p.url), path: loc.path, file: loc.file, line: loc.line, column: loc.column, component: nameOf(ownerOf(p.node)), viaOwner: p.hops > 0 };
}

export async function sourceOf(el: Element): Promise<SourceLoc | null> {
  const p = await pick(el);
  return p ? toLoc(p) : null;
}

/** fiber 自己的 JSX 位置（不沿 owner 往外找） */
export async function fiberSource(n: DebugNode): Promise<SourceLoc | null> {
  const p = await ownFrame(n, 0);
  return p ? toLoc(p) : null;
}

export function locKey(s: SourceLoc): string {
  return `${s.path}:${s.line}:${s.column}`;
}

/**
 * [元素自己的 JSX 位置, 渲染它的组件被调用的位置, 再外一层…]，callee 是这一层调用的组件；
 * node 是这一层在这个位置创建的节点，它的 props 就写在 loc 处
 */
async function frameChain(el: Element, depth: number): Promise<Array<{ loc: SourceLoc; callee: string | null; node: DebugNode }>> {
  const first = await pick(el);
  if (!first) return [];
  const out = [{ loc: toLoc(first), callee: null as string | null, node: first.node }];
  let n = ownerOf(first.node);
  for (let guard = 0; n && out.length <= depth && guard < 16; guard++) {
    const p = await ownFrame(n, 0);
    if (p) out.push({ loc: toLoc(p), callee: nameOf(n), node: n });
    n = ownerOf(n);
  }
  return out;
}

/**
 * 调用链上每一层传进来的 props，depth 和 callersOf 的层级一致（1 起）；
 * 元素由库组件渲染时，0 层是库组件在业务代码里被调用时收到的 props
 */
export async function propsChain(el: Element, depth = 3): Promise<Array<{ depth: number; props: Record<string, unknown> }>> {
  const chain = await frameChain(el, depth);
  const out: Array<{ depth: number; props: Record<string, unknown> }> = [];
  chain.forEach((c, i) => {
    if (i === 0 && !c.loc.viaOwner) return;
    const props = c.node.memoizedProps ?? c.node.props;
    if (props && typeof props === 'object') out.push({ depth: i, props: props as Record<string, unknown> });
  });
  return out;
}

async function chainKeys(el: Element, depth: number): Promise<string[]> {
  return (await frameChain(el, depth)).map((c) => locKey(c.loc));
}

/** depth > 0 时只留下调用链前 depth 层也和 el 相同的元素 */
async function sameChain(el: Element, peers: Element[], depth: number): Promise<Element[]> {
  if (depth <= 0) return peers;
  const want = (await chainKeys(el, depth)).slice(1, depth + 1).join('|');
  const keep = await Promise.all(peers.map(async (p) => p === el || (await chainKeys(p, depth)).slice(1, depth + 1).join('|') === want));
  return peers.filter((_, i) => keep[i]);
}

export async function callersOf(el: Element, peers: Element[], depth = 3): Promise<CallerLoc[]> {
  const chain = (await frameChain(el, depth)).slice(1);
  const out: CallerLoc[] = [];
  for (const [i, c] of chain.entries()) {
    out.push({ source: c.loc, component: c.callee, same: (await sameChain(el, peers, i + 1)).length });
  }
  return out;
}

function allElements(): Element[] {
  return Array.from(document.body.querySelectorAll('*'));
}

async function bySource(want: string): Promise<Element[]> {
  const nodes = allElements();
  const locs = await Promise.all(nodes.map((n) => sourceOf(n)));
  return nodes.filter((_, i) => {
    const s = locs[i];
    return !!s && locKey(s) === want;
  });
}

/** 找出和 el 由同一 JSX 位置创建的所有元素（按映射后的原始位置比较，热更新换了模块版本也能对上） */
export async function sameSourceElements(el: Element, depth = 0): Promise<Element[]> {
  const target = await sourceOf(el);
  if (!target) return [el];
  const peers = await bySource(locKey(target));
  if (!peers.includes(el)) {
    peers.push(el);
    peers.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }
  return depth > 0 ? sameChain(el, peers, depth) : peers;
}

export async function findBySource(path: string, line: number, column: number, index = 0): Promise<Element | null> {
  const hits = await bySource(`${path}:${line}:${column}`);
  return hits[index] ?? hits[0] ?? null;
}

let warmTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 页面渲染完就把所有元素的源码位置解析一遍并缓存：热更新后被复用的 fiber 仍带着旧代码的栈帧，
 * 要趁代码还没变时用当时的 sourcemap 解析（Next.js 的 chunk 地址不随热更新变化）。
 */
export function warmSources(delay = 600) {
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    warmTimer = null;
    const nodes = allElements();
    if (!fiberKey && !nodes.slice(0, 40).some((n) => fiberOf(n))) return;
    void Promise.all(nodes.slice(0, 5000).map((n) => sourceOf(n)));
  }, delay);
}
