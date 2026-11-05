import { describe, expect, it } from 'vitest';
import { emptyScales, measureSteps } from '../src/scales';

describe('标尺上的刻度名', () => {
  it('来自间距刻度：同一个 px 只留第一个名字，0 和没有 px 的不要', () => {
    const s = emptyScales(16, 'tailwind');
    s.spacing = [
      { label: '0', value: '0px', px: 0 },
      { label: 'px', value: '1px', px: 1 },
      { label: '4', value: '1rem', px: 16 },
      { label: 'md', value: '1rem', px: 16 },
      { label: 'auto', value: 'auto' },
    ];
    expect(measureSteps(s)).toEqual([
      { px: 1, label: 'px' },
      { px: 16, label: '4' },
    ]);
  });
});
