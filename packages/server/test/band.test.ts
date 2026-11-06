import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAKPOINTS, viewportBands, type Breakpoint } from '@css-tuner/protocol';
import { bandRange } from '../src/band';

const SCREENS: Breakpoint[] = [
  { name: 'sm', px: 640 },
  { name: 'md', px: 768 },
  { name: 'lg', px: 1024 },
  { name: 'xl', px: 1280 },
  { name: '2xl', px: 1536 },
];

describe('bandRange', () => {
  it('按断点切出三档，宽度上限不含', () => {
    const bands = viewportBands(SCREENS, true);
    expect(bandRange('mobile', bands)).toEqual({ name: 'mobile', min: 0, max: 768 });
    expect(bandRange('tablet', bands)).toEqual({ name: 'tablet', min: 768, max: 1024 });
    expect(bandRange('desktop', bands)).toEqual({ name: 'desktop', min: 1024, max: null });
  });

  it('普通 CSS 项目按默认断点切', () => {
    const bands = viewportBands(DEFAULT_BREAKPOINTS, false);
    expect(bandRange('tablet', bands)).toEqual({ name: 'tablet', min: bands.tablet.width, max: bands.desktop.width });
  });
});
