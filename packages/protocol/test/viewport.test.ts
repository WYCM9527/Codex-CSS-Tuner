import { describe, expect, it } from 'vitest';
import { bandOf, DEFAULT_BREAKPOINTS, viewportBands } from '../src';

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
