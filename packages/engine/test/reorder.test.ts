import { describe, expect, it } from 'vitest';
import { applyEdits, arrayOrderSite, editArrayOrder, editHtmlOrder, editJsxOrder, jsxOrderCheck, orderSummary, type OrderSite } from '../src';

const F = '/p/src/App.tsx';

/** 源码里第 n 个 `<tag` 的行列（行列从 1 开始） */
function at(source: string, tag: string, n = 0): OrderSite {
  let i = -1;
  for (let k = 0; k <= n; k++) i = source.indexOf(`<${tag}`, i + 1);
  const before = source.slice(0, i).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

function jsx(source: string, sites: OrderSite[], order: number[]) {
  const r = editJsxOrder({ file: F, source, sites, order });
  return r.ok ? applyEdits(source, r.edits) : r.reason;
}

describe('JSX 兄弟换序', () => {
  it('换两项：缩进、换行原样留着，补丁只覆盖变化的部分', () => {
    const src = `const A = () => (\n  <nav>\n    <a href="/">Home</a>\n    <a href="/about">About</a>\n    <a href="/blog">Blog</a>\n  </nav>\n);`;
    const sites = [at(src, 'a', 0), at(src, 'a', 1), at(src, 'a', 2)];
    expect(jsx(src, sites, [1, 0, 2])).toBe(`const A = () => (\n  <nav>\n    <a href="/about">About</a>\n    <a href="/">Home</a>\n    <a href="/blog">Blog</a>\n  </nav>\n);`);
    const r = editJsxOrder({ file: F, source: src, sites, order: [1, 0, 2] });
    expect(r.ok && r.edits[0].start).toBeGreaterThan(src.indexOf('<a href="/"') - 1);
    expect(r.ok && r.edits[0].end).toBeLessThanOrEqual(src.indexOf('<a href="/blog"'));
    expect(r.ok && r.summary).toMatch(/item 2 → position 1|第 2 项 → 第 1 位/);
  });

  it('多行、长短不一的项整体挪动，紧挨在上面的 {/* 注释 */} 跟着走', () => {
    const src = [
      'export function Page() {',
      '  return (',
      '    <main>',
      '      {/* 头图 */}',
      '      <section className="hero">',
      '        <h1>Hi</h1>',
      '      </section>',
      '      <p>Short</p>',
      '      <Footer year={2026} />',
      '    </main>',
      '  );',
      '}',
    ].join('\n');
    const sites = [at(src, 'section'), at(src, 'p'), { ...at(src, 'Footer'), name: 'Footer' }];
    expect(jsx(src, sites, [1, 2, 0])).toBe(
      [
        'export function Page() {',
        '  return (',
        '    <main>',
        '      <p>Short</p>',
        '      <Footer year={2026} />',
        '      {/* 头图 */}',
        '      <section className="hero">',
        '        <h1>Hi</h1>',
        '      </section>',
        '    </main>',
        '  );',
        '}',
      ].join('\n'),
    );
  });

  it('条件渲染和 .map() 块各算一项，同一行的项也能换', () => {
    const src = `const A = ({ show, xs }) => <ul><li>Head</li>{show && <li>Maybe</li>}{xs.map((x) => <li key={x}>{x}</li>)}</ul>;`;
    const sites = [at(src, 'li', 0), at(src, 'li', 1), at(src, 'li', 2)];
    expect(jsx(src, sites, [2, 0, 1])).toBe(`const A = ({ show, xs }) => <ul>{xs.map((x) => <li key={x}>{x}</li>)}<li>Head</li>{show && <li>Maybe</li>}</ul>;`);
  });

  it('children 经组件传给别处渲染时，按写它们的那个 JSX 父元素换', () => {
    const src = `const A = () => (\n  <Card>\n    <h2>T</h2>\n    <p>B</p>\n  </Card>\n);`;
    expect(jsxOrderCheck(src, F, [at(src, 'h2'), at(src, 'p')])).toEqual({ ok: true, parent: '<Card>', ...at(src, 'Card') });
    expect(jsx(src, [at(src, 'h2'), at(src, 'p')], [1, 0])).toBe(`const A = () => (\n  <Card>\n    <p>B</p>\n    <h2>T</h2>\n  </Card>\n);`);
  });

  it('不在同一个父元素里、顺序和页面不同、标签对不上时不改', () => {
    const src = `const A = () => (\n  <div>\n    <section><h1>a</h1></section>\n    <p>b</p>\n  </div>\n);`;
    // h1 和 p 的共同父元素是 div，但 h1 只是 section 里面的东西：在 div 下它俩对应的是 section 和 p，各自不同项，可以换
    expect(jsx(src, [at(src, 'section'), at(src, 'p')], [1, 0])).toContain('<p>b</p>\n    <section>');
    expect(jsx(src, [at(src, 'p'), at(src, 'section')], [1, 0])).toMatch(/doesn't match the page|对不上/);
    expect(jsx(src, [{ ...at(src, 'section'), name: 'article' }, at(src, 'p')], [1, 0])).toMatch(/doesn't match the page|对不上/);
    const viaAttr = `const A = () => <Layout header={<h1>T</h1>}><p>B</p></Layout>;`;
    expect(jsx(viaAttr, [at(viaAttr, 'h1'), at(viaAttr, 'p')], [1, 0])).toMatch(/aren't written next to each other|不是并排写在/);
    expect(jsx(src, [at(src, 'section'), at(src, 'p')], [0, 0])).toMatch(/number of items|个数对不上/);
  });
});

describe('.map() 渲染的数组换序', () => {
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

  it('同文件的 const 数组：独占一行的注释跟着项走，行尾注释和尾逗号留在原处', () => {
    const r = editArrayOrder({ file: F, source: page, ...at(page, 'a'), count: 3, order: [2, 0, 1], read });
    expect(r.ok && r.file).toBe(F);
    const out = r.ok ? applyEdits(page, r.edits) : r.reason;
    expect(out).toContain(["const links = [", "  { href: '/blog', label: 'Blog' },", "  // 首页", "  { href: '/', label: 'Home' }, // 关于", "  { href: '/about', label: 'About' },", '] as const;'].join('\n'));
    expect(arrayOrderSite({ file: F, source: page, ...at(page, 'a'), count: 3, read })).toEqual({ file: F, line: 2, column: 15, name: 'links' });
  });

  it('相对路径导入的数组改在导出它的文件里', () => {
    const r = editArrayOrder({ file: F, source: page, ...at(page, 'Plan'), count: 3, order: [2, 1, 0], read });
    expect(r.ok && r.file).toBe('/p/src/data.ts');
    expect(r.ok && applyEdits(data, r.edits)).toBe("export const plans = [\n  { id: 'team' },\n  { id: 'pro' },\n  { id: 'starter' },\n];\n");
    const reexport = { '/p/src/data.ts': "const all = [1, 2];\nexport { all as plans };\n" };
    const r2 = editArrayOrder({ file: F, source: page, ...at(page, 'Plan'), count: 2, order: [1, 0], read: (f) => reexport[f as keyof typeof reexport] ?? null });
    expect(r2.ok && applyEdits(reexport['/p/src/data.ts'], r2.edits)).toBe('const all = [2, 1];\nexport { all as plans };\n');
  });

  it('参数传进来的、筛选过的、项数对不上的、有展开的、来自 JSON 的都不改', () => {
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

  it('直接写在 .map() 前面的数组字面量也能换', () => {
    const src = `const A = () => <ul>{['a', 'b', 'c'].map((x) => <li key={x}>{x}</li>)}</ul>;`;
    const r = editArrayOrder({ file: F, source: src, ...at(src, 'li'), count: 3, order: [0, 2, 1], read });
    expect(r.ok && applyEdits(src, r.edits)).toBe(`const A = () => <ul>{['a', 'c', 'b'].map((x) => <li key={x}>{x}</li>)}</ul>;`);
  });
});

describe('纯 HTML 子元素换序', () => {
  const html = '<!doctype html>\n<html>\n<body>\n  <ul class="list">\n    <li>One</li>\n    <li class="b">Two</li>\n    <script>1</script>\n    <li>Three</li>\n  </ul>\n</body>\n</html>\n';

  it('script 留在原处，只换可挪动的子元素', () => {
    const r = editHtmlOrder({ file: '/p/index.html', source: html, path: [1, 0], tags: ['li', 'li', 'li'], order: [2, 0, 1] });
    expect(r.ok && applyEdits(html, r.edits)).toBe('<!doctype html>\n<html>\n<body>\n  <ul class="list">\n    <li>Three</li>\n    <li>One</li>\n    <script>1</script>\n    <li class="b">Two</li>\n  </ul>\n</body>\n</html>\n');
  });

  it('子元素和页面对不上、没有闭合标签时不改', () => {
    expect(editHtmlOrder({ file: '/p/index.html', source: html, path: [1, 0], tags: ['li', 'p', 'li'], order: [1, 0, 2] })).toMatchObject({ ok: false });
    const open = '<html><body><ul><li>a<li>b</ul></body></html>';
    expect(editHtmlOrder({ file: '/p/index.html', source: open, path: [1, 0], tags: ['li', 'li'], order: [1, 0] })).toEqual({ ok: false, reason: expect.stringMatching(/closing tag|闭合标签/) });
  });
});

describe('换序说明', () => {
  it('只挪了一项时说从第几到第几，否则列出新顺序', () => {
    expect(orderSummary([1, 2, 0])).toMatch(/item 1 → position 3|第 1 项 → 第 3 位/);
    expect(orderSummary([2, 0, 1])).toMatch(/item 3 → position 1|第 3 项 → 第 1 位/);
    expect(orderSummary([1, 0, 3, 2])).toMatch(/2 1 4 3/);
  });
});
