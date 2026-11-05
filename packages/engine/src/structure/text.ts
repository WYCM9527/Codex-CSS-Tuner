import { t as msg } from '@css-tuner/protocol';
import { parseModule, type Node } from '../ast';
import { classify, findElement, jsxChildren, translationBindings, type MessageRef } from './jsx';

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
