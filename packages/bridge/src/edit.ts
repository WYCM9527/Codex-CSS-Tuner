import { EDITING_ATTR, endEditing, fill, setEditing } from './text';
import { isOwnNode, OWN_ATTR } from './util';

type Send = (value: string, phase: 'live' | 'commit') => void;

interface Session {
  node: Text;
  wrap: HTMLElement;
  original: string;
  send: Send;
  /** 输入过程中已经发过 live，取消时要把开始时的文字发回去 */
  live: boolean;
  timer: number;
}

let cur: Session | null = null;

/** 拦在 window 捕获阶段：编辑中的按键和点击不交给页面自己的处理函数 */
const GUARDED = ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu'] as const;

/** 双击处的文本节点和光标位置；点在空白、内边距上不算。scope 是选中的元素，双击只改它里面的文字 */
export function textAt(x: number, y: number, scope: Element): { node: Text; offset: number } | null {
  const under = (n: Node) => {
    const r = document.createRange();
    r.selectNodeContents(n);
    return Array.from(r.getClientRects()).some((b) => x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2);
  };
  const d = document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null };
  const pos = d.caretPositionFromPoint?.(x, y);
  const range = pos ? null : document.caretRangeFromPoint?.(x, y);
  const node = pos?.offsetNode ?? range?.startContainer;
  if (node && node.nodeType === Node.TEXT_NODE && (node as Text).data.trim() && scope.contains(node) && under(node)) {
    return { node: node as Text, offset: pos?.offset ?? range?.startOffset ?? 0 };
  }
  // 文字被透明层盖住、或设了 pointer-events: none 时命中测试找不到它：在选中元素里按位置找，光标放到末尾。
  // 看不见的（入场动画还没播、visibility: hidden）不算，那样的编辑框拿不到焦点
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const el = t.parentElement;
    if (!t.data.trim() || !el || isOwnNode(el) || el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) continue;
    if (under(t)) return { node: t, offset: t.length };
  }
  return null;
}

export function isEditingText(): boolean {
  return !!cur;
}

const clean = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();

/** 把文本节点包进一个可编辑的 span；结束时拆掉 span，把原来那个文本节点放回去（React 还认得它） */
export function beginEdit(node: Text, offset: number, send: Send) {
  finish(true);
  const parent = node.parentNode;
  if (!parent) return;
  const original = node.data;
  const wrap = document.createElement('span');
  wrap.setAttribute(OWN_ATTR, '');
  wrap.setAttribute(EDITING_ATTR, '');
  wrap.setAttribute('contenteditable', 'plaintext-only');
  if (wrap.contentEditable !== 'plaintext-only') wrap.setAttribute('contenteditable', 'true');
  wrap.spellcheck = false;
  // 外层可能禁了选中或指针事件（装饰性标题常见），编辑框自己要放得进光标
  wrap.style.cssText =
    'outline:1px dashed currentColor;outline-offset:2px;border-radius:2px;cursor:text;user-select:text;-webkit-user-select:text;pointer-events:auto;';
  parent.insertBefore(wrap, node);
  wrap.appendChild(node);
  setEditing(node, original);
  cur = { node, wrap, original, send, live: false, timer: 0 };
  for (const t of GUARDED) window.addEventListener(t, guard, true);
  wrap.addEventListener('input', onInput);
  wrap.addEventListener('blur', onBlur);
  wrap.focus({ preventScroll: true });
  const sel = getSelection();
  if (sel) {
    const r = document.createRange();
    r.setStart(node, Math.min(offset, node.length));
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

function guard(e: Event) {
  const c = cur;
  if (!c || !(e.target instanceof Node) || !c.wrap.contains(e.target)) return;
  if (e instanceof KeyboardEvent) {
    // 输入法组字时的回车是选字，不是提交
    if (e.type === 'keydown' && !e.isComposing && e.keyCode !== 229) {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    }
  } else if (e.type === 'click' || e.type === 'auxclick') {
    // 文字在链接里时别跳转
    e.preventDefault();
  }
  e.stopImmediatePropagation();
}

function onInput() {
  const c = cur;
  if (!c) return;
  clearTimeout(c.timer);
  c.timer = window.setTimeout(() => {
    if (cur !== c) return;
    c.live = true;
    c.send(clean(c.wrap.textContent ?? '') || c.original.trim(), 'live');
  }, 150);
}

function onBlur() {
  finish(true);
}

/** 提交（回车、失焦）或取消（Esc）；改成空等于取消 */
export function finish(commit: boolean) {
  const c = cur;
  if (!c) return;
  cur = null;
  clearTimeout(c.timer);
  for (const t of GUARDED) window.removeEventListener(t, guard, true);
  c.wrap.removeEventListener('input', onInput);
  c.wrap.removeEventListener('blur', onBlur);
  const typed = clean(c.wrap.textContent ?? '');
  const value = commit && typed ? typed : c.original.trim();
  const changed = value !== c.original.trim();
  c.node.data = fill(c.original, value);
  if (c.wrap.isConnected) c.wrap.replaceWith(c.node);
  endEditing(c.node, c.original, changed);
  getSelection()?.removeAllRanges();
  if (changed || c.live) c.send(value, 'commit');
}
