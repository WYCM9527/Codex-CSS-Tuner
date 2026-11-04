import { t as msg } from '@css-tuner/protocol';
import { minimizeEdit, type EditResult, type TextEdit } from '../types';
import { intersects, isSubset, physicalSet, sameSet } from '../physical';
import type { TwDesign } from './design';
import type { ClassSite, ClassToken, Segment } from './jsx';
import { allClassSites, classLiteralSites, locateClassSite, locateLiteralSite } from './sites';

export interface TailwindEditInput {
  file: string;
  source: string;
  line: number;
  column: number;
  /** 要改的 CSS 属性（面板字段对应的长属性） */
  props: string[];
  /** 预览时用的 CSS 值 */
  value: string;
  /** 刻度令牌（如 "10"、"brand"、"lg"；"" 表示 DEFAULT） */
  token: string | null;
  /** 当前生效的工具类（含变体），用来确定变体前缀和要替换的那个类 */
  utility: string | null;
  /** (line, column) 指的是类名字符串字面量（cva 变体、类名常量），不是 JSX 元素 */
  literal?: boolean;
  /** 在这里追加一个覆盖类（组件用 cn / twMerge 合并，后写的赢）；utility 只用来确定变体前缀 */
  override?: boolean;
  /** 删属性：去掉这些类（各属性当前生效的类名，含变体），value、token 不用 */
  remove?: string[];
}

type Kind = 'length' | 'color' | 'weight' | 'opacity' | 'shadow' | 'align' | 'number' | 'keyword' | 'tracks' | 'integer' | 'borderWidth';

interface Root {
  root: string;
  props: string[];
  kind: Kind;
  /** keyword：CSS 值 → 工具类名 */
  words?: Record<string, string>;
}

const DISPLAY: Record<string, string> = {
  block: 'block',
  inline: 'inline',
  'inline-block': 'inline-block',
  flex: 'flex',
  'inline-flex': 'inline-flex',
  grid: 'grid',
  'inline-grid': 'inline-grid',
  none: 'hidden',
  contents: 'contents',
  'flow-root': 'flow-root',
  table: 'table',
  'list-item': 'list-item',
};

const FLEX_ALIGN = (prefix: string, extra: Record<string, string>): Record<string, string> => ({
  'flex-start': `${prefix}-start`,
  start: `${prefix}-start`,
  center: `${prefix}-center`,
  'flex-end': `${prefix}-end`,
  end: `${prefix}-end`,
  ...extra,
});

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

const ROOTS: Root[] = [
  ...(['padding', 'margin'] as const).flatMap((box): Root[] => {
    const r = box[0];
    const s = (side: string) => `${box}-${side}`;
    return [
      { root: r, props: SIDES.map(s), kind: 'length' },
      { root: `${r}x`, props: [s('left'), s('right')], kind: 'length' },
      { root: `${r}y`, props: [s('top'), s('bottom')], kind: 'length' },
      { root: `${r}t`, props: [s('top')], kind: 'length' },
      { root: `${r}r`, props: [s('right')], kind: 'length' },
      { root: `${r}b`, props: [s('bottom')], kind: 'length' },
      { root: `${r}l`, props: [s('left')], kind: 'length' },
    ];
  }),
  { root: 'gap', props: ['row-gap', 'column-gap'], kind: 'length' },
  { root: 'gap-x', props: ['column-gap'], kind: 'length' },
  { root: 'gap-y', props: ['row-gap'], kind: 'length' },
  { root: 'size', props: ['width', 'height'], kind: 'length' },
  { root: 'w', props: ['width'], kind: 'length' },
  { root: 'h', props: ['height'], kind: 'length' },
  { root: 'min-w', props: ['min-width'], kind: 'length' },
  { root: 'max-w', props: ['max-width'], kind: 'length' },
  { root: 'min-h', props: ['min-height'], kind: 'length' },
  { root: 'max-h', props: ['max-height'], kind: 'length' },
  { root: 'inset', props: [...SIDES], kind: 'length' },
  { root: 'inset-x', props: ['left', 'right'], kind: 'length' },
  { root: 'inset-y', props: ['top', 'bottom'], kind: 'length' },
  ...SIDES.map((s): Root => ({ root: s, props: [s], kind: 'length' })),
  { root: 'text', props: ['font-size'], kind: 'length' },
  { root: 'font', props: ['font-weight'], kind: 'weight' },
  { root: 'leading', props: ['line-height'], kind: 'number' },
  { root: 'tracking', props: ['letter-spacing'], kind: 'length' },
  { root: 'text', props: ['text-align'], kind: 'align' },
  { root: 'text', props: ['color'], kind: 'color' },
  { root: 'bg', props: ['background-color'], kind: 'color' },
  { root: 'rounded', props: CORNERS.map((c) => `border-${c}-radius`), kind: 'length' },
  { root: 'rounded-t', props: ['border-top-left-radius', 'border-top-right-radius'], kind: 'length' },
  { root: 'rounded-r', props: ['border-top-right-radius', 'border-bottom-right-radius'], kind: 'length' },
  { root: 'rounded-b', props: ['border-bottom-right-radius', 'border-bottom-left-radius'], kind: 'length' },
  { root: 'rounded-l', props: ['border-top-left-radius', 'border-bottom-left-radius'], kind: 'length' },
  { root: 'rounded-tl', props: ['border-top-left-radius'], kind: 'length' },
  { root: 'rounded-tr', props: ['border-top-right-radius'], kind: 'length' },
  { root: 'rounded-br', props: ['border-bottom-right-radius'], kind: 'length' },
  { root: 'rounded-bl', props: ['border-bottom-left-radius'], kind: 'length' },
  { root: 'border', props: SIDES.map((s) => `border-${s}-width`), kind: 'borderWidth' },
  { root: 'border-x', props: ['border-left-width', 'border-right-width'], kind: 'borderWidth' },
  { root: 'border-y', props: ['border-top-width', 'border-bottom-width'], kind: 'borderWidth' },
  ...SIDES.map((s): Root => ({ root: `border-${s[0]}`, props: [`border-${s}-width`], kind: 'borderWidth' })),
  { root: 'border', props: SIDES.map((s) => `border-${s}-color`), kind: 'color' },
  { root: 'border-x', props: ['border-left-color', 'border-right-color'], kind: 'color' },
  { root: 'border-y', props: ['border-top-color', 'border-bottom-color'], kind: 'color' },
  ...SIDES.map((s): Root => ({ root: `border-${s[0]}`, props: [`border-${s}-color`], kind: 'color' })),
  {
    root: '',
    props: SIDES.map((s) => `border-${s}-style`),
    kind: 'keyword',
    words: { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted', double: 'border-double', hidden: 'border-hidden', none: 'border-none' },
  },
  { root: 'opacity', props: ['opacity'], kind: 'opacity' },
  { root: 'shadow', props: ['box-shadow'], kind: 'shadow' },
  { root: '', props: ['display'], kind: 'keyword', words: DISPLAY },
  { root: 'flex', props: ['flex-direction'], kind: 'keyword', words: { row: 'flex-row', 'row-reverse': 'flex-row-reverse', column: 'flex-col', 'column-reverse': 'flex-col-reverse' } },
  { root: 'flex', props: ['flex-wrap'], kind: 'keyword', words: { wrap: 'flex-wrap', nowrap: 'flex-nowrap', 'wrap-reverse': 'flex-wrap-reverse' } },
  {
    root: 'justify',
    props: ['justify-content'],
    kind: 'keyword',
    words: FLEX_ALIGN('justify', { 'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly', stretch: 'justify-stretch', normal: 'justify-normal' }),
  },
  { root: 'items', props: ['align-items'], kind: 'keyword', words: FLEX_ALIGN('items', { stretch: 'items-stretch', baseline: 'items-baseline' }) },
  { root: 'grid-cols', props: ['grid-template-columns'], kind: 'tracks' },
  { root: '', props: ['position'], kind: 'keyword', words: { static: 'static', relative: 'relative', absolute: 'absolute', fixed: 'fixed', sticky: 'sticky' } },
  { root: 'z', props: ['z-index'], kind: 'integer' },
];

/** 两个同值的类合并成一个：px-4 py-4 → p-4 */
const COLLAPSE: Array<[string, string, string]> = [
  ['px', 'py', 'p'],
  ['mx', 'my', 'm'],
  ['pt', 'pb', 'py'],
  ['pl', 'pr', 'px'],
  ['mt', 'mb', 'my'],
  ['ml', 'mr', 'mx'],
  ['gap-x', 'gap-y', 'gap'],
];

function rootFor(props: Set<string>): Root | null {
  return ROOTS.find((r) => sameSet(new Set(r.props), props)) ?? null;
}

/** 按顶层冒号拆出变体前缀（方括号、圆括号里的冒号不算） */
export function splitCandidate(c: string): { variant: string; base: string; important: 'prefix' | 'suffix' | null } {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (ch === ':' && depth === 0) last = i;
  }
  const variant = c.slice(0, last + 1);
  let base = c.slice(last + 1);
  let important: 'prefix' | 'suffix' | null = null;
  if (base.startsWith('!')) {
    important = 'prefix';
    base = base.slice(1);
  } else if (base.endsWith('!')) {
    important = 'suffix';
    base = base.slice(0, -1);
  }
  return { variant, base, important };
}

/** 写进源码的文本里有没有任意值工具类（px-[13px]、[padding:13px]、bg-(--x)）；变体里的方括号（data-[open]:）不算 */
export function hasArbitraryValue(text: string): boolean {
  return text
    .split(/\s+/)
    .map((t) => t.replace(/^className=/, '').replace(/^["'`{]+|["'`}]+$/g, ''))
    .some((t) => t !== '' && /[[(]/.test(splitCandidate(t).base));
}

function join(variant: string, base: string, important: 'prefix' | 'suffix' | null): string {
  if (important === 'prefix') return `${variant}!${base}`;
  if (important === 'suffix') return `${variant}${base}!`;
  return `${variant}${base}`;
}

/** 任意值里的空格要写成下划线 */
function arb(value: string): string {
  return value.trim().replace(/_/g, '\\_').replace(/\s+/g, '_');
}

function varRef(value: string): string | null {
  const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value.trim());
  return m ? m[1] : null;
}

/** 生成候选类名（不含变体），按优先顺序给出几种写法，第一个合法的胜出 */
function composeBases(root: Root, value: string, token: string | null): string[] {
  const out: string[] = [];
  if (token !== null && root.root) out.push(token === '' ? root.root : `${root.root}-${token}`);
  const v = value.trim();
  const ref = varRef(v);
  switch (root.kind) {
    case 'align':
      out.push(`${root.root}-${v}`);
      break;
    case 'keyword':
      if (root.words?.[v]) out.push(root.words[v]);
      out.push(`[${root.props[0]}:${arb(v)}]`);
      break;
    case 'tracks': {
      const m = /^repeat\(\s*(\d+)\s*,\s*minmax\(\s*0(?:px)?\s*,\s*1fr\s*\)\s*\)$/.exec(v);
      if (m) out.push(`${root.root}-${m[1]}`);
      if (v === 'none' || v === 'subgrid') out.push(`${root.root}-${v}`);
      if (ref) out.push(`${root.root}-(${ref})`);
      out.push(`${root.root}-[${arb(v)}]`);
      break;
    }
    case 'integer':
      if (v === 'auto') out.push(`${root.root}-auto`);
      else if (/^-?\d+$/.test(v)) out.push(v.startsWith('-') ? `-${root.root}-${v.slice(1)}` : `${root.root}-${v}`);
      if (ref) out.push(`${root.root}-(${ref})`);
      out.push(`${root.root}-[${arb(v)}]`);
      break;
    case 'color':
      if (ref) out.push(root.root === 'text' ? `text-(color:${ref})` : `${root.root}-(${ref})`);
      if (v === 'transparent' || v === 'currentcolor' || v === 'currentColor' || v === 'inherit') out.push(`${root.root}-${v === 'currentColor' ? 'current' : v === 'currentcolor' ? 'current' : v}`);
      out.push(`${root.root}-[${arb(v)}]`);
      // border-[var(--x)] 分不清是粗细还是颜色
      if (root.root.startsWith('border')) out.push(`${root.root}-[color:${arb(v)}]`);
      break;
    case 'borderWidth': {
      const px = /^(\d+)px$/.exec(v);
      if (v === '1px') out.push(root.root);
      if (px) out.push(`${root.root}-${px[1]}`);
      if (ref) out.push(`${root.root}-(length:${ref})`);
      out.push(`${root.root}-[${arb(v)}]`, `${root.root}-[length:${arb(v)}]`);
      break;
    }
    case 'opacity': {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) out.push(`${root.root}-[${Math.round((v.endsWith('%') ? n : n * 100) * 100) / 100}%]`);
      if (ref) out.push(`${root.root}-(${ref})`);
      break;
    }
    case 'shadow':
      if (v === 'none') out.push('shadow-none');
      if (ref) out.push(`shadow-(${ref})`);
      out.push(`shadow-[${arb(v)}]`);
      break;
    case 'length':
      if (ref) out.push(root.root === 'text' ? `text-(length:${ref})` : `${root.root}-(${ref})`);
      out.push(root.root === 'text' ? `text-[length:${arb(v)}]` : `${root.root}-[${arb(v)}]`);
      if (root.root === 'text') out.push(`text-[${arb(v)}]`);
      break;
    default:
      if (ref) out.push(`${root.root}-(${ref})`);
      out.push(`${root.root}-[${arb(v)}]`);
  }
  return out;
}

interface Op {
  token: ClassToken;
  kind: 'replace' | 'remove';
  text?: string;
}

interface Insert {
  seg: Segment;
  /** 插在这个类名后面；null 表示插在段尾 */
  after: ClassToken | null;
  text: string;
}

/**
 * 按段重建文本：段首段尾的空白（模板字符串里紧贴 ${} 的空格、多行缩进）原样保留，
 * 类名之间沿用原来的分隔；删掉的类名连同它前面的分隔一起去掉
 */
function segmentEdits(source: string, site: ClassSite, ops: Op[], inserts: Insert[]): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const seg of site.segments) {
    const toks = site.tokens.filter((t) => t.seg === seg);
    const segOps = ops.filter((o) => o.token.seg === seg);
    const segIns = inserts.filter((i) => i.seg === seg);
    if (!segOps.length && !segIns.length) continue;
    const lead = toks.length ? source.slice(seg.start, toks[0].start) : '';
    const tail = toks.length ? source.slice(toks[toks.length - 1].end, seg.end) : source.slice(seg.start, seg.end);
    let out = '';
    let any = false;
    const emit = (sep: string, text: string) => {
      out += (any ? sep || ' ' : '') + text;
      any = true;
    };
    toks.forEach((t, i) => {
      const op = segOps.find((o) => o.token === t);
      const sep = i === 0 ? ' ' : source.slice(toks[i - 1].end, t.start);
      if (!op) emit(sep, t.text);
      else if (op.kind === 'replace') emit(sep, seg.single === 'key' && !/^[A-Za-z_$][\w$]*$/.test(op.text!) ? `'${op.text}'` : op.text!);
      for (const ins of segIns) if (ins.after === t) emit(' ', ins.text);
    });
    for (const ins of segIns) if (ins.after === null) emit(' ', ins.text);
    edits.push({ start: seg.start, end: seg.end, text: lead + out + tail });
  }
  return edits;
}

/**
 * 令牌对应的工具类顺带设置、可被别的类覆盖的属性（如 text-lg 的行高），预览时一起设上才和应用后一致。
 * 保留 var(--tw-*, …) 外壳：元素上另有 leading-* 时仍由它决定；主题变量换成具体值，页面上不一定生成了它
 */
export function previewCompanions(design: TwDesign, props: string[], value: string, token: string | null): Record<string, string> {
  const E = physicalSet(props);
  const root = rootFor(E);
  if (!root || token === null) return {};
  const info = design.info(design.canonical(composeBases(root, value, token)[0]));
  if (!info || !isSubset(E, info.hard)) return {};
  const out: Record<string, string> = {};
  for (const p of info.soft) {
    const v = info.values.get(p);
    if (v) out[p] = v.replace(/var\(\s*(--(?!tw-)[\w-]+)\s*\)/g, (m, name: string) => design.themeValue(name) ?? m);
  }
  return out;
}

export function editTailwind(design: TwDesign, input: TailwindEditInput): EditResult {
  const site = input.literal
    ? locateLiteralSite(input.source, input.file, input.line, input.column, input.override ? null : input.utility)
    : locateClassSite(input.source, input.file, input.line, input.column);
  if ('error' in site) return { ok: false, reason: site.error };

  const E = physicalSet(input.props);
  if (input.remove) return removeClasses(design, input, site, E);
  const root = rootFor(E);
  if (!root) return { ok: false, reason: msg('engine.tw.noUtility', { props: input.props.join(', ') }) };

  const hint = input.utility ? splitCandidate(input.utility) : null;
  const variant = hint?.variant ?? '';
  const important = hint?.important ?? null;

  const sameVariant = site.tokens.filter((t) => {
    const s = splitCandidate(t.text);
    return s.variant === variant && !!s.important === !!important;
  });
  const infoOf = (t: ClassToken) => design.info(t.text);
  const matching = sameVariant.filter((t) => {
    const i = infoOf(t);
    return !!i && intersects(i.hard, E);
  });
  const covered = matching.filter((t) => isSubset(infoOf(t)!.hard, E));

  let primary: ClassToken | null = null;
  if (input.utility) {
    primary = site.tokens.find((t) => t.text === input.utility) ?? null;
    if (!primary && !input.override) {
      return { ok: false, reason: msg('engine.tw.utilityNotLiteral', { cls: input.utility }) };
    }
    if (primary && !primary.editable) return { ok: false, reason: msg('engine.tw.utilityInTemplate', { cls: input.utility }) };
    // 生效的类管的属性比这次改的多（如 p-4 而只改左右），保留它，另加更具体的类
    if (primary && !covered.includes(primary)) primary = null;
  }

  // 组合新类名并校验
  let next: string | null = null;
  for (const b of composeBases(root, input.value, input.token)) {
    const cand = design.canonical(join(variant, b, important));
    const info = design.info(cand);
    if (info && isSubset(E, info.hard)) {
      next = cand;
      break;
    }
  }
  if (!next) return { ok: false, reason: msg('engine.tw.noClassForValue', { value: input.value }) };

  const addAttr = (cls: string): EditResult => ({
    ok: true,
    file: input.file,
    edits: [{ start: site.nameEnd, end: site.nameEnd, text: ` ${site.insertAttr ?? 'className'}="${cls}"` }],
    summary: `+ ${cls}`,
    classes: { removed: [], added: [cls], attrAdded: true },
  });
  if (!site.hasClassName) {
    if (site.hasSpread) return { ok: false, reason: msg('engine.tw.spreadNoClassName') };
    return addAttr(next);
  }

  const ops: Op[] = [];
  const inserts: Insert[] = [];
  const removedTexts: string[] = [];
  const primarySeg = primary?.seg ?? null;
  if (primary) {
    ops.push({ token: primary, kind: 'replace', text: next });
    removedTexts.push(primary.text);
  }
  // 其余被完全覆盖的类会和新类抢同一属性，一起去掉（只动与主类同一条件分支、或无条件的段）
  for (const t of covered) {
    if (t === primary) continue;
    if (t.seg.conditional && t.seg !== primarySeg) continue;
    if (!t.editable) return { ok: false, reason: msg('engine.tw.classInDynamic', { cls: t.text }) };
    ops.push({ token: t, kind: 'remove' });
    removedTexts.push(t.text);
  }

  let inserted: Insert | null = null;
  if (!primary) {
    const partial = matching.filter((t) => !covered.includes(t) && t.editable && !t.seg.conditional);
    const anchor = partial[partial.length - 1] ?? null;
    if (anchor) inserted = { seg: anchor.seg, after: anchor, text: next };
    else {
      // 追加到第一个无条件的字面量里：优先有可编辑类名的段，放在最后一个可编辑类名后面；
      // 空段只有不贴着 ${} 时才能用（className="" 这种）
      const fixed = site.segments.filter((s) => !s.conditional);
      const ordered = [...fixed.filter((s) => !s.viaConst), ...fixed.filter((s) => s.viaConst)];
      for (const seg of ordered) {
        const toks = site.tokens.filter((t) => t.seg === seg);
        const lastEditable = [...toks].reverse().find((t) => t.editable) ?? null;
        if (lastEditable) {
          inserted = { seg, after: lastEditable, text: next };
          break;
        }
        if (!toks.length && !seg.fragileStart && !seg.fragileEnd) {
          inserted = { seg, after: null, text: next };
          break;
        }
      }
      // Vue 的 :class 和 Svelte 的 class: 指令旁边可以再写一个静态 class，两者会合并
      if (!inserted && site.insertAttr && !site.attrRange) return addAttr(next);
      if (!inserted) return { ok: false, reason: msg('engine.tw.noStaticToAppend') };
    }
    inserts.push(inserted);
  }

  // 新类与已有同值类合并（px-4 + py-4 → p-4），或已被更大的同值类覆盖时直接省略
  const nextInfo = design.info(next)!;
  const others = sameVariant.filter((t) => !ops.some((o) => o.token === t) && t.editable && !t.seg.conditional);
  const redundant = others.find((t) => {
    const i = infoOf(t);
    if (!i || !isSubset(nextInfo.hard, i.hard)) return false;
    return [...nextInfo.hard].every((p) => i.values.get(p) === nextInfo.values.get(p));
  });
  let summaryNext = next;
  let added: string[] = [next];
  if (redundant) {
    if (primary) ops[0] = { token: primary, kind: 'remove' };
    else inserts.length = 0;
    summaryNext = msg('engine.tw.coveredBy', { cls: redundant.text });
    added = [];
  } else {
    const nb = splitCandidate(next).base;
    for (const [a, b, merged] of COLLAPSE) {
      const mine = nb.startsWith(`${a}-`) ? a : nb.startsWith(`${b}-`) ? b : null;
      if (!mine) continue;
      const otherRoot = mine === a ? b : a;
      const part = nb.slice(mine.length + 1);
      const mate = others.find((t) => splitCandidate(t.text).base === `${otherRoot}-${part}`);
      if (!mate) continue;
      const mergedCand = design.canonical(join(variant, `${merged}-${part}`, important));
      const mi = design.info(mergedCand);
      if (!mi) continue;
      const union = new Set([...nextInfo.hard, ...(design.info(mate.text)?.hard ?? [])]);
      if (!sameSet(mi.hard, union)) continue;
      ops.push({ token: mate, kind: 'replace', text: mergedCand });
      if (primary) ops[0] = { token: primary, kind: 'remove' };
      else inserts.length = 0;
      removedTexts.push(mate.text);
      summaryNext = mergedCand;
      added = [mergedCand];
      break;
    }
  }

  const single = ops.find((o) => o.kind === 'remove' && o.token.seg.single);
  if (single) return { ok: false, reason: msg('engine.tw.singleClass', { cls: single.token.text }) };

  const edits = finish(input.source, segmentEdits(input.source, site, ops, inserts));
  const summary = removedTexts.length ? `${removedTexts.join(' ')} → ${summaryNext}` : `+ ${summaryNext}`;
  return { ok: true, file: input.file, edits, summary, classes: { removed: removedTexts, added, attrAdded: false } };
}

/** 删属性：去掉各属性当前生效的类；类还管着别的属性（只删 p-4 的左边）就删不了 */
function removeClasses(design: TwDesign, input: TailwindEditInput, site: ClassSite, E: Set<string>): EditResult {
  const ops: Op[] = [];
  for (const cls of input.remove ?? []) {
    const tok = site.tokens.find((t) => t.text === cls);
    if (!tok) return { ok: false, reason: msg('engine.tw.utilityNotLiteral', { cls }) };
    if (!tok.editable) return { ok: false, reason: msg('engine.tw.classInDynamic', { cls }) };
    if (tok.seg.single) return { ok: false, reason: msg('engine.tw.singleClass', { cls }) };
    const info = design.info(cls);
    if (info && !isSubset(info.hard, E)) return { ok: false, reason: msg('engine.tw.removePartial', { cls }) };
    if (!ops.some((o) => o.token === tok)) ops.push({ token: tok, kind: 'remove' });
  }
  if (!ops.length) return { ok: false, reason: msg('engine.tw.nothingToRemove') };
  const removed = ops.map((o) => o.token.text);
  return { ok: true, file: input.file, edits: finish(input.source, segmentEdits(input.source, site, ops, [])), summary: `${removed.join(' ')} → ∅`, classes: { removed, added: [], attrAdded: false } };
}

function finish(source: string, edits: TextEdit[]): TextEdit[] {
  return edits.map((e) => minimizeEdit(source, e)).filter((e) => !(e.start === e.end && e.text === ''));
}

export interface TailwindRevertInput {
  file: string;
  source: string;
  line: number;
  column: number;
  removed: string[];
  added: string[];
  attrAdded: boolean;
  /** 当初写的是类名字符串字面量 */
  literal?: boolean;
}

/**
 * 按类名语义回退一次写回：把加上的类换回去掉的类。
 * 用在应用之后文件又被改过（字节级逆操作对不上）的时候；元素可能挪了行，在附近按类名找。
 */
export function revertTailwind(input: TailwindRevertInput): EditResult {
  let site: ClassSite | null = null;
  if (input.added.length) {
    const all = input.literal ? classLiteralSites(input.source, input.file) : allClassSites(input.source, input.file);
    if ('error' in all) return { ok: false, reason: all.error };
    const has = (s: ClassSite) => input.added.every((a) => s.tokens.some((t) => t.text === a && t.editable));
    site = all.filter(has).sort((a, b) => Math.abs(a.line - input.line) - Math.abs(b.line - input.line))[0] ?? null;
  } else {
    const s = input.literal ? locateLiteralSite(input.source, input.file, input.line, input.column, null) : locateClassSite(input.source, input.file, input.line, input.column);
    site = 'error' in s ? null : s;
  }
  if (!site) return { ok: false, reason: msg('engine.tw.addedNotFound', { classes: input.added.join(' ') }) };

  const summary = `${input.added.join(' ') || '∅'} → ${input.removed.join(' ') || '∅'}`;
  const range = site.attrRange;
  const inAttr = range ? site.tokens.filter((t) => t.start >= range.start && t.end <= range.end) : [];
  if (input.attrAdded && range && inAttr.map((t) => t.text).join(' ') === input.added.join(' ')) {
    const start = input.source[range.start - 1] === ' ' ? range.start - 1 : range.start;
    return { ok: true, file: input.file, edits: [{ start, end: range.end, text: '' }], summary };
  }

  const ops: Op[] = [];
  const inserts: Insert[] = [];
  const addedToks = input.added.map((a) => site!.tokens.find((t) => t.text === a && t.editable)!);
  addedToks.forEach((t, i) => {
    if (i === 0 && input.removed.length) ops.push({ token: t, kind: 'replace', text: input.removed.join(' ') });
    else ops.push({ token: t, kind: 'remove' });
  });
  if (!addedToks.length && input.removed.length) {
    const seg = site.segments.find((s) => !s.conditional);
    if (!seg) return { ok: false, reason: msg('engine.tw.noStaticToRestore') };
    const toks = site.tokens.filter((t) => t.seg === seg);
    inserts.push({ seg, after: toks[toks.length - 1] ?? null, text: input.removed.join(' ') });
  }
  return { ok: true, file: input.file, edits: finish(input.source, segmentEdits(input.source, site, ops, inserts)), summary };
}
