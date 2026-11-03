import { t as msg } from '@css-tuner/protocol';
import { parseModule, type Node } from '../ast';
import { applyEdits, type EditResult, type TextEdit } from '../types';
import { commonEnds, short } from './diff';
import { classify, cleanJsxText, findElement, jsxChildren, translationBindings, type MessageRef } from './jsx';

/** 文字在源码里的写法（给规划用，不带 AST） */
export type TextSite =
  | { kind: 'literal'; value: string }
  | { kind: 'message'; ref: MessageRef; code: string }
  | { kind: 'dynamic'; code: string };

function parsed(source: string, filename: string): { ast: Node } | { error: string } {
  try {
    return { ast: parseModule(source, filename) };
  } catch (e) {
    return { error: msg('engine.jsx.parseFailed', { error: (e as Error).message }) };
  }
}

function attrOf(el: Node, name: string): Node | null {
  return el.openingElement.attributes.find((a: Node) => a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' && a.name.name === name) ?? null;
}

function siteOf(n: Node, source: string, ast: Node): TextSite {
  const c = classify(n, source, translationBindings(ast));
  return c.kind === 'literal' ? { kind: 'literal', value: c.value } : c;
}

/** (line, column) 处 JSX 元素 children 里第 index 项的写法 */
export function jsxChildSite(source: string, filename: string, line: number, column: number, index: number): TextSite | { error: string } {
  const p = parsed(source, filename);
  if ('error' in p) return p;
  const { ast } = p;
  const el = findElement(ast, line, column);
  if (!el) return { error: msg('engine.jsx.noElement', { line }) };
  const child = jsxChildren(el)[index];
  if (!child) return { error: msg('engine.text.noChild', { line }) };
  if (child.node.type === 'JSXElement' || child.node.type === 'JSXFragment') return { kind: 'dynamic', code: source.slice(child.node.start, child.node.end) };
  return siteOf(child.node, source, ast);
}

/** (line, column) 处 JSX 元素上属性 name 的写法 */
export function jsxAttrSite(source: string, filename: string, line: number, column: number, name: string): TextSite | { error: string } {
  const p = parsed(source, filename);
  if ('error' in p) return p;
  const { ast } = p;
  const el = findElement(ast, line, column);
  if (!el) return { error: msg('engine.jsx.noElement', { line }) };
  const attr = attrOf(el, name);
  if (!attr) return { error: msg('engine.attr.missing', { name, line }) };
  const v = attr.value;
  if (v?.type === 'StringLiteral') return { kind: 'literal', value: v.value };
  if (v?.type === 'JSXExpressionContainer' && v.expression.type !== 'JSXEmptyExpression') return siteOf(v.expression, source, ast);
  return { kind: 'dynamic', code: source.slice(attr.start, attr.end) };
}

/** JSX 文本里不能直接写的字符：花括号、尖括号、会被当成实体的 &xx; */
const JSX_TEXT_UNSAFE = /[{}<>\r\n]|&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

const escapeJs = (s: string, quote: string) =>
  s.replace(/[\\\n\r\u2028\u2029]/g, (c) => ({ '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\u2028': '\\u2028', '\u2029': '\\u2029' })[c]!).split(quote).join(`\\${quote}`);
const escapeTemplate = (s: string) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

/** 字面量内部（引号里面）按最小差异改写；原文里有转义时整段替换 */
function innerEdit(start: number, raw: string, cooked: string, next: string, escape: (s: string) => string): TextEdit {
  if (raw !== cooked) return { start, end: start + raw.length, text: escape(next) };
  const { p, s } = commonEnds(cooked, next);
  return { start: start + p, end: start + cooked.length - s, text: escape(next.slice(p, next.length - s)) };
}

/** JSX 文本的候选改法：先在原文上做最小改动，写不成文本时整段换成 {"..."} */
function jsxTextEdits(source: string, node: Node, next: string): TextEdit[] {
  const raw = source.slice(node.start, node.end);
  const out: TextEdit[] = [];
  if (raw === node.value) {
    const { text: old, map } = cleanJsxText(raw);
    const { p, s } = commonEnds(old, next);
    const mid = next.slice(p, next.length - s);
    if (old.length && !JSX_TEXT_UNSAFE.test(mid)) {
      const from = p < old.length ? map[p][0] : map[old.length - 1][1];
      const to = old.length - s > p ? map[old.length - s - 1][1] : from;
      out.push({ start: node.start + from, end: node.start + to, text: mid });
    }
  }
  const lead = /^\s*/.exec(raw)![0].length;
  const trail = /\s*$/.exec(raw)![0].length;
  const core = { start: node.start + lead, end: node.end - trail };
  if (!JSX_TEXT_UNSAFE.test(next)) out.push({ ...core, text: next });
  out.push({ ...core, text: `{${JSON.stringify(next)}}` });
  return out;
}

function literalEdits(source: string, node: Node, next: string): TextEdit[] {
  if (node.type === 'JSXText') return jsxTextEdits(source, node, next);
  if (node.type === 'StringLiteral') {
    const quote = source[node.start];
    return [innerEdit(node.start + 1, source.slice(node.start + 1, node.end - 1), node.value, next, (x) => escapeJs(x, quote))];
  }
  const q = node.quasis[0];
  return [innerEdit(q.start, q.value.raw, q.value.cooked ?? '', next, escapeTemplate)];
}

/** 依次试候选改法，改完重新解析，读回来的文字和期望一致才算数 */
function firstVerified(source: string, file: string, candidates: TextEdit[], readBack: (src: string) => string | null, next: string): TextEdit | null {
  for (const e of candidates) {
    const after = applyEdits(source, [e]);
    if (readBack(after) === next) return e;
  }
  return null;
}

export interface JsxTextEditInput {
  file: string;
  source: string;
  line: number;
  column: number;
  /** 运行时 children 数组里的下标 */
  segment: number;
  /** 页面上原来的文字，源码里对不上就不改 */
  from: string;
  value: string;
}

export function editJsxText(input: JsxTextEditInput): EditResult {
  const { file, source, line, column, segment, from, value } = input;
  const p = parsed(source, file);
  if ('error' in p) return { ok: false, reason: p.error };
  const el = findElement(p.ast, line, column);
  if (!el) return { ok: false, reason: msg('engine.jsx.noElement', { line }) };
  const child = jsxChildren(el)[segment];
  if (!child) return { ok: false, reason: msg('engine.text.noChild', { line }) };
  const site = classify(child.node, source, []);
  if (site.kind !== 'literal') return { ok: false, reason: msg('engine.text.notLiteral', { code: short(site.code) }) };
  if (site.value.trim() !== from.trim()) return { ok: false, reason: msg('engine.text.changed', { now: short(site.value) }) };
  const readBack = (src: string) => {
    try {
      const a = parseModule(src, file);
      const e = findElement(a, line, column);
      const c = e && jsxChildren(e)[segment];
      const s = c && classify(c.node, src, []);
      return s && s.kind === 'literal' ? s.value : null;
    } catch {
      return null;
    }
  };
  const edit = firstVerified(source, file, literalEdits(source, child.node, value), readBack, value);
  if (!edit) return { ok: false, reason: msg('engine.text.verifyFailed') };
  return { ok: true, file, edits: [edit], summary: msg('engine.text.summary', { from: short(from), to: short(value) }) };
}

export interface JsxAttrEditInput {
  file: string;
  source: string;
  line: number;
  column: number;
  name: string;
  from: string;
  value: string;
}

/** JSX 属性字符串不处理反斜杠转义、会解码实体，含引号、换行、实体时改用 {"..."} */
const ATTR_UNSAFE = /[\r\n]|&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

export function editJsxAttr(input: JsxAttrEditInput): EditResult {
  const { file, source, line, column, name, from, value } = input;
  const p = parsed(source, file);
  if ('error' in p) return { ok: false, reason: p.error };
  const el = findElement(p.ast, line, column);
  if (!el) return { ok: false, reason: msg('engine.jsx.noElement', { line }) };
  const attr = attrOf(el, name);
  if (!attr) return { ok: false, reason: msg('engine.attr.missing', { name, line }) };
  const v = attr.value;
  let current: string;
  let candidates: TextEdit[] = [];
  if (v?.type === 'StringLiteral') {
    current = v.value;
    const quote = source[v.start];
    if (!ATTR_UNSAFE.test(value) && !value.includes(quote)) candidates.push(innerEdit(v.start + 1, source.slice(v.start + 1, v.end - 1), v.value, value, (x) => x));
    candidates.push({ start: v.start, end: v.end, text: `{${JSON.stringify(value)}}` });
  } else if (v?.type === 'JSXExpressionContainer') {
    const site = classify(v.expression, source, []);
    if (site.kind !== 'literal' || site.form === 'jsxText') return { ok: false, reason: msg('engine.text.notLiteral', { code: short(source.slice(v.start, v.end)) }) };
    current = site.value;
    candidates = literalEdits(source, v.expression, value);
  } else {
    return { ok: false, reason: msg('engine.text.notLiteral', { code: short(source.slice(attr.start, attr.end)) }) };
  }
  if (current.trim() !== from.trim()) return { ok: false, reason: msg('engine.text.changed', { now: short(current) }) };
  const readBack = (src: string) => {
    try {
      const a = parseModule(src, file);
      const e = findElement(a, line, column);
      const at = e && attrOf(e, name);
      const x = at?.value;
      if (x?.type === 'StringLiteral') return x.value as string;
      if (x?.type === 'JSXExpressionContainer') {
        const s = classify(x.expression, src, []);
        return s.kind === 'literal' ? s.value : null;
      }
      return null;
    } catch {
      return null;
    }
  };
  const edit = firstVerified(source, file, candidates, readBack, value);
  if (!edit) return { ok: false, reason: msg('engine.text.verifyFailed') };
  return { ok: true, file, edits: [edit], summary: msg('engine.attr.summary', { name, from: short(from), to: short(value) }) };
}
