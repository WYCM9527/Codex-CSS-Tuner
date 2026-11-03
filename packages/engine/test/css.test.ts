import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { applyEdits, editCssRule, indexCssRules, lookupCssRule, type CssRuleSpec } from '../src';

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

function run(props: string[], value: string, s: CssRuleSpec, read: (f: string) => string | null = disk, file = APP) {
  const r = editCssRule({ file, read, spec: s, props, value });
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const before = read(r.file)!;
  const out = applyEdits(before, r.edits);
  postcss.parse(out);
  return { ok: true as const, out, file: r.file, summary: r.summary };
}

describe('CSS 规则写回（fixtures/react-css）', () => {
  it('盒模型简写最小改写：padding: 16px 20px 改上边', () => {
    const r = run(['padding-top'], 'var(--space-6)', spec('.card'));
    expect(r.ok && r.out).toContain('  padding: var(--space-6) 20px 16px;\n');
  });

  it('简写两边一起改', () => {
    const r = run(['padding-left', 'padding-right'], '2rem', spec('.card'));
    expect(r.ok && r.out).toContain('  padding: 16px 2rem;\n');
  });

  it('只写了一个颜色的 background 直接替换', () => {
    const r = run(['background-color'], '#fffdf8', spec('.card'));
    expect(r.ok && r.out).toContain('  background: #fffdf8;\n');
  });

  it('长属性直接改值', () => {
    const r = run(['margin-top'], 'var(--space-6)', spec('.card + .card'));
    expect(r.ok && r.out).toContain('.card + .card {\n  margin-top: var(--space-6);\n}');
  });

  it('继承来的颜色：加到元素自己的规则里，沿用缩进', () => {
    const r = run(['color'], 'var(--color-accent)', spec('.card .title', { mode: 'add' }));
    expect(r.ok && r.out).toContain('  margin: 0 0 var(--space-2);\n  color: var(--color-accent);\n}');
  });

  it('嵌套规则（& .row）', () => {
    const r = run(['row-gap', 'column-gap'], '12px', spec(':is(.panel) .row', { selector: '& .row' }));
    expect(r.ok && r.out).toContain('  & .row {\n    display: flex;\n    gap: 12px;\n  }');
  });

  it('媒体查询里的同名规则，按条件区分', () => {
    const r = run(['padding-top'], '32px', spec('.card', { conditions: ['@media (min-width: 768px)'] }));
    expect(r.ok && r.out).toContain('@media (min-width: 768px) {\n  .card {\n    padding: 32px 28px 24px;\n  }\n}');
    expect(r.ok && r.out).toContain('  padding: 16px 20px;\n');
  });

  it('简写里有 var()：追加长属性覆盖', () => {
    const r = run(['padding-top'], '8px', spec('.page'));
    expect(r.ok && r.out).toContain('  padding: var(--space-6);\n  padding-top: 8px;\n}');
  });

  it('找不到规则时拒绝', () => {
    const r = run(['color'], 'red', spec('.nope'));
    expect(r.ok).toBe(false);
  });

  it('同一选择器出现多次：按序号定位', () => {
    const files: Record<string, string> = { '/p/a.css': '.x { color: red; }\n.y {}\n.x { color: blue; }\n' };
    const read = (f: string) => files[f] ?? null;
    const r = run(['color'], 'green', spec('.x', { ordinal: 1 }), read, '/p/a.css');
    expect(r.ok && r.out).toBe('.x { color: red; }\n.y {}\n.x { color: green; }\n');
  });

  it('@import 进来的文件：改被导入的那个文件', () => {
    const files: Record<string, string> = {
      '/p/main.css': "@import './parts/b.css';\n.a { color: red; }\n",
      '/p/parts/b.css': '.b {\n  margin: 0;\n}\n',
    };
    const read = (f: string) => files[f] ?? null;
    const r = run(['margin-top', 'margin-right', 'margin-bottom', 'margin-left'], '4px', spec('.b'), read, '/p/main.css');
    expect(r.ok && r.file).toBe('/p/parts/b.css');
    expect(r.ok && r.out).toBe('.b {\n  margin: 4px;\n}\n');
  });

  it('@import 链里的同名规则按展开顺序编号，lookupCssRule 给出实际文件', () => {
    const files: Record<string, string> = {
      '/p/world.css': "@import '../ui/styles.css';\n.plate h1 { font-size: 16px; }\n",
      '/ui/styles.css': "@import './tokens.css';\n.plate h1 {\n  font-size: 19px;\n}\n",
      '/ui/tokens.css': ':root { --x: 1px; }\n',
    };
    const read = (f: string) => files[f] ?? null;
    const index = indexCssRules('/p/world.css', read);
    expect(index.files).toEqual(['/p/world.css', '/ui/styles.css', '/ui/tokens.css']);
    expect(lookupCssRule(index, spec('.plate h1'))).toEqual({ file: '/ui/styles.css', line: 2, selector: '.plate h1' });
    expect(lookupCssRule(index, spec('.plate h1', { ordinal: 1 }))).toEqual({ file: '/p/world.css', line: 2, selector: '.plate h1' });
    const own = run(['font-size'], '21px', spec('.plate h1', { ordinal: 1 }), read, '/p/world.css');
    expect(own.ok && own.file).toBe('/p/world.css');
    expect(own.ok && own.out).toContain('.plate h1 { font-size: 21px; }');
    const imported = run(['font-size'], '21px', spec('.plate h1'), read, '/p/world.css');
    expect(imported.ok && imported.file).toBe('/ui/styles.css');
  });

  it('单行规则、末尾没分号：追加时补分号并保持单行', () => {
    const files: Record<string, string> = { '/p/a.css': '.x { color: red }\n' };
    const read = (f: string) => files[f] ?? null;
    const r = run(['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], '4px', spec('.x'), read, '/p/a.css');
    expect(r.ok && r.out).toBe('.x { color: red; padding: 4px; }\n');
  });

  it('选择器写法不同也能对上（CSSOM 序列化差异）', () => {
    const files: Record<string, string> = { '/p/a.css': '.a>.b , .c::after{ color: red }\n@media (min-width:768px){ .d { color: red } }\n' };
    const read = (f: string) => files[f] ?? null;
    const a = run(['color'], 'blue', spec('.a > .b, .c::after'), read, '/p/a.css');
    expect(a.ok).toBe(true);
    const b = run(['color'], 'blue', spec('.d', { conditions: ['@media (min-width: 768px)'] }), read, '/p/a.css');
    expect(b.ok && b.out).toContain('.d { color: blue }');
  });

  it('Tailwind 3 拍平了 @layer：页面上没有层的规则对上源码里 @layer 里的那条', () => {
    const files: Record<string, string> = {
      '/p/index.css': '@tailwind base;\n@tailwind components;\n\n@layer components {\n  .btn {\n    @apply px-4 py-2;\n    color: red;\n  }\n}\n\n.card { margin: 0; }\n',
    };
    const read = (f: string) => files[f] ?? null;
    const c = run(['color'], 'blue', spec('.btn'), read, '/p/index.css');
    expect(c.ok && c.out).toContain('    @apply px-4 py-2;\n    color: blue;\n');
    // 值来自 @apply：在规则末尾追加，排在 @apply 展开的声明后面
    const p = run(['padding-left', 'padding-right'], '1.5rem', spec('.btn'), read, '/p/index.css');
    expect(p.ok && p.out).toContain('    @apply px-4 py-2;\n    color: red;\n    padding-left: 1.5rem;\n    padding-right: 1.5rem;\n');
    expect(lookupCssRule(indexCssRules('/p/index.css', read), spec('.btn'))).toEqual({ file: '/p/index.css', line: 5, selector: '.btn' });
    expect(lookupCssRule(indexCssRules('/p/index.css', read), spec('.card'))).toEqual({ file: '/p/index.css', line: 11, selector: '.card' });
  });

  it('规则里只有 @apply：追加的声明排在它后面', () => {
    const files: Record<string, string> = { '/p/index.css': '@layer components {\n  .btn {\n    @apply px-4 py-2;\n  }\n}\n.chip { @apply px-2 }\n' };
    const read = (f: string) => files[f] ?? null;
    const p = run(['padding-left', 'padding-right'], '1.5rem', spec('.btn'), read, '/p/index.css');
    expect(p.ok && p.out).toContain('  .btn {\n    @apply px-4 py-2;\n    padding-left: 1.5rem;\n    padding-right: 1.5rem;\n  }\n');
    const c = run(['color'], 'red', spec('.chip'), read, '/p/index.css');
    expect(c.ok && c.out).toContain('.chip { @apply px-2; color: red; }');
  });
});
