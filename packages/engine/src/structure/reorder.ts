import { dirname, extname, join } from 'node:path';
import { t as msg } from '@css-tuner/protocol';
import { parseModule, walk, type Node } from '../ast';
import { findElement, short } from './jsx';

/** 兄弟组里一项在 JSX 里的位置；name 是页面上的标签名（宿主元素）或组件名 */
export interface OrderSite {
  line: number;
  column: number;
  name?: string;
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

/** 各项所在的那个 JSX 父元素；对不上（不是同一个父元素、顺序和页面不同）就报错 */
function jsxParent(p: Parsed, sites: OrderSite[]): { parent: Node } | { error: string } {
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
  return { parent };
}

/** 规划时用：这些位置是不是同一个 JSX 父元素下的几项；是的话给出父元素的写法和位置（行列从 1 开始） */
export function jsxOrderCheck(source: string, filename: string, sites: OrderSite[]): { ok: true; parent: string; line: number; column: number } | { error: string } {
  const p = parsed(source, filename);
  if ('error' in p) return p;
  const found = jsxParent(p, sites);
  if ('error' in found) return found;
  const { parent } = found;
  const { line, column } = parent.loc.start;
  return { ok: true, parent: parent.type === 'JSXFragment' ? '<>' : `<${jsxName(parent.openingElement.name)}>`, line, column: column + 1 };
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

/** 数组有展开、空位，或项数和页面上对不上：照着换顺序对不上页面 */
function arrayMismatch(a: FoundArray, count: number): { error: string } | null {
  const els = a.node.elements as Array<Node | null>;
  if (els.some((e) => !e || e.type === 'SpreadElement')) return { error: msg('engine.order.spread') };
  if (els.length !== count) return { error: msg('engine.order.countMismatch', { n: els.length, count }) };
  return null;
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
  return arrayMismatch(a, input.count) ?? { file: a.file, line: a.node.loc.start.line, column: a.node.loc.start.column + 1, name: a.name };
}
