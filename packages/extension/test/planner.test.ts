import { describe, expect, it } from 'vitest';
import type { CallerLoc, ElementSnapshot, PageInfo, RuleRef, SourceLoc } from '@css-tuner/protocol';
import { plan, scopeAll, type PlanContext } from '../src/planner';
import type { ProjectResolver } from '../src/project';
import type { SiteInfo } from '../src/sites';

const rule = (over: Partial<RuleRef> = {}): RuleRef => ({
  sheet: { index: 0, devId: null, href: null },
  path: [0],
  selector: '.card',
  fullSelector: '.card',
  conditions: [],
  layer: null,
  ordinal: 0,
  matchCount: 2,
  utility: null,
  ...over,
});

const page: PageInfo = {
  url: 'http://localhost:5173/',
  title: '',
  react: true,
  vite: true,
  sheets: [{ index: 0, devId: null, href: null, inline: false, tailwind: false, ruleCount: 3 }],
  rootVars: [],
};

const ctx: PlanContext = {
  page,
  project: { label: (f: string) => f.replace('/repo/', ''), sheetFile: () => '/repo/src/app.css', fileFor: () => null } as unknown as ProjectResolver,
  strategy: 'editRule',
  varStrategy: 'editDefinition',
  scope: 'source',
  classSite: () => null,
  classLiterals: () => null,
  ruleSource: () => null,
  isUtility: () => false,
  tailwindMajor: null,
};

/** 纯 CSS 项目里的 section.card，rules 按层叠优先级从低到高 */
const card = (rules: RuleRef[]): ElementSnapshot => ({
  uid: 'u1',
  tag: 'section',
  id: null,
  classes: ['card'],
  label: 'section.card',
  rect: { x: 0, y: 0, w: 100, h: 100 },
  breadcrumb: [],
  children: [],
  source: null,
  sameSource: 1,
  sourceIndex: 0,
  callers: [],
  classCounts: {},
  computed: {},
  winners: {},
  vars: [],
  rules,
  inline: {},
  fontSizePx: 16,
  rootFontSizePx: 16,
});

describe('没声明过的属性加到哪条规则', () => {
  const wide = rule({ path: [5, 0], conditions: ['@media (min-width: 768px)'] });

  it('跳过 @media 里同名的规则，不然换个窗口宽度加的样式就没了', () => {
    const p = plan(card([rule(), wide]), 'border-top-width', ctx);
    expect(p.write).toMatchObject({ kind: 'css', mode: 'add', selector: '.card', conditions: [] });
  });

  it('@layer 不算条件；只有带条件的规则时照样加进去', () => {
    const layered = rule({ conditions: ['@layer components'], layer: 'components' });
    expect(plan(card([layered, wide]), 'border-top-width', ctx).write).toMatchObject({ mode: 'add', conditions: ['@layer components'] });
    expect(plan(card([wide]), 'border-top-width', ctx).write).toMatchObject({ mode: 'add', conditions: ['@media (min-width: 768px)'] });
  });
});

describe('「只改这个」和「全部」有没有区别', () => {
  const loc = (path: string, line: number, component: string | null = null): SourceLoc => ({ url: `http://localhost:5173${path}`, path, file: `/repo${path}`, line, column: 5, component, viaOwner: false });
  const site = (over: Partial<SiteInfo> = {}): SiteInfo => ({ tokens: [], hasClassName: false, merges: false, passesClassName: false, recipe: null, ...over });
  /** Badge.tsx 第 3 行：<span className={cn('rounded-full', className)}>，App.tsx 第 15 行：<Badge /> */
  const sites: Record<string, SiteInfo> = {
    '/repo/src/Badge.tsx:3': site({ tokens: ['rounded-full'], hasClassName: true, merges: true, passesClassName: true }),
    '/repo/src/App.tsx:15': site(),
  };
  const tw: PlanContext = {
    ...ctx,
    page: { ...page, sheets: [{ index: 0, devId: '/src/index.css', href: null, inline: false, tailwind: true, ruleCount: 10 }] },
    project: { label: (f: string) => f.replace('/repo/', ''), sheetFile: () => '/repo/src/index.css', fileFor: (_url: string, path: string) => `/repo${path}` } as unknown as ProjectResolver,
    scope: 'instance',
    classSite: (f, line) => sites[`${f}:${line}`] ?? null,
    classLiterals: () => [],
  };
  /** 页面上 3 个 Badge 里的 span */
  const badge = (callers: CallerLoc[]): ElementSnapshot => ({ ...card([]), tag: 'span', classes: ['rounded-full'], label: 'span.rounded-full', source: loc('/src/Badge.tsx', 3, 'Badge'), sameSource: 3, callers });
  const usedAt = (path: string, line: number): CallerLoc => ({ source: loc(path, line), component: 'Badge', same: 1 });

  it('组件用了 3 次、调用处能把类名传进来：两种范围写到不同地方，「全部」改 3 个', () => {
    const el = badge([usedAt('/src/App.tsx', 15)]);
    expect(plan(el, 'margin-top', tw).view.label).toBe('src/App.tsx:15 <Badge> className');
    expect(scopeAll(el, tw)).toBe(3);
    expect(scopeAll(el, { ...tw, scope: 'source' })).toBe(3);
  });

  it('没有外层调用处、或组件没把类名传下去：两种范围写到同一处，不给选', () => {
    expect(scopeAll(badge([]), tw)).toBeNull();
    const closed: PlanContext = { ...tw, classSite: (_f, line) => (line === 3 ? site({ tokens: ['rounded-full'], hasClassName: true }) : site()) };
    expect(scopeAll(badge([usedAt('/src/App.tsx', 15)]), closed)).toBeNull();
  });
});
