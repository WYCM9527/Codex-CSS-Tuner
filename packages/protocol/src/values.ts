export interface CssNumber {
  num: number;
  unit: string;
}

const NUM_RE = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i;

export function parseCssNumber(value: string | null | undefined): CssNumber | null {
  if (value == null) return null;
  const m = NUM_RE.exec(String(value).trim());
  if (!m) return null;
  return { num: parseFloat(m[1]), unit: m[2].toLowerCase() };
}

/** 把简单长度换算成 px；百分比、auto、calc 等返回 null */
export function toPx(value: string | null | undefined, remBase = 16, emBase = remBase): number | null {
  const n = parseCssNumber(value);
  if (!n) return null;
  switch (n.unit) {
    case 'px':
      return n.num;
    case '':
      return n.num === 0 ? 0 : null;
    case 'rem':
      return n.num * remBase;
    case 'em':
      return n.num * emBase;
    default:
      return null;
  }
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function formatNumber(n: number, digits = 2): string {
  const r = round(n, digits);
  return Object.is(r, -0) ? '0' : String(r);
}

export function px(n: number): string {
  return `${formatNumber(n)}px`;
}

/** 在有序刻度里找最近的一档 */
export function nearest<T>(items: T[], target: number, get: (t: T) => number): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const d = Math.abs(get(it) - target);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

/** 按方向取刻度里的下一档（用于拖拽和方向键步进） */
export function stepScale<T>(items: T[], current: number, dir: 1 | -1, get: (t: T) => number): T | undefined {
  const sorted = [...items].sort((a, b) => get(a) - get(b));
  if (dir > 0) return sorted.find((it) => get(it) > current + 1e-6) ?? sorted[sorted.length - 1];
  for (let i = sorted.length - 1; i >= 0; i--) if (get(sorted[i]) < current - 1e-6) return sorted[i];
  return sorted[0];
}
