import type { PropValue } from '@css-tuner/protocol';
import { describe, expect, it } from 'vitest';
import { applyEdits, editJsxProp, jsxPropSite, recipeVariants } from '../src';

const F = '/p/src/App.tsx';

/** 源码里第 n 个 `<tag` 的行列（行列从 1 开始） */
function at(source: string, tag: string, n = 0): { line: number; column: number } {
  let i = -1;
  for (let k = 0; k <= n; k++) i = source.indexOf(`<${tag}`, i + 1);
  const before = source.slice(0, i).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

function prop(source: string, tag: string, name: string, value: PropValue, from?: PropValue) {
  const r = editJsxProp({ file: F, source, ...at(source, tag), name, value, from, tag: tag.split('.').pop() });
  return r.ok ? applyEdits(source, r.edits) : r.reason;
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

  it('字符串就地改，只动变化的部分，保留原来的引号', () => {
    const src = `const A = () => <Button variant='primary' size="sm">Go</Button>;`;
    const r = editJsxProp({ file: F, source: src, ...at(src, 'Button'), name: 'variant', value: 'outline', from: 'primary' });
    expect(r.ok && r.edits).toEqual([{ start: src.indexOf('primary'), end: src.indexOf('primary') + 7, text: 'outline' }]);
    expect(r.ok && r.summary).toMatch(/variant[:：] ?"primary" → "outline"/);
    expect(prop(src, 'Button', 'size', 'lg', 'sm')).toBe(`const A = () => <Button variant='primary' size="lg">Go</Button>;`);
  });

  it('换成数字、布尔、null，或者写不进引号里的字符串', () => {
    const src = `const A = () => <Card title="Hi" count={3} done />;`;
    expect(prop(src, 'Card', 'count', 5, 3)).toBe(`const A = () => <Card title="Hi" count={5} done />;`);
    expect(prop(src, 'Card', 'done', false, true)).toBe(`const A = () => <Card title="Hi" count={3} done={false} />;`);
    expect(prop(src, 'Card', 'title', 'Say "hi"', 'Hi')).toBe(`const A = () => <Card title={"Say \\"hi\\""} count={3} done />;`);
    expect(prop(src, 'Card', 'title', 'a\nb', 'Hi')).toBe(`const A = () => <Card title={"a\\nb"} count={3} done />;`);
    expect(prop(src, 'Card', 'title', null, 'Hi')).toBe(`const A = () => <Card title={null} count={3} done />;`);
    expect(prop(src, 'Card', 'count', '3', 3)).toBe(`const A = () => <Card title="Hi" count="3" done />;`);
    expect(prop(`const A = () => <Card on={false} />;`, 'Card', 'on', true, false)).toBe(`const A = () => <Card on />;`);
  });

  it('没写的属性加在最后一个属性后面，没有属性时加在标签名后面', () => {
    expect(prop(`const A = () => <Card title="Hi" />;`, 'Card', 'pill', true)).toBe(`const A = () => <Card title="Hi" pill />;`);
    expect(prop(`const A = () => <Card>x</Card>;`, 'Card', 'tone', 'brand')).toBe(`const A = () => <Card tone="brand">x</Card>;`);
    expect(prop(`const A = () => <ui.Card\n  a="1"\n>x</ui.Card>;`, 'ui.Card', 'n', 2)).toBe(`const A = () => <ui.Card\n  a="1" n={2}\n>x</ui.Card>;`);
    expect(prop(`const A = () => <List<string>>x</List>;`, 'List', 'dense', true)).toBe(`const A = () => <List<string> dense>x</List>;`);
  });

  it('表达式、源码已经改过、同一行找错元素时不改', () => {
    const src = `const A = ({ v }) => <><Button variant={v} /><Badge tone="x" /></>;`;
    expect(prop(src, 'Button', 'variant', 'a')).toMatch(/expression|表达式/);
    expect(prop(src, 'Badge', 'tone', 'y', 'z')).toMatch(/has changed|已经变了/);
    const r = editJsxProp({ file: F, source: src, line: 1, column: 1, name: 'tone', value: 'y', tag: 'Badge' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/not <Badge>|不是 <Badge>/);
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
