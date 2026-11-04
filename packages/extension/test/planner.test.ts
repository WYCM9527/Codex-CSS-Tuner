import { describe, expect, it } from 'vitest';
import type { ElementSnapshot, PageInfo, RuleRef } from '@css-tuner/protocol';
import { plan, type PlanContext } from '../src/planner';
import type { ProjectResolver } from '../src/project';

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
