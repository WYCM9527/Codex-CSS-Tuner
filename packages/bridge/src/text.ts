import type { PreviewTarget, SourceLoc, TextInfo, TextSegment } from '@css-tuner/protocol';
import { fiberOf, propsChain, sameSourceElements, type DebugNode } from './source';
import { elOf, isOwnNode } from './util';

/** 双击编辑时临时包住文本节点的那层 span */
export const EDITING_ATTR = 'data-css-tuner-editing';

const MAX_SEGMENTS = 8;

type TextTarget = Extract<PreviewTarget, { kind: 'text' }>;

/** 元素的直接子文本节点（跳过纯空白）；双击编辑时包着文字的那层也穿过去 */
export function textNodesOf(el: Element): Text[] {
  const out: Text[] = [];
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) {
      if ((n as Text).data.trim()) out.push(n as Text);
    } else if (n instanceof Element && n.hasAttribute(EDITING_ATTR)) {
      // 输入时浏览器可能把里面的文本节点整个换掉：算作编辑开始时的那个节点，结束时放回去的也是它
      const t = editing?.node ?? Array.from(n.childNodes).find((c): c is Text => c.nodeType === Node.TEXT_NODE);
      if (t) out.push(t);
    }
  }
  return out;
}

/* ---------- 预览 ---------- */

interface Held {
  el: Element;
  node: Text;
  /** 页面自己的文字：预览前的值，React 之后改写过就跟着更新（撤掉预览时恢复成它） */
  base: string;
}

interface Entry {
  target: TextTarget;
  value: string;
  nodes: Text[];
}

const held = new Map<Text, Held>();
const entries = new Map<string, Entry>();
/** 双击编辑刚提交、预览还没到时，记下编辑前的文字 */
const pendingBase = new Map<Text, { base: string; at: number }>();
let editing: { node: Text; original: string } | null = null;

const observer = new MutationObserver((records) => {
  for (const r of records) {
    const node = r.target as Text;
    const h = held.get(node);
    if (!h || editing?.node === node) continue;
    // 不是我们写的（自己写完会立刻 takeRecords 丢掉）：React 改了文字，这就是页面现在的值
    h.base = node.data;
    refresh(node);
  }
});

function observeHeld() {
  observer.disconnect();
  for (const node of held.keys()) observer.observe(node, { characterData: true });
}

/** 把新文字套进原文的首尾空白里 */
export function fill(base: string, value: string): string {
  return /^\s*/.exec(base)![0] + value + /\s*$/.exec(base)![0];
}

/** 页面自己的文字：被预览占着时是预览前的值 */
export function baseOf(node: Text): string {
  if (editing?.node === node) return held.get(node)?.base ?? editing.original;
  const h = held.get(node);
  if (h) return h.base;
  const p = pendingBase.get(node);
  if (p && Date.now() - p.at < 10000) return p.base;
  return node.data;
}

/** 按最后一个占着它的预览写文字，没有预览了就恢复原样 */
function refresh(node: Text) {
  const h = held.get(node);
  if (!h) return;
  let value: string | null = null;
  for (const e of entries.values()) if (e.nodes.includes(node)) value = e.value;
  // 正在双击编辑的节点不动它的文字，也留着它原本的值
  if (editing?.node === node) return;
  const next = value === null ? h.base : fill(h.base, value);
  if (node.data !== next) node.data = next;
  if (value === null) held.delete(node);
  observer.takeRecords();
}

function hold(el: Element, node: Text): void {
  if (held.has(node)) return;
  held.set(node, { el, node, base: baseOf(node) });
  pendingBase.delete(node);
}

export function hasTextPreview(id: string): boolean {
  return entries.has(id);
}

export async function previewText(id: string, target: TextTarget, value: string): Promise<number> {
  let e = entries.get(id);
  if (e && JSON.stringify(e.target) !== JSON.stringify(target)) {
    clearTextPreview(id);
    e = undefined;
  }
  if (!e) {
    const el = elOf(target.uid);
    const main = el && textNodesOf(el)[target.segment];
    if (!el || !main) return 0;
    const want = baseOf(main).trim();
    const els = target.sourceKey ? await sameSourceElements(el, target.depth ?? 0) : [el];
    const nodes: Text[] = [];
    for (const x of els) {
      const node = x === el ? main : textNodesOf(x)[target.segment];
      // 同源实例里只改显示着同一段文字的（条件渲染出别的文字的不动）
      if (!node || baseOf(node).trim() !== want) continue;
      hold(x, node);
      nodes.push(node);
    }
    e = { target, value, nodes };
    entries.delete(id);
    entries.set(id, e);
  }
  e.value = value;
  for (const node of e.nodes) refresh(node);
  observeHeld();
  return e.nodes.length;
}

export function clearTextPreview(id: string): boolean {
  const e = entries.get(id);
  if (!e) return false;
  entries.delete(id);
  for (const node of e.nodes) refresh(node);
  observeHeld();
  return true;
}

/** 写回纯 HTML 后页面不刷新：去掉预览记录，但页面上保留 value */
export function commitTextPreview(id: string, value: string | null) {
  const e = entries.get(id);
  if (!e) return;
  entries.delete(id);
  for (const node of e.nodes) {
    const h = held.get(node);
    if (h && value !== null) h.base = fill(h.base, value);
    refresh(node);
  }
  observeHeld();
}

export function clearAllTexts(): number {
  const n = entries.size;
  for (const id of Array.from(entries.keys())) clearTextPreview(id);
  return n;
}

/** React 重渲染把文本节点换掉了：在原来的元素里找回新的节点，重新套上预览 */
export function reapplyTexts() {
  const moved = new Map<Text, Text | undefined>();
  for (const e of entries.values()) {
    e.nodes = e.nodes.flatMap((node) => {
      if (node.isConnected) return [node];
      if (!moved.has(node)) {
        const h = held.get(node);
        held.delete(node);
        const again = h && h.el.isConnected ? textNodesOf(h.el)[e.target.segment] : undefined;
        // 双击编辑刚提交时页面上已是新文字，原文要从 baseOf 取
        if (again) hold(h!.el, again);
        moved.set(node, again);
      }
      const again = moved.get(node);
      return again ? [again] : [];
    });
    for (const node of e.nodes) refresh(node);
  }
  if (moved.size) observeHeld();
}

export function hasTextPreviews(): boolean {
  return entries.size > 0;
}

/* ---------- 双击编辑和预览的配合 ---------- */

export function setEditing(node: Text | null, original = '') {
  editing = node ? { node, original } : null;
}

/**
 * 编辑结束：自己改的文字不算 React 的改写；还没被预览占着的节点记下编辑前的文字。
 * 提交时页面上先留着新文字，等扩展发来预览；取消时按预览恢复
 */
export function endEditing(node: Text, original: string, committed: boolean) {
  observer.takeRecords();
  if (!held.has(node)) pendingBase.set(node, { base: original, at: Date.now() });
  editing = null;
  if (!committed) refresh(node);
}

/* ---------- 来源分析 ---------- */

/** 文本在宿主元素 JSX children 里的下标；不是元素自己的 children 直接写的为 null */
function childIndex(node: Text, host: DebugNode): number | null {
  const f = fiberOf(node);
  if (f) {
    const p = f.return;
    return p && (p === host || p === host.alternate || p.alternate === host) ? (f.index ?? null) : null;
  }
  // 只有一段文字时 React 直接设 textContent，文本节点上没有 fiber
  const kids = (host.memoizedProps as { children?: unknown } | undefined)?.children;
  return typeof kids === 'string' || typeof kids === 'number' ? 0 : null;
}

function matching(chain: Array<{ depth: number; props: Record<string, unknown> }>, text: string): TextSegment['props'] {
  const out: TextSegment['props'] = [];
  for (const { depth, props } of chain) {
    for (const [name, v] of Object.entries(props)) {
      if (name === 'children') {
        if (v === text) out.push({ depth, name, child: 0 });
        else if (Array.isArray(v)) {
          const i = v.indexOf(text);
          if (i >= 0) out.push({ depth, name, child: i });
        }
      } else if (v === text) out.push({ depth, name });
    }
  }
  return out.slice(0, 6);
}

/** 纯 HTML：元素从 <html> 起逐层在父元素里的下标（不算扩展自己插进去的节点） */
export function htmlPathOf(el: Element): number[] | null {
  const path: number[] = [];
  for (let e: Element = el; e !== document.documentElement; ) {
    const parent = e.parentElement;
    if (!parent) return null;
    path.unshift(Array.from(parent.children).filter((c) => !isOwnNode(c)).indexOf(e));
    e = parent;
  }
  return path;
}

/** 按 htmlPathOf 的路径在当前页面上找回元素（页面刷新过、uid 对不上时用） */
export function elementAtPath(path: number[]): Element | null {
  let el: Element | null = document.documentElement;
  for (const i of path) el = el ? (Array.from(el.children).filter((c) => !isOwnNode(c))[i] ?? null) : null;
  return el;
}

export async function textInfo(el: Element, source: SourceLoc | null): Promise<TextInfo | undefined> {
  const nodes = textNodesOf(el).slice(0, MAX_SEGMENTS);
  if (!nodes.length) return undefined;
  const host = fiberOf(el);
  const chain = host ? await propsChain(el) : [];
  const segments = nodes.map((node) => {
    const value = baseOf(node);
    return { value, child: host && !source?.viaOwner ? childIndex(node, host) : null, props: matching(chain, value) };
  });
  return { segments, htmlPath: host ? null : htmlPathOf(el), lang: document.documentElement.lang || null };
}

/** 不刷新页面，重新取一次页面 HTML，按路径读出那段文字（纯 HTML 写回后校验用） */
export async function fetchedText(path: number[], segment: number): Promise<string | null> {
  try {
    const html = await (await fetch(location.href, { cache: 'no-store' })).text();
    let el: Element | null = new DOMParser().parseFromString(html, 'text/html').documentElement;
    for (const i of path) el = el?.children[i] ?? null;
    return el ? (textNodesOf(el)[segment]?.data ?? null) : null;
  } catch {
    return null;
  }
}
