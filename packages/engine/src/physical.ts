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

export function intersects<T>(a: Set<T>, b: Set<T>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

export function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && isSubset(a, b);
}
