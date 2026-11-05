import { backgroundLayers, effectiveInterp, mixColors, parseColor, parseGradient, solidLayer, toHex, type Gradient } from '@css-tuner/protocol';

export type PaintKind = 'solid' | 'linear' | 'radial';

/** 字段上显示的颜料：纯色、一层面板能改的渐变，或者面板改不了的背景图（图片、多层、锥形渐变） */
export type Paint = { kind: 'solid'; color: string } | { kind: 'gradient'; gradient: Gradient } | { kind: 'complex'; image: string };

export const kindOf = (p: Paint): PaintKind | null => (p.kind === 'solid' ? 'solid' : p.kind === 'gradient' ? (p.gradient.type === 'radial' ? 'radial' : 'linear') : null);

/** 背景图是一层面板能改的渐变（线性、径向，可以是重复的） */
export function editableGradient(image: string): Gradient | null {
  const layers = backgroundLayers(image);
  if (layers.length !== 1) return null;
  const g = parseGradient(layers[0]);
  return g && g.type !== 'conic' ? g : null;
}

export const isOpaque = (color: string) => (parseColor(color)?.a ?? 0) >= 0.999;

export function opaqueGradient(g: Gradient): boolean {
  return g.stops.every((s) => isOpaque(s.color));
}

/**
 * 改过的渐变保持原来的插值：没写插值时浏览器按色标的写法取默认值（十六进制是 sRGB、oklch 是 OKLab），
 * 换了色标的写法就把原来的插值写明，画出来不会跟着变
 */
export function pinInterp(prev: Gradient, next: Gradient): Gradient {
  if (next.interp || effectiveInterp(next) === effectiveInterp(prev)) return next;
  return { ...next, interp: effectiveInterp(prev) };
}

/**
 * 新建渐变：从当前颜色过渡到全透明（Figma 的默认样子）。
 * opaque：两层背景叠描边时填充层不能透明，不然描边的渐变会从里面透出来，就过渡到浅一点的同色
 */
export function newGradient(type: 'linear' | 'radial', color: string, interp: string, opaque = false): Gradient {
  const c = parseColor(color);
  const from = c && c.a > 0 ? toHex({ ...c, a: 1 }) : '#000000';
  const to = opaque ? (mixColors(from, '#ffffff', 0.6, 'oklab') ?? '#ffffff') : 'transparent';
  return { type, repeating: false, dir: type === 'linear' ? 'to right' : '', interp, stops: [{ color: from, pos: 0 }, { color: to, pos: 100 }] };
}

/** 换回纯色时用的颜色：渐变里第一个看得见的颜色，全透明就是白色 */
export function firstVisible(g: Gradient): string {
  return g.stops.find((s) => (parseColor(s.color)?.a ?? 1) > 0)?.color ?? '#ffffff';
}

/** 两层背景里的填充层：纯色写成同色渐变（背景图里只能放渐变或图片） */
export function fillLayer(color: string): string {
  const c = parseColor(color);
  return solidLayer(c && c.a >= 0.999 ? toHex(c) : color);
}
