import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import { applyEdits, editTailwind, loadTailwindDesign, previewCompanions, revertTailwind, tailwindScales, type TailwindEditInput, type TwDesign } from '../src';
import { namespaces } from '../src/tailwind/v3';

const FIX = join(__dirname, '../../../fixtures/tw3-react');
const APP = join(FIX, 'src/App.tsx');
const CARD = join(FIX, 'src/Card.tsx');

let d: TwDesign;
beforeAll(async () => {
  d = await loadTailwindDesign(join(FIX, 'src/index.css'));
});

function run(file: string, source: string, input: Omit<TailwindEditInput, 'file' | 'source'>) {
  const r = editTailwind(d, { file, source, ...input });
  if (!r.ok) return { ok: false as const, reason: r.reason };
  const out = applyEdits(source, r.edits);
  parse(out, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  return { ok: true as const, out, summary: r.summary };
}

const lineOf = (s: string, line: number) => s.split('\n')[line - 1];

describe('Tailwind 3 设计系统（fixtures/tw3-react）', () => {
  it('按项目装的版本加载，主题来自 tailwind.config.ts', () => {
    expect(d.major).toBe(3);
    expect(d.files.map((f) => f.split('/').pop())).toEqual(['index.css', 'tailwind.config.ts']);
    expect(d.css('p-4')).toBe('.p-4 {\n  padding: 1rem;\n}\n');
    expect(d.css('md:p-8')).toContain('@media (min-width: 768px) {\n  .md\\:p-8 {\n    padding: 2rem;\n  }\n}');
    expect(d.valid('bg-brand')).toBe(true);
    expect(d.valid('p-13')).toBe(false);
    expect(d.valid('btn-primary')).toBe(false);
    expect(d.themeValue('--spacing')).toBe('0.25rem');
    expect(d.themeValue('--color-brand')).toBe('#3b5bdb');
    expect(d.themeValue('--text-lg--line-height')).toBe('1.75rem');
  });

  it('工具类管的属性：字号的行高、阴影都按 v4 的语义', () => {
    const lg = d.info('text-lg')!;
    expect([...lg.hard]).toEqual(['font-size']);
    expect(lg.soft.has('line-height')).toBe(true);
    expect([...d.info('text-lg/7')!.hard].sort()).toEqual(['font-size', 'line-height']);
    expect([...d.info('shadow-md')!.hard]).toEqual(['box-shadow']);
    expect(d.info('!p-4')!.important).toBe(true);
  });

  it('任意值换成主题写法', () => {
    expect(d.canonical('px-[40px]')).toBe('px-10');
    expect(d.canonical('md:p-[2rem]')).toBe('md:p-8');
    expect(d.canonical('!p-[16px]')).toBe('!p-4');
    expect(d.canonical('bg-[#3B5BDB]')).toBe('bg-brand');
    expect(d.canonical('text-[#1c1c1e]')).toBe('text-ink');
    expect(d.canonical('rounded-[14px]')).toBe('rounded-card');
    expect(d.canonical('rounded-[0.25rem]')).toBe('rounded');
    expect(d.canonical('opacity-[35%]')).toBe('opacity-35');
    expect(d.canonical('font-[900]')).toBe('font-black');
    expect(d.canonical('text-[length:19px]')).toBe('text-[19px]');
    expect(d.canonical('text-[length:1rem]')).toBe('text-[1rem]');
    expect(d.canonical('px-[13px]')).toBe('px-[13px]');
  });
});

describe('Tailwind 3 className 写回（fixtures/tw3-react）', () => {
  const app = readFileSync(APP, 'utf8');
  const card = readFileSync(CARD, 'utf8');

  it('替换生效的类：px-6 → px-10（令牌）', () => {
    const r = run(APP, app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '2.5rem', token: '10', utility: 'px-6' });
    expect(r.ok && lineOf(r.out, 14)).toContain('className="flex items-center justify-between bg-brand px-10 py-4 text-white"');
    expect(r.ok && r.summary).toBe('px-6 → px-10');
  });

  it('精确值换成主题写法：40px → px-10，13px 不在主题里写任意值', () => {
    const a = run(APP, app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '40px', token: null, utility: 'px-6' });
    expect(a.ok && lineOf(a.out, 14)).toContain(' px-10 py-4 ');
    const b = run(APP, app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '13px', token: null, utility: 'px-6' });
    expect(b.ok && lineOf(b.out, 14)).toContain(' px-[13px] py-4 ');
  });

  it('同值合并：px-6 改成 4 且已有 py-4 → p-4', () => {
    const r = run(APP, app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '1rem', token: '4', utility: 'px-6' });
    expect(r.ok && lineOf(r.out, 14)).toContain('className="flex items-center justify-between bg-brand p-4 text-white"');
  });

  it('tailwind.config 里的颜色：bg-brand → bg-ink', () => {
    const r = run(APP, app, { line: 14, column: 7, props: ['background-color'], value: '#1c1c1e', token: 'ink', utility: 'bg-brand' });
    expect(r.ok && lineOf(r.out, 14)).toContain(' bg-ink ');
  });

  it('字号、字重', () => {
    const a = run(APP, app, { line: 15, column: 9, props: ['font-size'], value: '1.25rem', token: 'xl', utility: 'text-2xl' });
    expect(a.ok && lineOf(a.out, 15)).toContain('className="text-xl font-bold tracking-tight"');
    const b = run(APP, app, { line: 15, column: 9, props: ['font-weight'], value: '900', token: null, utility: 'font-bold' });
    expect(b.ok && lineOf(b.out, 15)).toContain('className="text-2xl font-black tracking-tight"');
  });

  it('clsx 参数、模板字符串、只用了一次的常量', () => {
    const a = run(APP, app, { line: 19, column: 7, props: ['color'], value: '#3b5bdb', token: 'brand', utility: 'text-ink/70' });
    expect(a.ok && lineOf(a.out, 19)).toContain("clsx('mt-2 text-sm text-brand', active && 'underline')");
    const b = run(APP, app, { line: 23, column: 7, props: ['background-color'], value: '#f8f6f1', token: 'paper', utility: 'bg-white' });
    expect(b.ok && lineOf(b.out, 10)).toContain("const tone = active ? 'bg-brand/10' : 'bg-paper';");
    const c = run(APP, app, { line: 42, column: 7, props: ['padding-left', 'padding-right'], value: '1.5rem', token: '6', utility: 'px-4' });
    expect(c.ok && lineOf(c.out, 6)).toBe("const buttonStyles = 'rounded-md bg-brand px-6 py-2 text-white';");
  });

  it('没有 className 的元素：新增属性', () => {
    const r = run(APP, app, { line: 27, column: 7, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '1rem', token: '4', utility: null });
    expect(r.ok && lineOf(r.out, 27)).toContain('<section className="p-4" data-testid="bare">');
  });

  it('响应式变体、只改一边、悬停变体', () => {
    const a = run(CARD, card, { line: 5, column: 5, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '2.5rem', token: '10', utility: 'md:p-8' });
    expect(a.ok && lineOf(a.out, 5)).toContain('className="rounded-lg bg-white p-5 shadow-md md:p-10"');
    const b = run(CARD, card, { line: 5, column: 5, props: ['padding-left'], value: '2rem', token: '8', utility: 'p-5' });
    expect(b.ok && lineOf(b.out, 5)).toContain('className="rounded-lg bg-white p-5 pl-8 shadow-md md:p-8"');
    const c = run(APP, app, { line: 16, column: 9, props: ['background-color'], value: '#3b5bdb', token: 'brand', utility: 'hover:bg-white/20' });
    expect(c.ok && lineOf(c.out, 16)).toContain('className="opacity-90 hover:bg-brand"');
  });

  it('阴影、圆角、不透明度', () => {
    const s = run(CARD, card, { line: 5, column: 5, props: ['box-shadow'], value: 'none', token: 'none', utility: 'shadow-md' });
    expect(s.ok && lineOf(s.out, 5)).toContain(' shadow-none ');
    const r = run(CARD, card, { line: 5, column: 5, props: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'], value: '14px', token: null, utility: 'rounded-lg' });
    expect(r.ok && lineOf(r.out, 5)).toContain('className="rounded-card ');
    const o = run(APP, app, { line: 16, column: 9, props: ['opacity'], value: '0.35', token: null, utility: 'opacity-90' });
    expect(o.ok && lineOf(o.out, 16)).toContain('className="opacity-35 hover:bg-white/20"');
  });

  it('不在刻度上的字号写任意值', () => {
    const r = run(CARD, card, { line: 6, column: 7, props: ['font-size'], value: '19px', token: null, utility: 'text-lg' });
    expect(r.ok && lineOf(r.out, 6)).toContain('className="text-[19px] font-semibold text-ink"');
  });

  it('v3 没有的写法换成它有的：层级 z-[5]、important 用前缀', () => {
    const src = 'export const X = () => <ul className="grid grid-cols-3 gap-4" />;\n';
    const at = { line: 1, column: 24 };
    const a = run('/x.tsx', src, { ...at, props: ['grid-template-columns'], value: 'repeat(4, minmax(0, 1fr))', token: null, utility: 'grid-cols-3' });
    expect(a.ok && a.out).toContain('className="grid grid-cols-4 gap-4"');
    const z = run('/x.tsx', src, { ...at, props: ['z-index'], value: '10', token: '10', utility: null });
    expect(z.ok && z.out).toContain('gap-4 z-10"');
    const z5 = run('/x.tsx', src, { ...at, props: ['z-index'], value: '5', token: null, utility: null });
    expect(z5.ok && z5.out).toContain('gap-4 z-[5]"');
    const imp = run('/x.tsx', 'export const X = () => <div className="!p-4 text-sm" />;\n', { line: 1, column: 24, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '2rem', token: '8', utility: '!p-4' });
    expect(imp.ok && imp.out).toContain('className="!p-8 text-sm"');
    const v = run('/x.tsx', 'export const X = () => <div className="text-sm" />;\n', { line: 1, column: 24, props: ['color'], value: 'var(--brand)', token: null, utility: null });
    expect(v.ok && v.out).toContain('className="text-sm text-[var(--brand)]"');
  });

  it('补丁和还原', () => {
    const r = editTailwind(d, { file: APP, source: app, line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '1rem', token: '4', utility: 'px-6' });
    if (!r.ok) throw new Error(r.reason);
    const s = applyEdits(app, r.edits);
    const v = revertTailwind({ file: APP, source: s, line: 14, column: 7, ...r.classes! });
    expect(v.ok && applyEdits(s, v.edits)).toBe(app);
  });
});

describe('Tailwind 3 刻度', () => {
  it('来自 tailwind.config，含 extend 里的令牌，不重复', () => {
    const s = tailwindScales(d);
    expect(s.spacing.find((x) => x.token === '4')?.px).toBe(16);
    expect(s.spacing.find((x) => x.token === 'gutter')?.px).toBe(18);
    expect(s.spacing.filter((x) => x.token === '4')).toHaveLength(1);
    expect(s.spacing.slice(0, 3).map((x) => x.token)).toEqual(['0', 'px', '0.5']);
    expect(s.radius.find((x) => x.token === 'card')?.px).toBe(14);
    expect(s.radius.find((x) => x.label === 'DEFAULT')?.token).toBe('');
    expect(s.colors.find((x) => x.token === 'brand')?.value).toBe('#3b5bdb');
    expect(s.colors.find((x) => x.token === 'red-500')?.value).toBe('#ef4444');
    expect(s.fontSize.find((x) => x.token === 'lg')?.px).toBe(18);
    expect(s.fontSize.some((x) => x.label.includes('--'))).toBe(false);
    expect(s.size.find((x) => x.token === '3xl')?.px).toBe(768);
    expect(s.lineHeight.filter((x) => x.token === '6')).toHaveLength(1);
    expect(s.lineHeight.find((x) => x.token === 'tight')?.value).toBe('1.25');
    expect(s.shadow.find((x) => x.label === 'DEFAULT')?.token).toBe('');
    expect(s.breakpoints.map((b) => `${b.name}=${b.px}`)).toEqual(['sm=640', 'md=768', 'lg=1024', 'xl=1280', '2xl=1536']);
  });

  it('断点来自 screens：字符串和 { min } 算，只有上限的、raw、数组不算', () => {
    const { spaces } = namespaces({
      screens: { sm: '640px', tablet: { min: '700px', max: '900px' }, narrow: { max: '500px' }, print: { raw: 'print' }, multi: ['1400px'] },
    } as never);
    expect([...spaces.get('--breakpoint')!]).toEqual([
      ['sm', '640px'],
      ['tablet', '700px'],
    ]);
  });

  it('预览字号令牌时带上它的默认行高', () => {
    expect(previewCompanions(d, ['font-size'], '1.125rem', 'lg')).toEqual({ 'line-height': 'var(--tw-leading, 1.75rem)' });
    expect(previewCompanions(d, ['padding-left', 'padding-right'], '1rem', '4')).toEqual({});
  });
});

describe('Tailwind 3 配置的查找和重新读取', () => {
  const dir = join(FIX, '.tmp-config-test');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('@config 指定的配置；改过之后重新加载能读到新值', async () => {
    mkdirSync(join(dir, 'css'), { recursive: true });
    mkdirSync(join(dir, 'cfg'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{ "private": true }\n');
    writeFileSync(join(dir, 'css/app.css'), '@config "../cfg/tw.cjs";\n@tailwind utilities;\n');
    const write = (hex: string) =>
      writeFileSync(join(dir, 'cfg/tw.cjs'), `const shared = require('./shared.cjs');\nmodule.exports = { content: [], theme: { extend: { colors: { brand: '${hex}', ...shared } } } };\n`);
    writeFileSync(join(dir, 'cfg/shared.cjs'), "module.exports = { accent: '#ff0000' };\n");
    write('#111111');
    const a = await loadTailwindDesign(join(dir, 'css/app.css'));
    expect(a.css('bg-brand')).toContain('rgb(17 17 17');
    expect(a.css('bg-accent')).toContain('rgb(255 0 0');
    expect(a.files.map((f) => f.split('/').pop())).toEqual(['app.css', 'tw.cjs', 'shared.cjs']);
    write('#222222');
    writeFileSync(join(dir, 'cfg/shared.cjs'), "module.exports = { accent: '#00ff00' };\n");
    const b = await loadTailwindDesign(join(dir, 'css/app.css'));
    expect(b.css('bg-brand')).toContain('rgb(34 34 34');
    expect(b.css('bg-accent')).toContain('rgb(0 255 0');
  });

  it('没有配置文件时用默认主题', async () => {
    mkdirSync(join(dir, 'bare'), { recursive: true });
    writeFileSync(join(dir, 'bare/package.json'), '{ "private": true }\n');
    writeFileSync(join(dir, 'bare/index.css'), '@tailwind utilities;\n');
    const c = await loadTailwindDesign(join(dir, 'bare/index.css'));
    expect(c.major).toBe(3);
    expect(c.files.map((f) => f.split('/').pop())).toEqual(['index.css']);
    expect(c.valid('bg-red-500')).toBe(true);
    expect(c.valid('bg-brand')).toBe(false);
  });
});
