import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { indexCssRules, lookupCssRule, type CssRuleSpec } from '../src';

const FIX = join(__dirname, '../../../fixtures/react-css/src/styles');
const APP = join(FIX, 'app.css');
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

const files = (map: Record<string, string>) => (f: string) => map[f] ?? null;

describe('CSS 规则定位（fixtures/react-css）', () => {
  const index = indexCssRules(APP, disk);

  it('页面上的规则找到源文件里那一条', () => {
    expect(lookupCssRule(index, spec('.card'))).toEqual({ file: APP, line: 16, selector: '.card' });
    expect(lookupCssRule(index, spec('.card + .card'))).toEqual({ file: APP, line: 29, selector: '.card + .card' });
  });

  it('嵌套规则（& .row）给出展开后的写法', () => {
    expect(lookupCssRule(index, spec(':is(.panel) .row', { selector: '& .row' }))).toEqual({ file: APP, line: 51, selector: '.panel .row' });
  });

  it('媒体查询里的同名规则，按条件区分', () => {
    expect(lookupCssRule(index, spec('.card', { conditions: ['@media (min-width: 768px)'] }))).toMatchObject({ line: 58 });
  });

  it('找不到规则时给出原因', () => {
    expect(lookupCssRule(index, spec('.nope'))).toHaveProperty('error');
  });

  it('同一选择器出现多次：按序号定位', () => {
    const idx = indexCssRules('/p/a.css', files({ '/p/a.css': '.x { color: red; }\n.y {}\n.x { color: blue; }\n' }));
    expect(lookupCssRule(idx, spec('.x', { ordinal: 1 }))).toMatchObject({ line: 3 });
  });

  it('@import 链里的同名规则按展开顺序编号，给出实际文件', () => {
    const read = files({
      '/p/world.css': "@import '../ui/styles.css';\n.plate h1 { font-size: 16px; }\n",
      '/ui/styles.css': "@import './tokens.css';\n.plate h1 {\n  font-size: 19px;\n}\n",
      '/ui/tokens.css': ':root { --x: 1px; }\n',
    });
    const idx = indexCssRules('/p/world.css', read);
    expect(idx.files).toEqual(['/p/world.css', '/ui/styles.css', '/ui/tokens.css']);
    expect(lookupCssRule(idx, spec('.plate h1'))).toEqual({ file: '/ui/styles.css', line: 2, selector: '.plate h1' });
    expect(lookupCssRule(idx, spec('.plate h1', { ordinal: 1 }))).toEqual({ file: '/p/world.css', line: 2, selector: '.plate h1' });
  });

  it('选择器写法不同也能对上（CSSOM 序列化差异）', () => {
    const idx = indexCssRules('/p/a.css', files({ '/p/a.css': '.a>.b , .c::after{ color: red }\n@media (min-width:768px){ .d { color: red } }\n' }));
    expect(lookupCssRule(idx, spec('.a > .b, .c::after'))).toMatchObject({ line: 1 });
    expect(lookupCssRule(idx, spec('.d', { conditions: ['@media (min-width: 768px)'] }))).toMatchObject({ line: 2 });
  });

  it('Tailwind 3 拍平了 @layer：页面上没有层的规则对上源码里 @layer 里的那条', () => {
    const read = files({
      '/p/index.css': '@tailwind base;\n@tailwind components;\n\n@layer components {\n  .btn {\n    @apply px-4 py-2;\n    color: red;\n  }\n}\n\n.card { margin: 0; }\n',
    });
    const idx = indexCssRules('/p/index.css', read);
    expect(lookupCssRule(idx, spec('.btn'))).toEqual({ file: '/p/index.css', line: 5, selector: '.btn' });
    expect(lookupCssRule(idx, spec('.card'))).toEqual({ file: '/p/index.css', line: 11, selector: '.card' });
  });
});
