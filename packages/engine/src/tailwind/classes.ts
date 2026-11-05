import { isSubset, physicalSet, sameSet } from '../physical';
import type { TwDesign } from './design';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

/** 刻度令牌写成「前缀-令牌」的工具类，和它管的长属性 */
const ROOTS: Array<{ root: string; props: string[] }> = [
  ...(['padding', 'margin'] as const).flatMap((box) => {
    const r = box[0];
    const s = (side: string) => `${box}-${side}`;
    return [
      { root: r, props: SIDES.map(s) },
      { root: `${r}x`, props: [s('left'), s('right')] },
      { root: `${r}y`, props: [s('top'), s('bottom')] },
      { root: `${r}t`, props: [s('top')] },
      { root: `${r}r`, props: [s('right')] },
      { root: `${r}b`, props: [s('bottom')] },
      { root: `${r}l`, props: [s('left')] },
    ];
  }),
  { root: 'gap', props: ['row-gap', 'column-gap'] },
  { root: 'gap-x', props: ['column-gap'] },
  { root: 'gap-y', props: ['row-gap'] },
  { root: 'size', props: ['width', 'height'] },
  { root: 'w', props: ['width'] },
  { root: 'h', props: ['height'] },
  { root: 'min-w', props: ['min-width'] },
  { root: 'max-w', props: ['max-width'] },
  { root: 'min-h', props: ['min-height'] },
  { root: 'max-h', props: ['max-height'] },
  { root: 'inset', props: [...SIDES] },
  { root: 'inset-x', props: ['left', 'right'] },
  { root: 'inset-y', props: ['top', 'bottom'] },
  ...SIDES.map((s) => ({ root: s, props: [s] })),
  { root: 'text', props: ['font-size'] },
  { root: 'font', props: ['font-weight'] },
  { root: 'leading', props: ['line-height'] },
  { root: 'tracking', props: ['letter-spacing'] },
  { root: 'text', props: ['text-align'] },
  { root: 'text', props: ['color'] },
  { root: 'bg', props: ['background-color'] },
  { root: 'rounded', props: CORNERS.map((c) => `border-${c}-radius`) },
  { root: 'rounded-t', props: ['border-top-left-radius', 'border-top-right-radius'] },
  { root: 'rounded-r', props: ['border-top-right-radius', 'border-bottom-right-radius'] },
  { root: 'rounded-b', props: ['border-bottom-right-radius', 'border-bottom-left-radius'] },
  { root: 'rounded-l', props: ['border-top-left-radius', 'border-bottom-left-radius'] },
  { root: 'rounded-tl', props: ['border-top-left-radius'] },
  { root: 'rounded-tr', props: ['border-top-right-radius'] },
  { root: 'rounded-br', props: ['border-bottom-right-radius'] },
  { root: 'rounded-bl', props: ['border-bottom-left-radius'] },
  { root: 'border', props: SIDES.map((s) => `border-${s}-width`) },
  { root: 'border-x', props: ['border-left-width', 'border-right-width'] },
  { root: 'border-y', props: ['border-top-width', 'border-bottom-width'] },
  ...SIDES.map((s) => ({ root: `border-${s[0]}`, props: [`border-${s}-width`] })),
  { root: 'border', props: SIDES.map((s) => `border-${s}-color`) },
  { root: 'border-x', props: ['border-left-color', 'border-right-color'] },
  { root: 'border-y', props: ['border-top-color', 'border-bottom-color'] },
  ...SIDES.map((s) => ({ root: `border-${s[0]}`, props: [`border-${s}-color`] })),
  { root: 'opacity', props: ['opacity'] },
  { root: 'shadow', props: ['box-shadow'] },
  { root: 'grid-cols', props: ['grid-template-columns'] },
  { root: 'z', props: ['z-index'] },
];

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

/**
 * 令牌对应的工具类顺带设置、可被别的类覆盖的属性（如 text-lg 的行高），预览时一起设上才和改完代码后一致。
 * 保留 var(--tw-*, …) 外壳：元素上另有 leading-* 时仍由它决定；主题变量换成具体值，页面上不一定生成了它
 */
export function previewCompanions(design: TwDesign, props: string[], token: string | null): Record<string, string> {
  const E = physicalSet(props);
  const root = ROOTS.find((r) => sameSet(new Set(r.props), E));
  if (!root || token === null) return {};
  const info = design.info(design.canonical(token === '' ? root.root : `${root.root}-${token}`));
  if (!info || !isSubset(E, info.hard)) return {};
  const out: Record<string, string> = {};
  for (const p of info.soft) {
    const v = info.values.get(p);
    if (v) out[p] = v.replace(/var\(\s*(--(?!tw-)[\w-]+)\s*\)/g, (m, name: string) => design.themeValue(name) ?? m);
  }
  return out;
}
