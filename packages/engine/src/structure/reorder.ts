import { dirname, extname, join } from 'node:path';
import { t as msg } from '@css-tuner/protocol';
import { parseModule, walk, type Node } from '../ast';
import { applyEdits, type EditResult, type TextEdit } from '../types';
import { commonEnds, short } from './diff';
import { findElement } from './jsx';

/** 兄弟组里一项在 JSX 里的位置；name 是页面上的标签名（宿主元素）或组件名 */
export interface OrderSite {
  line: number;
  column: number;
  name?: string;
}

interface Span {
  start: number;
  end: number;
}

interface Parsed {
  ast: Node;
  parents: Map<Node, Node>;
}

function parsed(source: string, filename: string): Parsed | { error: string } {
  let ast: Node;
  try {
    ast = parseModule(source, filename);
  } catch (e) {
    return { error: msg('engine.jsx.parseFailed', { error: (e as Error).message }) };
  }
  const parents = new Map<Node, Node>();
  walk(ast, (n, p) => {
    if (p) parents.set(n, p);
  });
  return { ast, parents };
}

const errorCount = (ast: Node) => (ast.errors as unknown[] | undefined)?.length ?? 0;

/** order 是 0..n-1 的一个排列 */
export function isPermutation(order: number[], n: number): boolean {
  if (order.length !== n) return false;
  const seen = new Set(order);
  return seen.size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
}

/** 新顺序第 k 个位置放原来的第 order[k] 项；项与项之间的原文（空白、逗号、不参与换序的子节点）留在原处 */
export function permute(source: string, spans: Span[], order: number[]): TextEdit {
  let text = '';
  for (let k = 0; k < spans.length; k++) {
    const s = spans[order[k]];
    text += source.slice(s.start, s.end);
    if (k + 1 < spans.length) text += source.slice(spans[k].end, spans[k + 1].start);
  }
  const start = spans[0].start;
  const end = spans[spans.length - 1].end;
  const { p, s } = commonEnds(source.slice(start, end), text);
  return { start: start + p, end: end - s, text: text.slice(p, text.length - s) };
}

/** 只挪了一项（其余项的先后不变）时返回它原来的下标 */
function singleMove(order: number[]): number | null {
  for (let i = 0; i < order.length; i++) {
    if (order[i] === i) continue;
    for (const moved of [order[i], i]) {
      const rest = order.filter((v) => v !== moved);
      if (rest.every((v, k) => v === (k < moved ? k : k + 1))) return moved;
    }
    return null;
  }
  return null;
}

/** 改动说明：只挪了一项时说从第几到第几，否则列出新顺序（原来的位置，1 起） */
export function orderSummary(order: number[]): string {
  const moved = singleMove(order);
  if (moved !== null) return msg('engine.order.moved', { from: moved + 1, to: order.indexOf(moved) + 1 });
  return msg('engine.order.summary', { order: order.map((v) => v + 1).join(' ') });
}

/** 独占一行、紧挨在这一项前面的注释跟着它走；prevEnd 是上一项的结尾 */
function withLeadingComments(source: string, node: Node, prevEnd: number): Span {
  let start = node.start;
  const lead = (node.leadingComments as Node[] | undefined) ?? [];
  for (let i = lead.length - 1; i >= 0; i--) {
    const c = lead[i];
    if (c.start < prevEnd || !/^\s*$/.test(source.slice(c.end, start)) || !/\n/.test(source.slice(prevEnd, c.start))) break;
    start = c.start;
  }
  return { start, end: node.end };
}

/* ---------- JSX 子节点 ---------- */

/** 从 node 往上：每个在 children 里（直接或隔着 {…}、函数等）包含它的 JSX 元素 / 片段，以及那一层 children 里的那一项 */
function jsxAncestors(node: Node, parents: Map<Node, Node>): Array<{ parent: Node; item: Node }> {
  const out: Array<{ parent: Node; item: Node }> = [];
  for (let cur = node, p = parents.get(cur); p; cur = p, p = parents.get(cur)) {
    if ((p.type === 'JSXElement' || p.type === 'JSXFragment') && (p.children as Node[]).includes(cur)) out.push({ parent: p, item: cur });
  }
  return out;
}

const jsxName = (n: Node): string => {
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${jsxName(n.object)}.${n.property.name}`;
  if (n.type === 'JSXNamespacedName') return `${n.namespace.name}:${n.name.name}`;
  return '';
};

const isJsxComment = (n: Node) => n.type === 'JSXExpressionContainer' && n.expression.type === 'JSXEmptyExpression';
const isBlank = (n: Node) => n.type === 'JSXText' && !n.value.trim();

const isLineBreak = (n: Node | undefined) => !!n && isBlank(n) && /\n/.test(n.value);

/** JSX 里的一项，连同独占一行、紧挨在它上面的 {/* 注释 *\/} */
function jsxSpan(parent: Node, item: Node): Span {
  const kids = parent.children as Node[];
  let i = kids.indexOf(item);
  let start = item.start;
  while (i >= 3 && isLineBreak(kids[i - 1]) && isJsxComment(kids[i - 2]) && isLineBreak(kids[i - 3])) {
    start = kids[i - 2].start;
    i -= 2;
  }
  return { start, end: item.end };
}

interface JsxGroup {
  parent: Node;
  items: Node[];
  spans: Span[];
}

/** 各项所在的那个 JSX 父元素，和每一项在它 children 里对应的节点；对不上（不是同一个父元素、顺序和页面不同）就报错 */
function jsxGroup(p: Parsed, source: string, sites: OrderSite[]): JsxGroup | { error: string } {
  if (sites.length < 2) return { error: msg('engine.order.tooFew') };
  const chains: Array<Array<{ parent: Node; item: Node }>> = [];
  for (const s of sites) {
    const el = findElement(p.ast, s.line, s.column);
    if (!el) return { error: msg('engine.jsx.noElement', { line: s.line }) };
    const name = jsxName(el.openingElement.name);
    if (s.name && /^[a-z][a-z0-9-]*$/.test(name) && /^[a-z][a-z0-9-]*$/.test(s.name) && name !== s.name) return { error: msg('engine.order.mismatch') };
    chains.push(jsxAncestors(el, p.parents));
  }
  const parent = chains[0].map((c) => c.parent).find((cand) => chains.every((ch) => ch.some((c) => c.parent === cand)));
  if (!parent) return { error: msg('engine.order.noCommonParent') };
  const items = chains.map((ch) => ch.find((c) => c.parent === parent)!.item);
  for (let i = 1; i < items.length; i++) {
    if (items[i] === items[i - 1] || items.indexOf(items[i]) !== i) return { error: msg('engine.order.noCommonParent') };
    if (items[i].start <= items[i - 1].start) return { error: msg('engine.order.mismatch') };
  }
  return { parent, items, spans: items.map((it) => jsxSpan(parent, it)) };
}

/** 规划时用：这些位置是不是同一个 JSX 父元素下的几项；是的话给出父元素的写法和位置（行列从 1 开始） */
export function jsxOrderCheck(source: string, filename: string, sites: OrderSite[]): { ok: true; parent: string; line: number; column: number } | { error: string } {
  const p = parsed(source, filename);
  if ('error' in p) return p;
  const g = jsxGroup(p, source, sites);
  if ('error' in g) return g;
  const { line, column } = g.parent.loc.start;
  return { ok: true, parent: g.parent.type === 'JSXFragment' ? '<>' : `<${jsxName(g.parent.openingElement.name)}>`, line, column: column + 1 };
}

export interface JsxOrderInput {
  file: string;
  source: string;
  /** 各项在 JSX 里的位置，按页面上原来的顺序 */
  sites: OrderSite[];
  /** 新顺序第 k 个位置放原来的第 order[k] 项 */
  order: number[];
}

export function editJsxOrder(input: JsxOrderInput): EditResult {
  const { file, source, sites, order } = input;
  if (!isPermutation(order, sites.length)) return { ok: false, reason: msg('engine.order.badOrder') };
  const p = parsed(source, file);
  if ('error' in p) return { ok: false, reason: p.error };
  const g = jsxGroup(p, source, sites);
  if ('error' in g) return { ok: false, reason: g.error };
  const edit = permute(source, g.spans, order);
  const after = applyEdits(source, [edit]);
  const want = order.map((i) => source.slice(g.items[i].start, g.items[i].end));
  if (!sameJsxChildren(after, file, g.parent.start, (g.parent.children as Node[]).length, want, errorCount(p.ast))) {
    return { ok: false, reason: msg('engine.order.verifyFailed') };
  }
  return { ok: true, file, edits: [edit], summary: orderSummary(order) };
}

/** 改完重新解析：父元素还在原处、子节点数不变，参与换序的各项按新顺序出现 */
function sameJsxChildren(src: string, file: string, at: number, count: number, want: string[], errors: number): boolean {
  let ast: Node;
  try {
    ast = parseModule(src, file);
  } catch {
    return false;
  }
  if (errorCount(ast) > errors) return false;
  let parent: Node | null = null;
  walk(ast, (n) => {
    if (!parent && n.start === at && (n.type === 'JSXElement' || n.type === 'JSXFragment')) parent = n;
  });
  const kids = (parent as Node | null)?.children as Node[] | undefined;
  if (!kids || kids.length !== count) return false;
  const texts = kids.map((k) => src.slice(k.start, k.end));
  let from = 0;
  for (const w of want) {
    const i = texts.indexOf(w, from);
    if (i < 0) return false;
    from = i + 1;
  }
  return true;
}

/* ---------- .map() 渲染的数组 ---------- */

const FN_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'TSNonNullExpression', 'ParenthesizedExpression']);
const SCRIPT_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

const unwrap = (n: Node): Node => (WRAPPERS.has(n.type) ? unwrap(n.expression) : n);

/** 解构参数、默认值、剩余参数里绑定的名字 */
function bound(pattern: Node | null | undefined, out: Set<string>): Set<string> {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.add(pattern.name);
  else if (pattern.type === 'ObjectPattern') for (const pr of pattern.properties) bound(pr.type === 'RestElement' ? pr.argument : pr.value, out);
  else if (pattern.type === 'ArrayPattern') for (const el of pattern.elements) bound(el, out);
  else if (pattern.type === 'AssignmentPattern') bound(pattern.left, out);
  else if (pattern.type === 'RestElement') bound(pattern.argument, out);
  else if (pattern.type === 'TSParameterProperty') bound(pattern.parameter, out);
  return out;
}

interface FoundArray {
  file: string;
  source: string;
  ast: Node;
  node: Node;
  name: string;
}

interface Ctx {
  read: (file: string) => string | null;
  depth: number;
}

/** (line, column) 处的 JSX 是 xs.map(回调) 回调里渲染的：找到 xs 对应的数组字面量 */
function mappedArray(source: string, file: string, line: number, column: number, ctx: Ctx): FoundArray | { error: string } {
  const p = parsed(source, file);
  if ('error' in p) return p;
  const el = findElement(p.ast, line, column);
  if (!el) return { error: msg('engine.jsx.noElement', { line }) };
  let fn: Node | null = null;
  for (let cur = p.parents.get(el); cur; cur = p.parents.get(cur)) {
    if (FN_TYPES.has(cur.type)) {
      fn = cur;
      break;
    }
  }
  const call = fn && p.parents.get(fn);
  const callee = call && (call.type === 'CallExpression' || call.type === 'OptionalCallExpression') && call.arguments[0] === fn ? call.callee : null;
  const isMap = callee && (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') && !callee.computed && callee.property.name === 'map';
  if (!call || !isMap) return { error: msg('engine.order.notMap') };
  const obj = unwrap(callee.object);
  if (obj.type === 'ArrayExpression') return { file, source, ast: p.ast, node: obj, name: '[…]' };
  if (obj.type !== 'Identifier') return { error: msg('engine.order.notLiteral', { code: short(source.slice(obj.start, obj.end)) }) };
  return resolveLocal(p, source, file, obj.name, call, ctx);
}

/** 同文件里 name 指向的 const 数组，或沿相对路径的 import 找到导出它的模块 */
function resolveLocal(p: Parsed, source: string, file: string, name: string, at: Node, ctx: Ctx): FoundArray | { error: string } {
  // 从使用处往外：先遇到参数或 let / var 绑定就不是写死的数组
  let decl: Node | null = null;
  for (let scope = p.parents.get(at); scope && !decl; scope = p.parents.get(scope)) {
    if (FN_TYPES.has(scope.type) || scope.type === 'FunctionDeclaration' || scope.type === 'ObjectMethod' || scope.type === 'ClassMethod') {
      const names = new Set<string>();
      for (const prm of scope.params) bound(prm, names);
      if (names.has(name)) return { error: msg('engine.order.param', { name }) };
    }
    const body: Node[] | null = scope.type === 'Program' || scope.type === 'BlockStatement' ? scope.body : null;
    for (const st of body ?? []) {
      const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
      if (d?.type !== 'VariableDeclaration') continue;
      const hit = d.declarations.find((x: Node) => bound(x.id, new Set()).has(name));
      if (!hit) continue;
      if (d.kind !== 'const' || hit.id.type !== 'Identifier') return { error: msg('engine.order.notLiteral', { code: name }) };
      decl = hit;
      break;
    }
  }
  if (decl) return arrayInit(decl.init, file, source, p.ast, name);
  for (const st of p.ast.program.body as Node[]) {
    if (st.type !== 'ImportDeclaration') continue;
    const spec = st.specifiers.find((s: Node) => s.local.name === name);
    if (!spec) continue;
    if (spec.type === 'ImportNamespaceSpecifier') break;
    const imported = spec.type === 'ImportDefaultSpecifier' ? 'default' : (spec.imported.name ?? spec.imported.value);
    return fromModule(file, st.source.value, imported, ctx);
  }
  return { error: msg('engine.order.notLiteral', { code: name }) };
}

function arrayInit(init: Node | null | undefined, file: string, source: string, ast: Node, name: string): FoundArray | { error: string } {
  const node = init ? unwrap(init) : null;
  if (node?.type !== 'ArrayExpression') return { error: msg('engine.order.notLiteral', { code: short(init ? source.slice(init.start, init.end) : name) }) };
  return { file, source, ast, node, name };
}

function resolveModule(from: string, spec: string, read: Ctx['read']): { file: string; source: string } | null {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  const base = join(dirname(from), spec);
  const ext = extname(base);
  const candidates = [
    base,
    ...(SCRIPT_EXT.includes(ext) ? [base.slice(0, -ext.length) + (ext === '.js' ? '.ts' : ext === '.jsx' ? '.tsx' : ext)] : []),
    ...SCRIPT_EXT.map((e) => base + e),
    ...SCRIPT_EXT.map((e) => join(base, `index${e}`)),
  ];
  for (const f of candidates) {
    if (f !== base || ext) {
      const source = read(f);
      if (source !== null) return { file: f, source };
    }
  }
  return null;
}

/** 模块里导出名为 name 的数组：export const、export { 本地名 as name }、export default，或再转一层 export … from */
function fromModule(from: string, spec: string, name: string, ctx: Ctx): FoundArray | { error: string } {
  if (spec.endsWith('.json')) return { error: msg('engine.order.json', { file: spec }) };
  const mod = ctx.depth < 4 ? resolveModule(from, spec, ctx.read) : null;
  if (!mod) return { error: msg('engine.order.importNotFound', { name, file: spec }) };
  const p = parsed(mod.source, mod.file);
  if ('error' in p) return p;
  const next: Ctx = { ...ctx, depth: ctx.depth + 1 };
  const local = (n: string): FoundArray | { error: string } => {
    for (const st of p.ast.program.body as Node[]) {
      const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
      if (d?.type !== 'VariableDeclaration') continue;
      const hit = d.declarations.find((x: Node) => x.id.type === 'Identifier' && x.id.name === n);
      if (!hit) continue;
      if (d.kind !== 'const') return { error: msg('engine.order.notLiteral', { code: n }) };
      return arrayInit(hit.init, mod.file, mod.source, p.ast, n);
    }
    return { error: msg('engine.order.importNotFound', { name: n, file: spec }) };
  };
  for (const st of p.ast.program.body as Node[]) {
    if (name === 'default' && st.type === 'ExportDefaultDeclaration') {
      const d = unwrap(st.declaration);
      return d.type === 'Identifier' ? local(d.name) : arrayInit(st.declaration, mod.file, mod.source, p.ast, 'default');
    }
    if (st.type !== 'ExportNamedDeclaration') continue;
    if (st.declaration?.type === 'VariableDeclaration' && st.declaration.declarations.some((x: Node) => x.id.type === 'Identifier' && x.id.name === name)) return local(name);
    for (const s of st.specifiers ?? []) {
      const exported = s.exported?.name ?? s.exported?.value;
      if (exported !== name) continue;
      const inner = s.local?.name ?? s.local?.value ?? name;
      return st.source ? fromModule(mod.file, st.source.value, inner, next) : local(inner);
    }
  }
  return { error: msg('engine.order.importNotFound', { name, file: spec }) };
}

/** 数组每一项的范围（带上独占一行的前置注释）；有展开、空位，或项数和页面上对不上就报错 */
function arraySpans(a: FoundArray, count: number): Span[] | { error: string } {
  const els = a.node.elements as Array<Node | null>;
  if (els.some((e) => !e || e.type === 'SpreadElement')) return { error: msg('engine.order.spread') };
  if (els.length !== count) return { error: msg('engine.order.countMismatch', { n: els.length, count }) };
  const spans: Span[] = [];
  let prevEnd = a.node.start + 1;
  for (const e of els as Node[]) {
    spans.push(withLeadingComments(a.source, e, prevEnd));
    prevEnd = e.end;
  }
  return spans;
}

export interface ArrayOrderInput {
  file: string;
  source: string;
  /** .map() 回调里渲染这一项的 JSX 位置 */
  line: number;
  column: number;
  /** 页面上渲染出的项数，和数组长度对不上（被筛选、截取过）就不改 */
  count: number;
  /** 数组在别的文件里时用它读 */
  read: (file: string) => string | null;
}

/** 规划时用：列表对应的数组字面量在哪 */
export function arrayOrderSite(input: ArrayOrderInput): { file: string; line: number; column: number; name: string } | { error: string } {
  const a = mappedArray(input.source, input.file, input.line, input.column, { read: input.read, depth: 0 });
  if ('error' in a) return a;
  const spans = arraySpans(a, input.count);
  if ('error' in spans) return spans;
  return { file: a.file, line: a.node.loc.start.line, column: a.node.loc.start.column + 1, name: a.name };
}

export function editArrayOrder(input: ArrayOrderInput & { order: number[] }): EditResult {
  const { order, count } = input;
  if (!isPermutation(order, count)) return { ok: false, reason: msg('engine.order.badOrder') };
  const a = mappedArray(input.source, input.file, input.line, input.column, { read: input.read, depth: 0 });
  if ('error' in a) return { ok: false, reason: a.error };
  const spans = arraySpans(a, count);
  if ('error' in spans) return { ok: false, reason: spans.error };
  const edit = permute(a.source, spans, order);
  const after = applyEdits(a.source, [edit]);
  const els = a.node.elements as Node[];
  const want = order.map((i) => a.source.slice(els[i].start, els[i].end));
  if (!sameArray(after, a.file, a.node.start, want, errorCount(a.ast))) return { ok: false, reason: msg('engine.order.verifyFailed') };
  return { ok: true, file: a.file, edits: [edit], summary: orderSummary(order) };
}

function sameArray(src: string, file: string, at: number, want: string[], errors: number): boolean {
  let ast: Node;
  try {
    ast = parseModule(src, file);
  } catch {
    return false;
  }
  if (errorCount(ast) > errors) return false;
  let arr: Node | null = null;
  walk(ast, (n) => {
    if (!arr && n.start === at && n.type === 'ArrayExpression') arr = n;
  });
  const els = (arr as Node | null)?.elements as Node[] | undefined;
  return !!els && els.length === want.length && els.every((e, i) => src.slice(e.start, e.end) === want[i]);
}
