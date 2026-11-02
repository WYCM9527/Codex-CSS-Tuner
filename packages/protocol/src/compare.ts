import { parseColor, sameColor } from './color';
import { propMeta } from './props';
import { toPx } from './values';

/** 两个计算值是否视为相同：颜色按感知距离、长度允许 ±0.5px、纯数字允许 0.01 误差 */
export function sameValue(prop: string, a: string, b: string): boolean {
  if (a === b) return true;
  const kind = propMeta(prop)?.kind;
  if (kind === 'color' || (parseColor(a) && parseColor(b))) return sameColor(a, b);
  const pa = toPx(a);
  const pb = toPx(b);
  if (pa != null && pb != null) return Math.abs(pa - pb) <= 0.5;
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(na) === a.trim() && String(nb) === b.trim()) return Math.abs(na - nb) < 0.01;
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
}
