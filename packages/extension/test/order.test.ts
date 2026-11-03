import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyEdits, arrayOrderSite, editArrayOrder, editJsxOrder, jsxOrderCheck } from '@css-tuner/engine';
import { setLocale, type ElementSnapshot, type OrderInfo, type OrderUnit, type PageInfo, type SourceLoc } from '@css-tuner/protocol';
import { planOrder, type OrderContext } from '../src/planner';
import type { ProjectResolver } from '../src/project';

const root = mkdtempSync(join(tmpdir(), 'css-tuner-order-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, content: string): string {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

const NAV = put(
  'src/Nav.tsx',
  [
    "import { links } from './links';",
    '',
    'export function Nav() {',
    '  return (',
    '    <nav>',
    '      <a href="/">首页</a>',
    '      <a href="/docs">文档</a>',
    '      <Footer />',
    '    </nav>',
    '  );',
    '}',
    '',
    'export function List() {',
    '  return (',
    '    <ul>',
    '      {links.map((l) => (',
    '        <li key={l.href}>{l.label}</li>',
    '      ))}',
    '    </ul>',
    '  );',
    '}',
  ].join('\n'),
);
const LINKS = put('src/links.ts', ["export const links = [", "  { href: '/a', label: 'A' },", "  { href: '/b', label: 'B' },", "  { href: '/c', label: 'C' },", '];'].join('\n'));
const OTHER = put('src/Other.tsx', 'export const Other = () => <aside>旁注</aside>;\n');

const read = (f: string) => readFileSync(f, 'utf8');
const readOrNull = (f: string) => {
  try {
    return read(f);
  } catch {
    return null;
  }
};

/** 文件里 needle（以 `<` 开头）所在的行列，从 1 开始 */
function loc(file: string, needle: string): SourceLoc {
  const src = read(file);
  const before = src.slice(0, src.indexOf(needle)).split('\n');
  return { url: '', path: `/${relative(root, file)}`, file, line: before.length, column: before[before.length - 1].length + 1, component: 'Nav', viaOwner: false };
}

const unit = (uid: string, source: SourceLoc | null, name: string, sig = `${name}|${uid}`): OrderUnit => ({ uids: [uid], label: name, source, name, sig });

function el(order: OrderInfo, over: Partial<ElementSnapshot> = {}): ElementSnapshot {
  const self = order.units[order.index];
  return {
    uid: self.uids[0],
    tag: self.name,
    id: null,
    classes: [],
    label: self.label,
    rect: { x: 0, y: 0, w: 0, h: 0 },
    breadcrumb: [
      { uid: 'p', label: 'nav' },
      { uid: self.uids[0], label: self.label },
    ],
    children: [],
    source: self.source,
    sameSource: 1,
    sourceIndex: 0,
    callers: [],
    classCounts: {},
    computed: {},
    winners: {},
    vars: [],
    rules: [],
    inline: {},
    fontSizePx: 16,
    rootFontSizePx: 16,
    order,
    ...over,
  } as ElementSnapshot;
}

const project = {
  fileFor: (_url: string, path: string, file: string | null) => file ?? join(root, path),
  label: (f: string) => relative(root, f),
  htmlFileFor: () => join(root, 'index.html'),
} as unknown as ProjectResolver;

const ctx: OrderContext = {
  page: { url: 'http://localhost:5173/' } as PageInfo,
  project,
  jsxOrder: (f, sites) => jsxOrderCheck(read(f), f, sites),
  arraySite: (f, line, column, count) => arrayOrderSite({ file: f, source: read(f), line, column, count, read: readOrNull }),
};

const navUnits = () => [unit('a1', loc(NAV, '<a href="/"'), 'a'), unit('a2', loc(NAV, '<a href="/docs"'), 'a'), unit('f', loc(NAV, '<Footer'), 'Footer')];
const info = (units: OrderUnit[], over: Partial<OrderInfo> = {}): OrderInfo => ({ units, index: 0, layout: 'flex', axis: 'x', mapped: null, htmlPath: null, ...over });

beforeEach(() => setLocale('zh-CN'));
afterEach(() => setLocale('en'));

describe('换序写到哪', () => {
  it('写死的兄弟改 JSX：目标显示父元素的位置，写回按新顺序排子节点', () => {
    const p = planOrder(el(info(navUnits())), ctx)!;
    expect(p.view).toMatchObject({ kind: 'source', label: 'src/Nav.tsx:5 <nav>', file: NAV, line: 5, column: 5 });
    expect(p.key).toBe(`order|jsx|${NAV}|6:7,7:7,8:7`);
    const w = p.write([1, 0, 2]);
    expect(w).toMatchObject({ kind: 'jsxOrder', file: NAV, order: [1, 0, 2] });
    if (w.kind !== 'jsxOrder') throw new Error(w.kind);
    const r = editJsxOrder({ file: w.file, source: read(NAV), sites: w.sites, order: w.order });
    if (!r.ok) throw new Error(r.reason);
    expect(applyEdits(read(NAV), r.edits)).toContain('<a href="/docs">文档</a>\n      <a href="/">首页</a>\n      <Footer />');
  });

  it('预览带上选中元素的源码位置，刷新后据此找回这一组', () => {
    const e = el(info(navUnits(), { index: 1 }), { sourceIndex: 2 });
    const t = planOrder(e, ctx)!.preview([1, 0, 2]);
    expect(t).toEqual({ kind: 'order', uid: 'a2', order: [1, 0, 2], mapped: null, anchor: { path: '/src/Nav.tsx', line: 7, column: 7, index: 2 } });
  });

  it('.map() 渲染的列表改数组字面量，目标显示数组的位置', () => {
    const li = loc(NAV, '<li key');
    const units = ['l0', 'l1', 'l2'].map((u) => unit(u, li, 'li'));
    const p = planOrder(el(info(units, { mapped: `/src/Nav.tsx:${li.line}:${li.column}`, axis: 'y' })), ctx)!;
    expect(p.view).toMatchObject({ kind: 'source', label: 'src/links.ts:1 links', file: LINKS, line: 1 });
    expect(p.key).toBe(`order|array|${LINKS}|1|22`);
    const w = p.write([2, 0, 1]);
    expect(w).toEqual({ kind: 'arrayOrder', file: NAV, line: li.line, column: li.column, count: 3, order: [2, 0, 1] });
    if (w.kind !== 'arrayOrder') throw new Error(w.kind);
    const r = editArrayOrder({ ...w, source: read(NAV), read: readOrNull });
    if (!r.ok) throw new Error(r.reason);
    expect(r.file).toBe(LINKS);
    expect(applyEdits(read(LINKS), r.edits).replace(/\s+/g, ' ')).toContain("{ href: '/c', label: 'C' }, { href: '/a', label: 'A' }, { href: '/b', label: 'B' },");
  });

  it('纯 HTML 页面改 HTML 文件里父元素的子元素', () => {
    const units = [unit('h1', null, 'li'), unit('h2', null, 'li'), unit('h3', null, 'p')];
    const p = planOrder(el(info(units, { htmlPath: [1, 0, 0] })), ctx)!;
    const html = join(root, 'index.html');
    expect(p.key).toBe(`order|html|${html}|1.0`);
    expect(p.view).toMatchObject({ kind: 'source', label: 'index.html <nav>', file: html });
    expect(p.write([2, 0, 1])).toEqual({ kind: 'htmlOrder', file: html, path: [1, 0], tags: ['li', 'li', 'p'], order: [2, 0, 1] });
  });

  it('写不回时交给 Agent 并说明原因', () => {
    const units = navUnits();
    const why = (us: OrderUnit[]) => planOrder(el(info(us)), ctx)!.view.reason;
    expect(why([units[0], { ...units[1], source: null }])).toBe('找不到这组兄弟写在源码的哪里');
    expect(why([units[0], unit('o', loc(OTHER, '<aside'), 'aside')])).toBe('这组兄弟写在不同的文件里');
    expect(why([units[0], { ...units[1], name: 'button' }])).toMatch(/对不上/);
    const p = planOrder(el(info([units[0], { ...units[1], source: null }])), ctx)!;
    expect(p.write([1, 0])).toEqual({ kind: 'agent', reason: '找不到这组兄弟写在源码的哪里' });
    expect(p.view.kind).toBe('agent');
  });

  it('没有可换序的兄弟时不规划', () => {
    expect(planOrder(el(info(navUnits()), { order: undefined }), ctx)).toBeNull();
    expect(planOrder(el(info(navUnits().slice(0, 1))), ctx)).toBeNull();
  });
});
