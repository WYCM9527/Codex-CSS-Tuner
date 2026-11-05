import { describe, expect, it } from 'vitest';
import { formatGradient, parseGradient, setLocale } from '@css-tuner/protocol';
import { displayValue } from '../src/lib/format';
import { editableGradient, fillLayer, firstVisible, newGradient, opaqueGradient, pinInterp } from '../src/lib/paint';

const g = (text: string) => parseGradient(text)!;

describe('填充和描边的渐变', () => {
  it('新建渐变从当前颜色过渡到透明；两层背景的填充层不能透明，过渡到浅一点的同色', () => {
    expect(formatGradient(newGradient('linear', 'rgb(239, 68, 68)', 'oklab'))).toBe('linear-gradient(to right in oklab, #ef4444 0%, transparent 100%)');
    expect(formatGradient(newGradient('radial', 'rgba(0, 0, 0, 0)', ''))).toBe('radial-gradient(#000000 0%, transparent 100%)');
    const opaque = newGradient('linear', '#ef4444', '', true);
    expect(opaqueGradient(opaque)).toBe(true);
    expect(opaque.stops[1].color).not.toBe('#ef4444');
  });

  it('颜色点换了写法，插值方式保持原来的', () => {
    // 十六进制默认按 sRGB 插值，换成 oklch 后默认会变成 OKLab，所以写明 in srgb
    const prev = g('linear-gradient(90deg, #ff0000, #0000ff)');
    expect(pinInterp(prev, { ...prev, stops: [prev.stops[0], { color: 'oklch(0.6 0.2 250)', pos: null }] }).interp).toBe('srgb');
    expect(pinInterp(prev, { ...prev, stops: [prev.stops[0], { color: '#00ff00', pos: null }] }).interp).toBe('');
    const tw4 = g('linear-gradient(to right in oklab, #ff0000, #0000ff)');
    expect(pinInterp(tw4, { ...tw4, stops: [tw4.stops[0], { color: '#00ff00', pos: null }] }).interp).toBe('oklab');
  });

  it('换回纯色取渐变里第一个看得见的颜色，全透明是白色', () => {
    expect(firstVisible(g('linear-gradient(transparent, #ef4444, #3b82f6)'))).toBe('#ef4444');
    expect(firstVisible(g('linear-gradient(transparent, rgba(0, 0, 0, 0))'))).toBe('#ffffff');
  });

  it('只有一层线性或径向渐变能在面板里改', () => {
    expect(editableGradient('linear-gradient(red, blue)')?.type).toBe('linear');
    expect(editableGradient('repeating-radial-gradient(red, blue 20%)')?.type).toBe('radial');
    expect(editableGradient('conic-gradient(red, blue)')).toBeNull();
    expect(editableGradient('url("a.png")')).toBeNull();
    expect(editableGradient('linear-gradient(red, blue), linear-gradient(red, blue)')).toBeNull();
    expect(editableGradient('none')).toBeNull();
  });

  it('两层背景里纯色的填充层写成同色渐变', () => {
    expect(fillLayer('rgb(255, 255, 255)')).toBe('linear-gradient(#ffffff, #ffffff)');
    expect(fillLayer('var(--card)')).toBe('linear-gradient(var(--card), var(--card))');
  });

  it('改动清单里的渐变写成摘要，多层背景用 + 连起来', () => {
    setLocale('zh-CN');
    expect(displayValue('linear-gradient(to right in oklab, rgb(239, 68, 68) 0%, rgba(0, 0, 0, 0) 100%)')).toBe('线性渐变 90°（#ef4444 → transparent）');
    expect(displayValue('linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255)), radial-gradient(rgb(239, 68, 68), rgb(59, 130, 246))')).toBe('#ffffff + 径向渐变（#ef4444 → #3b82f6）');
    setLocale('en');
    expect(displayValue('linear-gradient(45deg, red, blue)')).toBe('Linear gradient 45° (#ff0000 → #0000ff)');
    expect(displayValue('0 1px 3px rgba(0, 0, 0, 0.1)')).toBe('0 1px 3px rgba(0, 0, 0, 0.1)');
  });
});
