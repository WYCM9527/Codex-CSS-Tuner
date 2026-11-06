import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jsxAttrSite, jsxChildSite, type MessageRef } from '@css-tuner/engine';
import { setLocale, type CallerLoc, type ElementSnapshot, type PageInfo, type SourceLoc, type TextSegment } from '@css-tuner/protocol';
import { MessageFiles } from '../src/messages';
import { oneLine, planText, routeLocale, textKey, type TextContext } from '../src/planner';
import type { ProjectResolver } from '../src/project';

const root = mkdtempSync(join(tmpdir(), 'css-tuner-text-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function put(rel: string, content: string): string {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

const APP = put(
  'src/App.tsx',
  [
    "import { useTranslation } from 'react-i18next';",
    "import { Card } from './Card';",
    '',
    'export function App() {',
    '  const { t } = useTranslation();',
    '  const n = 3;',
    '  return (',
    '    <main>',
    '      <h1>欢迎回来</h1>',
    "      <p>{t('home.lead')}</p>",
    '      <p>{n} 个条目</p>',
    '      <Card title="第一张">卡片内容</Card>',
    "      <Card title={t('home.card')} />",
    "      <p>{t('home.missing')}</p>",
    "      <span>{t('home.brand')}</span>",
    '    </main>',
    '  );',
    '}',
  ].join('\n'),
);
const CARD = put(
  'src/Card.tsx',
  ['export function Card({ title, children }) {', '  return (', '    <div>', '      <h2>{title}</h2>', '      <p>{children}</p>', '    </div>', '  );', '}'].join('\n'),
);
const ZH = put('src/locales/zh.json', JSON.stringify({ home: { lead: '一句介绍', card: '翻译的标题', brand: 'Acme' } }, null, 2));
const EN = put('src/locales/en.json', JSON.stringify({ home: { lead: 'An intro', card: 'Translated title', brand: 'Acme' } }, null, 2));
// 和 zh.json 里同一个键、同一段文字：不跳过的话会变成“找到多处”
put('package.json', JSON.stringify({ name: 'x', home: { lead: '一句介绍' } }));
put('node_modules/lib/zh.json', JSON.stringify({ home: { lead: '一句介绍' } }));

const read = (f: string) => readFileSync(f, 'utf8');

/** 文件里 needle（以 `<` 开头）所在的行列，从 1 开始 */
function loc(file: string, needle: string, component: string | null = 'App', viaOwner = false): SourceLoc {
  const src = read(file);
  const before = src.slice(0, src.indexOf(needle)).split('\n');
  return { url: '', path: `/${relative(root, file)}`, file, line: before.length, column: before[before.length - 1].length + 1, component, viaOwner };
}

function el(source: SourceLoc | null, segments: TextSegment[], over: Partial<ElementSnapshot> = {}): ElementSnapshot {
  return {
    uid: 'u1',
    tag: 'p',
    id: null,
    classes: [],
    label: 'p',
    rect: { x: 0, y: 0, w: 0, h: 0 },
    breadcrumb: [],
    children: [],
    source,
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
    text: { segments, htmlPath: null, lang: 'zh-CN' },
    ...over,
  } as ElementSnapshot;
}

const project = {
  fileFor: (_url: string, path: string, file: string | null) => file ?? join(root, path),
  label: (f: string) => relative(root, f),
  htmlFileFor: () => join(root, 'index.html'),
} as unknown as ProjectResolver;

const messages = new MessageFiles();
const ctx: TextContext = {
  page: { url: 'http://localhost:5173/' } as PageInfo,
  project,
  textChild: (file, line, column, index) => jsxChildSite(read(file), file, line, column, index),
  textAttr: (file, line, column, name) => jsxAttrSite(read(file), file, line, column, name),
  message: (_near, ref, text, lang) => messages.find(root, ref, text, lang),
};

const firstCard: CallerLoc = { source: loc(APP, '<Card title="第一张"'), component: 'Card', same: 1 };
const cardTitle = (uid: string) =>
  el(loc(CARD, '<h2', 'Card'), [{ value: '第一张', child: 0, props: [{ depth: 1, name: 'title' }] }], { uid, tag: 'h2', sameSource: 2, callers: [firstCard] });

beforeEach(() => setLocale('zh-CN'));
afterEach(() => setLocale('en'));

describe('文字写在哪', () => {
  it('元素自己 JSX 里的字面量写回原位', () => {
    const p = planText(el(loc(APP, '<h1'), [{ value: '欢迎回来', child: 0, props: [] }], { tag: 'h1' }), 0, ctx);
    expect(p.origin).toBe('jsx');
    expect(p.write).toMatchObject({ kind: 'jsxText', file: APP, line: 9, segment: 0 });
    expect(p.view).toMatchObject({ kind: 'source', label: 'src/App.tsx:9', affects: 1 });
  });

  it('t() 调用改当前语言的多语言文件', () => {
    const p = planText(el(loc(APP, "<p>{t('home.lead')"), [{ value: '一句介绍', child: 0, props: [] }]), 0, ctx);
    expect(p.origin).toBe('message');
    expect(p.write).toEqual({ kind: 'message', file: ZH, keyPath: ['home', 'lead'] });
    expect(p.view.label).toBe('src/locales/zh.json home.lead');
  });

  it('同一个元素里，动态的那段交给 Codex 并说明来自哪段代码，字面量那段照常写回', () => {
    const e = el(loc(APP, '<p>{n}'), [
      { value: '3', child: 0, props: [] },
      { value: ' 个条目', child: 1, props: [] },
    ]);
    const dyn = planText(e, 0, ctx);
    expect(dyn.origin).toBe('dynamic');
    expect(dyn.write).toEqual({ kind: 'agent', reason: '文字是代码（n）生成的，不是直接写出来的' });
    expect(planText(e, 1, ctx).write).toMatchObject({ kind: 'jsxText', line: 11, segment: 1 });
  });

  it('组件里 {title} 显示的文字改到调用处的属性上，只影响这一处调用', () => {
    const p = planText(cardTitle('u1'), 0, ctx);
    expect(p.origin).toBe('prop');
    expect(p.write).toMatchObject({ kind: 'jsxAttr', file: APP, line: 12, name: 'title' });
    expect(p.view).toMatchObject({ label: 'src/App.tsx:12 <Card> title', affects: 1 });
    expect(p.preview).toMatchObject({ kind: 'text', depth: 1 });
  });

  it('children 传进来的文字改到调用处的 children', () => {
    const e = el(loc(CARD, '<p', 'Card'), [{ value: '卡片内容', child: 0, props: [{ depth: 1, name: 'children', child: 0 }] }], { sameSource: 2, callers: [firstCard] });
    const p = planText(e, 0, ctx);
    expect(p.write).toMatchObject({ kind: 'jsxText', file: APP, line: 12, segment: 0 });
    expect(p.view.label).toBe('src/App.tsx:12 <Card> children');
  });

  it('调用处属性里的 t() 调用也改多语言文件', () => {
    const caller: CallerLoc = { source: loc(APP, '<Card title={t'), component: 'Card', same: 1 };
    const e = el(loc(CARD, '<h2', 'Card'), [{ value: '翻译的标题', child: 0, props: [{ depth: 1, name: 'title' }] }], { tag: 'h2', sameSource: 2, callers: [caller] });
    expect(planText(e, 0, ctx).write).toEqual({ kind: 'message', file: ZH, keyPath: ['home', 'card'] });
  });

  it('多语言文件里找不到时交给 Codex，附上那段翻译调用', () => {
    const p = planText(el(loc(APP, "<p>{t('home.missing')"), [{ value: '缺的文字', child: 0, props: [] }]), 0, ctx);
    expect(p.write.kind).toBe('agent');
    expect(p.code).toBe("t('home.missing')");
    expect(p.view.kind === 'agent' && p.view.reason).toContain('home.missing');
  });

  it('同一段文字几种语言里都有时，地址里的语言段比 <html lang> 优先', () => {
    const seg = [{ value: 'Acme', child: 0, props: [] }];
    const e = el(loc(APP, "<span>{t('home.brand')"), seg, { tag: 'span', text: { segments: seg, htmlPath: null, lang: 'en' } });
    expect(planText(e, 0, { ...ctx, page: { url: 'http://localhost:3000/zh/about' } as PageInfo }).write).toEqual({ kind: 'message', file: ZH, keyPath: ['home', 'brand'] });
    expect(planText(e, 0, ctx).write).toEqual({ kind: 'message', file: EN, keyPath: ['home', 'brand'] });
  });

  it('地址第一段像语言代码时才当作语言', () => {
    expect(routeLocale('http://localhost:3000/zh/about')).toBe('zh');
    expect(routeLocale('http://localhost:3000/en-us')).toBe('en-US');
    expect(routeLocale('http://localhost:3000/zh_CN/x')).toBe('zh-CN');
    expect(routeLocale('http://localhost:3000/docs/x')).toBeNull();
    expect(routeLocale('http://localhost:3000/')).toBeNull();
  });

  it('源码里的字面量和页面上的对不上时不硬改', () => {
    const p = planText(el(loc(APP, '<h1'), [{ value: '页面上别的字', child: 0, props: [] }], { tag: 'h1' }), 0, ctx);
    expect(p.write.kind).toBe('agent');
  });

  it('纯 HTML 页面写回 HTML 文件，按路径定位元素', () => {
    const e = el(null, [{ value: '\n    价格\n  ', child: null, props: [] }], { text: { segments: [{ value: '\n    价格\n  ', child: null, props: [] }], htmlPath: [1, 0, 2], lang: null } });
    const p = planText(e, 0, { ...ctx, page: { url: 'http://127.0.0.1:61312/index.html' } as PageInfo });
    expect(p.origin).toBe('html');
    expect(p.write).toEqual({ kind: 'htmlText', file: join(root, 'index.html'), path: [1, 0, 2], tag: 'p', segment: 0 });
    expect(p.preview).toMatchObject({ kind: 'text', sourceKey: null, htmlPath: [1, 0, 2] });
  });
});

describe('文字改动的标识', () => {
  it('写到同一处源码的改动合成一条，和是哪个元素无关', () => {
    const a = cardTitle('u1');
    const b = cardTitle('u2');
    expect(textKey(planText(a, 0, ctx), a, 0)).toBe(textKey(planText(b, 0, ctx), b, 0));
    expect(textKey(planText(a, 0, ctx), a, 0)).toMatch(/^text\|attr\|/);
  });

  it('交给 Codex 的按元素和第几段区分', () => {
    const e = el(loc(APP, '<p>{n}'), [{ value: '3', child: 0, props: [] }]);
    const p = planText(e, 0, ctx);
    expect(textKey(p, e, 0)).not.toBe(textKey(p, e, 1));
  });

  it('跨行的文字折成一行显示和比较', () => {
    expect(oneLine('\n    这段文字在 HTML 里\n    分成了两行\n  ')).toBe('这段文字在 HTML 里 分成了两行');
  });
});

describe('多语言文件', () => {
  const ref: MessageRef = { key: 'home.lead', ns: null, prefix: null, lib: 'i18next' };

  it('跳过依赖目录和配置文件；同一个键在几种语言里时，按页面语言挑', () => {
    const m = new MessageFiles();
    expect(m.find(root, ref, '一句介绍', null)).toEqual({ file: ZH, keyPath: ['home', 'lead'] });
    expect(m.find(root, ref, 'An intro', 'en-US')).toEqual({ file: EN, keyPath: ['home', 'lead'] });
    expect(m.find(root, ref, '没有这段', 'zh-CN')).toHaveProperty('reason');
  });

  it('文件改过之后重新读', () => {
    const m = new MessageFiles();
    expect(m.find(root, ref, '一句介绍', 'zh-CN')).toHaveProperty('file', ZH);
    const before = read(ZH);
    writeFileSync(ZH, JSON.stringify({ home: { lead: '改过的介绍', card: '翻译的标题', brand: 'Acme' } }, null, 2));
    try {
      expect(m.find(root, ref, '改过的介绍', 'zh-CN')).toHaveProperty('file', ZH);
    } finally {
      writeFileSync(ZH, before);
    }
  });
});
