import { parse, type DefaultTreeAdapterTypes as P5 } from 'parse5';
import { t as msg } from '@css-tuner/protocol';
import { applyEdits, type EditResult, type TextEdit } from '../types';
import { commonEnds, short } from './diff';

const isElement = (n: P5.ChildNode): n is P5.Element => 'tagName' in n;
const isText = (n: P5.ChildNode): n is P5.TextNode => n.nodeName === '#text';

/** 按页面上算出的子元素下标路径（从 <html> 起）找元素；路径走不通或标签对不上返回 null */
function elementAt(source: string, path: number[], tag: string): P5.Element | null {
  const doc = parse(source, { sourceCodeLocationInfo: true });
  let el = doc.childNodes.find((n): n is P5.Element => isElement(n) && n.tagName === 'html') ?? null;
  for (const i of path) {
    if (!el) return null;
    el = el.childNodes.filter(isElement)[i] ?? null;
  }
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
