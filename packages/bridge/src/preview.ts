import type { PreviewTarget, RuleRef } from '@css-tuner/protocol';
import { collectRules, type Reader } from './cascade';
import { sameSourceElements } from './source';
import { elOf, isOwnSheet, sheetDevId } from './util';

type Holder = { kind: 'inline'; el: HTMLElement } | { kind: 'rule'; style: CSSStyleDeclaration };

interface Saved {
  holder: Holder;
  /** inline：原 style 属性（null 表示没有）；rule：原 cssText */
  original: string | null;
  probe: CSSStyleDeclaration;
}

interface Entry {
  id: string;
  target: PreviewTarget;
  decls: Record<string, string>;
  holders: Holder[];
}

const entries = new Map<string, Entry>();
const saved = new Map<HTMLElement | CSSStyleDeclaration, Saved>();
const probeHost = () => document.createElement('div');

function keyOf(h: Holder) {
  return h.kind === 'inline' ? h.el : h.style;
}

function save(h: Holder) {
  const k = keyOf(h);
  if (saved.has(k)) return;
  const original = h.kind === 'inline' ? h.el.getAttribute('style') : h.style.cssText;
  const probe = probeHost().style;
  probe.cssText = original ?? '';
  saved.set(k, { holder: h, original, probe });
}

function styleOf(h: Holder): CSSStyleDeclaration {
  return h.kind === 'inline' ? h.el.style : h.style;
}

function write(h: Holder, decls: Record<string, string>) {
  const style = styleOf(h);
  for (const [prop, value] of Object.entries(decls)) {
    if (h.kind === 'inline') style.setProperty(prop, value, 'important');
    else style.setProperty(prop, value, style.getPropertyPriority(prop));
  }
}

function restore(k: HTMLElement | CSSStyleDeclaration) {
  const s = saved.get(k);
  if (!s) return;
  if (s.holder.kind === 'inline') {
    if (s.original == null) s.holder.el.removeAttribute('style');
    else s.holder.el.setAttribute('style', s.original);
  } else {
    s.holder.style.cssText = s.original ?? '';
  }
}

/** 给层叠计算用：读预览之前的原值 */
export const originalReader: Reader = (style, prop) => {
  for (const s of saved.values()) {
    if (styleOf(s.holder) !== style) continue;
    let present = false;
    for (let i = 0; i < s.probe.length; i++) if (s.probe[i] === prop) present = true;
    if (!present && !s.probe.getPropertyValue(prop)) return 'absent';
    return { value: s.probe.getPropertyValue(prop), priority: s.probe.getPropertyPriority(prop) };
  }
  return null;
};

function walkPath(sheet: CSSStyleSheet, path: number[]): CSSRule | null {
  let list: CSSRuleList;
  try {
    list = sheet.cssRules;
  } catch {
    return null;
  }
  let cur: CSSRule | null = null;
  for (const i of path) {
    cur = list[i] ?? null;
    if (!cur) return null;
    if (cur instanceof CSSImportRule) {
      if (!cur.styleSheet) return null;
      list = cur.styleSheet.cssRules;
    } else if ('cssRules' in cur) {
      list = (cur as CSSGroupingRule).cssRules;
    }
  }
  return cur;
}

function sheetMatches(sheet: CSSStyleSheet, ref: RuleRef['sheet']): boolean {
  if (ref.devId) return sheetDevId(sheet) === ref.devId;
  if (ref.href) return sheet.href === ref.href || stripQ(sheet.href) === stripQ(ref.href);
  return true;
}

function stripQ(u: string | null) {
  return u ? u.split('?')[0] : u;
}

/** 按 RuleRef 找回 CSSOM 里的规则；热更新后下标可能变化，就按样式表 + 选择器 + 条件重新找 */
export function resolveRule(ref: RuleRef): CSSStyleDeclaration | null {
  const sheets = Array.from(document.styleSheets);
  const direct = sheets[ref.sheet.index];
  if (direct && sheetMatches(direct, ref.sheet)) {
    const r = walkPath(direct, ref.path) as (CSSRule & { selectorText?: string; style?: CSSStyleDeclaration }) | null;
    if (r && r.style && (r.selectorText === ref.selector || (ref.selector === '&' && !r.selectorText))) return r.style;
  }
  const idx = collectRules(isOwnSheet);
  const hit = idx.rules.find(
    (fr) => fr.selector === ref.selector && fr.conditions.join('|') === ref.conditions.join('|') && sheetMatches(fr.topSheet, ref.sheet),
  );
  return hit ? hit.style : null;
}

async function holdersFor(target: PreviewTarget): Promise<Holder[]> {
  if (target.kind === 'inline') {
    const el = elOf(target.uid);
    if (!el) return [];
    let els = target.sourceKey ? await sameSourceElements(el, target.depth ?? 0) : [el];
    if (target.withClass) els = els.filter((e) => e === el || e.classList.contains(target.withClass!));
    return els.filter((e): e is HTMLElement => e instanceof HTMLElement || e instanceof SVGElement).map((e) => ({ kind: 'inline', el: e as HTMLElement }));
  }
  if (target.kind === 'rule') {
    const style = resolveRule(target.rule);
    return style ? [{ kind: 'rule', style }] : [];
  }
  return [];
}

function reapply(k: HTMLElement | CSSStyleDeclaration) {
  restore(k);
  let any = false;
  for (const e of entries.values()) {
    for (const h of e.holders) {
      if (keyOf(h) === k) {
        write(h, e.decls);
        any = true;
      }
    }
  }
  if (!any) saved.delete(k);
}

let chain: Promise<unknown> = Promise.resolve();

/** 拖动时预览请求很密，串行处理，避免同一 id 并发建出两条记录 */
export function preview(id: string, target: PreviewTarget, decls: Record<string, string>): Promise<number> {
  const run = chain.then(() => doPreview(id, target, decls));
  chain = run.catch(() => undefined);
  return run;
}

async function doPreview(id: string, target: PreviewTarget, decls: Record<string, string>): Promise<number> {
  let entry = entries.get(id);
  if (entry && !sameTarget(entry.target, target)) {
    clearPreview(id);
    entry = undefined;
  }
  if (!entry) {
    const holders = await holdersFor(target);
    for (const h of holders) save(h);
    entry = { id, target, decls: {}, holders };
  }
  // 挪到末尾：多个预览改同一属性时，最近一次编辑的那条最后应用、最终生效
  entries.delete(id);
  entries.set(id, entry);
  entry.decls = { ...entry.decls, ...decls };
  for (const h of entry.holders) reapply(keyOf(h));
  return entry.holders.length;
}

function sameTarget(a: PreviewTarget, b: PreviewTarget): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function clearPreview(id: string): boolean {
  const e = entries.get(id);
  if (!e) return false;
  entries.delete(id);
  for (const h of e.holders) {
    const k = keyOf(h);
    if (h.kind === 'rule' && !isLive(h.style)) {
      saved.delete(k);
      continue;
    }
    reapply(k);
  }
  return true;
}

export function clearAll(): number {
  const n = entries.size;
  for (const id of Array.from(entries.keys())) clearPreview(id);
  return n;
}

export function hasPreview(id: string): boolean {
  return entries.has(id);
}

/** 热更新替换 <style> 后，旧 CSSOM 规则就脱离了文档 */
function isLive(style: CSSStyleDeclaration): boolean {
  const rule = style.parentRule;
  if (!rule) return false;
  let sheet = rule.parentStyleSheet;
  while (sheet && sheet.ownerRule) sheet = sheet.ownerRule.parentStyleSheet;
  return !!sheet && Array.from(document.styleSheets).includes(sheet);
}

/** 页面刷新或 DOM 重建后清掉指向失效节点的记录 */
export function prune() {
  for (const [k, s] of Array.from(saved.entries())) {
    if (s.holder.kind === 'inline' ? !s.holder.el.isConnected : !isLive(s.holder.style)) saved.delete(k);
  }
}
