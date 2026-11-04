import { toPx, type CssVar, type PageInfo, type Scales, type ScaleStep } from '@css-tuner/protocol';

const WEIGHTS: Array<[string, string]> = [
  ['thin', '100'],
  ['extralight', '200'],
  ['light', '300'],
  ['normal', '400'],
  ['medium', '500'],
  ['semibold', '600'],
  ['bold', '700'],
  ['extrabold', '800'],
  ['black', '900'],
];

export function emptyScales(rem: number, mode: Scales['mode'] = 'css'): Scales {
  return {
    mode,
    rem,
    spacing: [],
    size: [],
    radius: [],
    fontSize: [],
    fontWeight: WEIGHTS.map(([label, value]) => ({ label, value, token: null })),
    lineHeight: [],
    letterSpacing: [],
    shadow: [{ label: 'none', value: 'none', token: null }],
    colors: [],
    opacity: [],
    zIndex: [],
    borderWidth: [],
  };
}

type Bucket = Exclude<keyof Scales, 'mode' | 'rem'>;

/** 按变量名猜用途；猜不出的长度归到间距 */
function bucketOf(v: CssVar): Bucket | null {
  const n = v.name.toLowerCase();
  if (v.kind === 'color') return 'colors';
  if (/shadow|elevation/.test(n)) return 'shadow';
  if (v.kind === 'number') {
    if (/weight|fw/.test(n)) return 'fontWeight';
    if (/opacity|alpha/.test(n)) return 'opacity';
    if (/leading|line-height|lh/.test(n)) return 'lineHeight';
    return null;
  }
  if (v.kind !== 'length') return null;
  if (/radius|round|corner/.test(n)) return 'radius';
  if (/border|stroke|outline/.test(n)) return 'borderWidth';
  if (/leading|line-height|lh/.test(n)) return 'lineHeight';
  if (/tracking|letter/.test(n)) return 'letterSpacing';
  if (/font-size|text-|fs-|^--font-|type-|step-/.test(n)) return 'fontSize';
  if (/width|container|breakpoint|screen|max-|min-|^--w-|^--h-/.test(n)) return 'size';
  return 'spacing';
}

/** 普通 CSS 项目：刻度来自 :root 上的自定义属性，写回时用 var(--x) */
export function cssScales(page: PageInfo, rem: number): Scales {
  const s = emptyScales(rem, 'css');
  for (const v of page.rootVars) {
    const b = bucketOf(v);
    if (!b) continue;
    const step: ScaleStep = { label: v.name, value: `var(${v.name})`, token: v.name };
    if (v.kind === 'length') {
      const px = toPx(v.value, rem, rem);
      if (px === null) continue;
      step.px = px;
    } else if (v.kind === 'number') {
      step.px = parseFloat(v.value);
    } else if (v.kind === 'color') {
      step.value = v.value;
    }
    if (b === 'shadow') step.value = `var(${v.name})`;
    (s[b] as ScaleStep[]).push(step);
  }
  s.size = [...s.spacing, ...s.size];
  return s;
}
