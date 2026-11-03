import { parseExpression } from '@babel/parser';
import { basename } from 'node:path';
import { t as msg } from '@css-tuner/protocol';
import type { Node } from '../ast';
import { parseSfc, type SvelteNode, type VueNode } from '../sfc';
import { collectClasses, tokenize, type ClassSite } from './jsx';

/** 模板里的一个开标签，start 是 < 的位置 */
interface Tag {
  start: number;
  site: () => ClassSite;
}

/** 类名表达式用到了组件收到的 class：Svelte 的 className 参数、$$props，Vue 的 $attrs */
const PASSES_CLASS = /\bclassName\b|\$\$props\b|\$\$restProps\b|\$attrs\b/;

class Builder {
  private starts = [0];

  constructor(readonly source: string) {
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') this.starts.push(i + 1);
  }

  /** 行列都从 1 开始 */
  lineCol(offset: number): { line: number; column: number } {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.starts[lo] + 1 };
  }

  offsetOf(line: number, column: number): number {
    return (this.starts[line - 1] ?? Number.NaN) + column - 1;
  }

  site(start: number, tagLength: number): ClassSite {
    const { line, column } = this.lineCol(start);
    return {
      line,
      column,
      nameEnd: start + 1 + tagLength,
      attrRange: null,
      hasSpread: false,
      hasClassName: false,
      dynamic: false,
      merges: false,
      passesClassName: false,
      recipe: null,
      insertAttr: 'class',
      segments: [],
      tokens: [],
    };
  }

  text(site: ClassSite, start: number, end: number, fragileStart = false, fragileEnd = false) {
    site.segments.push({ start, end, conditional: false, fragileStart, fragileEnd, viaConst: null });
  }

  /** 属性值里的 JS 表达式，按文件里的偏移解析，复用 JSX className 的分析 */
  expr(site: ClassSite, start: number, end: number) {
    const code = this.source.slice(start, end);
    if (PASSES_CLASS.test(code)) site.passesClassName = true;
    let node: Node;
    try {
      const { line, column } = this.lineCol(start);
      node = parseExpression(code, { startIndex: start, startLine: line, startColumn: column - 1, plugins: ['typescript'] }) as unknown as Node;
    } catch {
      site.dynamic = true;
      return;
    }
    collectClasses(site, node);
  }
}

const hasDir = (n: VueNode, name: string) => n.props.some((p) => p.type === 7 && p.name === name);

/** 组件的根元素（只有一个，或者是一条 v-if 链上的几个）：调用处写的 class 会透传到这里 */
function vueRoots(children: VueNode[]): VueNode[] {
  const els = children.filter((c) => c.type === 1);
  const chain = els.every((e, i) => (i === 0 ? hasDir(e, 'if') : hasDir(e, 'else-if') || hasDir(e, 'else')));
  return els.length === 1 || chain ? els.filter((e) => e.tagType <= 1) : [];
}

function vueSite(b: Builder, n: VueNode, root: boolean): ClassSite {
  const site = b.site(n.loc.start.offset, n.tag.length);
  site.passesClassName = root;
  for (const p of n.props) {
    if (p.type === 6 && p.name === 'class') {
      site.hasClassName = true;
      site.attrRange = { start: p.loc.start.offset, end: p.loc.end.offset };
      if (!p.value) continue;
      const start = p.value.loc.start.offset;
      const end = p.value.loc.end.offset;
      const quoted = b.source[start] === '"' || b.source[start] === "'";
      b.text(site, quoted ? start + 1 : start, quoted ? end - 1 : end);
    } else if (p.type === 7 && p.name === 'bind') {
      // v-bind="obj" 和 :[name] 可能带着 class
      if (!p.arg || !p.arg.isStatic) site.hasSpread = true;
      else if (p.arg.content === 'class' && p.exp) {
        site.hasClassName = true;
        b.expr(site, p.exp.loc.start.offset, p.exp.loc.end.offset);
      }
    }
  }
  tokenize(b.source, site);
  return site;
}

function vueTags(b: Builder, file: string): Tag[] {
  const { source } = b;
  const p = parseSfc(source, file);
  if (p.kind !== 'vue') return [];
  const tpl = p.descriptor.template;
  if (!tpl?.ast || tpl.src || (tpl.lang && tpl.lang !== 'html')) throw new Error(msg('engine.sfc.noTemplate', { file: basename(file) }));
  const script = [p.descriptor.script, p.descriptor.scriptSetup].map((s) => (s ? source.slice(s.loc.start.offset, s.loc.end.offset) : '')).join('\n');
  const roots = /inheritAttrs\s*:\s*false/.test(script) ? [] : vueRoots(tpl.ast.children);
  const tags: Tag[] = [];
  const visit = (nodes: VueNode[]) => {
    for (const n of nodes) {
      if (n.type !== 1) continue;
      // 0 元素、1 组件；<slot> 和 <template> 不是页面上的元素
      if (n.tagType <= 1) tags.push({ start: n.loc.start.offset, site: () => vueSite(b, n, roots.includes(n)) });
      if (n.children) visit(n.children);
    }
  };
  visit(tpl.ast.children);
  return tags;
}

interface SvelteAttr {
  type: string;
  start: number;
  end: number;
  name: string;
  value?: true | SveltePart | SveltePart[];
}

interface SveltePart {
  type: string;
  start: number;
  end: number;
  expression?: { start: number; end: number };
}

const SVELTE_ELEMENTS = new Set(['RegularElement', 'Component', 'SvelteElement', 'SvelteComponent', 'SvelteSelf']);
/** 往下找元素时不用进的键：属性、表达式和位置信息 */
const SVELTE_SKIP = new Set(['metadata', 'attributes', 'expression', 'name_loc', 'loc', 'context', 'key', 'test', 'index', 'value', 'error', 'parameters']);

function svelteSite(b: Builder, n: SvelteNode): ClassSite {
  const site = b.site(n.start, n.name!.length);
  for (const a of (n.attributes ?? []) as SvelteAttr[]) {
    if (a.type === 'SpreadAttribute') site.hasSpread = true;
    else if (a.type === 'Attribute' && a.name === 'class') {
      site.hasClassName = true;
      site.attrRange = { start: a.start, end: a.end };
      if (a.value === true || !a.value) continue;
      const parts = Array.isArray(a.value) ? a.value : [a.value];
      parts.forEach((p, i) => {
        if (p.type === 'Text') b.text(site, p.start, p.end, i > 0, i < parts.length - 1);
        else if (p.type === 'ExpressionTag' && p.expression) b.expr(site, p.expression.start, p.expression.end);
      });
    } else if (a.type === 'ClassDirective') {
      site.hasClassName = true;
      const start = a.start + 'class:'.length;
      const end = start + a.name.length;
      // class:active 简写没有 =，类名同时是变量名
      site.segments.push({ start, end, conditional: true, fragileStart: false, fragileEnd: false, viaConst: null, single: 'directive', locked: b.source[end] !== '=' });
    }
  }
  tokenize(b.source, site);
  return site;
}

function svelteTags(b: Builder, file: string): Tag[] {
  const p = parseSfc(b.source, file);
  if (p.kind !== 'svelte') return [];
  const tags: Tag[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const c of v) visit(c);
      return;
    }
    const n = v as SvelteNode;
    if (typeof n.type === 'string' && SVELTE_ELEMENTS.has(n.type) && n.name) tags.push({ start: n.start, site: () => svelteSite(b, n) });
    for (const k of Object.keys(n)) if (!SVELTE_SKIP.has(k)) visit(n[k]);
  };
  visit(p.root.fragment);
  return tags;
}

function tagsOf(source: string, file: string): { tags: Tag[]; b: Builder } | { error: string } {
  try {
    const b = new Builder(source);
    return { tags: parseSfc(source, file).kind === 'vue' ? vueTags(b, file) : svelteTags(b, file), b };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** .vue / .svelte 模板里所有元素和组件标签的类名信息 */
export function templateClassSites(source: string, file: string): ClassSite[] | { error: string } {
  const r = tagsOf(source, file);
  return 'error' in r ? r : r.tags.map((t) => t.site());
}

/** (line, column) 处开标签的类名信息；line、column 都从 1 开始，指向 < */
export function locateTemplateSite(source: string, file: string, line: number, column: number): ClassSite | { error: string } {
  const r = tagsOf(source, file);
  if ('error' in r) return r;
  const at = r.b.offsetOf(line, column);
  let tag = r.tags.find((t) => t.start === at);
  if (!tag) {
    const sameLine = r.tags.filter((t) => r.b.lineCol(t.start).line === line);
    tag = sameLine.sort((x, y) => Math.abs(x.start - at) - Math.abs(y.start - at))[0];
  }
  return tag ? tag.site() : { error: msg('engine.sfc.noElement', { line }) };
}
