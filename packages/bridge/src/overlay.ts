import { OWN_ATTR, labelOf } from './util';

// 只用灰阶，而且要在任意颜色的页面上都看得见：描边和外边距斜线都是黑白两层，填充用半透明中灰
const STYLE = `
:host { all: initial; }
.box { position: fixed; pointer-events: none; box-sizing: border-box; border-style: solid; border-width: 0; }
.m { border-color: transparent;
  background: repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.3) 0 1px, rgba(255, 255, 255, 0.45) 1px 2px, transparent 2px 6px) border-box;
  mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0); mask-composite: exclude; }
.bd { border-color: rgba(128, 128, 128, 0.6); }
.p { border-color: rgba(128, 128, 128, 0.36); }
.c { background: rgba(128, 128, 128, 0.14); }
.sel-outline { outline: 1.5px solid #fff; box-shadow: 0 0 0 2.5px #111; }
.hov-outline { outline: 1px dashed #fff; box-shadow: 0 0 0 1px #111; }
.peer { outline: 1px dotted #fff; box-shadow: 0 0 0 1px rgba(17, 17, 17, 0.55); }
.tag { position: fixed; pointer-events: none; font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; color: #f5f5f5;
  background: #111; padding: 2px 6px; border-radius: 4px; white-space: nowrap; max-width: 70vw; overflow: hidden;
  text-overflow: ellipsis; font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 2px 8px rgba(0, 0, 0, 0.3); }
.tag .dim { opacity: 0.6; margin-left: 6px; }
.hidden { display: none; }
`;

interface Layer {
  m: HTMLDivElement;
  bd: HTMLDivElement;
  p: HTMLDivElement;
  c: HTMLDivElement;
  outline: HTMLDivElement;
}

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let hoverLayer: Layer | null = null;
let selLayer: Layer | null = null;
let tag: HTMLDivElement | null = null;
let peerBox: HTMLDivElement | null = null;

let hoverEl: Element | null = null;
let selEl: Element | null = null;
let selNote = '';
let peers: Element[] = [];
let raf = 0;
let fallback = 0;

function div(cls: string, parent: Node): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}

function makeLayer(outlineCls: string): Layer {
  const r = root!;
  return { m: div('box m', r), bd: div('box bd', r), p: div('box p', r), c: div('box c', r), outline: div(`box ${outlineCls}`, r) };
}

function ensure() {
  if (host && host.isConnected) return;
  if (!document.documentElement) return;
  host = document.createElement('css-tuner-overlay');
  host.setAttribute(OWN_ATTR, '');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; display: block;';
  root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.appendChild(style);
  peerBox = div('peers', root);
  hoverLayer = makeLayer('hov-outline');
  selLayer = makeLayer('sel-outline');
  tag = div('tag hidden', root);
  document.documentElement.appendChild(host);
}

function place(d: HTMLElement, x: number, y: number, w: number, h: number, borders?: [number, number, number, number]) {
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  d.style.width = `${Math.max(0, w)}px`;
  d.style.height = `${Math.max(0, h)}px`;
  if (borders) d.style.borderWidth = borders.map((b) => `${Math.max(0, b)}px`).join(' ');
  d.classList.remove('hidden');
}

function hideLayer(l: Layer | null) {
  if (!l) return;
  for (const d of Object.values(l)) d.classList.add('hidden');
}

function drawLayer(l: Layer, el: Element, tint: boolean) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const n = (v: string) => parseFloat(v) || 0;
  const mt = n(cs.marginTop), mr = n(cs.marginRight), mb = n(cs.marginBottom), ml = n(cs.marginLeft);
  const bt = n(cs.borderTopWidth), br = n(cs.borderRightWidth), bb = n(cs.borderBottomWidth), bl = n(cs.borderLeftWidth);
  const pt = n(cs.paddingTop), pr = n(cs.paddingRight), pb = n(cs.paddingBottom), pl = n(cs.paddingLeft);
  place(l.outline, r.left, r.top, r.width, r.height);
  if (!tint) {
    for (const d of [l.m, l.bd, l.p, l.c]) d.classList.add('hidden');
    return;
  }
  place(l.m, r.left - Math.max(0, ml), r.top - Math.max(0, mt), r.width + Math.max(0, ml) + Math.max(0, mr), r.height + Math.max(0, mt) + Math.max(0, mb), [mt, mr, mb, ml]);
  place(l.bd, r.left, r.top, r.width, r.height, [bt, br, bb, bl]);
  place(l.p, r.left + bl, r.top + bt, r.width - bl - br, r.height - bt - bb, [pt, pr, pb, pl]);
  place(l.c, r.left + bl + pl, r.top + bt + pt, r.width - bl - br - pl - pr, r.height - bt - bb - pt - pb);
}

function drawTag(el: Element, note: string) {
  if (!tag) return;
  const r = el.getBoundingClientRect();
  tag.textContent = '';
  const main = document.createElement('span');
  main.textContent = labelOf(el);
  const dim = document.createElement('span');
  dim.className = 'dim';
  dim.textContent = `${Math.round(r.width)}×${Math.round(r.height)}${note ? '  ' + note : ''}`;
  tag.append(main, dim);
  tag.classList.remove('hidden');
  const h = 20;
  const top = r.top - h - 4 >= 0 ? r.top - h - 4 : r.bottom + 4;
  tag.style.left = `${Math.max(2, Math.min(r.left, innerWidth - 240))}px`;
  tag.style.top = `${Math.min(top, innerHeight - h - 2)}px`;
}

function drawPeers() {
  if (!peerBox) return;
  const need = selEl ? peers.filter((p) => p !== selEl && p.isConnected).slice(0, 80) : [];
  while (peerBox.childElementCount < need.length) div('box peer', peerBox);
  const kids = Array.from(peerBox.children) as HTMLElement[];
  kids.forEach((k, i) => {
    const p = need[i];
    if (!p) {
      k.classList.add('hidden');
      return;
    }
    const r = p.getBoundingClientRect();
    place(k, r.left, r.top, r.width, r.height);
  });
}

function frame() {
  raf = 0;
  ensure();
  if (!root) return;
  if (hoverEl && hoverEl.isConnected && hoverEl !== selEl) drawLayer(hoverLayer!, hoverEl, true);
  else hideLayer(hoverLayer);
  if (selEl && selEl.isConnected) {
    drawLayer(selLayer!, selEl, !hoverEl || hoverEl === selEl);
    drawTag(selEl, selNote);
  } else {
    hideLayer(selLayer);
    if (hoverEl && hoverEl.isConnected) drawTag(hoverEl, '');
    else tag?.classList.add('hidden');
  }
  drawPeers();
  if ((hoverEl && hoverEl.isConnected) || (selEl && selEl.isConnected)) raf = requestAnimationFrame(frame);
}

// 页面不出帧（窗口被遮住、后台截图）时 rAF 不触发，用定时器补画一帧
function kick() {
  if (!raf) raf = requestAnimationFrame(frame);
  if (!fallback) {
    fallback = window.setTimeout(() => {
      fallback = 0;
      if (!raf) return;
      cancelAnimationFrame(raf);
      frame();
    }, 100);
  }
}

export function setHover(el: Element | null) {
  hoverEl = el;
  kick();
}

export function setSelected(el: Element | null, note = '', same: Element[] = []) {
  selEl = el;
  selNote = note;
  peers = same;
  kick();
}

export function isOverlay(node: EventTarget | null): boolean {
  return !!host && node === host;
}
