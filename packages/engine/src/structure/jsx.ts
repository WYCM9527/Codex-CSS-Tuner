import { SKIP_KEYS, type Node } from '../ast';

/** 运行时 children 数组里的一项（和 Babel / SWC 生成 children 的规则一致） */
export interface JsxChild {
  /** JSXText、表达式（已去掉外面的 {}）、JSXElement、JSXFragment 或 JSXSpreadChild */
  node: Node;
  /** 表达式外面的 JSXExpressionContainer */
  container: Node | null;
  /** JSXText 折叠空白后的值 */
  text?: string;
}

/** (line, column) 处开标签所属的 JSX 元素；column 从 1 开始，对不上时取同一行最近的那个 */
export function findElement(ast: Node, line: number, column: number): Node | null {
  const els: Node[] = [];
  walkAll(ast, (n) => {
    if (n.type === 'JSXElement') els.push(n);
  });
  const sameLine = els.filter((e) => e.openingElement.loc.start.line === line);
  const exact = sameLine.find((e) => e.openingElement.loc.start.column === column - 1);
  if (exact) return exact;
  if (!sameLine.length) return null;
  return sameLine.reduce((a, b) =>
    Math.abs(b.openingElement.loc.start.column - (column - 1)) < Math.abs(a.openingElement.loc.start.column - (column - 1)) ? b : a,
  );
}

export function jsxChildren(el: Node): JsxChild[] {
  const out: JsxChild[] = [];
  for (const c of el.children ?? []) {
    if (c.type === 'JSXText') {
      const text = cleanJsxText(c.value).text;
      if (text) out.push({ node: c, container: null, text });
    } else if (c.type === 'JSXExpressionContainer') {
      if (c.expression.type !== 'JSXEmptyExpression') out.push({ node: c.expression, container: c });
    } else {
      out.push({ node: c, container: null });
    }
  }
  return out;
}

/**
 * JSX 文本的空白折叠（Babel cleanJSXElementLiteralChild）：去掉挨着换行的空白，行与行之间留一个空格。
 * map[k] 是结果第 k 个字符在原文里的范围；行间补的空格对应被折叠掉的那段空白。
 */
export function cleanJsxText(value: string): { text: string; map: Array<[number, number]> } {
  const lines: Array<{ start: number; text: string }> = [];
  const re = /\r\n|\n|\r/g;
  let at = 0;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    lines.push({ start: at, text: value.slice(at, m.index) });
    at = m.index + m[0].length;
  }
  lines.push({ start: at, text: value.slice(at) });
  let lastNonEmpty = 0;
  lines.forEach((l, i) => {
    if (/[^ \t]/.test(l.text)) lastNonEmpty = i;
  });
  let text = '';
  const map: Array<[number, number]> = [];
  let pendingSpace: number | null = null;
  lines.forEach((l, i) => {
    let s = 0;
    let e = l.text.length;
    if (i > 0) while (s < e && (l.text[s] === ' ' || l.text[s] === '\t')) s++;
    if (i < lines.length - 1) while (e > s && (l.text[e - 1] === ' ' || l.text[e - 1] === '\t')) e--;
    if (s >= e) return;
    if (pendingSpace !== null) {
      text += ' ';
      map.push([pendingSpace, l.start + s]);
      pendingSpace = null;
    }
    for (let k = s; k < e; k++) {
      text += l.text[k] === '\t' ? ' ' : l.text[k];
      map.push([l.start + k, l.start + k + 1]);
    }
    if (i !== lastNonEmpty) pendingSpace = l.start + e;
  });
  return { text, map };
}

/** 一段文字在源码里的写法 */
export type TextSource =
  | { kind: 'literal'; form: 'jsxText' | 'string' | 'template'; node: Node; value: string }
  | { kind: 'message'; ref: MessageRef; code: string }
  | { kind: 'dynamic'; code: string };

export interface MessageRef {
  key: string;
  /** useTranslation('ns') / useTranslations('Ns') 声明的命名空间 */
  ns: string | null;
  /** react-i18next 的 keyPrefix */
  prefix: string | null;
  lib: 'i18next' | 'next-intl';
}

interface Binding {
  name: string;
  lib: MessageRef['lib'];
  ns: string | null;
  prefix: string | null;
  start: number;
  end: number;
}

const FN_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod']);

function walkAll(node: unknown, visit: (n: Node, stack: Node[]) => void, stack: Node[] = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const c of node) walkAll(c, visit, stack);
    return;
  }
  const n = node as Node;
  if (typeof n.type !== 'string') return;
  visit(n, stack);
  stack.push(n);
  for (const k of Object.keys(n)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = n[k];
    if (v && typeof v === 'object') walkAll(v, visit, stack);
  }
  stack.pop();
}

const strOf = (n: Node | null | undefined): string | null => {
  if (!n) return null;
  if (n.type === 'StringLiteral') return n.value;
  if (n.type === 'TemplateLiteral' && !n.expressions.length) return n.quasis[0].value.cooked ?? null;
  return null;
};

function prop(obj: Node | undefined, name: string): Node | null {
  if (obj?.type !== 'ObjectExpression') return null;
  const p = obj.properties.find((x: Node) => x.type === 'ObjectProperty' && !x.computed && (x.key.name === name || x.key.value === name));
  return p?.value ?? null;
}

/** 文件里的翻译函数：react-i18next 的 useTranslation、next-intl 的 useTranslations / getTranslations、从 i18next 导入的 t */
export function translationBindings(ast: Node): Binding[] {
  const out: Binding[] = [];
  walkAll(ast, (n, stack) => {
    const scope = [...stack].reverse().find((a) => FN_TYPES.has(a.type));
    const range = scope ? { start: scope.start, end: scope.end } : { start: 0, end: Infinity };
    if (n.type === 'ImportDeclaration' && n.source.value === 'i18next') {
      for (const s of n.specifiers) {
        if (s.type === 'ImportSpecifier' && (s.imported.name ?? s.imported.value) === 't') out.push({ name: s.local.name, lib: 'i18next', ns: null, prefix: null, start: 0, end: Infinity });
      }
      return;
    }
    if (n.type !== 'VariableDeclarator' || !n.init) return;
    const call = n.init.type === 'AwaitExpression' ? n.init.argument : n.init;
    if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier') return;
    const fn = call.callee.name;
    const [a0, a1] = call.arguments as Node[];
    if (fn === 'useTranslation' && n.id.type === 'ObjectPattern') {
      const t = n.id.properties.find((p: Node) => p.type === 'ObjectProperty' && (p.key.name === 't' || p.key.value === 't'));
      if (!t || t.value.type !== 'Identifier') return;
      const ns = strOf(a0) ?? (a0?.type === 'ArrayExpression' ? strOf(a0.elements[0]) : null);
      out.push({ name: t.value.name, lib: 'i18next', ns, prefix: strOf(prop(a1, 'keyPrefix')), ...range });
    } else if ((fn === 'useTranslations' || fn === 'getTranslations') && n.id.type === 'Identifier') {
      out.push({ name: n.id.name, lib: 'next-intl', ns: strOf(a0) ?? strOf(prop(a0, 'namespace')), prefix: null, ...range });
    }
  });
  return out;
}

/** t('key') 调用对应的消息；callee 不是翻译函数时返回 null */
function messageOf(call: Node, bindings: Binding[]): MessageRef | null {
  const key = strOf(call.arguments[0]);
  if (key === null) return null;
  const c = call.callee;
  if (c.type === 'MemberExpression' && !c.computed && c.property.name === 't' && c.object.type === 'Identifier' && /^i18n(ext)?$/.test(c.object.name)) {
    return { key, ns: null, prefix: null, lib: 'i18next' };
  }
  if (c.type !== 'Identifier') return null;
  const b = bindings.filter((x) => x.name === c.name && x.start <= call.start && call.end <= x.end).sort((x, y) => y.start - x.start)[0];
  return b ? { key, ns: b.ns, prefix: b.prefix, lib: b.lib } : null;
}

/** 表达式是不是字面量文字、翻译调用，还是动态内容 */
export function classify(expr: Node, source: string, bindings: Binding[]): TextSource {
  const code = source.slice(expr.start, expr.end);
  if (expr.type === 'JSXText') return { kind: 'literal', form: 'jsxText', node: expr, value: cleanJsxText(expr.value).text };
  if (expr.type === 'StringLiteral') return { kind: 'literal', form: 'string', node: expr, value: expr.value };
  if (expr.type === 'TemplateLiteral' && !expr.expressions.length) return { kind: 'literal', form: 'template', node: expr, value: expr.quasis[0].value.cooked ?? '' };
  if (expr.type === 'CallExpression') {
    const ref = messageOf(expr, bindings);
    if (ref) return { kind: 'message', ref, code };
  }
  return { kind: 'dynamic', code };
}
