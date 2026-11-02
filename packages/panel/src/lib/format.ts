import { formatNumber, parseColor, toHex, type ElementSnapshot, type SelectionView } from '@css-tuner/protocol';
import { valuePx, type Ctx } from './scale';

/** 字段当前值：有未应用的改动用改动值，否则用计算样式 */
export function currentValue(sel: SelectionView, prop: string): string {
  return sel.pending[prop] ?? sel.el.computed[prop] ?? '';
}

export function isPending(sel: SelectionView, props: string[]): boolean {
  return props.some((p) => p in sel.pending);
}

export function displayNumber(value: string, ctx: Ctx, prop?: string): string {
  const px = valuePx(value, ctx, prop);
  if (px === null) return value;
  return formatNumber(px, Math.abs(px) < 10 && px % 1 !== 0 ? 2 : 1);
}

/** 源码里写的是 var(--x) 时返回变量名，用来在字段旁边显示令牌 */
export function declaredVar(el: ElementSnapshot, prop: string): string | null {
  const w = el.winners[prop];
  if (!w || w.origin !== 'rule' || w.rule?.utility) return null;
  const m = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(w.value.trim());
  return m ? m[1] : null;
}

export function colorHex(value: string): string | null {
  const c = parseColor(value);
  return c ? toHex(c) : null;
}

/** `var(--x)` / `var(--x, 回退值)` → `--x` */
export function varName(value: string): string | null {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(value.trim());
  return m ? m[1] : null;
}

/** 改动清单里的值：颜色用十六进制，变量只显示名字 */
export function displayValue(value: string): string {
  const v = varName(value);
  if (v) return v;
  const c = parseColor(value);
  if (c) return c.a === 0 ? 'transparent' : toHex(c);
  return value;
}

export function shortFile(file: string | null | undefined): string {
  if (!file) return '';
  const parts = file.split(/[\\/]/);
  return parts.slice(-2).join('/');
}

export function plural(n: number, unit: string): string {
  return `${n} ${unit}`;
}
