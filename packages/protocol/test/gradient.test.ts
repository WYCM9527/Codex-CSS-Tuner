import { describe, expect, it } from 'vitest';
import {
  angleDir,
  backgroundLayers,
  colorAt,
  effectiveInterp,
  formatGradient,
  gradientAngle,
  parseGradient,
  sameBackgroundImage,
  sameValue,
  solidColorOf,
  stopPositions,
  strokeLayers,
} from '../src';

describe('渐变解析和生成', () => {
  it('读浏览器的计算值：默认方向省掉、插值写在方向后面', () => {
    expect(parseGradient('linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))')).toEqual({
      type: 'linear',
      repeating: false,
      dir: '',
      interp: '',
      stops: [
        { color: 'rgb(255, 0, 0)', pos: null },
        { color: 'rgb(0, 0, 255)', pos: null },
      ],
    });
    const g = parseGradient('linear-gradient(to right in oklab, oklch(0.637 0.237 25.331) 0%, rgb(59, 130, 246) 100%)')!;
    expect([g.dir, g.interp, g.stops.map((s) => s.pos)]).toEqual(['to right', 'oklab', [0, 100]]);
    const r = parseGradient('radial-gradient(circle at 25% 25% in oklab, rgb(255, 0, 0), rgb(0, 0, 255))')!;
    expect([r.type, r.dir, r.interp]).toEqual(['radial', 'circle at 25% 25%', 'oklab']);
    expect(parseGradient('linear-gradient(in oklab, red, blue)')).toMatchObject({ dir: '', interp: 'oklab' });
    expect(parseGradient('linear-gradient(90deg in oklch longer hue, red, blue)')).toMatchObject({ dir: '90deg', interp: 'oklch longer hue' });
  });

  it('色标颜色可以是变量、颜色函数和颜色名；一个色标两个位置拆成两个', () => {
    const g = parseGradient('linear-gradient(45deg, var(--brand) 0%, rgb(255 0 0 / 0.5) 40%, tomato)')!;
    expect(g.stops.map((s) => s.color)).toEqual(['var(--brand)', 'rgb(255 0 0 / 0.5)', 'tomato']);
    expect(parseGradient('linear-gradient(red 0% 50%, blue 50%)')!.stops).toEqual([
      { color: 'red', pos: 0 },
      { color: 'red', pos: 50 },
      { color: 'blue', pos: 50 },
    ]);
  });

  it('面板编辑不了的写法返回 null：插值提示、px 位置、只有一个色标、不是渐变', () => {
    expect(parseGradient('linear-gradient(rgb(255, 0, 0), 30%, rgb(0, 0, 255))')).toBeNull();
    expect(parseGradient('linear-gradient(rgb(255, 0, 0) 10px, rgb(0, 0, 255))')).toBeNull();
    expect(parseGradient('linear-gradient(red)')).toBeNull();
    expect(parseGradient('url("a.png")')).toBeNull();
  });

  it('生成：方向和插值在前，色标带位置', () => {
    const g = parseGradient('linear-gradient(to right in oklab, #f00 0%, #00f 100%)')!;
    expect(formatGradient(g)).toBe('linear-gradient(to right in oklab, #f00 0%, #00f 100%)');
    expect(formatGradient({ ...g, type: 'radial', dir: '', interp: '' })).toBe('radial-gradient(#f00 0%, #00f 100%)');
    expect(formatGradient({ ...g, stops: [{ color: 'red', pos: 12.345 }, { color: 'blue', pos: null }] })).toBe('linear-gradient(to right in oklab, red 12.35%, blue)');
  });

  it('背景图按顶层逗号分层', () => {
    expect(backgroundLayers('none')).toEqual([]);
    expect(backgroundLayers('linear-gradient(#fff, #fff), linear-gradient(90deg, red, blue)')).toEqual(['linear-gradient(#fff, #fff)', 'linear-gradient(90deg, red, blue)']);
  });
});

describe('色标位置、方向和插值', () => {
  it('没写的位置按 CSS 规则补齐', () => {
    const s = (...ps: Array<number | null>) => ps.map((pos) => ({ color: 'red', pos }));
    expect(stopPositions(s(null, null, null))).toEqual([0, 50, 100]);
    expect(stopPositions(s(null, 20, null, null))).toEqual([0, 20, 60, 100]);
    expect(stopPositions(s(50, 10))).toEqual([50, 50]);
  });

  it('方向换算成角度，正对上下左右的角度写回 to 方向', () => {
    const a = (dir: string) => gradientAngle({ type: 'linear', dir });
    expect([a(''), a('to right'), a('to right top'), a('to bottom left'), a('0.25turn'), a('-45deg')]).toEqual([180, 90, 45, 225, 90, -45]);
    expect(gradientAngle({ type: 'radial', dir: '' })).toBeNull();
    expect([angleDir(90), angleDir(45), angleDir(-90), angleDir(360), angleDir(180.4)]).toEqual(['to right', '45deg', 'to left', 'to top', 'to bottom']);
  });

  it('没写插值时按颜色写法取浏览器的默认值', () => {
    const g = (interp: string, ...colors: string[]) => ({ interp, stops: colors.map((color) => ({ color, pos: null })) });
    expect(effectiveInterp(g('', '#f00', 'rgb(0, 0, 255)', 'transparent'))).toBe('srgb');
    expect(effectiveInterp(g('', '#f00', 'oklch(0.6 0.2 250)'))).toBe('oklab');
    expect(effectiveInterp(g('oklch shorter hue', '#f00', '#00f'))).toBe('oklch');
  });

  it('取渐变中间的颜色（加色标用）', () => {
    expect(colorAt(parseGradient('linear-gradient(#ff0000 0%, #0000ff 100%)')!, 50)).toBe('#800080');
    expect(colorAt(parseGradient('linear-gradient(#ff0000 20%, #0000ff 80%)')!, 10)).toBe('#ff0000');
    // 过渡到透明：颜色不变、透明度减半（浏览器按预乘透明度插值，不会发黑）
    expect(colorAt(parseGradient('linear-gradient(#3b5bdb, transparent)')!, 50)).toBe('#3b5bdb80');
    expect(colorAt(parseGradient('linear-gradient(to right in oklab, #3b5bdb, transparent)')!, 50)).toBe('#3b5bdb80');
  });
});

describe('渐变按画出来的样子比较', () => {
  it('Tailwind 4：预览带 in oklab，读回的计算值里 oklch 颜色的默认插值被省掉', () => {
    const preview = 'linear-gradient(to right in oklab, oklch(63.7% 0.237 25.331) 0%, oklch(62.3% 0.214 259.815) 100%)';
    expect(sameValue('background-image', preview, 'linear-gradient(to right, oklch(0.637 0.237 25.331) 0%, oklch(0.623 0.214 259.815) 100%)')).toBe(true);
    // 十六进制颜色默认在 sRGB 里插值，in oklab 不能省
    expect(sameBackgroundImage('linear-gradient(to right in oklab, rgb(255, 0, 0), rgb(0, 0, 255))', 'linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))')).toBe(false);
    expect(sameBackgroundImage('linear-gradient(90deg in srgb, red, blue)', 'linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))')).toBe(true);
  });

  it('Tailwind 3：色标不带位置，和写了 0% / 100% 一样', () => {
    expect(sameBackgroundImage('linear-gradient(to right, #ef4444 0%, #3b82f6 100%)', 'linear-gradient(to right, rgb(239, 68, 68), rgb(59, 130, 246))')).toBe(true);
    // from-red-500 单独用时终点是透明的红色，和 transparent 画出来一样
    expect(sameBackgroundImage('linear-gradient(to right, #ef4444 0%, transparent 100%)', 'linear-gradient(to right, rgb(239, 68, 68), rgba(239, 68, 68, 0))')).toBe(true);
  });

  it('方向：度数、to 方向、默认值等价；角落方向不分先后，但和 45deg 不同', () => {
    expect(sameBackgroundImage('linear-gradient(90deg, red, blue)', 'linear-gradient(to right, red, blue)')).toBe(true);
    expect(sameBackgroundImage('linear-gradient(180deg, red, blue)', 'linear-gradient(red, blue)')).toBe(true);
    expect(sameBackgroundImage('linear-gradient(to top right, red, blue)', 'linear-gradient(to right top, red, blue)')).toBe(true);
    expect(sameBackgroundImage('linear-gradient(45deg, red, blue)', 'linear-gradient(to right top, red, blue)')).toBe(false);
    expect(sameBackgroundImage('radial-gradient(ellipse farthest-corner at 50% 50%, red, blue)', 'radial-gradient(rgb(255, 0, 0), rgb(0, 0, 255))')).toBe(true);
    expect(sameBackgroundImage('radial-gradient(circle at center, red, blue)', 'radial-gradient(circle, red, blue)')).toBe(true);
  });

  it('多层、none 和编辑不了的写法', () => {
    expect(
      sameBackgroundImage(
        'linear-gradient(#fff, #fff), linear-gradient(90deg, red 0%, blue 100%)',
        'linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255)), linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      ),
    ).toBe(true);
    expect(sameBackgroundImage('none', 'none')).toBe(true);
    expect(sameBackgroundImage('none', 'linear-gradient(red, blue)')).toBe(false);
    expect(sameBackgroundImage('linear-gradient(red 10px, blue)', 'linear-gradient(red  10px, blue)')).toBe(true);
  });
});

describe('两层背景叠出的渐变描边', () => {
  const image = 'linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255)), linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))';
  it('上层裁到内边距、下层铺到边框才算', () => {
    expect(strokeLayers(image, 'padding-box, border-box')).toEqual({
      fill: 'linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255))',
      stroke: 'linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))',
    });
    expect(strokeLayers(image, 'border-box, border-box')).toBeNull();
    expect(strokeLayers('linear-gradient(90deg, red, blue)', 'padding-box, border-box')).toBeNull();
  });

  it('色标全同色的一层就是纯色', () => {
    expect(solidColorOf('linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255))')).toBe('rgb(255, 255, 255)');
    expect(solidColorOf('linear-gradient(90deg, red, blue)')).toBeNull();
  });
});
