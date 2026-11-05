import postcss, { type AtRule, type ChildNode, type Container, type Declaration, type Rule } from 'postcss';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { aliasesOf, backgroundLayers, isGradient, normalizeCondition, normalizeSelector, resolveNested, shorthandsOf, splitTopLevel, t } from '@css-tuner/protocol';
import type { EditResult, TextEdit } from '../types';
import { physical, physicalSet } from '../physical';
import { sfcKind, styleSource, unscopePage, unscopeSource } from '../sfc';
import { isCssModule, localClasses, localizeSelector } from './modules';

export interface CssRuleSpec {
  selector: string;
  fullSelector: string;
  conditions: string[];
  ordinal: number;
  mode: 'edit' | 'add';
  via: string | null;
}

export interface CssEditInput {
  /** 页面上样式表对应的入口文件（@import 的文件会顺着找） */
  file: string;
  read: (file: string) => string | null;
  spec: CssRuleSpec;
  props: string[];
  value: string;
  /** 删掉管这些属性的声明，value 不用 */
  remove?: boolean;
}

export interface FoundRule {
  rule: Rule;
  file: string;
  source: string;
  fullSelector: string;
  key: string;
  /** 不算 @layer 的 key：Tailwind 3 会把 @layer 拍平，页面上的规则没有层 */
  flatKey: string;
}

const MAX_IMPORT_DEPTH = 8;

/** 条件统一写法：@import 带的媒体查询和 @media 等价（Vite 内联 @import 时会包成 @media） */
function condKey(conds: string[]): string {
  return conds
    .map((c) => normalizeCondition(c.replace(/^@import\s+/, '@media ')))
    .filter((c) => c !== '@media' && c !== '@media all')
    .join(' | ');
}

export function importPath(at: AtRule): { path: string; media: string } | null {
  const m = /^\s*(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?\s*(.*)$/.exec(at.params);
  if (!m) return null;
  const p = m[2];
  if (/^(https?:)?\/\//.test(p) || (!p.startsWith('.') && !p.startsWith('/'))) return null;
  return { path: p, media: m[3].replace(/^layer(\([^)]*\))?\s*/, '').trim() };
}

/** 按浏览器看到的顺序展开所有规则（含 @import 进来的文件和嵌套规则），算出与桥接脚本一致的 key 和序号 */
function collect(entry: string, read: (f: string) => string | null): { rules: FoundRule[]; errors: string[]; files: string[] } {
  const rules: FoundRule[] = [];
  const errors: string[] = [];
  const files: string[] = [];
  const visitFile = (file: string, conds: string[], depth: number, seen: Set<string>) => {
    if (depth > MAX_IMPORT_DEPTH || seen.has(file)) return;
    const source = read(file);
    if (!files.includes(file)) files.push(file);
    if (source === null) {
      errors.push(t('engine.readFailed', { file }));
      return;
    }
    const sfc = !!sfcKind(file);
    let css = source;
    if (sfc) {
      // 只解析 <style> 块，其余换成空格：规则的偏移和行列仍是整个文件里的
      try {
        const s = styleSource(source, file);
        for (const lang of s.skipped) errors.push(t('engine.sfc.styleLang', { file: basename(file), lang }));
        if (!s.css) return;
        css = s.css;
      } catch (e) {
        errors.push((e as Error).message);
        return;
      }
    }
    let root: postcss.Root;
    try {
      root = postcss.parse(css, { from: file });
    } catch (e) {
      errors.push(t('engine.parseFailed', { file, error: (e as Error).message }));
      return;
    }
    const nextSeen = new Set(seen).add(file);
    const walk = (container: Container, parentSel: string | null, conds: string[]) => {
      container.each((node: ChildNode) => {
        if (node.type === 'rule') {
          const sel = node.selector;
          const full = parentSel ? splitTopLevel(sel).map((s) => resolveNested(parentSel, s.trim())).join(', ') : sel;
          const norm = normalizeSelector(sfc ? unscopePage(unscopeSource(full)) : full);
          rules.push({ rule: node, file, source, fullSelector: full, key: `${norm}|${condKey(conds)}`, flatKey: `${norm}|${condKey(conds.filter((c) => !c.startsWith('@layer')))}` });
          walk(node, full, conds);
        } else if (node.type === 'atrule') {
          const name = node.name.toLowerCase();
          if (name === 'import' && depth < MAX_IMPORT_DEPTH) {
            const imp = importPath(node);
            if (!imp) return;
            const target = isAbsolute(imp.path) && !imp.path.startsWith('/') ? imp.path : resolve(dirname(file), imp.path);
            visitFile(target, imp.media ? [...conds, `@media ${imp.media}`] : conds, depth + 1, nextSeen);
          } else if (name === 'media' || name === 'supports' || name === 'container') {
            walk(node, parentSel, [...conds, `@${name} ${node.params}`]);
          } else if (name === 'layer') {
            if (node.nodes) walk(node, parentSel, [...conds, `@layer ${node.params}`]);
          } else if (name === 'scope' || name === 'starting-style') {
            walk(node, parentSel, [...conds, `@${name} ${node.params}`.trim()]);
          }
        }
      });
    };
    walk(root, null, conds);
  };
  visitFile(entry, [], 0, new Set());
  return { rules, errors, files };
}

type RuleKey = Pick<CssRuleSpec, 'selector' | 'fullSelector' | 'conditions' | 'ordinal'>;

const moduleLocals = new WeakMap<FoundRule[], Set<string> | null>();

/** 规则来自 CSS Modules 文件时，页面上的哈希类名换回源文件里的本地类名 */
function localized(rules: FoundRule[], fullSelector: string): string | null {
  let locals = moduleLocals.get(rules);
  if (locals === undefined) {
    const mod = rules.filter((r) => isCssModule(r.file));
    locals = mod.length ? localClasses(mod.map((r) => r.fullSelector)) : null;
    moduleLocals.set(rules, locals);
  }
  if (!locals) return null;
  const out = localizeSelector(fullSelector, locals);
  return out === fullSelector ? null : out;
}

function pick(rules: FoundRule[], errors: string[], spec: RuleKey): FoundRule | { error: string } {
  if (!rules.length && errors.length) return { error: errors[0] };
  const keyOf = (sel: string) => `${normalizeSelector(unscopePage(sel))}|${condKey(spec.conditions)}`;
  let same = rules.filter((r) => r.key === keyOf(spec.fullSelector));
  if (!same.length) {
    const local = localized(rules, spec.fullSelector);
    if (local) same = rules.filter((r) => r.key === keyOf(local));
  }
  if (!same.length) same = rules.filter((r) => r.flatKey === keyOf(spec.fullSelector));
  if (!same.length) return { error: t('engine.css.ruleNotFound', { selector: spec.selector }) };
  return same[spec.ordinal] ?? (same.length === 1 ? same[0] : { error: t('engine.css.ruleAmbiguous', { selector: spec.selector, n: same.length }) });
}

function findRule(input: CssEditInput): FoundRule | { error: string } {
  const { rules, errors } = collect(input.file, input.read);
  return pick(rules, errors, input.spec);
}

/** 入口样式表连同 @import 进来的文件展开后的规则；files 是读过的文件，调用方据此判断缓存是否过期 */
export interface CssRuleIndex {
  files: string[];
  rules: FoundRule[];
  errors: string[];
}

export function indexCssRules(entry: string, read: (file: string) => string | null): CssRuleIndex {
  return collect(entry, read);
}

/** 规则实际写在哪个文件、哪一行（开发服务器把 @import 内联后，页面上只看得到入口文件）；selector 是源文件里的写法 */
export function lookupCssRule(index: CssRuleIndex, spec: RuleKey): { file: string; line: number; selector: string } | { error: string } {
  const r = pick(index.rules, index.errors, spec);
  return 'error' in r ? r : { file: r.file, line: r.rule.source?.start?.line ?? 1, selector: sourceSelector(r, spec.selector) };
}

/** 摘要和标签里显示的选择器：嵌套规则显示展开后的写法，CSS Modules 显示本地类名 */
function sourceSelector(found: FoundRule, pageSelector: string): string {
  if (sfcKind(found.file)) return found.fullSelector;
  if (!pageSelector.includes('&') && !isCssModule(found.file)) return pageSelector;
  return found.fullSelector.replace(/:is\(([^(),]+)\)/g, '$1');
}

const BOX: Record<string, string[]> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  inset: ['top', 'right', 'bottom', 'left'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
};
const PAIR: Record<string, string[]> = {
  gap: ['row-gap', 'column-gap'],
  'padding-inline': ['padding-left', 'padding-right'],
  'padding-block': ['padding-top', 'padding-bottom'],
  'margin-inline': ['margin-left', 'margin-right'],
  'margin-block': ['margin-top', 'margin-bottom'],
  'inset-inline': ['left', 'right'],
  'inset-block': ['top', 'bottom'],
  ...Object.fromEntries(
    ['width', 'style', 'color'].flatMap((part) => [
      [`border-inline-${part}`, [`border-left-${part}`, `border-right-${part}`]],
      [`border-block-${part}`, [`border-top-${part}`, `border-bottom-${part}`]],
    ]),
  ),
};

const BORDER_PARTS = ['width', 'style', 'color'] as const;
type BorderPart = (typeof BORDER_PARTS)[number];
const BORDER_STYLES = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset']);
const BORDER_WIDTH = /^(thin|medium|thick|-?(\d+\.?\d*|\.\d+)([a-z]+|%)?)$/i;

/** border、border-top、border-inline 这类分量简写（值里是粗细、样式、颜色各一个词） */
function isBorderShorthand(name: string): boolean {
  return name.startsWith('border') && physical(name).length >= 3 && !/-(width|style|color|radius)$/.test(name);
}

/** 分量简写里每个词是哪个分量；变量分不清，只能有一个、归到唯一缺的那个分量，否则返回 null */
function borderParts(value: string): Partial<Record<BorderPart, string>> | null {
  const out: Partial<Record<BorderPart, string>> = {};
  const unknown: string[] = [];
  for (const w of splitTopLevel(value.trim(), ' ').filter(Boolean)) {
    const part: BorderPart | null = BORDER_STYLES.has(w.toLowerCase()) ? 'style' : BORDER_WIDTH.test(w) || /^calc\(/i.test(w) ? 'width' : /^var\(/i.test(w) ? null : 'color';
    if (!part) unknown.push(w);
    else if (out[part]) return null;
    else out[part] = w;
  }
  if (unknown.length) {
    const missing = BORDER_PARTS.filter((p) => !out[p]);
    if (unknown.length > 1 || missing.length !== 1) return null;
    out[missing[0]] = unknown[0];
  }
  return out;
}

/** 改的属性正好是分量简写里某个分量的全部长写（border 的四边粗细、border-top 的颜色） */
function wholePart(name: string, props: string[]): BorderPart | null {
  const all = physical(name);
  for (const part of BORDER_PARTS) {
    const of = all.filter((p) => p.endsWith(`-${part}`));
    if (of.length === props.length && of.every((p) => props.includes(p))) return part;
  }
  return null;
}

/** 1~4 值的盒模型简写展开成四边 */
function expandBox(values: string[]): string[] | null {
  const [a, b = a, c = a, d = b] = values;
  return values.length >= 1 && values.length <= 4 ? [a, b, c, d] : null;
}

function minifyBox(v: string[]): string {
  const [t, r, b, l] = v;
  if (r === l) {
    if (t === b) return t === r ? t : `${t} ${r}`;
    return `${t} ${r} ${b}`;
  }
  return `${t} ${r} ${b} ${l}`;
}

/** postcss 的 end.offset 是开区间：slice(start, end) 正好是整条声明（有分号时含分号） */
function declRange(d: Declaration | AtRule): { start: number; end: number } | null {
  const s = d.source?.start?.offset;
  const e = d.source?.end?.offset;
  return typeof s === 'number' && typeof e === 'number' ? { start: s, end: e } : null;
}

/** 声明值在文件里的位置 */
export function valueRange(source: string, d: Declaration): { start: number; end: number } | null {
  const r = declRange(d);
  if (!r) return null;
  const text = source.slice(r.start, r.end);
  const colon = text.indexOf(':');
  if (colon < 0) return null;
  const raw = (d.raws as { value?: { raw: string } }).value?.raw ?? d.value;
  const at = text.indexOf(raw, colon + 1);
  if (at < 0) return null;
  return { start: r.start + at, end: r.start + at + raw.length };
}

function indentOf(rule: Rule | AtRule, source: string): string {
  const firstDecl = rule.nodes?.find((n) => n.type === 'decl') as Declaration | undefined;
  if (firstDecl?.raws.before) {
    const m = /[^\S\n]*$/.exec(firstDecl.raws.before);
    if (m) return m[0];
  }
  const start = rule.source?.start?.offset ?? 0;
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const ruleIndent = /^[^\S\n]*/.exec(source.slice(lineStart, start))?.[0] ?? '';
  return ruleIndent + '  ';
}

/**
 * 在规则最后一条声明后面（嵌套规则之前）追加声明；单行规则保持单行。
 * @apply 这类没有块的 at-rule 会在原位展开成声明，追加的要排在它后面才盖得住
 */
export function appendDecls(rule: Rule | AtRule, source: string, decls: Array<[string, string]>): TextEdit[] {
  const rs = rule.source?.start?.offset ?? 0;
  const re = rule.source?.end?.offset ?? rs;
  const singleLine = !source.slice(rs, re).includes('\n');
  const indent = indentOf(rule, source);
  const own = (rule.nodes ?? []).filter((n) => n.type === 'decl' || (n.type === 'atrule' && !n.nodes)) as Array<Declaration | AtRule>;
  const last = own[own.length - 1];
  const body = singleLine ? decls.map(([p, v]) => ` ${p}: ${v};`).join('') : decls.map(([p, v]) => `\n${indent}${p}: ${v};`).join('');
  if (last) {
    const r = declRange(last)!;
    const hasSemi = source.slice(r.start, r.end).trimEnd().endsWith(';');
    return [{ start: r.end, end: r.end, text: `${hasSemi ? '' : ';'}${body}` }];
  }
  // 空规则或只有嵌套规则：插在左花括号后面
  const open = source.indexOf('{', rs);
  if (open < 0) return [];
  return [{ start: open + 1, end: open + 1, text: body }];
}

/** 只写了一个值的非盒模型简写（background: #fff、background: var(--x)）可以直接替换；带图片、位置等的不行 */
function singleValue(value: string): boolean {
  return splitTopLevel(value.trim(), ' ').length === 1 && !/url\(|gradient\(/.test(value);
}

/** background 简写只写了背景图（一层或几层渐变、url，没有颜色、位置、尺寸） */
function imageOnly(value: string): boolean {
  const layers = backgroundLayers(value);
  return layers.length > 0 && layers.every((l) => splitTopLevel(l, ' ').length === 1 && (isGradient(l) || /^url\(/i.test(l)));
}

/** 改的正好是 background 简写里唯一写了的那部分（背景色或背景图），整条简写可以直接替换或删掉 */
function wholeBackground(name: string, props: string[], value: string): boolean {
  if (name !== 'background' || props.length !== 1) return false;
  return (props[0] === 'background-color' && singleValue(value)) || (props[0] === 'background-image' && imageOnly(value));
}

/** 自定义属性区分大小写，其余属性名不区分 */
const propName = (d: Declaration) => (d.prop.startsWith('--') ? d.prop : d.prop.toLowerCase());

function relevant(prop: string, edited: Set<string>): boolean {
  return physical(prop).some((p) => edited.has(p));
}

/** 每个被改的长属性找到规则里最后一条管它的声明（!important 优先），按声明归组 */
function ownersOf(decls: Declaration[], E: Set<string>): Map<Declaration, string[]> {
  const owner = new Map<string, Declaration>();
  for (const p of E) {
    const names = new Set([p, ...aliasesOf(p), ...shorthandsOf(p)]);
    for (const a of aliasesOf(p)) for (const s of shorthandsOf(a)) names.add(s);
    const cands = decls.filter((d) => names.has(propName(d)));
    const imp = cands.filter((d) => d.important);
    const pick = (imp.length ? imp : cands)[(imp.length ? imp : cands).length - 1];
    if (pick) owner.set(p, pick);
  }
  const byDecl = new Map<Declaration, string[]>();
  for (const [p, d] of owner) byDecl.set(d, [...(byDecl.get(d) ?? []), p]);
  return byDecl;
}

export function editCssRule(input: CssEditInput): EditResult {
  const found = findRule(input);
  if ('error' in found) return { ok: false, reason: found.error };
  const { rule, source, file } = found;
  const E = physicalSet(input.props);
  const v = input.value.trim();
  const sel = sourceSelector(found, input.spec.selector);

  const decls = (rule.nodes ?? []).filter((n) => n.type === 'decl') as Declaration[];
  if (input.remove) return removeDecls(found, input.spec.mode === 'edit' ? ownersOf(decls, E) : new Map(), E, sel);
  const edits: TextEdit[] = [];
  const notes: string[] = [];
  const handled = new Set<string>();
  const appends: Array<[string, string]> = [];

  if (input.spec.mode === 'edit') {
    for (const [d, props] of ownersOf(decls, E)) {
      const name = propName(d);
      const range = valueRange(source, d);
      if (!range) continue;
      const all = physical(name);
      const isLonghand = all.length === 1 && E.has(all[0]);
      const coversAll = all.length > 1 && all.every((p) => E.has(p));
      if (isLonghand || coversAll || wholeBackground(name, props, d.value)) {
        edits.push({ start: range.start, end: range.end, text: v });
        notes.push(`${name}: ${d.value} → ${v}`);
        for (const p of props) handled.add(p);
        continue;
      }
      // border: 1px solid #ddd 里换掉一个分量（四边一起改粗细、改颜色），没写的分量补在后面
      const part = isBorderShorthand(name) ? wholePart(name, props) : null;
      const parts = part ? borderParts(d.value) : null;
      if (part && parts) {
        const words = splitTopLevel(d.value.trim(), ' ').filter(Boolean);
        const at = parts[part] ? words.indexOf(parts[part]!) : -1;
        const text = at >= 0 ? words.map((w, i) => (i === at ? v : w)).join(' ') : `${words.join(' ')} ${v}`;
        edits.push({ start: range.start, end: range.end, text });
        notes.push(`${name}: ${d.value} → ${text}`);
        for (const p of props) handled.add(p);
        continue;
      }
      const sides = BOX[name] ?? PAIR[name];
      if (sides && !/var\(|calc\(|env\(|\(/.test(d.value)) {
        const parts = d.value.trim().split(/\s+/);
        const vals = BOX[name] ? expandBox(parts) : parts.length === 1 ? [parts[0], parts[0]] : parts.length === 2 ? parts : null;
        if (vals) {
          const nextVals = sides.map((s, i) => (E.has(s) ? v : vals[i]));
          const text = BOX[name] ? minifyBox(nextVals) : nextVals[0] === nextVals[1] ? nextVals[0] : nextVals.join(' ');
          edits.push({ start: range.start, end: range.end, text });
          notes.push(`${name}: ${d.value} → ${text}`);
          for (const p of props) handled.add(p);
          continue;
        }
      }
      // 简写里有变量 / 函数，或不是盒模型简写（font、background…）：在它后面补长属性覆盖
      for (const p of props) {
        appends.push([p, v]);
        handled.add(p);
      }
    }
  }

  for (const p of E) {
    if (!handled.has(p)) appends.push([p, v]);
  }
  if (appends.length) {
    const list = compose(appends, E);
    edits.push(...appendDecls(rule, source, list));
    notes.push(...list.map(([p, val]) => `+ ${p}: ${val}`));
  }
  if (!edits.length) return { ok: false, reason: t('engine.noEdits') };
  return { ok: true, file, edits, summary: `${sel} { ${notes.join('; ')} }` };
}

/**
 * 删声明：完全由删的属性组成的整条删掉（连同前面的换行和缩进）；
 * 盒模型简写、描边简写只删一部分时，剩下的部分改写成长写，其余简写（font、多值 background）删不了一部分
 */
function removeDecls(found: FoundRule, owners: Map<Declaration, string[]>, E: Set<string>, sel: string): EditResult {
  const { source, file } = found;
  if (!owners.size) return { ok: false, reason: t('engine.css.nothingToRemove', { selector: sel }) };
  const edits: TextEdit[] = [];
  const notes: string[] = [];
  for (const [d, props] of owners) {
    const name = propName(d);
    const left = physical(name).filter((p) => !E.has(p));
    const whole = !left.length || wholeBackground(name, props, d.value);
    const rest = whole ? [] : remainder(name, d.value, left);
    if (!rest) return { ok: false, reason: t('engine.css.removePartial', { decl: `${name}: ${d.value}` }) };
    const r = declRange(d);
    if (!r) continue;
    const before = d.raws.before ?? '';
    const start = before && source.slice(r.start - before.length, r.start) === before ? r.start - before.length : r.start;
    const imp = d.important ? ' !important' : '';
    const text = rest.map(([p, val]) => `${before || ' '}${p}: ${val}${imp};`).join('');
    edits.push({ start, end: r.end, text });
    notes.push(rest.length ? `${name}: ${d.value} → ${rest.map(([p, val]) => `${p}: ${val}`).join('; ')}` : `- ${name}: ${d.value}`);
  }
  if (!edits.length) return { ok: false, reason: t('engine.noEdits') };
  return { ok: true, file, edits, summary: `${sel} { ${notes.join('; ')} }` };
}

/** 简写删掉一部分长写之后，剩下的写成长写；四边的同一分量合成 border-width 这类 */
function remainder(name: string, value: string, left: string[]): Array<[string, string]> | null {
  const sides = BOX[name] ?? PAIR[name];
  if (sides) {
    if (/\(/.test(value)) return null;
    const parts = value.trim().split(/\s+/);
    const vals = BOX[name] ? expandBox(parts) : parts.length === 1 ? [parts[0], parts[0]] : parts.length === 2 ? parts : null;
    if (!vals) return null;
    return sides.flatMap((s, i): Array<[string, string]> => (left.includes(s) ? [[s, vals[i]]] : []));
  }
  if (!isBorderShorthand(name)) return null;
  const parts = borderParts(value);
  if (!parts) return null;
  const out: Array<[string, string]> = [];
  for (const part of BORDER_PARTS) {
    const val = parts[part];
    const mine = left.filter((p) => p.endsWith(`-${part}`));
    if (!val || !mine.length) continue;
    if (mine.length === 4) out.push([`border-${part}`, val]);
    else for (const p of mine) out.push([p, val]);
  }
  return out;
}

/** 新增声明时四边都改就写简写，否则写长属性 */
function compose(appends: Array<[string, string]>, E: Set<string>): Array<[string, string]> {
  const props = new Set(appends.map(([p]) => p));
  const sameValue = new Set(appends.map(([, v]) => v)).size === 1;
  if (sameValue) {
    for (const [short, sides] of Object.entries(BOX)) {
      if (sides.every((s) => props.has(s)) && props.size === sides.length) return [[short, appends[0][1]]];
    }
    if (props.size === 2 && props.has('row-gap') && props.has('column-gap')) return [['gap', appends[0][1]]];
  }
  void E;
  return appends;
}

export function relevantDecl(prop: string, edited: string[]): boolean {
  return relevant(prop, new Set(edited));
}
