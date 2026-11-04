import { afterEach, describe, expect, it } from 'vitest';
import { CATALOGS, format, localeFrom, placeholders, setLocale, t, type Locale } from '../src';

const LOCALES = Object.keys(CATALOGS) as Locale[];

describe('界面文案', () => {
  afterEach(() => setLocale('en'));

  it('每种语言的键完全一致', () => {
    const keys = Object.keys(CATALOGS.en).sort();
    for (const l of LOCALES) expect(Object.keys(CATALOGS[l]).sort()).toEqual(keys);
  });

  it('同一个键在各语言里的占位符一致，且没有空文案', () => {
    const bad: string[] = [];
    for (const [key, text] of Object.entries(CATALOGS.en)) {
      const want = placeholders(text).join(',');
      for (const l of LOCALES) {
        const s = CATALOGS[l][key as keyof typeof CATALOGS.en];
        if (!s.trim()) bad.push(`${l} ${key}: 空`);
        else if (placeholders(s).join(',') !== want) bad.push(`${l} ${key}: {${placeholders(s)}} ≠ {${want}}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('编辑器语言换算成界面语言：中文都用简体，其余用英文', () => {
    expect(localeFrom('zh-cn')).toBe('zh-CN');
    expect(localeFrom('zh-tw')).toBe('zh-CN');
    expect(localeFrom('zh')).toBe('zh-CN');
    expect(localeFrom('en-us')).toBe('en');
    expect(localeFrom('ja')).toBe('en');
    expect(localeFrom(undefined)).toBe('en');
  });

  it('参数替换和英文单复数', () => {
    expect(format('{n} {n|change|changes}', { n: 1 })).toBe('1 change');
    expect(format('{n} {n|change|changes}', { n: 3 })).toBe('3 changes');
    expect(format('{a} and {b}', { a: 'x' })).toBe('x and {b}');
    expect(format('spreads {...props}', { props: 'p' })).toBe('spreads {...props}');
    expect(t('ext.handoff.none')).toMatch(/Agent/);
    setLocale('zh-CN');
    expect(t('apply.log', { n: 2, writeMs: 5, ms: 40 })).toBe('应用 2 条改动：保存 5ms，页面生效 40ms');
  });
});
