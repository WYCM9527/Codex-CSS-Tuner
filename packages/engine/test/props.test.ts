import { describe, expect, it } from 'vitest';
import { jsxPropSite, recipeVariants } from '../src';

const F = '/p/src/App.tsx';

/** 源码里第 n 个 `<tag` 的行列（行列从 1 开始） */
function at(source: string, tag: string, n = 0): { line: number; column: number } {
  let i = -1;
  for (let k = 0; k <= n; k++) i = source.indexOf(`<${tag}`, i + 1);
  const before = source.slice(0, i).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

describe('组件属性', () => {
  it('读出调用处各种字面量的写法', () => {
    const src = "const A = () => <Card title=\"Hi\" count={3} neg={-2} done flag={false} none={null} tpl={`t`} cast={'x' as const} fn={go} {...rest} late=\"z\" />;";
    const { line, column } = at(src, 'Card');
    const site = (name: string) => jsxPropSite(src, F, line, column, name);
    expect(site('title')).toEqual({ site: { kind: 'literal', value: 'Hi', inner: { line: 1, column: src.indexOf('"Hi"') + 2 } }, spread: 'after' });
    expect(site('count')).toMatchObject({ site: { kind: 'literal', value: 3 } });
    expect(site('neg')).toMatchObject({ site: { kind: 'literal', value: -2 } });
    expect(site('done')).toMatchObject({ site: { kind: 'literal', value: true } });
    expect(site('flag')).toMatchObject({ site: { kind: 'literal', value: false } });
    expect(site('none')).toMatchObject({ site: { kind: 'literal', value: null } });
    expect(site('tpl')).toMatchObject({ site: { kind: 'literal', value: 't' } });
    expect(site('cast')).toMatchObject({ site: { kind: 'literal', value: 'x' } });
    expect(site('fn')).toEqual({ site: { kind: 'dynamic', code: 'fn={go}' }, spread: 'after' });
    expect(site('late')).toMatchObject({ spread: 'before' });
    expect(site('nope')).toEqual({ site: { kind: 'missing' }, spread: 'before' });
  });

  it('列号对不上、同一行取到了别的元素时，按组件名核对', () => {
    const src = `const A = ({ v }) => <><Button variant={v} /><Badge tone="x" /></>;`;
    expect(jsxPropSite(src, F, 1, 1, 'tone', 'Badge')).toEqual({ error: expect.stringMatching(/not <Badge>|不是 <Badge>/) });
    expect(jsxPropSite(src, F, ...(Object.values(at(src, 'Badge')) as [number, number]), 'tone', 'Badge')).toMatchObject({ site: { kind: 'literal', value: 'x' } });
    expect(jsxPropSite(src, F, ...(Object.values(at(src, 'Button')) as [number, number]), 'variant', 'Button')).toMatchObject({ site: { kind: 'dynamic', code: 'variant={v}' } });
  });
});

describe('cva / tv 配方', () => {
  it('读出元素 className 用到的配方的变体和默认值', () => {
    const src = [
      `import { cva } from 'class-variance-authority';`,
      `const buttonVariants = cva('rounded', {`,
      `  variants: { variant: { primary: 'a', 'ghost-x': 'b' }, size: { sm: '', lg: '' }, block: { true: 'w-full' } },`,
      `  defaultVariants: { variant: 'primary', size: 'sm', block: false },`,
      `});`,
      `export function Button({ variant, size: s, className, ...rest }) {`,
      `  return <button className={cn(buttonVariants({ variant, size: s, block: true }), className)} {...rest} />;`,
      `}`,
    ].join('\n');
    expect(recipeVariants(src, F, ...(Object.values(at(src, 'button')) as [number, number]))).toEqual({
      name: 'buttonVariants',
      variants: { variant: ['primary', 'ghost-x'], size: ['sm', 'lg'], block: ['true'] },
      defaults: { variant: 'primary', size: 'sm', block: 'false' },
      passed: ['variant'],
    });
  });

  it('tv 的配置在第一个参数里；没用配方时返回 null', () => {
    const src = [
      `const badge = tv({ base: 'x', variants: { tone: { brand: '', muted: '' } } });`,
      `export const Badge = ({ tone }) => <><span className={badge({ tone })} /><i className="plain" /></>;`,
    ].join('\n');
    expect(recipeVariants(src, F, ...(Object.values(at(src, 'span')) as [number, number]))).toEqual({ name: 'badge', variants: { tone: ['brand', 'muted'] }, defaults: {}, passed: ['tone'] });
    expect(recipeVariants(src, F, ...(Object.values(at(src, 'i')) as [number, number]))).toBeNull();
  });
});
