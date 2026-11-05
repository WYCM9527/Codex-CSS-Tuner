import { t as msg, type PropValue } from '@css-tuner/protocol';
import { parseModule, walk, type Node } from '../ast';
import { findElement } from './jsx';

/** 组件调用处一个属性的写法 */
export type PropSite =
  /** inner：字符串字面量引号里第一个字符的位置（行列都从 1 起），在这里问 TS 有哪些可选值 */
  | { kind: 'literal'; value: PropValue; inner?: { line: number; column: number } }
  | { kind: 'missing' }
  | { kind: 'dynamic'; code: string };

export interface PropSiteInfo {
  site: PropSite;
  /** 元素上的 {...spread}：写在这个属性后面的可能盖掉它；属性没写时新加在最后，会盖过展开里的同名值 */
  spread: 'none' | 'before' | 'after';
}

function parsed(source: string, filename: string): { ast: Node } | { error: string } {
  try {
    return { ast: parseModule(source, filename) };
  } catch (e) {
    return { error: msg('engine.jsx.parseFailed', { error: (e as Error).message }) };
  }
}

function tagOf(el: Node): string {
  const n = el.openingElement.name;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return n.property.name;
  return n.name?.name ?? '';
}

/** (line, column) 处的 JSX 元素；列号对不上、取了同一行最近的那个时，要求标签名就是这个组件，免得改到旁边的元素上 */
function elementAt(ast: Node, line: number, column: number, tag?: string): { el: Node } | { error: string } {
  const el = findElement(ast, line, column);
  if (!el) return { error: msg('engine.jsx.noElement', { line }) };
  if (tag && el.openingElement.loc.start.column !== column - 1 && tagOf(el) !== tag) return { error: msg('engine.prop.tagMismatch', { line, found: tagOf(el), want: tag }) };
  return { el };
}

const attrsNamed = (el: Node, name: string): Node[] =>
  el.openingElement.attributes.filter((a: Node) => a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' && a.name.name === name);

function unwrap(e: Node): Node {
  let n = e;
  while (n && (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'TSNonNullExpression' || n.type === 'ParenthesizedExpression')) n = n.expression;
  return n;
}

function literalOf(attr: Node, source: string): PropSite {
  const v = attr.value;
  if (!v) return { kind: 'literal', value: true };
  const inner = (s: Node) => ({ line: s.loc.start.line, column: s.loc.start.column + 2 });
  if (v.type === 'StringLiteral') return { kind: 'literal', value: v.value, inner: inner(v) };
  if (v.type === 'JSXExpressionContainer') {
    const e = unwrap(v.expression);
    if (e.type === 'StringLiteral') return { kind: 'literal', value: e.value, inner: inner(e) };
    if (e.type === 'TemplateLiteral' && !e.expressions.length) return { kind: 'literal', value: e.quasis[0].value.cooked ?? '' };
    if (e.type === 'NumericLiteral') return { kind: 'literal', value: e.value };
    if (e.type === 'UnaryExpression' && e.operator === '-' && e.argument.type === 'NumericLiteral') return { kind: 'literal', value: -e.argument.value };
    if (e.type === 'BooleanLiteral') return { kind: 'literal', value: e.value };
    if (e.type === 'NullLiteral') return { kind: 'literal', value: null };
  }
  return { kind: 'dynamic', code: source.slice(attr.start, attr.end) };
}

function spreadOf(el: Node, attr: Node | null): PropSiteInfo['spread'] {
  const spreads = el.openingElement.attributes.filter((a: Node) => a.type === 'JSXSpreadAttribute');
  if (!spreads.length) return 'none';
  return attr && spreads.some((s: Node) => s.start > attr.start) ? 'after' : 'before';
}

/** (line, column) 处组件调用上属性 name 的写法 */
export function jsxPropSite(source: string, filename: string, line: number, column: number, name: string, tag?: string): PropSiteInfo | { error: string } {
  const p = parsed(source, filename);
  if ('error' in p) return p;
  const at = elementAt(p.ast, line, column, tag);
  if ('error' in at) return at;
  const attr = attrsNamed(at.el, name).pop() ?? null;
  return { site: attr ? literalOf(attr, source) : { kind: 'missing' }, spread: spreadOf(at.el, attr) };
}

/* ---------- cva / tv 配方 ---------- */

export interface RecipeInfo {
  /** 配方的变量名，如 buttonVariants */
  name: string;
  /** 变体名 → 可选值（对象里的键，布尔变体是 "true" / "false"） */
  variants: Record<string, string[]>;
  defaults: Record<string, string>;
  /** 调用配方时原样传进去的变体（{ variant, size }、整个 props、展开）：只有这些才对应组件的同名属性 */
  passed: string[];
}

const RECIPE_FNS = new Set(['cva', 'tv']);

function calleeName(call: Node): string | null {
  const c = call.callee;
  if (c?.type === 'Identifier') return c.name;
  if (c?.type === 'MemberExpression' && c.property?.type === 'Identifier') return c.property.name;
  return null;
}

function keyOf(p: Node): string | null {
  if (p.type !== 'ObjectProperty' || p.computed) return null;
  const k = p.key;
  if (k.type === 'Identifier') return k.name;
  if (k.type === 'StringLiteral') return k.value;
  if (k.type === 'NumericLiteral' || k.type === 'BooleanLiteral') return String(k.value);
  return null;
}

const objProp = (obj: Node | undefined, name: string): Node | null =>
  obj?.type === 'ObjectExpression' ? (obj.properties.find((p: Node) => keyOf(p) === name)?.value ?? null) : null;

const propsOf = (obj: Node | null): Node[] => (obj?.type === 'ObjectExpression' ? obj.properties : []);

/** (line, column) 处元素的 className 用到的同文件 cva / tv 配方：每个变体的可选值和默认值 */
export function recipeVariants(source: string, filename: string, line: number, column: number): RecipeInfo | null {
  const p = parsed(source, filename);
  if ('error' in p) return null;
  const el = findElement(p.ast, line, column);
  const attr = el ? (attrsNamed(el, 'className').pop() ?? attrsNamed(el, 'class').pop()) : null;
  if (!attr?.value) return null;
  const decls = new Map<string, Node[]>();
  walk(p.ast, (n) => {
    if (n.type !== 'VariableDeclarator' || n.id?.type !== 'Identifier' || !n.init) return;
    decls.set(n.id.name, [...(decls.get(n.id.name) ?? []), n]);
  });
  let found: RecipeInfo | null = null;
  walk(attr.value, (n) => {
    if (found || n.type !== 'CallExpression' || n.callee?.type !== 'Identifier') return;
    const d = decls.get(n.callee.name);
    const init = d?.length === 1 ? unwrap(d[0].init) : null;
    const fn = init?.type === 'CallExpression' ? calleeName(init) : null;
    if (!init || !fn || !RECIPE_FNS.has(fn)) return;
    const config: Node | undefined = fn === 'cva' ? init.arguments[1] : init.arguments[0];
    const variants: Record<string, string[]> = {};
    for (const prop of propsOf(objProp(config, 'variants'))) {
      const k = keyOf(prop);
      if (k && prop.value?.type === 'ObjectExpression') variants[k] = prop.value.properties.map(keyOf).filter((x: string | null): x is string => !!x);
    }
    const defaults: Record<string, string> = {};
    for (const prop of propsOf(objProp(config, 'defaultVariants'))) {
      const k = keyOf(prop);
      const v = prop.value;
      if (!k || !v) continue;
      if (v.type === 'StringLiteral') defaults[k] = v.value;
      else if (v.type === 'BooleanLiteral' || v.type === 'NumericLiteral') defaults[k] = String(v.value);
    }
    found = { name: n.callee.name, variants, defaults, passed: passedKeys(n.arguments[0], Object.keys(variants)) };
  });
  return found;
}

function passedKeys(arg: Node | undefined, all: string[]): string[] {
  if (arg?.type === 'Identifier') return all;
  if (arg?.type !== 'ObjectExpression') return [];
  if (arg.properties.some((p: Node) => p.type === 'SpreadElement')) return all;
  return arg.properties.filter((p: Node) => p.value?.type === 'Identifier' && keyOf(p) === p.value.name).map((p: Node) => keyOf(p)!);
}
