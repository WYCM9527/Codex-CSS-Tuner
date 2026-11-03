import type { SourceLoc } from '@css-tuner/protocol';
import { isLibFile, type ChainLink, type Locator } from './locator';
import { isOwnNode } from './util';
import { lineColAt, parseVueTemplate, type TNode } from './vue-template';

/*
 * Vue 3 开发态在 DOM 元素上挂着 __vnode，vnode.ctx 是写这段模板的组件实例（插槽内容也算父组件的），
 * 实例的 type.__file 是 .vue 文件的绝对路径。vnode 上没有源码位置：把实例的渲染树和模板按顺序对齐，
 * 对齐时照编译器的规则展开 v-if 链、v-for、<template>、插槽和编译成静态 HTML 的内容。
 */

/** 只声明用到的字段 */
interface VNode {
  type: unknown;
  key: PropertyKey | null;
  props: Record<string, unknown> | null;
  children: unknown;
  shapeFlag: number;
  patchFlag: number;
  el: Node | null;
  anchor: Node | null;
  ctx: Instance | null;
  component: Instance | null;
}

interface Instance {
  type: { __file?: string; __name?: string; name?: string; inheritAttrs?: boolean };
  /** 组件自己的 vnode：由写着这个组件标签的模板创建，ctx 就是那个模板的实例 */
  vnode: VNode;
  subTree: VNode | null;
  render?: unknown;
  isUnmounted?: boolean;
}

const FRAGMENT = Symbol.for('v-fgt');
const TEXT = Symbol.for('v-txt');
const COMMENT = Symbol.for('v-cmt');
const STATIC = Symbol.for('v-stc');

const ELEMENT = 1;
const COMPONENT = 2 | 4;
const ARRAY_CHILDREN = 16;
const TELEPORT = 64;
const SUSPENSE = 128;
/** 开发态根上有注释时，单根模板也包在片段里 */
const DEV_ROOT_FRAGMENT = 2048;

const vnodeOf = (el: Element): VNode | null => (el as unknown as { __vnode?: VNode }).__vnode ?? null;

function kids(v: VNode): VNode[] {
  return v.shapeFlag & ARRAY_CHILDREN && Array.isArray(v.children) ? (v.children as VNode[]) : [];
}

/** 渲染出这个元素的 vnode：子组件没跟着重新渲染时，父组件更新会把组件 vnode 挂到它的根元素上，要往里走到真正的那一层 */
function elementVNodeOf(el: Element): VNode | null {
  let v = vnodeOf(el);
  for (let guard = 0; v && v.shapeFlag & COMPONENT && guard < 20; guard++) {
    let sub = v.component?.subTree ?? null;
    if (sub?.type === FRAGMENT && sub.patchFlag & DEV_ROOT_FRAGMENT) sub = kids(sub).find((c) => c.el === el) ?? null;
    if (!sub || sub.el !== el) return null;
    v = sub;
  }
  return v;
}

/** 参与对齐的 vnode：文字不算，注释里只有没渲染的 v-if 留下的占位算 */
function counts(v: unknown): v is VNode {
  if (!v || typeof v !== 'object') return false;
  const n = v as VNode;
  if (n.type === TEXT) return false;
  if (n.type === COMMENT) return n.children === 'v-if';
  return true;
}

/* ---------- 模板这一侧 ---------- */

/** 兄弟里的一项：普通元素，或一条 v-if / v-else-if / v-else 链（渲染出一个 vnode） */
type Entry = { node: TNode } | { branches: TNode[] };

function entriesOf(children: TNode[]): Entry[] {
  const out: Entry[] = [];
  for (const c of children) {
    const last = out[out.length - 1];
    if ((c.attrs.has('v-else-if') || c.attrs.has('v-else')) && last && 'branches' in last) last.branches.push(c);
    else if (c.attrs.has('v-if')) out.push({ branches: [c] });
    else out.push({ node: c });
  }
  return out;
}

const WRAPPER_ATTR = /^(?:v-if|v-else-if|v-else|v-for|v-slot(?::.*)?|#.*)$/;

/** 带指令的 <template> 只是包装，不渲染成元素；什么指令都没有的 <template> 是原生元素 */
function isWrapper(t: TNode): boolean {
  if (t.tag !== 'template') return false;
  for (const k of t.attrs.keys()) if (WRAPPER_ATTR.test(k)) return true;
  return false;
}

function slotNameOf(t: TNode): string | null {
  for (const k of t.attrs.keys()) {
    if (k === 'v-slot') return 'default';
    if (k.startsWith('v-slot:')) return k.slice(7);
    if (k.startsWith('#')) return k.slice(1);
  }
  return null;
}

const NATIVE_LOOKING = /^[a-z][a-z0-9]*$/;
const CORE = new Set(['component', 'transition', 'teleport', 'suspense', 'keepalive']);

function sameTag(t: TNode, v: VNode): boolean {
  if (typeof v.type === 'string') return v.type === t.tag || t.tag === 'component';
  if (v.shapeFlag & (COMPONENT | TELEPORT | SUSPENSE)) return !NATIVE_LOOKING.test(t.tag) || CORE.has(t.tag);
  return false;
}

/** 不算 v-for，这个模板元素的一份能不能渲染出 v */
function itemShape(t: TNode, v: VNode): boolean {
  if (t.tag === 'slot') return v.type === FRAGMENT;
  // 只有一个子元素的 <template v-if> 直接渲染成那个子元素
  if (isWrapper(t)) return v.type === FRAGMENT || (t.children.length === 1 && sameShape(t.children[0], v));
  return sameTag(t, v);
}

function sameShape(t: TNode, v: VNode): boolean {
  return t.attrs.has('v-for') ? v.type === FRAGMENT : itemShape(t, v);
}

/** v-if 链渲染了哪个分支：编译器给没写 key 的分支注入 key，是同一组兄弟里所有 v-if 链分支的顺序号 */
function pickBranch(branches: TNode[], v: VNode, base: number): TNode | null {
  if (typeof v.key === 'number') {
    const b = branches[v.key - base];
    if (b && sameShape(b, v)) return b;
  }
  const keyed = branches.find((b) => b.attrs.get('key') === String(v.key));
  if (keyed) return keyed;
  const same = branches.filter((b) => sameShape(b, v));
  return same.length === 1 ? same[0] : null;
}

/* ---------- 对齐 ---------- */

interface Template {
  file: string;
  src: string;
  root: TNode;
}

interface Aligned {
  tpl: Template;
  subTree: VNode;
  render: unknown;
  at: number;
  /** 这个模板渲染出的 DOM 元素 → 模板里写它的元素 */
  els: Map<Element, TNode>;
  /** 这个模板里写着的子组件实例 → 组件标签 */
  comps: Map<Instance, TNode>;
}

/** 一组兄弟的模板项；base 是每项之前同组 v-if 链的分支总数（编译器注入的 key 从这里接着编） */
interface Siblings {
  entries: Entry[];
  bases: number[];
}

function siblingsOf(...lists: TNode[][]): Siblings {
  const out: Siblings = { entries: [], bases: [] };
  for (const list of lists) {
    let base = 0;
    for (const e of entriesOf(list)) {
      out.entries.push(e);
      out.bases.push(base);
      if ('branches' in e) base += e.branches.length;
    }
  }
  return out;
}

const isFor = (e: Entry | undefined): e is { node: TNode } => !!e && 'node' in e && e.node.attrs.has('v-for');

function fits(e: Entry, v: VNode, base: number): boolean {
  if ('branches' in e) return v.type === COMMENT || !!pickBranch(e.branches, v, base);
  return v.type !== COMMENT && (sameShape(e.node, v) || (isFor(e) && itemShape(e.node, v)));
}

/**
 * 按顺序对齐模板项和渲染出的 vnode。编译出来的子节点和模板一项对一项；
 * loose 时（渲染函数组件直接放进去的插槽内容）对不上的模板项跳过：没渲染的插槽什么也不产生
 */
function alignList(ts: TNode[] | Siblings, vs: VNode[], a: Aligned, owner: Instance, loose = false): boolean {
  const { entries, bases } = Array.isArray(ts) ? siblingsOf(ts) : ts;
  let i = 0;
  // 上一项是 v-for、片段被摊平了（TransitionGroup 会这样）：后面同形的 vnode 还归它
  let flat: TNode | null = null;
  for (const v of vs) {
    if (!counts(v)) continue;
    if (flat && v.type !== FRAGMENT && itemShape(flat, v)) {
      if (!alignOne(flat, v, a, owner)) return false;
      continue;
    }
    flat = null;
    if (v.type === STATIC) {
      for (const el of staticRoots(v)) {
        const e = entries[i++];
        if (!e || !('node' in e) || !mapStatic(el, e.node, a)) return false;
      }
      continue;
    }
    // 摊平的 v-for 一项都没有时什么也不渲染
    while (i < entries.length && (loose || (isFor(entries[i]) && v.type !== FRAGMENT)) && !fits(entries[i], v, bases[i])) i++;
    const e = entries[i];
    const base = bases[i++];
    if (!e) return false;
    if ('branches' in e) {
      if (v.type === COMMENT) continue;
      const b = pickBranch(e.branches, v, base);
      if (!b || !alignNode(b, v, a, owner)) return false;
      continue;
    }
    if (v.type === COMMENT) return false;
    if (isFor(e) && v.type !== FRAGMENT) {
      if (!alignOne(e.node, v, a, owner)) return false;
      flat = e.node;
      continue;
    }
    if (!alignNode(e.node, v, a, owner)) return false;
  }
  return true;
}

function alignNode(t: TNode, v: VNode, a: Aligned, owner: Instance): boolean {
  if (t.attrs.has('v-for')) {
    if (v.type !== FRAGMENT) return false;
    for (const item of kids(v)) if (counts(item) && !alignOne(t, item, a, owner)) return false;
    return true;
  }
  return alignOne(t, v, a, owner);
}

function alignOne(t: TNode, v: VNode, a: Aligned, owner: Instance): boolean {
  if (isWrapper(t)) return alignList(t.children, v.type === FRAGMENT ? kids(v) : [v], a, owner);
  if (t.tag === 'slot') {
    if (v.type !== FRAGMENT) return false;
    // 渲染的是后备内容时子节点归这个模板；父组件传进来的内容在对齐父组件时处理
    const own = kids(v).filter(counts);
    return own.length > 0 && own.every((c) => c.ctx === owner) ? alignList(t.children, own, a, owner) : true;
  }
  if (!sameTag(t, v)) return false;
  if (v.shapeFlag & COMPONENT) {
    if (v.component) {
      a.comps.set(v.component, t);
      alignSlots(t, v.component, a, owner);
    }
    return true;
  }
  if (v.el instanceof Element) a.els.set(v.el, t);
  if (t.attrs.has('v-html') || t.attrs.has('v-text')) return true;
  if (v.shapeFlag & ARRAY_CHILDREN) return alignList(t.children, kids(v), a, owner);
  // 子节点全是静态内容时可能被编译成 innerHTML
  if (v.el instanceof Element && t.children.length && v.props && ('innerHTML' in v.props || 'textContent' in v.props)) return mapChildren(v.el, t, a);
  return true;
}

/** 组件标签里写的插槽内容：在子组件渲染出的树里找到 renderSlot 的片段（key 是 _插槽名），和对应的模板对齐 */
function alignSlots(t: TNode, child: Instance, a: Aligned, owner: Instance) {
  if (!child.subTree) return;
  // 按模板里的顺序：没包在 <template #名字> 里的子元素都是默认插槽
  const named = new Map<string, TNode[]>();
  const order: TNode[][] = [];
  const loose: TNode[] = [];
  for (const c of t.children) {
    const name = c.tag === 'template' ? slotNameOf(c) : null;
    if (name) {
      named.set(name, c.children);
      order.push(c.children);
    } else {
      if (!loose.length) order.push(loose);
      loose.push(c);
    }
  }
  if (!named.has('default')) named.set('default', loose);
  const frags: Array<{ name: string; v: VNode }> = [];
  const direct: VNode[] = [];
  collectSlots(child.subTree, owner, frags, direct, 0);
  for (const f of frags) {
    const list = named.get(f.name);
    if (list) alignList(list, kids(f.v), a, owner);
  }
  // Transition、KeepAlive 和用渲染函数写的组件直接把插槽内容放进自己的树里，分不出是哪个插槽的
  if (direct.length) alignList(siblingsOf(...order), direct, a, owner, true);
}

function collectSlots(v: VNode, owner: Instance, frags: Array<{ name: string; v: VNode }>, direct: VNode[], depth: number) {
  if (!v || typeof v !== 'object' || depth > 100) return;
  if (v.ctx === owner) {
    if (counts(v)) direct.push(v);
    return;
  }
  if (v.type === FRAGMENT && typeof v.key === 'string' && v.key.startsWith('_')) {
    const own = kids(v).filter(counts);
    if (own.length && own.every((c) => c.ctx === owner)) {
      frags.push({ name: v.key.slice(1), v });
      return;
    }
  }
  if (v.shapeFlag & COMPONENT) {
    if (v.component?.subTree) collectSlots(v.component.subTree, owner, frags, direct, depth + 1);
    return;
  }
  for (const c of kids(v)) collectSlots(c, owner, frags, direct, depth + 1);
}

/** 静态 vnode 插进去的顶层元素：从 el 到 anchor */
function staticRoots(v: VNode): Element[] {
  const out: Element[] = [];
  for (let n: Node | null = v.el; n; n = n.nextSibling) {
    if (n instanceof Element && !isOwnNode(n)) out.push(n);
    if (n === v.anchor) break;
  }
  return out;
}

/** 静态内容和模板逐层一一对应（里面没有组件、v-if 和 v-for） */
function mapStatic(el: Element, t: TNode, a: Aligned): boolean {
  if (el.localName !== t.tag && el.localName !== t.tag.toLowerCase()) return false;
  a.els.set(el, t);
  return mapChildren(el, t, a);
}

function mapChildren(el: Element, t: TNode, a: Aligned): boolean {
  const ks = Array.from(el.children).filter((c) => !isOwnNode(c));
  if (ks.length !== t.children.length) return false;
  return ks.every((k, i) => mapStatic(k, t.children[i], a));
}

function alignRoot(a: Aligned, inst: Instance) {
  const top = a.tpl.root.children;
  const sub = a.subTree;
  const unwrap = sub.type === FRAGMENT && (sub.patchFlag & DEV_ROOT_FRAGMENT || entriesOf(top).length > 1);
  alignList(top, unwrap ? kids(sub) : [sub], a, inst);
}

/* ---------- 模板源码 ---------- */

/** Vite 的地址前缀：Nuxt 是 /_nuxt/ */
function viteBase(): string {
  const src = document.querySelector('script[src*="/@vite/client"]')?.getAttribute('src');
  if (src) {
    try {
      return new URL(src.slice(0, src.indexOf('@vite/client')), location.href).pathname;
    } catch {
      /* 用默认的 */
    }
  }
  return '/';
}

/** 从开发服务器取 .vue 原文（Vite 的 ?raw 导入） */
async function fetchTemplate(file: string): Promise<Template | null> {
  try {
    const path = file.startsWith('/') ? file : '/' + file;
    const r = await fetch(`${viteBase()}@fs${encodeURI(path)}?raw`, { cache: 'no-store' });
    if (!r.ok) return null;
    const m = /export default\s*("(?:[^"\\]|\\[\s\S])*")/.exec(await r.text());
    if (!m) return null;
    const src = JSON.parse(m[1]) as string;
    const root = parseVueTemplate(src);
    return root ? { file, src, root } : null;
  } catch {
    return null;
  }
}

/** 按文件缓存；热更新会换掉组件的渲染函数，换了就重新取 */
const templates = new Map<string, { render: unknown; p: Promise<Template | null> }>();

function templateOf(inst: Instance): Promise<Template | null> {
  const file = inst.type.__file;
  if (!file) return Promise.resolve(null);
  const render = inst.render ?? null;
  let hit = templates.get(file);
  if (!hit || hit.render !== render) {
    hit = { render, p: fetchTemplate(file) };
    templates.set(file, hit);
  }
  return hit.p;
}

const alignedCache = new WeakMap<Instance, Aligned>();

/**
 * 实例当前渲染树的对齐结果；每次重新渲染 subTree 都会换。
 * 插槽内容渲染在子组件里，子组件自己重新渲染时这边的 subTree 不变、DOM 却可能换了：查不到元素时 fresh 重新对齐一次
 */
async function alignedFor(inst: Instance, fresh = false): Promise<Aligned | null> {
  if (!inst.subTree || inst.isUnmounted) return null;
  const render = inst.render ?? null;
  const hit = alignedCache.get(inst);
  if (hit && hit.subTree === inst.subTree && hit.render === render && !(fresh && performance.now() - hit.at > 200)) return hit;
  const tpl = await templateOf(inst);
  if (!tpl || !inst.subTree) return null;
  const a: Aligned = { tpl, subTree: inst.subTree, render, at: performance.now(), els: new Map(), comps: new Map() };
  alignRoot(a, inst);
  alignedCache.set(inst, a);
  return a;
}

/* ---------- 定位 ---------- */

interface Hit {
  inst: Instance;
  a: Aligned;
  t: TNode;
  /** 元素是库组件（渲染函数、内置组件）的根元素，位置是业务模板里写着这个组件的标签 */
  viaOwner?: boolean;
}

function appInstanceOf(el: Element): Instance | null {
  return (el as unknown as { __vue_app__?: { _instance?: Instance | null } }).__vue_app__?._instance ?? null;
}

/** 业务代码里的组件：有 .vue 文件，且不在依赖包里 */
const isAppComponent = (inst: Instance): boolean => !!inst.type.__file && !isLibFile(inst.type.__file);

/** 没有模板文件或在依赖包里的组件渲染出的元素：只有根元素能追到业务模板（调用处写的 class 透传到它上面） */
async function viaCaller(el: Element, inst: Instance): Promise<Hit | null> {
  for (let hops = 0; hops < 8; hops++) {
    if (rootElementOf(inst) !== el) return null;
    const parent = inst.vnode.ctx;
    if (!parent) return null;
    if (isAppComponent(parent)) {
      const a = await alignedFor(parent);
      const t = a?.comps.get(inst);
      return a && t ? { inst: parent, a, t, viaOwner: true } : null;
    }
    inst = parent;
  }
  return null;
}

async function locate(el: Element): Promise<Hit | null> {
  const v = elementVNodeOf(el);
  if (v?.ctx) {
    if (!isAppComponent(v.ctx)) return viaCaller(el, v.ctx);
    for (const fresh of [false, true]) {
      const a = await alignedFor(v.ctx, fresh);
      const t = a?.els.get(el);
      if (a && t) return { inst: v.ctx, a, t };
    }
    return null;
  }
  // 编译成静态 HTML 的内容没有 vnode：从最近的祖先所在的组件往里找，静态块可能在它渲染的子组件里
  let start: Instance | null = null;
  for (let p = el.parentElement; p && !start; p = p.parentElement) start = vnodeOf(p)?.ctx ?? appInstanceOf(p);
  if (!start) return null;
  for (const fresh of [false, true]) {
    const queue: Instance[] = [start];
    const seen = new Set<Instance>();
    while (queue.length && seen.size < 64) {
      const inst = queue.shift()!;
      if (seen.has(inst)) continue;
      seen.add(inst);
      const a = await alignedFor(inst, fresh);
      if (!a) continue;
      // 依赖包里的组件（比如 Nuxt 的根组件）只用来往里找业务组件
      const t = isAppComponent(inst) ? a.els.get(el) : undefined;
      if (t) return { inst, a, t };
      queue.push(...a.comps.keys());
    }
  }
  return null;
}

function nameOf(inst: Instance | null | undefined): string | null {
  if (!inst) return null;
  const t = inst.type;
  return t.__name || t.name || (t.__file ? t.__file.replace(/^.*[\\/]/, '').replace(/\.vue$/, '') : null);
}

function toLoc(hit: Hit): SourceLoc {
  const { file, src } = hit.a.tpl;
  const { line, column } = lineColAt(src, hit.t.start);
  return { url: file, path: file, file, line, column, component: nameOf(hit.inst), viaOwner: !!hit.viaOwner };
}

/** 组件的根元素：调用处写的 class 会透传到它上面（Vue 只透传给元素或组件根，多根、静态块和 inheritAttrs: false 都不透传） */
function rootElementOf(inst: Instance): Element | null {
  if (inst.type.inheritAttrs === false) return null;
  let root = inst.subTree;
  if (root?.type === FRAGMENT && root.patchFlag & DEV_ROOT_FRAGMENT) {
    const only = kids(root).filter(counts);
    root = only.length === 1 ? only[0] : null;
  }
  return root && root.shapeFlag & (ELEMENT | COMPONENT) && root.el instanceof Element ? root.el : null;
}

export const vueLocator: Locator = {
  owns: (el) => !!vnodeOf(el) || !!el.closest('[data-v-app]'),
  sourceOf: async (el) => {
    const hit = await locate(el);
    return hit ? toLoc(hit) : null;
  },
  /** 只有组件根元素往外走：元素的类名只可能来自它自己的标签和（透传的）调用处 */
  chain: async (el, depth) => {
    const first = await locate(el);
    if (!first) return [];
    const out: ChainLink[] = [{ loc: toLoc(first), callee: null }];
    let inst = first.inst;
    while (out.length <= depth && rootElementOf(inst) === el) {
      const parent = inst.vnode.ctx;
      if (!parent || !isAppComponent(parent)) break;
      const pa = await alignedFor(parent);
      const t = pa?.comps.get(inst);
      if (!pa || !t) break;
      out.push({ loc: toLoc({ inst: parent, a: pa, t }), callee: nameOf(inst) });
      inst = parent;
    }
    return out;
  },
  ownerName: (el) => nameOf(elementVNodeOf(el)?.ctx),
  warm: (nodes) => {
    const seen = new Set<Instance>();
    for (const n of nodes) {
      const inst = elementVNodeOf(n)?.ctx;
      if (inst && !seen.has(inst)) {
        seen.add(inst);
        void templateOf(inst);
      }
    }
  },
};
