import postcss, { type AtRule, type ChildNode, type Container, type Rule } from 'postcss';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { normalizeCondition, normalizeSelector, resolveNested, splitTopLevel, t } from '@css-tuner/protocol';
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

function importPath(at: AtRule): { path: string; media: string } | null {
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

/** 标签里显示的选择器：嵌套规则显示展开后的写法，CSS Modules 显示本地类名 */
function sourceSelector(found: FoundRule, pageSelector: string): string {
  if (sfcKind(found.file)) return found.fullSelector;
  if (!pageSelector.includes('&') && !isCssModule(found.file)) return pageSelector;
  return found.fullSelector.replace(/:is\(([^(),]+)\)/g, '$1');
}
