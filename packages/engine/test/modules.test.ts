import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyEdits, editCssRule, indexCssRules, lookupCssRule, type CssRuleSpec } from '../src';
import { localClasses, localizeClass, localizeSelector } from '../src/css/modules';

const BADGE = join(__dirname, '../../../fixtures/react-css/src/styles/Badge.module.css');
const disk = (f: string) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};

function spec(fullSelector: string, extra: Partial<CssRuleSpec> = {}): CssRuleSpec {
  return { selector: fullSelector, fullSelector, conditions: [], ordinal: 0, mode: 'edit', via: null, ...extra };
}

describe('CSS Modules 哈希类名还原', () => {
  const locals = new Set(['badge', 'badge-muted', 'list', 'card_title']);

  it('三种打包器的命名都能认出本地类名，取最长匹配', () => {
    expect(localizeClass('_badge_2qmet_1', locals)).toBe('badge');
    expect(localizeClass('_badge-muted_2qmet_10', locals)).toBe('badge-muted');
    expect(localizeClass('Badge_badge-muted__x1Y2z', locals)).toBe('badge-muted');
    expect(localizeClass('Badge-module__x1Y2z__badge', locals)).toBe('badge');
    expect(localizeClass('_card_title_9ab3c_4', locals)).toBe('card_title');
  });

  it('不在边界上的子串、认不出的类名保持原样', () => {
    expect(localizeClass('_badges_2qmet_1', locals)).toBeNull();
    expect(localizeClass('xlist', locals)).toBeNull();
    expect(localizeSelector('._list_2qmet_14 ._badge_2qmet_1:hover > .other', locals)).toBe('.list .badge:hover > .other');
  });

  it('从源文件选择器里收集本地类名', () => {
    expect([...localClasses(['.a .b-c', '.d:not(.e_f)', '#id'])]).toEqual(['a', 'b-c', 'd', 'e_f']);
  });
});

describe('CSS Modules 写回（fixtures/react-css Badge.module.css）', () => {
  it('页面上的哈希选择器找到源文件里的规则', () => {
    const r = editCssRule({ file: BADGE, read: disk, spec: spec('._badge_2qmet_1'), props: ['padding-left'], value: '12px' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary).toBe('.badge { padding: 2px 8px → 2px 8px 2px 12px }');
    expect(applyEdits(disk(BADGE)!, r.edits)).toContain('  padding: 2px 8px 2px 12px;\n');
  });

  it('组合选择器、长名字优先', () => {
    const muted = editCssRule({ file: BADGE, read: disk, spec: spec('._badge-muted_2qmet_10'), props: ['background-color'], value: '#999' });
    expect(muted.ok && muted.summary).toBe('.badge-muted { background: var(--color-muted) → #999 }');
    const nested = editCssRule({ file: BADGE, read: disk, spec: spec('._list_2qmet_14 ._badge_2qmet_1'), props: ['margin-left'], value: '8px' });
    expect(nested.ok && nested.summary).toBe('.list .badge { margin-left: 6px → 8px }');
  });

  it('lookupCssRule 给出源文件里的选择器写法', () => {
    const index = indexCssRules(BADGE, disk);
    expect(lookupCssRule(index, spec('._list_2qmet_14 ._badge_2qmet_1'))).toEqual({ file: BADGE, line: 14, selector: '.list .badge' });
  });

  it('普通 CSS 文件不做还原', () => {
    const r = editCssRule({ file: '/p/a.css', read: () => '.badge { color: red; }\n', spec: spec('._badge_2qmet_1'), props: ['color'], value: 'blue' });
    expect(r.ok).toBe(false);
  });
});
