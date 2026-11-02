import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { applyEdits, editCssRule, editThemeVar } from '../src';

const disk = (f: string) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};

const TW = join(__dirname, '../../../fixtures/tw-react/src/index.css');
const CSS = join(__dirname, '../../../fixtures/react-css/src/styles');

function theme(name: string, value: string, read: (f: string) => string | null = disk, file = TW) {
  const r = editThemeVar({ file, read, name, value });
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const out = applyEdits(read(r.file)!, r.edits);
  postcss.parse(out);
  return { ok: true as const, out, file: r.file, summary: r.summary };
}

const memory = (files: Record<string, string>) => (f: string) => files[f] ?? null;

describe('Tailwind @theme 变量写回', () => {
  it('改项目里声明过的主题变量', () => {
    const r = theme('--color-brand', '#e8590c');
    expect(r.ok && r.out).toContain('  --color-brand: #e8590c;\n');
    expect(r.ok && r.out).toContain('  --color-ink: #1c1c1e;\n');
    expect(r.ok && r.summary).toBe('@theme { --color-brand: #3b5bdb → #e8590c }');
  });

  it('默认主题的变量加进已有的 @theme 块', () => {
    const r = theme('--spacing', '0.3rem');
    expect(r.ok && r.out).toMatch(/--spacing-gutter: 18px;\n {2}--spacing: 0\.3rem;\n/);
  });

  it('没有 @theme 块就新建，放在最后一条 @import 后面', () => {
    const read = memory({ '/a.css': "@import 'tailwindcss';\n@import './b.css';\n\nbody { color: red; }\n", '/b.css': '.x { color: blue; }\n' });
    const r = theme('--radius-md', '10px', read, '/a.css');
    expect(r.ok && r.out).toBe("@import 'tailwindcss';\n@import './b.css';\n\n@theme {\n  --radius-md: 10px;\n}\n\nbody { color: red; }\n");
  });

  it('@import 进来的文件里声明的变量改在那个文件，后声明的生效', () => {
    const read = memory({
      '/a.css': "@import 'tailwindcss';\n@import './tokens.css';\n@theme {\n  --color-brand: red;\n}\n",
      '/tokens.css': '@theme {\n  --color-brand: blue;\n  --color-ink: black;\n}\n',
    });
    expect(theme('--color-brand', 'green', read, '/a.css')).toMatchObject({ ok: true, file: '/a.css' });
    const r = theme('--color-ink', '#111', read, '/a.css');
    expect(r).toMatchObject({ ok: true, file: '/tokens.css' });
    expect(r.ok && r.out).toContain('--color-ink: #111;');
  });

  it('非法值和未变化的值拒绝写入', () => {
    expect(theme('--color-brand', 'red; --x: 1').ok).toBe(false);
    expect(theme('--color-brand', '#3b5bdb').ok).toBe(false);
  });
});

describe('普通 CSS 变量写回', () => {
  it('改 :root 里的声明，区分大小写', () => {
    const file = join(CSS, 'tokens.css');
    const r = editCssRule({ file, read: disk, spec: { selector: ':root', fullSelector: ':root', conditions: [], ordinal: 0, mode: 'edit', via: null }, props: ['--radius-md'], value: '12px' });
    expect(r.ok).toBe(true);
    const out = r.ok ? applyEdits(disk(r.file)!, r.edits) : '';
    expect(out).toContain('  --radius-md: 12px;\n');
    expect(out).toContain('  --radius-sm: 4px;\n');

    const read = memory({ '/v.css': ':root {\n  --Brand: red;\n  --brand: blue;\n}\n' });
    const s = editCssRule({ file: '/v.css', read, spec: { selector: ':root', fullSelector: ':root', conditions: [], ordinal: 0, mode: 'edit', via: null }, props: ['--Brand'], value: 'green' });
    expect(s.ok && applyEdits(read('/v.css')!, s.edits)).toBe(':root {\n  --Brand: green;\n  --brand: blue;\n}\n');
  });
});
