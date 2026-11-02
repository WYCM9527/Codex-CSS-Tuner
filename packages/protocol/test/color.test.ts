import { describe, expect, it } from 'vitest';
import { parseColor, toHex, rgbToHsv, hsvToRgb, sameColor, toPx, parseCssNumber, stepScale, groupLabel } from '../src';

describe('parseColor', () => {
  it('解析十六进制和 rgb', () => {
    expect(toHex(parseColor('#3b5bdb')!)).toBe('#3b5bdb');
    expect(toHex(parseColor('#fff')!)).toBe('#ffffff');
    expect(toHex(parseColor('rgb(59, 91, 219)')!)).toBe('#3b5bdb');
    expect(toHex(parseColor('rgba(0, 0, 0, 0.5)')!)).toBe('#00000080');
    expect(toHex(parseColor('rgb(0 0 0 / 50%)')!)).toBe('#00000080');
    expect(parseColor('transparent')!.a).toBe(0);
  });

  it('解析 oklch（Tailwind 4 默认调色板）', () => {
    // Tailwind 4 red-500 = oklch(63.7% 0.237 25.331) ≈ #fb2c36
    const c = parseColor('oklch(63.7% 0.237 25.331)')!;
    expect(sameColor(toHex(c), '#fb2c36', 0.01)).toBe(true);
  });

  it('解析 hsl 与 color(display-p3)', () => {
    expect(toHex(parseColor('hsl(0 100% 50%)')!)).toBe('#ff0000');
    expect(toHex(parseColor('color(display-p3 1 1 1)')!)).toBe('#ffffff');
  });

  it('HSV 往返', () => {
    const c = parseColor('#e8590c')!;
    expect(toHex(hsvToRgb(rgbToHsv(c)))).toBe('#e8590c');
  });
});

describe('values', () => {
  it('长度换算', () => {
    expect(toPx('16px')).toBe(16);
    expect(toPx('1.5rem')).toBe(24);
    expect(toPx('0')).toBe(0);
    expect(toPx('auto')).toBeNull();
    expect(parseCssNumber('-0.025em')).toEqual({ num: -0.025, unit: 'em' });
  });

  it('刻度步进', () => {
    const scale = [0, 4, 8, 12, 16];
    expect(stepScale(scale, 8, 1, (n) => n)).toBe(12);
    expect(stepScale(scale, 9, -1, (n) => n)).toBe(8);
    expect(stepScale(scale, 16, 1, (n) => n)).toBe(16);
  });

  it('联动分组命名', () => {
    expect(groupLabel(['padding-left', 'padding-right'])).toBe('padding-x');
    expect(groupLabel(['padding-top', 'padding-right', 'padding-bottom', 'padding-left'])).toBe('padding');
    expect(groupLabel(['width'])).toBe('width');
  });
});
