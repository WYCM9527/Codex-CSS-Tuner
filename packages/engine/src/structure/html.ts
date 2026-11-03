import { parse, type DefaultTreeAdapterTypes as P5 } from 'parse5';
import { t as msg } from '@css-tuner/protocol';
import { applyEdits, type EditResult, type TextEdit } from '../types';
import { commonEnds, short } from './diff';
import { isPermutation, orderSummary, permute } from './reorder';

const isElement = (n: P5.ChildNode): n is P5.Element => 'tagName' in n;
const isText = (n: P5.ChildNode): n is P5.TextNode => n.nodeName === '#text';

/** 按页面上算出的子元素下标路径（从 <html> 起）找元素；路径走不通返回 null */
function nodeAt(source: string, path: number[]): P5.Element | null {
  const doc = parse(source, { sourceCodeLocationInfo: true });
  let el = doc.childNodes.find((n): n is P5.Element => isElement(n) && n.tagName === 'html') ?? null;
  for (const i of path) {
    if (!el) return null;
    el = el.childNodes.filter(isElement)[i] ?? null;
  }
  return el;
}

/** 同 nodeAt，标签也要对得上 */
function elementAt(source: string, path: number[], tag: string): P5.Element | null {
  const el = nodeAt(source, path);
  return el && el.tagName === tag ? el : null;
}

/** 元素第 segment 段直接子文本（跳过纯空白），和页面上的分段方式一致 */
function textAt(el: P5.Element, segment: number): P5.TextNode | null {
  return el.childNodes.filter(isText).filter((t) => t.value.trim())[segment] ?? null;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface HtmlTextEditInput {
  file: string;
  source: string;
  path: number[];
  tag: string;
  segment: number;
  from: string;
  value: string;
}

export function editHtmlText(input: HtmlTextEditInput): EditResult {
  const { file, source, path, tag, segment, from, value } = input;
  const el = elementAt(source, path, tag);
  if (!el) return { ok: false, reason: msg('engine.html.noElement', { tag }) };
  const node = textAt(el, segment);
  const loc = node?.sourceCodeLocation;
  if (!node || !loc) return { ok: false, reason: msg('engine.html.noText') };
  if (node.value.trim() !== from.trim()) return { ok: false, reason: msg('engine.text.changed', { now: short(node.value) }) };
  const raw = source.slice(loc.startOffset, loc.endOffset);
  const lead = /^\s*/.exec(raw)![0].length;
  const trail = /\s*$/.exec(raw)![0].length;
  const coreStart = loc.startOffset + lead;
  const core = raw.slice(lead, raw.length - trail);
  let edit: TextEdit;
  if (core === node.value.trim()) {
    const { p, s } = commonEnds(core, value);
    edit = { start: coreStart + p, end: coreStart + core.length - s, text: escapeHtml(value.slice(p, value.length - s)) };
  } else {
    edit = { start: coreStart, end: coreStart + core.length, text: escapeHtml(value) };
  }
  const back = elementAt(applyEdits(source, [edit]), path, tag);
  const check = back && textAt(back, segment);
  if (!check || check.value.trim() !== value.trim()) return { ok: false, reason: msg('engine.text.verifyFailed') };
  return { ok: true, file, edits: [edit], summary: msg('engine.text.summary', { from: short(from), to: short(value) }) };
}

/** 不参与换序、留在原处的子元素（和页面上的判断一致） */
const FIXED = new Set(['script', 'style', 'link', 'template', 'meta', 'noscript', 'base', 'title']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const movable = (el: P5.Element) => el.childNodes.filter(isElement).filter((c) => !FIXED.has(c.tagName));

export interface HtmlOrderInput {
  file: string;
  source: string;
  /** 父元素从 <html> 起的子元素下标 */
  path: number[];
  /** 参与换序的子元素标签，按页面上原来的顺序，用来确认文件和页面对得上 */
  tags: string[];
  /** 新顺序第 k 个位置放原来的第 order[k] 个 */
  order: number[];
}

export function editHtmlOrder(input: HtmlOrderInput): EditResult {
  const { file, source, path, tags, order } = input;
  if (!isPermutation(order, tags.length)) return { ok: false, reason: msg('engine.order.badOrder') };
  const parent = nodeAt(source, path);
  if (!parent) return { ok: false, reason: msg('engine.html.noElement', { tag: tags[0] ?? '?' }) };
  const kids = movable(parent);
  if (kids.map((k) => k.tagName).join(' ') !== tags.join(' ')) return { ok: false, reason: msg('engine.html.orderMismatch', { tag: parent.tagName }) };
  const spans: Array<{ start: number; end: number }> = [];
  for (const k of kids) {
    const loc = k.sourceCodeLocation;
    if (!loc || (!loc.endTag && !VOID.has(k.tagName))) return { ok: false, reason: msg('engine.html.noEndTag', { tag: k.tagName }) };
    spans.push({ start: loc.startOffset, end: loc.endOffset });
  }
  const edit = permute(source, spans, order);
  const after = applyEdits(source, [edit]);
  const want = order.map((i) => source.slice(spans[i].start, spans[i].end));
  const back = nodeAt(after, path);
  const got = back ? movable(back).map((k) => (k.sourceCodeLocation ? after.slice(k.sourceCodeLocation.startOffset, k.sourceCodeLocation.endOffset) : '')) : [];
  if (got.join('\u0000') !== want.join('\u0000')) return { ok: false, reason: msg('engine.order.verifyFailed') };
  return { ok: true, file, edits: [edit], summary: orderSummary(order) };
}
