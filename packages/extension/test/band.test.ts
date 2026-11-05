import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAKPOINTS, viewportBands, type Breakpoint, type ViewportView } from '@css-tuner/protocol';
import { bandPlan, bandRange } from '../src/band';
import type { Plan } from '../src/planner';

const SCREENS: Breakpoint[] = [
  { name: 'sm', px: 640 },
  { name: 'md', px: 768 },
  { name: 'lg', px: 1024 },
  { name: 'xl', px: 1280 },
  { name: '2xl', px: 1536 },
];
const tw: ViewportView = { preset: 'tablet', bands: viewportBands(SCREENS, true) };
const css: ViewportView = { preset: 'tablet', bands: viewportBands(DEFAULT_BREAKPOINTS, false) };

const twPlan = (utility: string | null): Plan => ({
  view: { kind: 'tailwind', label: 'App.tsx:3', file: '/p/App.tsx', line: 3, column: 5, affects: 1 },
  preview: { kind: 'inline', uid: 'u1' },
  write: { kind: 'tailwind', file: '/p/App.tsx', line: 3, column: 5, utility, entry: '/p/index.css' },
}) as Plan;

const cssPlan: Plan = {
  view: { kind: 'css', label: 'app.css .card', file: '/p/app.css', line: 1, column: 1, affects: 2 },
  preview: { kind: 'rule', uid: 'u1' },
  write: { kind: 'css', file: '/p/app.css', rule: '.card' },
} as unknown as Plan;

const bandOfWrite = (p: Plan) => (p.write.kind === 'tailwind' ? p.write.band : undefined);

describe('bandRange', () => {
  it('按断点切出三档，宽度上限不含', () => {
    expect(bandRange('mobile', tw.bands)).toEqual({ name: 'mobile', min: 0, max: 768 });
    expect(bandRange('tablet', tw.bands)).toEqual({ name: 'tablet', min: 768, max: 1024 });
    expect(bandRange('desktop', tw.bands)).toEqual({ name: 'desktop', min: 1024, max: null });
  });
});

describe('bandPlan', () => {
  it('Tailwind：每档写到自己的断点上，夹在中间的断点算在档内', () => {
    expect(bandOfWrite(bandPlan(twPlan('px-6'), 'mobile', tw, SCREENS))).toEqual({ prefix: '', keep: 'md', inBand: ['sm'] });
    expect(bandOfWrite(bandPlan(twPlan('px-6'), 'tablet', tw, SCREENS))).toEqual({ prefix: 'md', keep: 'lg', inBand: [] });
    expect(bandOfWrite(bandPlan(twPlan(null), 'desktop', tw, SCREENS))).toEqual({ prefix: 'lg', keep: null, inBand: ['xl', '2xl'] });
  });

  it('生效的类带断点前缀照样能写', () => {
    expect(bandPlan(twPlan('md:px-6'), 'tablet', tw, SCREENS).write.kind).toBe('tailwind');
  });

  it('生效的类带着 hover: 这类条件、主题里没有 md / lg 断点：交给 Agent', () => {
    const hover = bandPlan(twPlan('hover:px-6'), 'tablet', tw, SCREENS);
    expect(hover.write.kind).toBe('agent');
    expect(hover.view.kind).toBe('agent');
    expect(hover.view.reason).toContain('hover:px-6');
    const bare: ViewportView = { preset: 'tablet', bands: viewportBands([{ name: 'tablet', px: 700 }], true) };
    expect(bandPlan(twPlan('px-6'), 'tablet', bare, [{ name: 'tablet', px: 700 }]).write.kind).toBe('agent');
  });

  it('普通 CSS 交给 Agent，写回位置不变', () => {
    const p = bandPlan(cssPlan, 'mobile', css, DEFAULT_BREAKPOINTS);
    expect(p.write.kind).toBe('agent');
    expect(p.view).toMatchObject({ kind: 'agent', label: 'app.css .card', affects: 2 });
  });

  it('本来就交给 Agent 的不动', () => {
    const agent = { ...cssPlan, write: { kind: 'agent', reason: 'x' } } as Plan;
    expect(bandPlan(agent, 'tablet', css, DEFAULT_BREAKPOINTS)).toBe(agent);
  });
});
