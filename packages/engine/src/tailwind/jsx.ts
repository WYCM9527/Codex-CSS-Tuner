import { t as msg } from '@css-tuner/protocol';
import { parseModule, SKIP_KEYS, walk, type Node } from '../ast';

export { parseModule };

/** className 里一段可以直接改写的字面量文本 */
export interface Segment {
  start: number;
  end: number;
  /** 条件分支里的字符串（clsx 的 `cond && 'x'`、三元表达式），新增类名不往这里放 */
  conditional: boolean;
  /** 模板字符串里紧贴 ${} 的一端：那里的类名可能被表达式拼接，不能动 */
  fragileStart: boolean;
  fragileEnd: boolean;
  /** 来自同文件里只用了一次的常量 */
  viaConst: string | null;
}

export interface ClassToken {
  text: string;
  start: number;
  end: number;
  seg: Segment;
  editable: boolean;
}

export interface ClassSite {
  /** 开标签（或字符串字面量）所在行，从 1 开始，在附近找元素时用 */
  line: number;
  /** 从 1 开始 */
  column: number;
  /** `<tag` 结束的位置，没有 className 时在这里插入 */
  nameEnd: number;
  /** className 属性本身的范围（含属性名） */
  attrRange: { start: number; end: number } | null;
  hasSpread: boolean;
  hasClassName: boolean;
  /** className 里有没法静态分析的部分（变量、函数调用参数等） */
  dynamic: boolean;
  /** 经 cn / twMerge / tv 合并：后写的类覆盖先写的同类属性 */
  merges: boolean;
  /** className 表达式用到了组件的 className 参数 */
  passesClassName: boolean;
  /** className 调用了同文件里 cva / tv 定义的配方：基础类字符串的位置 */
  recipe: { line: number; column: number } | null;
  /** 类名字符串字面量的路径名，如 `buttonVariants.size.default` */
  name?: string;
  segments: Segment[];
  tokens: ClassToken[];
}

const CLASS_FNS = new Set(['clsx', 'cn', 'cx', 'classnames', 'classNames', 'twMerge', 'twJoin', 'tw', 'cva', 'tv']);
const MERGE_FNS = new Set(['cn', 'twMerge', 'tv']);
const RECIPE_FNS = new Set(['cva', 'tv']);

function attrName(a: Node): string | null {
  if (a.type !== 'JSXAttribute') return null;
  return a.name?.type === 'JSXIdentifier' ? a.name.name : null;
}

/**
 * 找到 (line, column) 处的 JSX 开标签并收集 className 的可写字面量。
 * line 从 1 开始；column 从 1 开始（React 开发态源码位置的约定）。
 */
export function locateClassSite(source: string, filename: string, line: number, column: number): ClassSite | { error: string } {
  const all = classSites(source, filename);
  if ('error' in all) return all;
  const { sites, opens } = all;
  let el = opens.find((o) => o.loc.start.line === line && o.loc.start.column === column - 1);
  if (!el) {
    const sameLine = opens.filter((o) => o.loc.start.line === line);
    if (sameLine.length === 1) el = sameLine[0];
    else if (sameLine.length > 1) el = sameLine.reduce((a, b) => (Math.abs(b.loc.start.column - (column - 1)) < Math.abs(a.loc.start.column - (column - 1)) ? b : a));
  }
  if (!el) return { error: msg('engine.jsx.noElement', { line }) };
  return sites(el);
}

/** 文件里所有 JSX 开标签的 className 信息（还原时源码行号可能变了，要在附近按类名找） */
export function allClassSites(source: string, filename: string): ClassSite[] | { error: string } {
  const all = classSites(source, filename);
  if ('error' in all) return all;
  return all.opens.map((o) => all.sites(o));
}

/** 变量名 / 对象键像在存类名 */
const CLASSY_NAME = /class|cls|variant|size|tone|intent|appearance|styles$|theme|look|skin|preset|recipe/i;
/** 对象键是 CSS 属性名：这是 style 对象，值不是类名 */
const CSS_KEY =
  /^(display|position|overflow|color|background|border|margin|padding|width|height|min[A-Z]|max[A-Z]|font|text[A-Z]|align|justify|flex|grid|gap|opacity|zIndex|top|left|right|bottom|inset|transform|transition|animation|cursor|visibility|whiteSpace|boxShadow|lineHeight|letterSpacing|content|outline|filter|pointerEvents|userSelect|objectFit|verticalAlign|listStyle|wordBreak|place[A-Z])/;
/** 从字面量往上走时可以穿过的“数据”节点 */
const PASS_THROUGH = new Set([
  'ObjectExpression',
  'ArrayExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'TemplateLiteral',
  'BinaryExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'ParenthesizedExpression',
  'ArrowFunctionExpression',
]);

function keyName(p: Node): string {
  if (p.computed) return '';
  return p.key?.type === 'Identifier' ? p.key.name : p.key?.type === 'StringLiteral' ? p.key.value : '';
}

/** 字面量是不是在写类名：在 cn / cva 等的参数里、名字像类名的常量或对象键下、xxxClassName 属性里 */
function classy(lit: Node, stack: Node[]): boolean {
  const parent = stack[stack.length - 1];
  if (!parent) return false;
  const attr = [...stack].reverse().find((a) => a.type === 'JSXAttribute');
  if (attr && attr.name?.type === 'JSXIdentifier' && (attr.name.name === 'className' || attr.name.name === 'class')) return false;
  if (parent.type === 'ObjectProperty') {
    if (parent.key === lit) return false;
    const key = keyName(parent);
    if (/^(className|class|base|root)$|ClassName$/.test(key)) return true;
    if (CSS_KEY.test(key)) return false;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const a = stack[i];
    const child = stack[i + 1] ?? lit;
    if (a.type === 'JSXAttribute') {
      const name = a.name?.type === 'JSXIdentifier' ? a.name.name : '';
      return name !== 'className' && name !== 'class' && /ClassName$|^classes$/.test(name);
    }
    if (a.type === 'CallExpression') {
      if (a.callee === child) return false;
      const name = calleeName(a);
      return !!name && CLASS_FNS.has(name);
    }
    if (a.type === 'VariableDeclarator') return a.init === child && a.id?.type === 'Identifier' && CLASSY_NAME.test(a.id.name);
    if (a.type === 'ObjectProperty') {
      if (a.key === child) return false;
      if (CLASSY_NAME.test(keyName(a)) || /ClassName$/.test(keyName(a))) return true;
      continue;
    }
    if (a.type === 'BinaryExpression' && a.operator !== '+') return false;
    if (a.type === 'ArrowFunctionExpression' && a.body !== child) return false;
    if (!PASS_THROUGH.has(a.type)) return false;
  }
  return false;
}

/** 常量名 + 对象键：`buttonVariants.size.default`、`buttonVariants.base` */
function literalName(lit: Node, stack: Node[]): string {
  const parts: string[] = [];
  stack.forEach((a, i) => {
    const child = stack[i + 1] ?? lit;
    if (a.type === 'VariableDeclarator' && a.id?.type === 'Identifier' && a.init) parts.push(a.id.name);
    else if (a.type === 'ObjectProperty' && a.value === child) {
      const k = keyName(a);
      if (k && k !== 'variants') parts.push(k);
    } else if (a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier') parts.push(a.name.name);
    else if (a.type === 'CallExpression' && RECIPE_FNS.has(calleeName(a) ?? '') && a.arguments[0] === child && child.type !== 'ObjectExpression') parts.push('base');
  });
  return parts.join('.');
}

function literalSite(source: string, lit: Node): ClassSite {
  const site: ClassSite = {
    line: lit.loc.start.line,
    column: lit.loc.start.column + 1,
    nameEnd: -1,
    attrRange: null,
    hasSpread: false,
    hasClassName: true,
    dynamic: lit.type === 'TemplateLiteral' && lit.expressions.length > 0,
    merges: false,
    passesClassName: false,
    recipe: null,
    segments: [],
    tokens: [],
  };
  if (lit.type === 'StringLiteral') site.segments.push({ start: lit.start + 1, end: lit.end - 1, conditional: false, fragileStart: false, fragileEnd: false, viaConst: null });
  else {
    const qs: Node[] = lit.quasis;
    qs.forEach((q, i) => site.segments.push({ start: q.start, end: q.end, conditional: false, fragileStart: i > 0, fragileEnd: i < qs.length - 1, viaConst: null }));
  }
  tokenize(source, site);
  return site;
}

/**
 * 文件里写类名用的字符串字面量：cva / tv / cn 等的参数（含变体对象）、名字像类名的常量和对象键、xxxClassName 属性。
 * JSX 的 className 属性本身不在内（那是元素自己的位置）。
 */
export function classLiteralSites(source: string, filename: string): ClassSite[] | { error: string } {
  let ast: Node;
  try {
    ast = parseModule(source, filename);
  } catch (e) {
    return { error: msg('engine.jsx.parseFailed', { error: (e as Error).message }) };
  }
  const out: ClassSite[] = [];
  const stack: Node[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const c of node) visit(c);
      return;
    }
    const n = node as Node;
    if (typeof n.type !== 'string') return;
    if ((n.type === 'StringLiteral' || n.type === 'TemplateLiteral') && classy(n, stack)) {
      const site = literalSite(source, n);
      site.name = literalName(n, stack);
      if (site.tokens.length) out.push(site);
      if (n.type === 'StringLiteral') return;
    }
    stack.push(n);
    for (const k of Object.keys(n)) {
      if (SKIP_KEYS.has(k)) continue;
      const v = n[k];
      if (v && typeof v === 'object') visit(v);
    }
    stack.pop();
  };
  visit(ast);
  return out;
}

/** (line, column) 处的类名字符串；挪了位置时在附近找含 token 的那个 */
export function locateLiteralSite(source: string, filename: string, line: number, column: number, token: string | null): ClassSite | { error: string } {
  const all = classLiteralSites(source, filename);
  if ('error' in all) return all;
  const has = (s: ClassSite) => !token || s.tokens.some((t) => t.text === token);
  const exact = all.find((s) => s.line === line && s.column === column);
  if (exact && has(exact)) return exact;
  const near = all.filter(has).sort((a, b) => Math.abs(a.line - line) - Math.abs(b.line - line))[0];
  return near ?? { error: token ? msg('engine.jsx.noClassStringWith', { line, token }) : msg('engine.jsx.noClassString', { line }) };
}

function tokenize(source: string, site: ClassSite) {
  for (const seg of site.segments) {
    const text = source.slice(seg.start, seg.end);
    for (const m of text.matchAll(/\S+/g)) {
      const start = seg.start + (m.index ?? 0);
      const end = start + m[0].length;
      const touchesStart = seg.fragileStart && start === seg.start;
      const touchesEnd = seg.fragileEnd && end === seg.end;
      site.tokens.push({ text: m[0], start, end, seg, editable: !touchesStart && !touchesEnd });
    }
  }
}

function classSites(source: string, filename: string): { opens: Node[]; sites: (el: Node) => ClassSite } | { error: string } {
  let ast: Node;
  try {
    ast = parseModule(source, filename);
  } catch (e) {
    return { error: msg('engine.jsx.parseFailed', { error: (e as Error).message }) };
  }
  const opens: Node[] = [];
  const declarators = new Map<string, Node[]>();
  const refs = new Map<string, number>();
  walk(ast, (n, parent) => {
    if (n.type === 'JSXOpeningElement') opens.push(n);
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier') {
      const list = declarators.get(n.id.name) ?? [];
      list.push(n);
      declarators.set(n.id.name, list);
    }
    if (n.type === 'Identifier' && parent) {
      const isDeclId = parent.type === 'VariableDeclarator' && parent.id === n;
      const isKey = (parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') && parent.key === n && !parent.computed;
      const isMember = parent.type === 'MemberExpression' && parent.property === n && !parent.computed;
      if (!isDeclId && !isKey && !isMember) refs.set(n.name, (refs.get(n.name) ?? 0) + 1);
    }
  });

  return { opens, sites: (el) => buildSite(source, el, declarators, refs) };
}

function calleeName(expr: Node): string | null {
  const c = expr.callee;
  if (c?.type === 'Identifier') return c.name;
  if (c?.type === 'MemberExpression' && c.property?.type === 'Identifier') return c.property.name;
  return null;
}

/** cva('基础类', …) 的第一个参数、tv({ base: '基础类' }) 的 base */
function recipeBase(init: Node | null | undefined): Node | null {
  if (!init || init.type !== 'CallExpression') return null;
  const name = calleeName(init);
  if (!name || !RECIPE_FNS.has(name)) return null;
  const first: Node | undefined = init.arguments[0];
  if (!first) return null;
  if (name === 'cva') {
    if (first.type === 'StringLiteral' || first.type === 'TemplateLiteral') return first;
    if (first.type === 'ArrayExpression') return first.elements.find((e: Node | null) => e?.type === 'StringLiteral') ?? null;
    return null;
  }
  if (first.type !== 'ObjectExpression') return null;
  const base = first.properties.find((p: Node) => p.type === 'ObjectProperty' && !p.computed && (p.key.name === 'base' || p.key.value === 'base'));
  const v: Node | undefined = base?.value;
  return v && (v.type === 'StringLiteral' || v.type === 'TemplateLiteral') ? v : null;
}

function mentionsClassName(expr: Node): boolean {
  let found = false;
  walk(expr, (n, parent) => {
    if (found || n.type !== 'Identifier' || n.name !== 'className') return;
    const isKey = parent?.type === 'ObjectProperty' && parent.key === n && !parent.shorthand;
    if (!isKey) found = true;
  });
  return found;
}

function buildSite(source: string, el: Node, declarators: Map<string, Node[]>, refs: Map<string, number>): ClassSite {
  const site: ClassSite = {
    line: el.loc.start.line,
    column: el.loc.start.column + 1,
    nameEnd: (el.typeParameters ?? el.typeArguments ?? el.name).end,
    attrRange: null,
    hasSpread: el.attributes.some((a: Node) => a.type === 'JSXSpreadAttribute'),
    hasClassName: false,
    dynamic: false,
    merges: false,
    passesClassName: false,
    recipe: null,
    segments: [],
    tokens: [],
  };
  const attr: Node | undefined = el.attributes.find((a: Node) => attrName(a) === 'className' || attrName(a) === 'class');
  if (!attr) return site;
  site.hasClassName = true;
  site.attrRange = { start: attr.start, end: attr.end };
  if (attr.value) site.passesClassName = mentionsClassName(attr.value);

  const push = (start: number, end: number, conditional: boolean, fragileStart = false, fragileEnd = false, viaConst: string | null = null) => {
    site.segments.push({ start, end, conditional, fragileStart, fragileEnd, viaConst });
  };

  const collect = (expr: Node | null | undefined, conditional: boolean, viaConst: string | null, depth = 0) => {
    if (!expr || depth > 6) {
      site.dynamic = true;
      return;
    }
    switch (expr.type) {
      case 'StringLiteral':
        push(expr.start + 1, expr.end - 1, conditional, false, false, viaConst);
        return;
      case 'TemplateLiteral': {
        const qs: Node[] = expr.quasis;
        qs.forEach((q, i) => {
          push(q.start, q.end, conditional, i > 0, i < qs.length - 1, viaConst);
        });
        for (const e of expr.expressions) collect(e, conditional, viaConst, depth + 1);
        return;
      }
      case 'LogicalExpression':
        if (expr.operator === '&&') {
          collect(expr.right, true, viaConst, depth + 1);
        } else {
          collect(expr.left, true, viaConst, depth + 1);
          collect(expr.right, true, viaConst, depth + 1);
        }
        return;
      case 'ConditionalExpression':
        collect(expr.consequent, true, viaConst, depth + 1);
        collect(expr.alternate, true, viaConst, depth + 1);
        return;
      case 'CallExpression': {
        const name = calleeName(expr);
        if (name && MERGE_FNS.has(name)) site.merges = true;
        if (!name || !CLASS_FNS.has(name)) {
          site.dynamic = true;
          const decls = name ? (declarators.get(name) ?? []) : [];
          const base = decls.length === 1 ? recipeBase(decls[0].init) : null;
          if (base && !site.recipe) {
            site.recipe = { line: base.loc.start.line, column: base.loc.start.column + 1 };
            if (calleeName(decls[0].init) === 'tv') site.merges = true;
          }
          return;
        }
        for (const a of expr.arguments) collect(a, conditional, viaConst, depth + 1);
        return;
      }
      case 'ArrayExpression':
        for (const a of expr.elements) collect(a, conditional, viaConst, depth + 1);
        return;
      case 'ObjectExpression':
        for (const p of expr.properties) {
          if (p.type === 'ObjectProperty' && !p.computed && p.key.type === 'StringLiteral') push(p.key.start + 1, p.key.end - 1, true, false, false, viaConst);
          else if (p.type === 'ObjectProperty' && !p.computed && p.key.type === 'Identifier') push(p.key.start, p.key.end, true, false, false, viaConst);
          else site.dynamic = true;
        }
        return;
      case 'Identifier': {
        const decls = declarators.get(expr.name) ?? [];
        // 只有同文件里唯一声明、只被引用一次的常量才当作这个调用位置自己的类名
        if (decls.length === 1 && decls[0].init && (refs.get(expr.name) ?? 0) === 1) {
          collect(decls[0].init, conditional, expr.name, depth + 1);
        } else {
          site.dynamic = true;
        }
        return;
      }
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'ParenthesizedExpression':
        collect(expr.expression, conditional, viaConst, depth + 1);
        return;
      case 'BinaryExpression':
        if (expr.operator === '+') {
          collect(expr.left, conditional, viaConst, depth + 1);
          collect(expr.right, conditional, viaConst, depth + 1);
          return;
        }
        site.dynamic = true;
        return;
      case 'NullLiteral':
      case 'BooleanLiteral':
        return;
      default:
        site.dynamic = true;
    }
  };

  const v: Node | null = attr.value;
  if (!v) return site;
  if (v.type === 'StringLiteral') collect(v, false, null);
  else if (v.type === 'JSXExpressionContainer') collect(v.expression, false, null);
  else site.dynamic = true;

  tokenize(source, site);
  return site;
}
