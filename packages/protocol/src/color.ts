/** sRGB 通道 0..1（可能超出色域），alpha 0..1 */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Hsva {
  h: number;
  s: number;
  v: number;
  a: number;
}

const NAMED: Record<string, string> = {
  transparent: '#0000',
  black: '#000',
  white: '#fff',
  red: '#f00',
  green: '#008000',
  blue: '#00f',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  yellow: '#ff0',
  orange: '#ffa500',
  purple: '#800080',
  navy: '#000080',
  teal: '#008080',
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function toLinear(c: number): number {
  const s = Math.sign(c) || 1;
  const x = Math.abs(c);
  return x <= 0.04045 ? c / 12.92 : s * ((x + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number): number {
  const s = Math.sign(c) || 1;
  const x = Math.abs(c);
  return x <= 0.0031308 ? c * 12.92 : s * (1.055 * x ** (1 / 2.4) - 0.055);
}

export function oklabToRgb(L: number, a: number, b: number, alpha = 1): Rgba {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  };
}

export function rgbToOklab(c: Rgba): [number, number, number] {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function p3ToRgb(r: number, g: number, b: number, a: number): Rgba {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const x = 0.4865709486482162 * lr + 0.26566769316909306 * lg + 0.1982172852343625 * lb;
  const y = 0.2289745640697488 * lr + 0.6917385218365064 * lg + 0.079286914093745 * lb;
  const z = 0.04511338185890264 * lg + 1.043944368900976 * lb;
  return {
    r: fromLinear(3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z),
    g: fromLinear(-0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z),
    b: fromLinear(0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z),
    a,
  };
}

function parseHex(hex: string): Rgba | null {
  const h = hex.slice(1);
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  const expand = h.length <= 4 ? h.split('').map((c) => c + c).join('') : h;
  if (expand.length !== 6 && expand.length !== 8) return null;
  const n = (i: number) => parseInt(expand.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: expand.length === 8 ? n(6) : 1 };
}

function splitArgs(body: string, legacyAlpha: boolean): { parts: string[]; alpha: string | null } {
  const [main, alpha] = body.split('/');
  const parts = main.replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (legacyAlpha && alpha === undefined && parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts, alpha: alpha === undefined ? null : alpha.trim() };
}

function num(s: string, percentScale = 1): number {
  if (s === 'none') return 0;
  if (s.endsWith('%')) return (parseFloat(s) / 100) * percentScale;
  return parseFloat(s);
}

function hue(s: string): number {
  if (s === 'none') return 0;
  const v = parseFloat(s);
  if (s.endsWith('rad')) return (v * 180) / Math.PI;
  if (s.endsWith('grad')) return v * 0.9;
  if (s.endsWith('turn')) return v * 360;
  return v;
}

function alphaOf(s: string | null): number {
  if (s == null) return 1;
  return clamp01(num(s, 1));
}

function hslToRgb(h: number, s: number, l: number, a: number): Rgba {
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4), a };
}

export function parseColor(input: string | null | undefined): Rgba | null {
  if (!input) return null;
  const str = input.trim().toLowerCase();
  if (NAMED[str]) return parseHex(NAMED[str]);
  if (str.startsWith('#')) return parseHex(str);
  const m = /^([a-z-]+)\((.*)\)$/.exec(str);
  if (!m) return null;
  const fn = m[1];
  const { parts, alpha } = splitArgs(m[2], fn === 'rgb' || fn === 'rgba' || fn === 'hsl' || fn === 'hsla');
  const a = alphaOf(alpha);
  if (fn === 'rgb' || fn === 'rgba') {
    if (parts.length < 3) return null;
    return { r: num(parts[0], 255) / 255, g: num(parts[1], 255) / 255, b: num(parts[2], 255) / 255, a };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    if (parts.length < 3) return null;
    return hslToRgb(hue(parts[0]), num(parts[1], 100) / 100, num(parts[2], 100) / 100, a);
  }
  if (fn === 'oklch') {
    if (parts.length < 3) return null;
    const L = num(parts[0], 1);
    const C = num(parts[1], 0.4);
    const H = (hue(parts[2]) * Math.PI) / 180;
    return oklabToRgb(L, C * Math.cos(H), C * Math.sin(H), a);
  }
  if (fn === 'oklab') {
    if (parts.length < 3) return null;
    return oklabToRgb(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 0.4), a);
  }
  if (fn === 'color') {
    const [space, r, g, b] = parts;
    if (b === undefined) return null;
    const rgb = [num(r, 1), num(g, 1), num(b, 1)];
    if (space === 'srgb') return { r: rgb[0], g: rgb[1], b: rgb[2], a };
    if (space === 'srgb-linear') return { r: fromLinear(rgb[0]), g: fromLinear(rgb[1]), b: fromLinear(rgb[2]), a };
    if (space === 'display-p3') return p3ToRgb(rgb[0], rgb[1], rgb[2], a);
    return null;
  }
  return null;
}

const hex2 = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0');

export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a >= 0.999 ? base : base + hex2(c.a);
}

export function rgbToHsv(c: Rgba): Hsva {
  const r = clamp01(c.r);
  const g = clamp01(c.g);
  const b = clamp01(c.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max, a: c.a };
}

export function hsvToRgb(c: Hsva): Rgba {
  const f = (n: number) => {
    const k = (n + c.h / 60) % 6;
    return c.v - c.v * c.s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5), g: f(3), b: f(1), a: c.a };
}

/** OKLab 空间里的欧氏距离，叠加 alpha 差；< 0.005 可视为同一颜色 */
export function colorDistance(a: Rgba, b: Rgba): number {
  const [l1, a1, b1] = rgbToOklab(a);
  const [l2, a2, b2] = rgbToOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) + Math.abs(a.a - b.a);
}

export function sameColor(a: string, b: string, tolerance = 0.004): boolean {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a.trim() === b.trim();
  return colorDistance(ca, cb) < tolerance;
}
