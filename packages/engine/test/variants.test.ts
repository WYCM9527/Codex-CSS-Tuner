import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import { applyEdits, classLiteralSites, editTailwind, loadTailwindDesign, locateClassSite, revertTailwind, type TailwindEditInput, type TwDesign } from '../src';

const FIX = join(__dirname, '../../../fixtures/tw-react');

let d: TwDesign;
beforeAll(async () => {
  d = await loadTailwindDesign(join(FIX, 'src/index.css'));
  // Tailwind 4 第一次规范类名要先建整张反查表，CI 上要好几秒，不能算进第一个测试的超时
  d.canonical('p-4');
}, 30_000);

const BUTTON = `import { cva } from 'class-variance-authority';
import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white hover:bg-brand/90',
        outline: 'border bg-white',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3',
        lg: 'h-10 px-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const sizes = { sm: 'text-xs', md: 'text-sm' } as const;
const style = { overflow: 'hidden' };

export function Button({ className, variant, size }: { className?: string; variant?: 'default'; size?: 'default' }) {
  return <button className={cn(buttonVariants({ variant, size, className }))} />;
}

export function Label({ on }: { on: boolean }) {
  return <label title="hidden" className={cn('block', sizes.md)} style={style} data-on={on ? 'yes' : 'no'} />;
}
`;

function run(source: string, input: Omit<TailwindEditInput, 'file' | 'source'>) {
  const r = editTailwind(d, { file: '/button.tsx', source, ...input });
  if (!r.ok) return { ok: false as const, reason: r.reason, out: '' };
  const out = applyEdits(source, r.edits);
  parse(out, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  return { ok: true as const, out, r };
}

describe('组件定义与变体（cva / 类名常量）', () => {
  it('JSX 位置知道 className 经 cn 合并、透传了 className 参数、调用了 cva 配方', () => {
    const site = locateClassSite(BUTTON, '/button.tsx', 26, 10);
    expect('error' in site).toBe(false);
    if ('error' in site) return;
    expect(site.merges).toBe(true);
    expect(site.passesClassName).toBe(true);
    expect(site.recipe).toEqual({ line: 5, column: 3 });
    expect(site.tokens).toEqual([]);
  });

  it('收集类名字符串：cva 参数、变体对象、类名常量；不收 style 对象、import、JSX className 和普通属性', () => {
    const all = classLiteralSites(BUTTON, '/button.tsx');
    expect('error' in all).toBe(false);
    if ('error' in all) return;
    const texts = all.map((s) => s.tokens.map((t) => t.text).join(' '));
    expect(texts).toContain('inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium');
    expect(texts).toContain('h-9 px-4 py-2');
    expect(texts).toContain('bg-brand text-white hover:bg-brand/90');
    expect(texts).toContain('text-xs');
    expect(texts).not.toContain('hidden');
    expect(texts).not.toContain('class-variance-authority');
    expect(texts).not.toContain('block');
    expect(texts).not.toContain('yes');
    const names = all.map((s) => s.name);
    expect(names).toContain('buttonVariants.base');
    expect(names).toContain('buttonVariants.size.default');
    expect(names).toContain('sizes.md');
  });

  it('改变体里的类：size.default 的 px-4 → px-6，再按语义还原', () => {
    const line = 13;
    const column = 18;
    const a = run(BUTTON, { line, column, literal: true, props: ['padding-left', 'padding-right'], value: '1.5rem', token: '6', utility: 'px-4' });
    expect(a.ok && a.out).toContain("default: 'h-9 px-6 py-2',");
    expect(a.ok && a.out).toContain("lg: 'h-10 px-6',");
    if (!a.ok || !a.r.ok) return;
    // 文件挪了几行之后语义还原
    const shifted = `// 新加的注释\n// 第二行\n${a.out}`;
    const back = revertTailwind({ file: '/button.tsx', source: shifted, line, column, literal: true, ...a.r.classes! });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(applyEdits(shifted, back.edits)).toBe(`// 新加的注释\n// 第二行\n${BUTTON}`);
  });

  it('位置对不上时在附近找含生效类名的字符串', () => {
    const a = run(BUTTON, { line: 14, column: 1, literal: true, props: ['padding-left', 'padding-right'], value: '1rem', token: '4', utility: 'px-3' });
    expect(a.ok && a.out).toContain("sm: 'h-8 rounded-md px-4',");
  });

  it('给组件定义新增：写进 cva 的基础类字符串', () => {
    const a = run(BUTTON, { line: 5, column: 3, literal: true, props: ['letter-spacing'], value: '-0.025em', token: 'tight', utility: null });
    expect(a.ok && a.out).toContain("'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium tracking-tight',");
  });

  it('调用处追加覆盖类：保留变体前缀，已有同属性的类直接替换', () => {
    const call = 'export const P = () => <Button className="w-full" />;\nexport const Q = () => <Button className="w-full md:px-2" />;\nexport const R = () => <Button />;\n';
    const a = editTailwind(d, { file: '/page.tsx', source: call, line: 1, column: 24, override: true, props: ['padding-left', 'padding-right'], value: '1.5rem', token: '6', utility: 'px-4' });
    expect(a.ok && applyEdits(call, a.edits)).toContain('<Button className="w-full px-6" />');
    const b = editTailwind(d, { file: '/page.tsx', source: call, line: 2, column: 24, override: true, props: ['padding-left', 'padding-right'], value: '1.5rem', token: '6', utility: 'md:px-4' });
    expect(b.ok && applyEdits(call, b.edits)).toContain('<Button className="w-full md:px-6" />');
    const c = editTailwind(d, { file: '/page.tsx', source: call, line: 3, column: 24, override: true, props: ['padding-left', 'padding-right'], value: '1.5rem', token: '6', utility: 'px-4' });
    expect(c.ok && applyEdits(call, c.edits)).toContain('<Button className="px-6" />');
  });
});
