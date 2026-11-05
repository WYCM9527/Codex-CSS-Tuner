import { oklabToRgb, parseColor, rgbToOklab, sameColor, toHex } from './color';
import { splitTopLevel } from './selectors';

export type GradientType = 'linear' | 'radial' | 'conic';

export interface GradientStop {
  color: string;
  /** 位置（%）；没写是 null，按 CSS 的规则在前后两个有位置的色标之间均分 */
  pos: number | null;
}

export interface Gradient {
  type: GradientType;
  repeating: boolean;
  /** 方向、形状和位置（不含插值）：线性是 to right、90deg，空串是默认的向下；径向是 circle at 25% 25%，空串是默认的椭圆居中 */
  dir: string;
  /** in 后面的插值色彩空间（oklab、oklch longer hue），没写是空串 */
  interp: string;
  stops: GradientStop[];
}

const FN = /^(repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/i;
const PRELUDE_WORD = /^(to|in|at|from|circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner)$/i;
const ANGLE = /^(-?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)$/i;
const COLOR_FN = /^(?:var|color-mix|light-dark|rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const PCT = /^(-?(?:\d+\.?\d*|\.\d+))%$/;
const SIDE_ANGLE: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 };

/** 两层背景描边里内外两层的裁剪范围（内层是填充，外层是描边渐变） */
export const STROKE_CLIP = 'padding-box, border-box';
export const STROKE_ORIGIN = 'border-box';

/** 背景图的各层（按顶层逗号分开），none 是空数组 */
export function backgroundLayers(value: string): string[] {
  const v = value.trim();
  if (!v || v === 'none') return [];
  return splitTopLevel(v, ',').map((s) => s.trim()).filter(Boolean);
}

export function isGradient(value: string): boolean {
  return /^(repeating-)?(linear|radial|conic)-gradient\(/i.test(value.trim());
}

function isColorToken(tok: string): boolean {
  if (COLOR_FN.test(tok) || tok.startsWith('#') || parseColor(tok)) return true;
  return /^[a-z]+$/i.test(tok) && !PRELUDE_WORD.test(tok);
}

/** 色标位置：只认百分比和 0，其余（px、calc）面板编辑不了 */
function pctOf(tok: string): number | null {
  if (tok === '0' || tok === '0px') return 0;
  const m = PCT.exec(tok);
  return m ? parseFloat(m[1]) : null;
}

const words = (s: string) => splitTopLevel(s.replace(/\s+/g, ' ').trim(), ' ').filter(Boolean);

/**
 * 解析一层渐变；有面板编辑不了的写法（插值提示、非百分比的位置、不到两个色标）时返回 null。
 * 一个色标写两个位置（red 0% 50%）拆成两个同色的色标
 */
export function parseGradient(layer: string): Gradient | null {
  const m = FN.exec(layer.trim());
  if (!m) return null;
  const args = splitTopLevel(m[3], ',').map((s) => s.replace(/\s+/g, ' ').trim());
  if (!args.length) return null;
  let dir = '';
  let interp = '';
  const first = words(args[0]);
  if (first.length && !isColorToken(first[0])) {
    const pre = args.shift()!;
    const im = /(?:^|\s)in\s+([a-z-]+(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?)/i.exec(pre);
    if (im) interp = im[1].toLowerCase();
    dir = (im ? pre.replace(im[0], ' ') : pre).replace(/\s+/g, ' ').trim();
  }
  const stops: GradientStop[] = [];
  for (const arg of args) {
    const w = words(arg);
    if (!w.length || w.length > 3 || !isColorToken(w[0])) return null;
    const pos = w.slice(1).map(pctOf);
    if (pos.some((p) => p === null)) return null;
    if (!pos.length) stops.push({ color: w[0], pos: null });
    for (const p of pos) stops.push({ color: w[0], pos: p });
  }
  if (stops.length < 2) return null;
  return { type: m[2].toLowerCase() as GradientType, repeating: !!m[1], dir, interp, stops };
}

const fmt = (n: number) => `${Math.round(n * 100) / 100}%`;

export function formatGradient(g: Gradient): string {
  const pre = [g.dir.trim(), g.interp ? `in ${g.interp}` : ''].filter(Boolean).join(' ');
  const stops = g.stops.map((s) => (s.pos === null ? s.color : `${s.color} ${fmt(s.pos)}`));
  return `${g.repeating ? 'repeating-' : ''}${g.type}-gradient(${[pre, ...stops].filter(Boolean).join(', ')})`;
}

/**
 * 每个色标实际的位置（%）：第一个没写算 0，最后一个没写算 100，比前面小的拉平到前面最大的，
 * 中间没写的在前后两个有位置的色标之间均分
 */
export function stopPositions(stops: GradientStop[]): number[] {
  const n = stops.length;
  const out: Array<number | null> = stops.map((s) => s.pos);
  if (!n) return [];
  if (out[0] === null) out[0] = 0;
  if (out[n - 1] === null) out[n - 1] = 100;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = out[i];
    if (p === null) continue;
    if (p < max) out[i] = max;
    else max = p;
  }
  for (let i = 1; i < n; i++) {
    if (out[i] !== null) continue;
    let j = i;
    while (out[j] === null) j++;
    const a = out[i - 1]!;
    const b = out[j]!;
    for (let k = i; k < j; k++) out[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  return out as number[];
}

const toDeg = (n: number, unit: string) => {
  const u = unit.toLowerCase();
  return u === 'turn' ? n * 360 : u === 'rad' ? (n * 180) / Math.PI : u === 'grad' ? n * 0.9 : n;
};

/** 线性渐变的角度（度，0 朝上、顺时针）：默认向下是 180，to right 是 90；角落方向（to top right）按 45° 的倍数算 */
export function gradientAngle(g: Pick<Gradient, 'type' | 'dir'>): number | null {
  if (g.type !== 'linear') return null;
  const d = g.dir.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!d) return 180;
  const a = ANGLE.exec(d);
  if (a) return toDeg(parseFloat(a[1]), a[2]);
  const m = /^to ([a-z]+)(?: ([a-z]+))?$/.exec(d);
  if (!m) return null;
  if (!m[2]) return SIDE_ANGLE[m[1]] ?? null;
  const set = new Set([m[1], m[2]]);
  if (set.has('top') && set.has('right')) return 45;
  if (set.has('right') && set.has('bottom')) return 135;
  if (set.has('bottom') && set.has('left')) return 225;
  if (set.has('left') && set.has('top')) return 315;
  return null;
}

/** 按角度写方向：正好朝上下左右时写成 to right 这种（Tailwind 有对应的类），其余写度数 */
export function angleDir(deg: number): string {
  const n = ((Math.round(deg) % 360) + 360) % 360;
  return ({ 0: 'to top', 90: 'to right', 180: 'to bottom', 270: 'to left' } as Record<number, string>)[n] ?? `${n}deg`;
}

/** 比较用的方向：角度取 0~360，角落方向不分先后，径向、锥形去掉默认的形状和位置 */
function dirKey(g: Gradient): string {
  const d = g.dir.trim().toLowerCase().replace(/\s+/g, ' ');
  if (g.type === 'linear') {
    const corner = /^to ([a-z]+) ([a-z]+)$/.exec(d);
    if (corner) return `to ${[corner[1], corner[2]].sort().join(' ')}`;
    const a = gradientAngle(g);
    return a === null ? d : String((((Math.round(a * 1000) / 1000) % 360) + 360) % 360);
  }
  const defaults = g.type === 'radial' ? /(^|\s)(ellipse|farthest-corner|at center( center)?|at 50% 50%)(?=\s|$)/g : /(^|\s)(from 0deg|at center( center)?|at 50% 50%)(?=\s|$)/g;
  return d.replace(defaults, ' ').replace(/\s+/g, ' ').trim();
}

/** 旧式写法的 sRGB 颜色（十六进制、颜色名、rgb()、hsl()）；变量当作这种 */
export function isLegacyColor(c: string): boolean {
  const v = c.trim();
  return /^(?:#|rgba?\(|hsla?\(|hwb\(|var\()/i.test(v) || /^[a-z]+$/i.test(v);
}

/** 色标里有 oklch() 这类新写法的颜色时浏览器默认在 oklab 里插值，全是旧式写法时在 sRGB 里插值 */
export function defaultInterp(stops: GradientStop[]): string {
  return stops.every((s) => isLegacyColor(s.color)) ? 'srgb' : 'oklab';
}

/** 实际的插值色彩空间：没写时按色标的写法取默认值（浏览器读回的计算值里，等于默认值的 in … 会省掉） */
export function effectiveInterp(g: Pick<Gradient, 'interp' | 'stops'>): string {
  if (!g.interp) return defaultInterp(g.stops);
  return g.interp.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ shorter hue$/, '');
}

/** 全透明的色标不管是什么颜色画出来都一样：浏览器按预乘透明度插值 */
function sameStopColor(a: string, b: string): boolean {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (ca && cb) return (ca.a === 0 && cb.a === 0) || sameColor(a, b);
  return a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
}

export function sameGradient(a: Gradient, b: Gradient): boolean {
  if (a.type !== b.type || a.repeating !== b.repeating || a.stops.length !== b.stops.length) return false;
  if (dirKey(a) !== dirKey(b) || effectiveInterp(a) !== effectiveInterp(b)) return false;
  const pa = stopPositions(a.stops);
  const pb = stopPositions(b.stops);
  return a.stops.every((s, i) => Math.abs(pa[i] - pb[i]) <= 0.5 && sameStopColor(s.color, b.stops[i].color));
}

/** 两个 background-image 是否画出来一样：渐变按方向、插值、色标比，其余按文字比 */
export function sameBackgroundImage(a: string, b: string): boolean {
  const la = backgroundLayers(a);
  const lb = backgroundLayers(b);
  if (la.length !== lb.length) return false;
  return la.every((x, i) => {
    const ga = parseGradient(x);
    const gb = parseGradient(lb[i]);
    if (ga && gb) return sameGradient(ga, gb);
    return x.replace(/\s+/g, ' ') === lb[i].replace(/\s+/g, ' ');
  });
}

/** 两个颜色之间 t（0~1）处的颜色：在 oklab 或 sRGB 里插值，输出十六进制 */
export function mixColors(a: string, b: string, t: number, space: string): string | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  // 浏览器按预乘透明度插值：和全透明的颜色混合只降透明度，不会混进黑色
  const wa = ca.a * (1 - t);
  const wb = cb.a * t;
  const alpha = wa + wb;
  if (alpha <= 0) return toHex({ ...ca, a: 0 });
  const mix = (x: number, y: number) => (x * wa + y * wb) / alpha;
  if (space === 'oklab') {
    const [l1, a1, b1] = rgbToOklab(ca);
    const [l2, a2, b2] = rgbToOklab(cb);
    return toHex(oklabToRgb(mix(l1, l2), mix(a1, a2), mix(b1, b2), alpha));
  }
  return toHex({ r: mix(ca.r, cb.r), g: mix(ca.g, cb.g), b: mix(ca.b, cb.b), a: alpha });
}

/** 渐变在 pos（%）处的颜色，加色标时用 */
export function colorAt(g: Gradient, pos: number): string | null {
  const ps = stopPositions(g.stops);
  if (pos <= ps[0]) return g.stops[0].color;
  for (let i = 1; i < ps.length; i++) {
    if (pos > ps[i]) continue;
    const span = ps[i] - ps[i - 1];
    return mixColors(g.stops[i - 1].color, g.stops[i].color, span ? (pos - ps[i - 1]) / span : 0, effectiveInterp(g));
  }
  return g.stops[g.stops.length - 1].color;
}

/** 一块纯色写成一层渐变：两层背景描边里垫在描边渐变上面、裁到内边距的那层 */
export const solidLayer = (color: string) => `linear-gradient(${color}, ${color})`;

/** 一层线性渐变的色标全是同一个颜色：画出来就是一块纯色，返回这个颜色 */
export function solidColorOf(layer: string): string | null {
  const g = parseGradient(layer);
  if (!g || g.type !== 'linear' || g.repeating) return null;
  const c = g.stops[0].color;
  return g.stops.every((s) => sameStopColor(s.color, c)) ? c : null;
}

/**
 * 两层背景叠出来的渐变描边：上层是填充（纯色层或填充渐变）裁到内边距，下层是描边渐变铺到边框；
 * clip 是 background-clip 的计算值，层数不够时浏览器按顺序重复
 */
export function strokeLayers(image: string, clip: string): { fill: string; stroke: string } | null {
  const layers = backgroundLayers(image);
  if (layers.length !== 2 || !parseGradient(layers[1])) return null;
  const clips = splitTopLevel(clip, ',').map((s) => s.trim());
  if (!clips.length) return null;
  const clipOf = (i: number) => clips[i % clips.length];
  return clipOf(0) === 'padding-box' && clipOf(1) === 'border-box' ? { fill: layers[0], stroke: layers[1] } : null;
}
