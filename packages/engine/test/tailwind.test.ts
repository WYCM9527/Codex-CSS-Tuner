import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import { applyEdits, editTailwind, hasArbitraryValue, loadTailwindDesign, previewCompanions, revertTailwind, tailwindScales, type TailwindEditInput, type TwDesign } from '../src';

const FIX = join(__dirname, '../../../fixtures/tw-react');
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
  // 改完必须还是合法的 TSX
  parse(out, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  return { ok: true as const, out, summary: r.summary };
}

/** 取改完后第 line 行 */
const lineOf = (s: string, line: number) => s.split('\n')[line - 1];

describe('Tailwind className 写回（fixtures/tw-react）', () => {
  const app = readFileSync(APP, 'utf8');
  const card = readFileSync(CARD, 'utf8');

  it('替换生效的类：px-6 → px-10（令牌）', () => {
    const r = run(APP, app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '2.5rem', token: '10', utility: 'px-6' });
    expect(r.ok && lineOf(r.out, 14)).toContain('className="flex items-center justify-between bg-brand px-10 py-4 text-white"');
    expect(r.ok && r.summary).toBe('px-6 → px-10');
  });

  it('任意值规范成主题写法：40px → px-10', () => {
    const r = run(APP, app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '40px', token: null, utility: 'px-6' });
    expect(r.ok && lineOf(r.out, 14)).toContain(' px-10 py-4 ');
  });

  it('同值合并：px-6 改成 4 且已有 py-4 → p-4', () => {
    const r = run(APP, app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '1rem', token: '4', utility: 'px-6' });
    expect(r.ok && lineOf(r.out, 14)).toContain('className="flex items-center justify-between bg-brand p-4 text-white"');
  });

  it('自定义主题色：bg-brand → bg-ink', () => {
    const r = run(APP, app, { line: 14, column: 7, props: ['background-color'], value: '#1c1c1e', token: 'ink', utility: 'bg-brand' });
    expect(r.ok && lineOf(r.out, 14)).toContain(' bg-ink ');
  });

  it('字号、字重', () => {
    const a = run(APP, app, { line: 15, column: 9, props: ['font-size'], value: '1.25rem', token: 'xl', utility: 'text-2xl' });
    expect(a.ok && lineOf(a.out, 15)).toContain('className="text-xl font-bold tracking-tight"');
    const b = run(APP, app, { line: 15, column: 9, props: ['font-weight'], value: '900', token: null, utility: 'font-bold' });
    expect(b.ok && lineOf(b.out, 15)).toContain('className="text-2xl font-black tracking-tight"');
  });

  it('clsx 第一个参数里的类', () => {
    const r = run(APP, app, { line: 19, column: 7, props: ['color'], value: '#3b5bdb', token: 'brand', utility: 'text-ink/70' });
    expect(r.ok && lineOf(r.out, 19)).toContain("clsx('mt-2 text-sm text-brand', active && 'underline')");
  });

  it('模板字符串里的类，以及单次引用的常量里的条件类', () => {
    const a = run(APP, app, { line: 23, column: 7, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '1.5rem', token: '6', utility: 'p-4' });
    expect(a.ok && lineOf(a.out, 23)).toContain('`rounded-card mt-4 p-6 ${tone}`');
    const b = run(APP, app, { line: 23, column: 7, props: ['background-color'], value: '#f8f6f1', token: 'paper', utility: 'bg-white' });
    expect(b.ok && lineOf(b.out, 10)).toContain("const tone = active ? 'bg-brand/10' : 'bg-paper';");
  });

  it('没有 className 的元素：新增属性', () => {
    const r = run(APP, app, { line: 27, column: 7, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '1rem', token: '4', utility: null });
    expect(r.ok && lineOf(r.out, 27)).toContain('<section className="p-4" data-testid="bare">');
  });

  it('列表项（map 里的同源元素）', () => {
    const r = run(APP, app, { line: 31, column: 11, props: ['padding-top', 'padding-bottom'], value: '0.75rem', token: '3', utility: 'py-2' });
    expect(r.ok && lineOf(r.out, 31)).toContain('className="py-3"');
  });

  it('className={常量}：只用了一次的常量直接改声明', () => {
    const r = run(APP, app, { line: 42, column: 7, props: ['padding-left', 'padding-right'], value: '1.5rem', token: '6', utility: 'px-4' });
    expect(r.ok && lineOf(r.out, 6)).toBe("const buttonStyles = 'rounded-md bg-brand px-6 py-2 text-white';");
  });

  it('保留响应式变体：md:p-8 → md:p-10', () => {
    const r = run(CARD, card, { line: 5, column: 5, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '2.5rem', token: '10', utility: 'md:p-8' });
    expect(r.ok && lineOf(r.out, 5)).toContain('className="rounded-lg bg-white p-5 shadow-md md:p-10"');
  });

  it('生效的类管得更多（p-5 只改左边）：保留并追加 pl-*', () => {
    const r = run(CARD, card, { line: 5, column: 5, props: ['padding-left'], value: '2rem', token: '8', utility: 'p-5' });
    expect(r.ok && lineOf(r.out, 5)).toContain('className="rounded-lg bg-white p-5 pl-8 shadow-md md:p-8"');
  });

  it('阴影、圆角、不透明度', () => {
    const s = run(CARD, card, { line: 5, column: 5, props: ['box-shadow'], value: 'none', token: 'none', utility: 'shadow-md' });
    expect(s.ok && lineOf(s.out, 5)).toContain(' shadow-none ');
    const r = run(CARD, card, { line: 5, column: 5, props: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'], value: '14px', token: null, utility: 'rounded-lg' });
    expect(r.ok && lineOf(r.out, 5)).toContain('className="rounded-card ');
    const o = run(APP, app, { line: 16, column: 9, props: ['opacity'], value: '0.35', token: null, utility: 'opacity-90' });
    expect(o.ok && lineOf(o.out, 16)).toContain('className="opacity-35 hover:bg-white/20"');
  });

  it('不在刻度上的值写任意值', () => {
    const r = run(CARD, card, { line: 6, column: 7, props: ['font-size'], value: '19px', token: null, utility: 'text-lg' });
    expect(r.ok && lineOf(r.out, 6)).toContain('className="text-[19px] font-semibold text-ink"');
  });

  it('文字对齐（新增）', () => {
    const r = run(CARD, card, { line: 6, column: 7, props: ['text-align'], value: 'center', token: null, utility: null });
    expect(r.ok && lineOf(r.out, 6)).toContain('className="text-lg font-semibold text-ink text-center"');
  });

  it('布局关键字：显示方式、方向、换行、主轴和交叉轴对齐', () => {
    const src = 'export const X = () => <div className="flex items-center justify-between gap-4 md:flex" />;\n';
    const at = { line: 1, column: 24, token: null };
    const a = run('/x.tsx', src, { ...at, props: ['display'], value: 'grid', utility: 'flex' });
    expect(a.ok && a.out).toContain('className="grid items-center justify-between gap-4 md:flex"');
    const b = run('/x.tsx', src, { ...at, props: ['display'], value: 'none', utility: 'flex' });
    expect(b.ok && b.out).toContain('className="hidden items-center');
    const md = run('/x.tsx', src, { ...at, props: ['display'], value: 'block', utility: 'md:flex' });
    expect(md.ok && md.out).toContain('gap-4 md:block"');
    const c = run('/x.tsx', src, { ...at, props: ['justify-content'], value: 'center', utility: 'justify-between' });
    expect(c.ok && c.out).toContain('className="flex items-center justify-center gap-4 md:flex"');
    const e = run('/x.tsx', src, { ...at, props: ['align-items'], value: 'flex-end', utility: 'items-center' });
    expect(e.ok && e.out).toContain('className="flex items-end justify-between');
    const f = run('/x.tsx', src, { ...at, props: ['flex-direction'], value: 'column', utility: null });
    expect(f.ok && f.out).toContain('md:flex flex-col"');
    const g = run('/x.tsx', src, { ...at, props: ['flex-wrap'], value: 'wrap', utility: null });
    expect(g.ok && g.out).toContain('md:flex flex-wrap"');
    const h = run('/x.tsx', src, { ...at, props: ['justify-content'], value: 'space-evenly', utility: 'justify-between' });
    expect(h.ok && h.out).toContain(' justify-evenly ');
  });

  it('网格列数、定位方式、层级', () => {
    const src = 'export const X = () => <ul className="grid grid-cols-3 gap-4" />;\n';
    const at = { line: 1, column: 24 };
    const a = run('/x.tsx', src, { ...at, props: ['grid-template-columns'], value: 'repeat(4, minmax(0, 1fr))', token: null, utility: 'grid-cols-3' });
    expect(a.ok && a.out).toContain('className="grid grid-cols-4 gap-4"');
    const b = run('/x.tsx', src, { ...at, props: ['grid-template-columns'], value: '200px 1fr', token: null, utility: 'grid-cols-3' });
    expect(b.ok && b.out).toContain('className="grid grid-cols-[200px_1fr] gap-4"');
    const c = run('/x.tsx', src, { ...at, props: ['position'], value: 'sticky', token: null, utility: null });
    expect(c.ok && c.out).toContain('gap-4 sticky"');
    const z = run('/x.tsx', src, { ...at, props: ['z-index'], value: '10', token: '10', utility: null });
    expect(z.ok && z.out).toContain('gap-4 z-10"');
    const z2 = run('/x.tsx', src, { ...at, props: ['z-index'], value: '5', token: null, utility: null });
    expect(z2.ok && z2.out).toContain('gap-4 z-5"');
    const pos = run('/x.tsx', 'export const X = () => <i className="absolute top-2 z-10" />;\n', { ...at, props: ['position'], value: 'relative', token: null, utility: 'absolute' });
    expect(pos.ok && pos.out).toContain('className="relative top-2 z-10"');
    const top = run('/x.tsx', 'export const X = () => <i className="absolute top-2 z-10" />;\n', { ...at, props: ['top'], value: '1rem', token: '4', utility: 'top-2' });
    expect(top.ok && top.out).toContain('className="absolute top-4 z-10"');
  });

  it('已被更大的同值类覆盖时不重复添加', () => {
    const src = 'export const X = () => <div className="p-4 px-6" />;\n';
    const r = run('/x.tsx', src, { line: 1, column: 24, props: ['padding-left', 'padding-right'], value: '1rem', token: '4', utility: 'px-6' });
    expect(r.ok && r.out).toContain('className="p-4"');
  });

  it('important 写法保持不变', () => {
    const src = 'export const X = () => <div className="p-4! text-sm" />;\n';
    const r = run('/x.tsx', src, { line: 1, column: 24, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '2rem', token: '8', utility: 'p-4!' });
    expect(r.ok && r.out).toContain('className="p-8! text-sm"');
  });

  it('多行 className 保留换行缩进', () => {
    const src = 'export const X = () => (\n  <div\n    className="\n      flex\n      px-6\n      py-4\n    "\n  />\n);\n';
    const r = run('/x.tsx', src, { line: 2, column: 3, props: ['padding-left', 'padding-right'], value: '2rem', token: '8', utility: 'px-6' });
    expect(r.ok && r.out).toBe('export const X = () => (\n  <div\n    className="\n      flex\n      px-8\n      py-4\n    "\n  />\n);\n');
  });

  it('拒绝：生效的类来自组件参数', () => {
    const src = 'export const X = (p: { c: string }) => <div className={p.c} />;\n';
    const r = run('/x.tsx', src, { line: 1, column: 40, props: ['padding-left'], value: '1rem', token: '4', utility: 'pl-2' });
    expect(r.ok).toBe(false);
  });

  it('拒绝：类名和模板表达式拼接', () => {
    const src = 'export const X = ({ n }: { n: number }) => <div className={`p-${n} text-sm`} />;\n';
    const r = run('/x.tsx', src, { line: 1, column: 45, props: ['padding-left'], value: '1rem', token: '4', utility: 'p-${n}' });
    expect(r.ok).toBe(false);
  });

  it('拒绝：有 {...props} 而没有 className', () => {
    const src = 'export const X = (p: object) => <div {...p} />;\n';
    const r = run('/x.tsx', src, { line: 1, column: 33, props: ['padding-left'], value: '1rem', token: '4', utility: null });
    expect(r.ok).toBe(false);
  });
});

describe('Tailwind 写回的补丁与还原', () => {
  const app = readFileSync(APP, 'utf8');
  const raw = (source: string, input: Omit<TailwindEditInput, 'file' | 'source'>) => {
    const r = editTailwind(d, { file: APP, source, ...input });
    if (!r.ok) throw new Error(r.reason);
    return r;
  };
  const back = (source: string, r: ReturnType<typeof raw>, line: number, column: number) => {
    const v = revertTailwind({ file: APP, source, line, column, ...r.classes! });
    if (!v.ok) throw new Error(v.reason);
    return applyEdits(source, v.edits);
  };

  it('补丁按类名粒度，只覆盖变化的类', () => {
    const r = raw(app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '2.5rem', token: '10', utility: 'px-6' });
    expect(r.edits).toHaveLength(1);
    expect(app.slice(r.edits[0].start, r.edits[0].end)).toBe('px-6');
    expect(r.edits[0].text).toBe('px-10');
    expect(r.classes).toEqual({ removed: ['px-6'], added: ['px-10'], attrAdded: false });
  });

  it('同一个 className 先后改两处，单独还原第一处，第二处保留', () => {
    const r1 = raw(app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '2.5rem', token: '10', utility: 'px-6' });
    const s1 = applyEdits(app, r1.edits);
    const r2 = raw(s1, { line: 14, column: 7, props: ['padding-top', 'padding-bottom'], value: '1.5rem', token: '6', utility: 'py-4' });
    const s2 = applyEdits(s1, r2.edits);
    const out = back(s2, r1, 14, 7);
    expect(lineOf(out, 14)).toContain('className="flex items-center justify-between bg-brand px-6 py-6 text-white"');
  });

  it('合并成 p-4 之后还原，恢复成 px-6 py-4', () => {
    const r = raw(app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '1rem', token: '4', utility: 'px-6' });
    const s = applyEdits(app, r.edits);
    expect(back(s, r, 14, 7)).toBe(app);
  });

  it('新增的 className 属性还原时整条删掉；元素挪了行也能找到', () => {
    const r = raw(app, { line: 27, column: 7, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '1rem', token: '4', utility: null });
    const s = applyEdits(app, r.edits);
    expect(back(s, r, 27, 7)).toBe(app);
    const shifted = `// 新加的一行\n${s}`;
    expect(back(shifted, r, 27, 7)).toBe(`// 新加的一行\n${app}`);
  });

  it('写入的类已被手动删掉：拒绝还原', () => {
    const r = raw(app, { line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '2.5rem', token: '10', utility: 'px-6' });
    const s = applyEdits(app, r.edits).replace(' px-10', '');
    const v = revertTailwind({ file: APP, source: s, line: 14, column: 7, ...r.classes! });
    expect(v.ok).toBe(false);
  });
});

describe('Tailwind 刻度', () => {
  it('来自项目设计系统，含 @theme 自定义令牌', () => {
    const s = tailwindScales(d);
    expect(s.mode).toBe('tailwind');
    expect(s.spacing.find((x) => x.token === '4')?.px).toBe(16);
    expect(s.spacing.find((x) => x.token === 'gutter')?.px).toBe(18);
    expect(s.radius.find((x) => x.token === 'card')?.px).toBe(14);
    expect(s.colors.find((x) => x.token === 'brand')?.value).toBe('#3b5bdb');
    expect(s.fontSize.find((x) => x.token === 'lg')?.px).toBe(18);
    expect(s.fontSize.some((x) => x.label.includes('--'))).toBe(false);
    expect(s.size.find((x) => x.token === '3xl')?.px).toBe(768);
  });

  it('预览字号令牌时带上它的默认行高，保留 --tw-leading 让 leading-* 仍然生效', () => {
    const lh = previewCompanions(d, ['font-size'], '1.125rem', 'lg')['line-height'];
    expect(lh).toMatch(/^var\(--tw-leading,\s*calc\(1\.75\s*\/\s*1\.125\)\)$/);
    expect(previewCompanions(d, ['font-size'], '18px', null)).toEqual({});
    expect(previewCompanions(d, ['padding-left', 'padding-right'], '1rem', '4')).toEqual({});
  });
});

describe('任意值类名识别（写回策略用）', () => {
  it('值里的方括号、圆括号算任意值，变体里的不算', () => {
    expect(hasArbitraryValue('px-[13px]')).toBe(true);
    expect(hasArbitraryValue('md:[padding:13px]')).toBe(true);
    expect(hasArbitraryValue('bg-(--brand)')).toBe(true);
    expect(hasArbitraryValue(' className="w-40 px-[13px]"')).toBe(true);
    expect(hasArbitraryValue('data-[state=open]:px-6')).toBe(false);
    expect(hasArbitraryValue('[&>svg]:size-4 px-6')).toBe(false);
    expect(hasArbitraryValue(' className="px-6"')).toBe(false);
  });

  it('精确值能换成刻度类名时不算任意值', () => {
    const src = readFileSync(APP, 'utf8');
    const r = editTailwind(d, { file: APP, source: src, line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '32px', token: null, utility: 'px-6' });
    expect(r.ok && r.edits.map((e) => e.text).join(' ')).toBe('px-8');
    expect(r.ok && hasArbitraryValue(r.edits.map((e) => e.text).join(' '))).toBe(false);
    const dyn = editTailwind(d, { file: APP, source: src, line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '13px', token: null, utility: 'px-6' });
    expect(dyn.ok && dyn.edits.map((e) => e.text).join(' ')).toBe('px-3.25');
    const q = editTailwind(d, { file: APP, source: src, line: 14, column: 7, props: ['padding-left', 'padding-right'], value: '13.5px', token: null, utility: 'px-6' });
    expect(q.ok && q.edits.map((e) => e.text).join(' ')).toBe('px-[13.5px]');
    expect(q.ok && hasArbitraryValue(q.edits.map((e) => e.text).join(' '))).toBe(true);
  });
});
