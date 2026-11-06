import { describe, expect, it } from 'vitest';
import { bandOf, DEFAULT_BREAKPOINTS, frameSettled, presetOf, viewportBands } from '../src';

describe('视口的三档', () => {
  it('平板从 md 起、桌面从 lg 起，Tailwind 项目带前缀', () => {
    const bands = viewportBands([{ name: 'sm', px: 640 }, { name: 'md', px: 800 }, { name: 'lg', px: 1200 }], true);
    expect(bands).toEqual({
      mobile: { width: 390, prefix: null },
      tablet: { width: 800, prefix: 'md' },
      desktop: { width: 1200, prefix: 'lg' },
    });
  });

  it('普通 CSS 项目用 768、1024，没有前缀', () => {
    expect(viewportBands(DEFAULT_BREAKPOINTS, false)).toEqual({
      mobile: { width: 390, prefix: null },
      tablet: { width: 768, prefix: null },
      desktop: { width: 1024, prefix: null },
    });
  });

  it('主题里没有 md、lg 时用默认宽度，也就没有前缀', () => {
    const bands = viewportBands([{ name: 'tablet', px: 700 }], true);
    expect(bands.tablet).toEqual({ width: 768, prefix: null });
    expect(bands.desktop).toEqual({ width: 1024, prefix: null });
  });

  it('页面宽度落在哪一档', () => {
    const bands = viewportBands(DEFAULT_BREAKPOINTS, true);
    expect([320, 767, 768, 1023, 1024, 1920].map((w) => bandOf(w, bands))).toEqual(['mobile', 'mobile', 'tablet', 'tablet', 'desktop', 'desktop']);
  });
});

describe('页面连上时选哪一档', () => {
  const bands = viewportBands(DEFAULT_BREAKPOINTS, false);

  it('不在设备框页面里（面板浮在页面上）、或者框跟着停靠的面板走：都是实际宽度', () => {
    expect(presetOf(null, bands)).toBe('actual');
    expect(presetOf({ w: 768, framed: false, fit: false }, bands)).toBe('actual');
    expect(presetOf({ w: 768, framed: true, fit: true }, bands)).toBe('actual');
  });

  it('框定了宽度：正好是某一档的宽度就选那一档，否则按宽度落在哪一档', () => {
    expect(presetOf({ w: 768, framed: true, fit: false }, bands)).toBe('tablet');
    expect(presetOf({ w: 390, framed: true, fit: false }, bands)).toBe('mobile');
    expect(presetOf({ w: 1100, framed: true, fit: false }, bands)).toBe('desktop');
  });
});

describe('设备框已经是要的样子', () => {
  it('实际宽度：不在框里，或者框跟着停靠的面板走', () => {
    expect(frameSettled(null, { w: 1180, framed: false, fit: false })).toBe(true);
    expect(frameSettled(null, { w: 800, framed: true, fit: true })).toBe(true);
    expect(frameSettled(null, { w: 390, framed: true, fit: false })).toBe(false);
  });

  it('某一档：框定成了这个宽度；跟着面板走的框宽度碰巧一样也要换成定宽', () => {
    expect(frameSettled(390, { w: 390, framed: true, fit: false })).toBe(true);
    expect(frameSettled(390, { w: 768, framed: true, fit: false })).toBe(false);
    expect(frameSettled(390, { w: 390, framed: true, fit: true })).toBe(false);
    expect(frameSettled(390, { w: 390, framed: false, fit: false })).toBe(false);
  });
});
