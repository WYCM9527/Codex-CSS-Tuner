import { describe, expect, it } from 'vitest';
import { arrayOrderSite, jsxOrderCheck, type OrderSite } from '../src';

const F = '/p/src/App.tsx';

/** 源码里第 n 个 `<tag` 的行列（行列从 1 开始） */
function at(source: string, tag: string, n = 0): OrderSite {
  let i = -1;
  for (let k = 0; k <= n; k++) i = source.indexOf(`<${tag}`, i + 1);
  const before = source.slice(0, i).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

describe('JSX 兄弟换序的位置', () => {
  it('同一个父元素下的几项：给出父元素的写法和位置', () => {
    const src = `const A = () => (\n  <nav>\n    <a href="/">Home</a>\n    <a href="/about">About</a>\n    <a href="/blog">Blog</a>\n  </nav>\n);`;
    expect(jsxOrderCheck(src, F, [at(src, 'a', 0), at(src, 'a', 1), at(src, 'a', 2)])).toEqual({ ok: true, parent: '<nav>', ...at(src, 'nav') });
  });

  it('条件渲染和 .map() 块各算一项，同一行的项也认得出', () => {
    const src = `const A = ({ show, xs }) => <ul><li>Head</li>{show && <li>Maybe</li>}{xs.map((x) => <li key={x}>{x}</li>)}</ul>;`;
    expect(jsxOrderCheck(src, F, [at(src, 'li', 0), at(src, 'li', 1), at(src, 'li', 2)])).toEqual({ ok: true, parent: '<ul>', ...at(src, 'ul') });
  });

  it('children 经组件传给别处渲染时，按写它们的那个 JSX 父元素算；片段写成 <>', () => {
    const src = `const A = () => (\n  <Card>\n    <h2>T</h2>\n    <p>B</p>\n  </Card>\n);`;
    expect(jsxOrderCheck(src, F, [at(src, 'h2'), at(src, 'p')])).toEqual({ ok: true, parent: '<Card>', ...at(src, 'Card') });
    const frag = `const A = () => <>\n  <h2>T</h2>\n  <p>B</p>\n</>;`;
    expect(jsxOrderCheck(frag, F, [at(frag, 'h2'), at(frag, 'p')])).toMatchObject({ ok: true, parent: '<>', line: 1 });
  });

  it('不在同一个父元素里、顺序和页面不同、标签对不上时报错', () => {
    const src = `const A = () => (\n  <div>\n    <section><h1>a</h1></section>\n    <p>b</p>\n  </div>\n);`;
    // h1 和 p 的共同父元素是 div：在 div 下它俩对应的是 section 和 p，各自不同项
    expect(jsxOrderCheck(src, F, [at(src, 'section'), at(src, 'p')])).toMatchObject({ ok: true, parent: '<div>' });
    expect(jsxOrderCheck(src, F, [at(src, 'p'), at(src, 'section')])).toEqual({ error: expect.stringMatching(/doesn't match the page|对不上/) });
    expect(jsxOrderCheck(src, F, [{ ...at(src, 'section'), name: 'article' }, at(src, 'p')])).toEqual({ error: expect.stringMatching(/doesn't match the page|对不上/) });
    const viaAttr = `const A = () => <Layout header={<h1>T</h1>}><p>B</p></Layout>;`;
    expect(jsxOrderCheck(viaAttr, F, [at(viaAttr, 'h1'), at(viaAttr, 'p')])).toEqual({ error: expect.stringMatching(/aren't written next to each other|不是并排写在/) });
  });
});

describe('.map() 渲染的数组在哪', () => {
  const page = [
    "import { plans } from './data';",
    'const links = [',
    "  // 首页",
    "  { href: '/', label: 'Home' },",
    "  { href: '/about', label: 'About' }, // 关于",
    "  { href: '/blog', label: 'Blog' },",
    '] as const;',
    'export function Nav() {',
    '  return <nav>{links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</nav>;',
    '}',
    'export function Plans() {',
    '  return <ul>{plans.map((p) => <Plan key={p.id} {...p} />)}</ul>;',
    '}',
    'export function Prop({ links }) {',
    '  return <ol>{links.map((l) => <li key={l}>{l}</li>)}</ol>;',
    '}',
  ].join('\n');
  const data = "export const plans = [\n  { id: 'starter' },\n  { id: 'pro' },\n  { id: 'team' },\n];\n";
  const files: Record<string, string> = { '/p/src/data.ts': data };
  const read = (f: string) => files[f] ?? null;

  it('同文件的 const 数组', () => {
    expect(arrayOrderSite({ file: F, source: page, ...at(page, 'a'), count: 3, read })).toEqual({ file: F, line: 2, column: 15, name: 'links' });
  });

  it('相对路径导入的数组：给出导出它的文件，再转一层导出也找得到', () => {
    expect(arrayOrderSite({ file: F, source: page, ...at(page, 'Plan'), count: 3, read })).toEqual({ file: '/p/src/data.ts', line: 1, column: 22, name: 'plans' });
    const reexport: Record<string, string> = { '/p/src/data.ts': 'const all = [1, 2];\nexport { all as plans };\n' };
    expect(arrayOrderSite({ file: F, source: page, ...at(page, 'Plan'), count: 2, read: (f) => reexport[f] ?? null })).toEqual({ file: '/p/src/data.ts', line: 1, column: 13, name: 'all' });
  });

  it('参数传进来的、筛选过的、项数对不上的、有展开的、来自 JSON 的都给出原因', () => {
    expect(arrayOrderSite({ file: F, source: page, ...at(page, 'li'), count: 2, read })).toEqual({ error: expect.stringMatching(/passed in from outside|外面传进来/) });
    expect(arrayOrderSite({ file: F, source: page, ...at(page, 'a'), count: 2, read })).toEqual({ error: expect.stringMatching(/3 items but the page shows 2|3 项，页面上显示 2 项/) });
    const filtered = `const xs = [1, 2];\nconst A = () => <ul>{xs.filter(Boolean).map((x) => <li key={x}>{x}</li>)}</ul>;`;
    expect(arrayOrderSite({ file: F, source: filtered, ...at(filtered, 'li'), count: 2, read })).toEqual({ error: expect.stringMatching(/xs\.filter\(Boolean\)/) });
    const spread = `const base = [1];\nconst xs = [...base, 2];\nconst A = () => <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>;`;
    expect(arrayOrderSite({ file: F, source: spread, ...at(spread, 'li'), count: 2, read })).toEqual({ error: expect.stringMatching(/spread|展开/) });
    const json = `import items from './items.json';\nconst A = () => <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul>;`;
    expect(arrayOrderSite({ file: F, source: json, ...at(json, 'li'), count: 2, read })).toEqual({ error: expect.stringMatching(/JSON/) });
    const noMap = `const A = () => <ul><li>a</li></ul>;`;
    expect(arrayOrderSite({ file: F, source: noMap, ...at(noMap, 'li'), count: 1, read })).toEqual({ error: expect.stringMatching(/\.map\(\)/) });
  });

  it('直接写在 .map() 前面的数组字面量', () => {
    const src = `const A = () => <ul>{['a', 'b', 'c'].map((x) => <li key={x}>{x}</li>)}</ul>;`;
    expect(arrayOrderSite({ file: F, source: src, ...at(src, 'li'), count: 3, read })).toEqual({ file: F, line: 1, column: 22, name: '[…]' });
  });
});
