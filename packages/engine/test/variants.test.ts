import { describe, expect, it } from 'vitest';
import { classLiteralSites, locateClassSite } from '../src';

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

  it('变体字符串的位置：size.default 在第 13 行', () => {
    const all = classLiteralSites(BUTTON, '/button.tsx');
    if ('error' in all) throw new Error(all.error);
    expect(all.find((s) => s.name === 'buttonVariants.size.default')).toMatchObject({ line: 13, column: 18 });
  });
});
