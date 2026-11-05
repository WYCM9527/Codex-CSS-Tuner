import { describe, expect, it } from 'vitest';
import { measure, spanLabel } from '../src/measure';

const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });

describe('标尺量距离', () => {
  it('左右分开、竖直方向有重叠：量中间的空隙，线画在重叠范围的中间', () => {
    const r = measure(box(0, 0, 100, 40), box(116, 20, 50, 40));
    expect(r.spans).toEqual([{ axis: 'x', from: 100, to: 116, at: 30 }]);
    expect(r.guides).toEqual([]);
  });

  it('上下分开', () => {
    const r = measure(box(0, 0, 100, 40), box(20, 64, 40, 10));
    expect(r.spans).toEqual([{ axis: 'y', from: 40, to: 64, at: 40 }]);
  });

  it('斜着分开：横竖各量一段，线画在选中元素的中线上，再补虚线引到目标', () => {
    const r = measure(box(0, 0, 100, 40), box(120, 60, 50, 30));
    expect(r.spans).toEqual([
      { axis: 'x', from: 100, to: 120, at: 20 },
      { axis: 'y', from: 40, to: 60, at: 50 },
    ]);
    expect(r.guides).toEqual([
      { x1: 120, y1: 20, x2: 120, y2: 60 },
      { x1: 50, y1: 60, x2: 120, y2: 60 },
    ]);
  });

  it('选中元素在里面：量到外层四条边的距离', () => {
    const r = measure(box(16, 24, 200, 100), box(0, 0, 300, 160));
    expect(r.spans).toEqual([
      { axis: 'y', from: 0, to: 24, at: 116 },
      { axis: 'y', from: 124, to: 160, at: 116 },
      { axis: 'x', from: 0, to: 16, at: 74 },
      { axis: 'x', from: 216, to: 300, at: 74 },
    ]);
  });

  it('悬停的在选中元素里面也一样，贴齐的边不画', () => {
    const r = measure(box(0, 0, 300, 160), box(0, 24, 300, 100));
    expect(r.spans.map((s) => [s.axis, s.to - s.from])).toEqual([
      ['y', 24],
      ['y', 36],
    ]);
  });

  it('紧挨着、没有空隙时不画', () => {
    expect(measure(box(0, 0, 100, 40), box(100, 0, 50, 40)).spans).toEqual([]);
  });
});

describe('标尺上的刻度名', () => {
  const steps = [
    { px: 4, label: '1' },
    { px: 16, label: '4' },
    { px: 24, label: '--space-6' },
  ];

  it('正好是某一档时带上名字', () => {
    expect(spanLabel(16, steps)).toBe('16 · 4');
    expect(spanLabel(15.98, steps)).toBe('16 · 4');
    expect(spanLabel(24, steps)).toBe('24 · --space-6');
  });

  it('不是任何一档只显示数字', () => {
    expect(spanLabel(17, steps)).toBe('17');
    expect(spanLabel(12.25, steps)).toBe('12.3');
  });
});
