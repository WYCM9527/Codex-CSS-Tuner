import { setHover } from './overlay';
import { OWN_ATTR, isOwnNode } from './util';

let on = false;
let cursorStyle: HTMLStyleElement | null = null;
let onPick: ((el: Element) => void) | null = null;
let onExit: (() => void) | null = null;

function targetOf(e: Event): Element | null {
  const path = e.composedPath();
  for (const n of path) {
    if (n instanceof Element && !isOwnNode(n)) return n;
  }
  return null;
}

function block(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function move(e: PointerEvent) {
  const el = targetOf(e);
  setHover(el && el !== document.documentElement && el !== document.body ? el : null);
}

function click(e: MouseEvent) {
  block(e);
  const el = targetOf(e);
  if (!el || el === document.documentElement) return;
  const cb = onPick;
  setPick(false);
  cb?.(el);
}

function key(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    block(e);
    setPick(false);
  }
}

const passthrough = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu', 'auxclick'] as const;

export function setPick(v: boolean, pick?: (el: Element) => void, exit?: () => void) {
  if (pick) onPick = pick;
  if (exit) onExit = exit;
  if (v === on) return;
  on = v;
  if (on) {
    window.addEventListener('pointermove', move, true);
    window.addEventListener('click', click, true);
    window.addEventListener('keydown', key, true);
    for (const t of passthrough) window.addEventListener(t, block, true);
    cursorStyle = document.createElement('style');
    cursorStyle.setAttribute(OWN_ATTR, '');
    cursorStyle.textContent = 'html, html * { cursor: crosshair !important; }';
    (document.head || document.documentElement).appendChild(cursorStyle);
  } else {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('click', click, true);
    window.removeEventListener('keydown', key, true);
    for (const t of passthrough) window.removeEventListener(t, block, true);
    cursorStyle?.remove();
    cursorStyle = null;
    setHover(null);
    onExit?.();
  }
}

export function pickOn(): boolean {
  return on;
}
