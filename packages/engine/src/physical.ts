/**
 * 把 CSS 属性展开成物理长属性，用来比较“这个工具类 / 这条声明管哪些属性”。
 * 逻辑属性按从左到右的书写方向换算（inline-start = left）。
 */
const EXPAND: Record<string, string[]> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  'padding-inline': ['padding-left', 'padding-right'],
  'padding-block': ['padding-top', 'padding-bottom'],
  'padding-inline-start': ['padding-left'],
  'padding-inline-end': ['padding-right'],
  'padding-block-start': ['padding-top'],
  'padding-block-end': ['padding-bottom'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'margin-inline': ['margin-left', 'margin-right'],
  'margin-block': ['margin-top', 'margin-bottom'],
  'margin-inline-start': ['margin-left'],
  'margin-inline-end': ['margin-right'],
  'margin-block-start': ['margin-top'],
  'margin-block-end': ['margin-bottom'],
  inset: ['top', 'right', 'bottom', 'left'],
  'inset-inline': ['left', 'right'],
  'inset-block': ['top', 'bottom'],
  'inset-inline-start': ['left'],
  'inset-inline-end': ['right'],
  'inset-block-start': ['top'],
  'inset-block-end': ['bottom'],
  gap: ['row-gap', 'column-gap'],
  'grid-gap': ['row-gap', 'column-gap'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  'border-start-start-radius': ['border-top-left-radius'],
  'border-start-end-radius': ['border-top-right-radius'],
  'border-end-end-radius': ['border-bottom-right-radius'],
  'border-end-start-radius': ['border-bottom-left-radius'],
  'inline-size': ['width'],
  'block-size': ['height'],
  'min-inline-size': ['min-width'],
  'max-inline-size': ['max-width'],
  'min-block-size': ['min-height'],
  'max-block-size': ['max-height'],
};

/** 描边：border 管四边的粗细、样式、颜色，border-top 管一边，border-width 管四边的一个分量，逻辑写法换成物理边 */
const PARTS = ['width', 'style', 'color'];
const sideParts = (side: string) => PARTS.map((p) => `border-${side}-${p}`);
EXPAND.border = ['top', 'right', 'bottom', 'left'].flatMap(sideParts);
for (const p of PARTS) EXPAND[`border-${p}`] = ['top', 'right', 'bottom', 'left'].map((s) => `border-${s}-${p}`);
for (const [name, side] of Object.entries({ top: 'top', right: 'right', bottom: 'bottom', left: 'left', 'block-start': 'top', 'inline-end': 'right', 'block-end': 'bottom', 'inline-start': 'left' })) {
  EXPAND[`border-${name}`] = sideParts(side);
  for (const p of PARTS) if (name !== side) EXPAND[`border-${name}-${p}`] = [`border-${side}-${p}`];
}
for (const [axis, sides] of Object.entries({ inline: ['left', 'right'], block: ['top', 'bottom'] })) {
  EXPAND[`border-${axis}`] = sides.flatMap(sideParts);
  for (const p of PARTS) EXPAND[`border-${axis}-${p}`] = sides.map((s) => `border-${s}-${p}`);
}

export function physical(prop: string): string[] {
  return EXPAND[prop] ?? [prop];
}

export function physicalSet(props: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const p of props) for (const q of physical(p)) out.add(q);
  return out;
}

export function isSubset<T>(a: Set<T>, b: Set<T>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && isSubset(a, b);
}
