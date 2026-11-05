import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { indexCssRules, lookupCssRule, type CssRuleSpec } from '../src';
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

describe('CSS Modules 定位（fixtures/react-css Badge.module.css）', () => {
  const index = indexCssRules(BADGE, disk);

  it('页面上的哈希选择器找到源文件里的规则，给出源文件里的写法', () => {
    expect(lookupCssRule(index, spec('._badge_2qmet_1'))).toEqual({ file: BADGE, line: 1, selector: '.badge' });
    expect(lookupCssRule(index, spec('._list_2qmet_14 ._badge_2qmet_1'))).toEqual({ file: BADGE, line: 14, selector: '.list .badge' });
  });

  it('长名字优先', () => {
    expect(lookupCssRule(index, spec('._badge-muted_2qmet_10'))).toEqual({ file: BADGE, line: 10, selector: '.badge-muted' });
  });

  it('普通 CSS 文件不做还原', () => {
    expect(lookupCssRule(indexCssRules('/p/a.css', () => '.badge { color: red; }\n'), spec('._badge_2qmet_1'))).toHaveProperty('error');
  });
});
