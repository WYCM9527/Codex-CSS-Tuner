import type { OrderInfo, OrderUnit, PreviewTarget, SourceLoc } from '@css-tuner/protocol';
import { flowOffsets } from './drop';
import { coarse, hasRun, sameOrder, textSig } from './sig';
import { fiberOf, fiberSource, isPlainHtml, locKey, nameOf, ownerOf, sameSourceElements, type DebugNode } from './source';
import { baseOf, elementAtPath, htmlPathOf } from './text';
import { elOf, isOwnNode, labelOf, textOf, uidOf } from './util';

type OrderTarget = Extract<PreviewTarget, { kind: 'order' }>;

/** 不参与换序、留在原处的子元素（和引擎里纯 HTML 的判断一致） */
const FIXED = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'META', 'NOSCRIPT', 'BASE', 'TITLE']);
const MAX_KIDS = 300;

export function movableKids(p: Element): Element[] {
  return Array.from(p.children).filter((c) => !isOwnNode(c) && !FIXED.has(c.tagName.toUpperCase()));
}

const MAX_TEXT = 20000;

/** 元素里的文字（文字预览占着时用预览前的原文），最多取 max 个字符 */
function textIn(el: Element, max: number): string {
  let text = '';
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && text.length < max; n = walker.nextNode()) {
    if (!isOwnNode(n.parentElement)) text += baseOf(n as Text);
  }
  return text;
}

const extraOf = (el: Element) => el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? el.getAttribute('src') ?? el.getAttribute('href') ?? el.id ?? '';

/**
 * 元素的指纹：标签加文字里各字符的个数（和先后无关：这一项里面的子元素一起换了顺序也不变），
 * 没有文字时用一个能区分的属性。校验换序时按它认出每一项
 */
export const sigOf = (el: Element) => textSig(el.tagName.toLowerCase(), textIn(el, MAX_TEXT).replace(/\s+/g, ''), extraOf(el));

/** 给人看的样子：文字开头，没有文字时是标签 */
export function shortOf(el: Element): string {
  const text = textIn(el, 80).replace(/\s+/g, ' ').trim();
  if (!text) return `<${el.tagName.toLowerCase()}>`;
  return text.length > 20 ? `${text.slice(0, 20)}…` : text;
}

/** 兄弟组里的一项 */
export interface Unit {
  els: Element[];
  source: SourceLoc | null;
  name: string;
}

const hostOf = (f: DebugNode, p: Element) => f.stateNode === p || (f.stateNode as { containerInfo?: unknown } | null)?.containerInfo === p;

/** kid 的 fiber 往上到父元素为止的一串（从外到里） */
function pathOf(kid: Element, p: Element): DebugNode[] | null {
  const out: DebugNode[] = [];
  let f = fiberOf(kid);
  for (let guard = 0; f && guard < 200; guard++) {
    out.push(f);
    const up = f.return;
    if (!up) return null;
    if (hostOf(up, p)) return out.reverse();
    f = up;
  }
  return null;
}

/** fiber 和它的 alternate 是同一个 */
const sameFiber = (a: DebugNode, b: DebugNode) => a === b || a.alternate === b;
const FRAGMENT = 7;

/**
 * 这一项在父元素 JSX（写在 home 这个文件里）中的位置；片段自己没有调用栈时用它里面第一个元素的。
 * 服务端组件在客户端没有 fiber，它渲染的元素记的是组件自己文件里的位置：沿 owner 回到 home 里调用它的那一处
 */
async function unitSource(f: DebugNode, home: string | null): Promise<SourceLoc | null> {
  let own = await fiberSource(f);
  if (!own && typeof f.type !== 'string') {
    for (let c = f.child; c; c = c.child) {
      if (typeof c.type === 'string') {
        own = await fiberSource(c);
        break;
      }
    }
  }
  if (!own || !home || own.path === home) return own;
  let n = ownerOf(f);
  for (let i = 0; n && i < 8; i++, n = ownerOf(n)) {
    const s = await fiberSource(n);
    if (s?.path === home) return s;
  }
  return own;
}

type FiberUnit = Unit & { fiber: DebugNode };

/**
 * React：子元素按“父元素 JSX 里的一项”分组，一项是各子元素的 fiber 链开始分叉的那一层
 * （所有项共用的外层，比如 StrictMode、Provider、组件返回的片段，不算一项）；不是 React 渲染的子元素留在原处、不算
 */
async function reactUnits(p: Element, kids: Element[]): Promise<FiberUnit[]> {
  const paths: Array<{ kid: Element; path: DebugNode[] }> = [];
  for (const kid of kids) {
    const path = pathOf(kid, p);
    if (path) paths.push({ kid, path });
  }
  let depth = 0;
  while (paths.length > 1) {
    const f = paths[0].path[depth];
    if (!paths.every((x) => x.path.length > depth + 1 && sameFiber(x.path[depth], f))) break;
    depth++;
  }
  const out: FiberUnit[] = [];
  for (const { kid, path } of paths) {
    const f = path[Math.min(depth, path.length - 1)];
    let u = out.find((x) => sameFiber(x.fiber, f));
    if (!u) {
      u = { els: [], source: null, name: '', fiber: f };
      out.push(u);
    }
    u.els.push(kid);
  }
  const host = fiberOf(p);
  const home = host ? ((await fiberSource(host))?.path ?? null) : null;
  await Promise.all(
    out.map(async (u) => {
      u.source = await unitSource(u.fiber, home);
      u.name = typeof u.fiber.type === 'string' ? u.fiber.type : (nameOf(u.fiber) ?? '');
    }),
  );
  return out;
}

const keyOf = (u: Unit) => (u.source ? locKey(u.source) : null);
const plain = ({ els, source, name }: FiberUnit): Unit => ({ els, source, name });

/**
 * 父元素下的兄弟组。mapped 给了时是 .map() 渲染、共用这个 JSX 位置的那些项；
 * 否则是写死的各项（同一个位置渲染出的几项，即 .map() 整块，合成一项）
 */
export async function groupOf(p: Element, mapped: string | null): Promise<Unit[]> {
  const kids = movableKids(p);
  if (kids.length > MAX_KIDS) return [];
  if (!kids.some((k) => fiberOf(k))) return kids.map((el) => ({ els: [el], source: null, name: el.tagName.toLowerCase() }));
  const units = await reactUnits(p, kids);
  if (mapped) {
    const direct = units.filter((u) => u.fiber.tag !== FRAGMENT && keyOf(u) === mapped);
    if (direct.length > 1) return direct.map(plain);
    // .map() 和别的子节点混在一起时，数组渲染出的各项在一个片段里
    const frag = units.find((u) => u.fiber.tag === FRAGMENT && keyOf(u) === mapped);
    if (frag) return (await reactUnits(p, frag.els)).filter((u) => keyOf(u) === mapped).map(plain);
    return direct.map(plain);
  }
  const merged: Unit[] = [];
  const at = new Map<string, Unit>();
  for (const u of units) {
    const k = keyOf(u);
    const same = k ? at.get(k) : undefined;
    if (same) same.els.push(...u.els);
    else {
      const copy = { ...plain(u), els: [...u.els] };
      merged.push(copy);
      if (k) at.set(k, copy);
    }
  }
  return merged;
}

/** 选中元素所在那项的下标 */
const indexIn = (units: Unit[], el: Element) => units.findIndex((u) => u.els.includes(el));

function boxOf(u: Unit): DOMRect | null {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const e of u.els) {
    const x = e.getBoundingClientRect();
    if (!x.width && !x.height) continue;
    l = Math.min(l, x.left);
    t = Math.min(t, x.top);
    r = Math.max(r, x.right);
    b = Math.max(b, x.bottom);
  }
  return l === Infinity ? null : new DOMRect(l, t, r - l, b - t);
}

/** 父元素怎么排这些项：flex 看主轴方向，其余看前两项是不是在同一行 */
export function layoutOf(p: Element, units: Unit[]): { layout: OrderInfo['layout']; axis: OrderInfo['axis'] } {
  const cs = getComputedStyle(p);
  if (/flex/.test(cs.display)) return { layout: 'flex', axis: cs.flexDirection.startsWith('column') ? 'y' : 'x' };
  const [a, b] = [units[0] && boxOf(units[0]), units[1] && boxOf(units[1])];
  const sameRow = !!a && !!b && Math.abs(b.top - a.top) < Math.min(a.height, b.height) / 2 && b.left !== a.left;
  return { layout: /grid/.test(cs.display) ? 'grid' : 'flow', axis: sameRow ? 'x' : 'y' };
}

/** 选中元素的兄弟组（少于两项时为 undefined） */
export async function orderInfo(el: Element): Promise<OrderInfo | undefined> {
  const p = el.parentElement;
  if (!p || p === document.documentElement || isOwnNode(el) || FIXED.has(el.tagName.toUpperCase())) return undefined;
  const react = !!fiberOf(el);
  let units = await groupOf(p, null);
  let mapped: string | null = null;
  const self = units[indexIn(units, el)];
  if (react && self) {
    // 选中的是 .map() 渲染的一项：组就是同一个位置渲染出的各项
    const k = keyOf(self);
    const all = k ? await groupOf(p, k) : [];
    if (all.length > 1) {
      units = all;
      mapped = k;
    }
  }
  const index = indexIn(units, el);
  if (units.length < 2 || index < 0) return undefined;
  const out: OrderUnit[] = units.map((u) => {
    const text = textOf(u.els[0]);
    return {
      uids: u.els.map(uidOf),
      label: u.els.length > 1 ? `${labelOf(u.els[0])} ×${u.els.length}` : labelOf(u.els[0]),
      ...(text ? { text } : {}),
      source: u.source,
      name: u.name,
      sig: u.els.map(sigOf).join(' + '),
    };
  });
  return { units: out, index, ...layoutOf(p, units), mapped, htmlPath: isPlainHtml(el) ? htmlPathOf(el) : null };
}

export const unitSig = (u: Unit) => u.els.map(sigOf).join(' + ');
export const unitShort = (u: Unit) => u.els.map(shortOf).join(' + ');

/** p 下可能是这一组的几种分法：写死的各项，或（mapped 时）某个 .map() 渲染出的各项 */
async function groupsIn(p: Element, n: number, mapped: string | null): Promise<Unit[][]> {
  const block = await groupOf(p, null);
  if (!mapped) return block.length === n ? [block] : [];
  const out: Unit[][] = [];
  const direct = await groupOf(p, mapped);
  if (direct.length === n) out.push(direct);
  // 同一批里别的改动挪过源码时 mapped 记的位置不准了：这里每个 .map() 渲染出的组都试一遍
  const keys = new Set(block.filter((u) => u.els.length > 1 && u.source).map((u) => locKey(u.source!)));
  keys.delete(mapped);
  for (const k of keys) {
    const g = await groupOf(p, k);
    if (g.length === n) out.push(g);
  }
  return out;
}

/** p 下按 want 的顺序显示的那一组 */
export async function matchIn(p: Element | null, want: string[], mapped: string | null): Promise<Unit[] | null> {
  if (!p?.isConnected) return null;
  for (const g of await groupsIn(p, want.length, mapped)) {
    if (sameOrder(g.map(unitSig), want)) return g;
  }
  return null;
}

/**
 * 在整个页面里找按 want 的顺序显示这一组的父元素：热更新时 React 可能换掉了原来的父元素，
 * 同一批里别的改动也可能挪过它在源码里的位置，只能按各项的指纹认
 */
export async function findGroup(want: string[], mapped: string | null): Promise<{ p: Element; units: Unit[] } | null> {
  // 每一项的元素在父元素里是连着的，先用子元素的指纹序列筛掉不可能的父元素，再做要解析源码的分组
  const count = want.reduce((n, w) => n + w.split(' + ').length, 0);
  for (const el of document.body.querySelectorAll('*')) {
    if (el.childElementCount < count || isOwnNode(el)) continue;
    if (!hasRun(movableKids(el).map(sigOf), want)) continue;
    const units = await matchIn(el, want, mapped);
    if (units) return { p: el, units };
  }
  return null;
}

/* ---------- 模拟预览 ---------- */

type Decls = Map<HTMLElement, Record<string, string>>;

const styled = (e: Element): e is HTMLElement => e instanceof HTMLElement || e instanceof SVGElement;

/**
 * 一组兄弟按新顺序摆出来要写的内联样式：flex / grid 给所有子元素编 order，
 * 其余按量到的位置算出每项要挪的距离（行内元素用相对定位，transform 对它不起作用）
 */
function layOut(p: Element, units: Unit[], order: number[], out: Decls) {
  const { layout, axis } = layoutOf(p, units);
  if (layout !== 'flow') {
    const slot = new Map<Element, number>();
    units.forEach((u, i) => u.els.forEach((e) => slot.set(e, i)));
    let n = 0;
    let k = 0;
    for (const kid of Array.from(p.children)) {
      if (isOwnNode(kid)) continue;
      const i = slot.get(kid);
      if (i === undefined) {
        if (styled(kid)) out.set(kid, { order: String(n) });
        n++;
        continue;
      }
      if (kid !== units[i].els[0]) continue;
      for (const e of units[order[k++]].els) {
        if (styled(e)) out.set(e, { order: String(n) });
        n++;
      }
    }
    return;
  }
  const boxes = units.map(boxOf);
  if (boxes.some((b) => !b)) return;
  flowOffsets(boxes as DOMRect[], order, axis).forEach(([dx, dy], i) => {
    for (const e of units[i].els) if (styled(e) && (dx || dy)) out.set(e, shift(e, dx, dy));
  });
}

function shift(e: HTMLElement, dx: number, dy: number): Record<string, string> {
  const cs = getComputedStyle(e);
  if (cs.display === 'inline') {
    if (cs.position !== 'static' && cs.position !== 'relative') return {};
    const base = (side: 'top' | 'left') => (cs.position === 'relative' ? parseFloat(cs.getPropertyValue(side)) || 0 : 0);
    return { position: 'relative', ...(dy ? { top: `${base('top') + dy}px` } : {}), ...(dx ? { left: `${base('left') + dx}px` } : {}) };
  }
  const move = `translate(${dx}px, ${dy}px)`;
  return { transform: cs.transform && cs.transform !== 'none' ? `${move} ${cs.transform}` : move };
}

/** 预览目标对应的父元素：元素还在就用它的父元素，纯 HTML 页面按路径找 */
export function parentOf(target: OrderTarget): Element | null {
  const el = elOf(target.uid) ?? (target.htmlPath ? elementAtPath(target.htmlPath) : null);
  return el?.parentElement ?? null;
}

/**
 * 要写的样式和涉及的父元素；元素被 React 换掉、uid 找不回来时用 hint（上次的父元素）。
 * 组件用了好几次时（同一份源码渲染出的其他实例），兄弟的源码位置一样就一起换
 */
export async function orderDecls(target: OrderTarget, hint?: Element): Promise<{ decls: Decls; parents: Element[] }> {
  const decls: Decls = new Map();
  const parents: Element[] = [];
  const found = elOf(target.uid) ?? (target.htmlPath ? elementAtPath(target.htmlPath) : null);
  const p = found?.parentElement ?? (hint?.isConnected ? hint : null);
  if (!p) return { decls, parents };
  const base = await groupOf(p, target.mapped);
  if (base.length !== target.order.length) return { decls, parents };
  layOut(p, base, target.order, decls);
  parents.push(p);
  const el = found && found.parentElement === p ? found : base[0].els[0];
  if (fiberOf(el)) {
    const shape = base.map(keyOf).join('|');
    for (const peer of await sameSourceElements(el)) {
      const q = peer.parentElement;
      if (!q || parents.includes(q)) continue;
      const units = await groupOf(q, target.mapped);
      if (units.length === base.length && units.map(keyOf).join('|') === shape) {
        layOut(q, units, target.order, decls);
        parents.push(q);
      }
    }
  }
  return { decls, parents };
}

/* ---------- 纯 HTML：写回后的校验和摆放 ---------- */

/** 不刷新页面，重新取一次页面 HTML，读出父元素下各子元素的指纹和给人看的样子 */
export async function fetchedKids(parentPath: number[]): Promise<{ sigs: string[]; shorts: string[] } | null> {
  try {
    const html = await (await fetch(location.href, { cache: 'no-store' })).text();
    let el: Element | null = new DOMParser().parseFromString(html, 'text/html').documentElement;
    for (const i of parentPath) el = el?.children[i] ?? null;
    if (!el) return null;
    const kids = movableKids(el);
    return { sigs: kids.map(sigOf), shorts: kids.map(shortOf) };
  } catch {
    return null;
  }
}

/** 把父元素下的子元素按 want（各项的样子）重新摆放：页面不会刷新，写回成功后让页面和文件一致 */
export function arrange(p: Element, want: string[]): boolean {
  const kids = movableKids(p);
  const sigs = kids.map(sigOf);
  const used = new Set<number>();
  const seq: Element[] = [];
  for (const w of want) {
    let i = sigs.findIndex((s, k) => s === w && !used.has(k));
    if (i < 0) i = sigs.findIndex((s, k) => coarse(s) === coarse(w) && !used.has(k));
    if (i < 0) return false;
    used.add(i);
    seq.push(kids[i]);
  }
  if (seq.length !== kids.length) return false;
  const marks = kids.map((k) => {
    const m = document.createComment('');
    p.insertBefore(m, k);
    return m;
  });
  seq.forEach((e, k) => p.insertBefore(e, marks[k]));
  for (const m of marks) m.remove();
  return true;
}

/** 选中元素所在兄弟组按页面上现在看到的顺序排好的各项外框（页面上拖动时算落点用） */
export function visibleBoxes(units: string[][], order: number[]): Array<DOMRect | null> {
  return order.map((i) => boxOf({ els: units[i].map((u) => elOf(u)).filter((e): e is Element => !!e), source: null, name: '' }));
}
