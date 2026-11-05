import { colorDistance, effectiveInterp, gradientAngle, parseColor, parseGradient, sameColor, splitTopLevel, stopPositions, type Gradient, type Rgba } from '@css-tuner/protocol';
import type { TwDesign } from './design';

export type StopRole = 'from' | 'via' | 'to';
/** 色标类：from-* / via-* / to-* 设颜色，from-10% 这类设位置 */
export type GradientRole = StopRole | `${StopRole}-position`;

export interface StopToken {
  role: GradientRole;
  /** 源码里的类名（含变体） */
  text: string;
}

function declOf(body: string, name: string): string | null {
  const m = new RegExp(`(?:^|[\\s;{])${name}\\s*:\\s*([^;]*);`).exec(body);
  return m ? m[1].trim() : null;
}

const bodyOf = (design: TwDesign, candidate: string) => (design.css(candidate) ?? '').split('@property')[0];

/** 只设渐变变量、不直接画背景的类是哪种色标类；bg-linear-* 也设 --tw-gradient-position，但它是方向类 */
export function gradientRole(design: TwDesign, candidate: string): GradientRole | null {
  const body = bodyOf(design, candidate);
  if (!body.includes('--tw-gradient-') || /(?:^|[\s;{])background-image\s*:/.test(body)) return null;
  for (const r of ['from', 'via', 'to'] as const) if (declOf(body, `--tw-gradient-${r}-position`) !== null) return `${r}-position`;
  if (declOf(body, '--tw-gradient-via') !== null) return 'via';
  // v3 的 via-* 不设自己的变量，直接把颜色拼进 --tw-gradient-stops 中间
  const stops = declOf(body, '--tw-gradient-stops');
  if (stops !== null && stops.includes('via-position') && declOf(body, '--tw-gradient-from') === null) return 'via';
  if (declOf(body, '--tw-gradient-from') !== null) return 'from';
  if (declOf(body, '--tw-gradient-to') !== null) return 'to';
  return null;
}

/** 色标类设的颜色，主题变量换成具体值 */
function stopColor(design: TwDesign, candidate: string, role: StopRole): string | null {
  const body = bodyOf(design, candidate);
  let v: string | null;
  if (role === 'via' && declOf(body, '--tw-gradient-via') === null) {
    const stops = declOf(body, '--tw-gradient-stops');
    v = stops ? (splitTopLevel(stops, ',')[1] ?? null) : null;
  } else v = declOf(body, `--tw-gradient-${role}`);
  if (!v) return null;
  return v
    .replace(/var\(\s*--tw-gradient-\w+-position\s*\)/g, '')
    .replace(/var\(\s*(--(?!tw-)[\w-]+)\s*\)/g, (m, name: string) => design.themeValue(name) ?? m)
    .trim();
}

const themeColors = new WeakMap<TwDesign, Array<{ key: string; rgba: Rgba }>>();

/** 主题里和这个颜色一样的颜色名（red-500、brand） */
function themeColorKey(design: TwDesign, color: string): string | null {
  let list = themeColors.get(design);
  if (!list) {
    list = design.namespace('--color').flatMap(([key, v]) => {
      const rgba = key === null ? null : parseColor(v.replace(/var\(\s*(--[\w-]+)\s*\)/g, (m, name: string) => design.themeValue(name) ?? m));
      return rgba && key !== null ? [{ key, rgba }] : [];
    });
    themeColors.set(design, list);
  }
  const c = parseColor(color);
  if (!c) return null;
  let best: string | null = null;
  let bestD = 0.004;
  for (const t of list) {
    const d = colorDistance(c, t.rgba);
    if (d < bestD) {
      best = t.key;
      bestD = d;
    }
  }
  return best;
}

/** 任意值：逗号两边不留空格，其余空格写成下划线 */
export function arbValue(value: string): string {
  return value.trim().replace(/\s*,\s*/g, ',').replace(/_/g, '\\_').replace(/\s+/g, '_');
}

const SIDE_ABBR: Record<string, string> = { top: 't', right: 'r', bottom: 'b', left: 'l' };

/** to right / to top right / 空（默认 to bottom）→ r / tr / b；别的方向返回 null */
function sideAbbr(dir: string): string | null {
  const d = dir.trim().toLowerCase() || 'to bottom';
  const m = /^to\s+(top|right|bottom|left)(?:\s+(top|right|bottom|left))?$/.exec(d);
  if (!m) return null;
  if (!m[2]) return SIDE_ABBR[m[1]];
  const v = [m[1], m[2]].find((s) => s === 'top' || s === 'bottom');
  const h = [m[1], m[2]].find((s) => s === 'left' || s === 'right');
  return v && h ? SIDE_ABBR[v] + SIDE_ABBR[h] : null;
}

/** 方向 / 类型类的候选（不含变体），按优先顺序 */
function directionBases(design: TwDesign, g: Gradient): string[] {
  const interp = g.interp ? ` in ${g.interp}` : '';
  if (design.major < 4) {
    const abbr = g.type === 'linear' && !g.interp ? sideAbbr(g.dir) : null;
    const prelude = (g.dir + interp).trim();
    return [...(abbr ? [`bg-gradient-to-${abbr}`] : []), `bg-[${g.type}-gradient(${prelude ? `${arbValue(prelude)},` : ''}var(--tw-gradient-stops))]`];
  }
  const out: string[] = [];
  // 标准类都带 in oklab，渐变本来就在 OKLab 里插值时才能用
  if (effectiveInterp(g) === 'oklab') {
    if (g.type === 'linear') {
      const abbr = sideAbbr(g.dir);
      const deg = gradientAngle(g);
      if (abbr) out.push(`bg-linear-to-${abbr}`);
      else if (deg !== null && Math.abs(deg - Math.round(deg)) < 1e-6) out.push(`bg-linear-${((Math.round(deg) % 360) + 360) % 360}`);
    } else if (g.type === 'radial' && !g.dir) out.push('bg-radial');
  }
  const prelude = ((g.dir || (g.type === 'linear' ? 'to bottom' : 'ellipse')) + interp).trim();
  out.push(`bg-${g.type}-[${arbValue(prelude)}]`);
  return out;
}

/** 色标颜色类的候选（不含变体） */
function colorBases(design: TwDesign, role: StopRole, color: string): string[] {
  const c = color.trim();
  const out: string[] = [];
  if (parseColor(c)?.a === 0) out.push(`${role}-transparent`);
  if (/^currentcolor$/i.test(c)) out.push(`${role}-current`);
  const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(c);
  if (ref) {
    const theme = /^--color-(.+)$/.exec(ref[1]);
    if (theme && design.major >= 4) out.push(`${role}-${theme[1]}`);
    out.push(design.major >= 4 ? `${role}-(${ref[1]})` : `${role}-[var(${ref[1]})]`);
  }
  const key = themeColorKey(design, c);
  if (key) out.push(`${role}-${key}`);
  out.push(`${role}-[${arbValue(c)}]`);
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 一层渐变写成 Tailwind 工具类：方向 / 类型一个类，加上每个色标的颜色类和不在默认位置时的位置类。
 * 颜色没变的色标沿用元素上原来的类（主题色读回来是 rgb()，重新拼会变成任意值）。
 * 写不成标准类（重复渐变、锥形、超过三个色标、多层）就整个写成 bg-[…]；make 给类名加上变体并规范化
 */
export function gradientClasses(design: TwDesign, value: string, existing: StopToken[], make: (base: string) => string): string[] | null {
  const v = value.trim();
  const image = (cand: string) => !!design.info(cand)?.hard.has('background-image');
  if (v === 'none') return [make('bg-none')];
  const g = parseGradient(v);
  if (g && !g.repeating && g.type !== 'conic' && g.stops.length <= 3) {
    const out: string[] = [];
    const dir = directionBases(design, g).map(make).find(image);
    if (dir) {
      out.push(dir);
      const roles: StopRole[] = g.stops.length === 3 ? ['from', 'via', 'to'] : ['from', 'to'];
      const pos = stopPositions(g.stops);
      // v4 的位置变量注册了初始值 0% / 50% / 100%；v3 没写位置就是 CSS 的自动位置，via 落在两头中间
      const defaults = design.major >= 4 ? [0, 50, 100] : [0, (pos[0] + pos[pos.length - 1]) / 2, 100];
      const ok = roles.every((role, i) => {
        const color = g.stops[i].color;
        const kept = existing.find((e) => e.role === role && sameColorOf(design, e.text, role, color));
        const cls = kept?.text ?? colorBases(design, role, color).map(make).find((c) => gradientRole(design, c) === role);
        if (!cls) return false;
        out.push(cls);
        const def = role === 'from' ? defaults[0] : role === 'to' ? defaults[2] : defaults[1];
        if (Math.abs(pos[i] - def) < 0.005) return true;
        const p = make(`${role}-[${round2(pos[i])}%]`);
        if (gradientRole(design, p) !== `${role}-position`) return false;
        out.push(p);
        return true;
      });
      if (ok) return out;
    }
  }
  const arbitrary = [`bg-[${arbValue(v)}]`, `bg-[image:${arbValue(v)}]`].map(make).find((c) => image(c) && !design.info(c)!.hard.has('background-color'));
  return arbitrary ? [arbitrary] : null;
}

function sameColorOf(design: TwDesign, text: string, role: StopRole, color: string): boolean {
  const mine = stopColor(design, text, role);
  if (mine === null) return false;
  const a = parseColor(mine);
  const b = parseColor(color);
  if (a && b) return (a.a === 0 && b.a === 0) || sameColor(mine, color);
  return mine.replace(/\s+/g, '') === color.replace(/\s+/g, '');
}
