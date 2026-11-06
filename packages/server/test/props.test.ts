import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jsxPropSite } from '@css-tuner/engine';
import { setLocale, t, type ElementSnapshot, type PageInfo, type PropsInfo, type SourceLoc } from '@css-tuner/protocol';
import { planProp, propKey, type PropContext } from '../src/planner';
import type { ProjectResolver } from '../src/project';

const root = mkdtempSync(join(tmpdir(), 'css-tuner-props-'));
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
    "import { Button } from './Button';",
    '',
    'export function App({ rest, v }) {',
    '  return (',
    '    <main>',
    '      <Button variant="outline" size="sm">甲</Button>',
    '      <Button>乙</Button>',
    '      <Button variant={v}>丙</Button>',
    '      <Button {...rest} variant="ghost">丁</Button>',
    '      <Button variant="solid" {...rest}>戊</Button>',
    '    </main>',
    '  );',
    '}',
  ].join('\n'),
);

const read = (f: string) => readFileSync(f, 'utf8');

/** 文件里 needle（以 `<` 开头）所在的行列，从 1 开始 */
function loc(needle: string): SourceLoc {
  const src = read(APP);
  const before = src.slice(0, src.indexOf(needle)).split('\n');
  return { url: '', path: `/${relative(root, APP)}`, file: APP, line: before.length, column: before[before.length - 1].length + 1, component: 'App', viaOwner: false };
}

function el(source: SourceLoc | null, over: Partial<PropsInfo> = {}): ElementSnapshot {
  const props: PropsInfo = { component: 'Button', source, props: [], server: false, live: true, same: 2, direct: true, ...over };
  return {
    uid: 'u1',
    tag: 'button',
    id: null,
    classes: [],
    label: 'button',
    rect: { x: 0, y: 0, w: 0, h: 0 },
    breadcrumb: [],
    children: [],
    source: { url: '', path: '/src/Button.tsx', file: join(root, 'src/Button.tsx'), line: 3, column: 10, component: 'Button', viaOwner: false },
    sameSource: 5,
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
    props,
  } as ElementSnapshot;
}

const project = {
  fileFor: (_url: string, path: string, file: string | null) => file ?? join(root, path),
  label: (f: string) => relative(root, f),
} as unknown as ProjectResolver;

const ctx: PropContext = {
  page: { url: 'http://localhost:5173/' } as PageInfo,
  project,
  propSite: (file, line, column, name, tag) => jsxPropSite(read(file), file, line, column, name, tag),
};

beforeEach(() => setLocale('zh-CN'));
afterEach(() => setLocale('en'));

describe('属性写在哪', () => {
  it('调用处写的字面量就地改；没写的加在这个调用上', () => {
    const at = loc('<Button variant="outline"');
    const p = planProp(el(at), 'variant', ctx);
    expect(p.write).toEqual({ kind: 'jsxProp', file: APP, line: at.line, column: at.column, name: 'variant', tag: 'Button' });
    expect(p.site).toMatchObject({ kind: 'literal', value: 'outline' });
    expect(p.view).toMatchObject({ kind: 'source', label: `src/App.tsx:${at.line} <Button> variant`, affects: 2 });
    expect(p.preview).toEqual({ kind: 'props', uid: 'u1', name: 'variant', anchor: { path: '/src/Button.tsx', line: 3, column: 10, index: 0 } });
    expect(p.warn).toBeUndefined();

    const missing = planProp(el(loc('<Button>乙')), 'size', ctx);
    expect(missing.write.kind).toBe('jsxProp');
    expect(missing.site).toEqual({ kind: 'missing' });
  });

  it('调用处是表达式、或找不到调用处时交给 Codex', () => {
    const dyn = planProp(el(loc('<Button variant={v}')), 'variant', ctx);
    expect(dyn.write.kind).toBe('agent');
    expect(dyn.view.reason).toBe(t('engine.prop.dynamic', { name: 'variant', code: 'variant={v}' }));
    expect(planProp(el(null), 'variant', ctx).view.reason).toBe(t('plan.prop.noSource'));
    expect(planProp({ ...el(null), props: undefined }, 'variant', ctx).write.kind).toBe('agent');
  });

  it('调用处有展开写法时提醒：展开在后面可能盖掉这个值；没写的属性会加在展开后面', () => {
    expect(planProp(el(loc('<Button variant="solid"')), 'variant', ctx).warn).toBe(t('plan.prop.spreadAfter'));
    expect(planProp(el(loc('<Button {...rest}')), 'variant', ctx).warn).toBeUndefined();
    expect(planProp(el(loc('<Button {...rest}')), 'size', ctx).warn).toBe(t('plan.prop.spreadBefore'));
  });
});

describe('属性改动的标识', () => {
  it('同一个调用处的同一个属性合并成一条；交给 Codex 的按调用处的位置', () => {
    const at = loc('<Button variant="outline"');
    const a = el(at);
    const b = { ...el(at), uid: 'u2' };
    expect(propKey(planProp(a, 'variant', ctx), a, 'variant')).toBe(propKey(planProp(b, 'variant', ctx), b, 'variant'));
    expect(propKey(planProp(a, 'variant', ctx), a, 'variant')).not.toBe(propKey(planProp(a, 'size', ctx), a, 'size'));
    const dyn = el(loc('<Button variant={v}'));
    expect(propKey(planProp(dyn, 'variant', ctx), dyn, 'variant')).toMatch(/^prop\|agent\|.*\|variant$/);
  });
});
