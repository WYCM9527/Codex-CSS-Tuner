import { t, type Breakpoint, type ViewportBand, type ViewportView } from '@css-tuner/protocol';
import { splitCandidate } from '@css-tuner/engine';
import type { Plan } from './planner';

/** 改动只管视口的哪一档：档名和宽度范围（max 不含，桌面没有上限） */
export interface RecordBand {
  name: ViewportBand;
  min: number;
  max: number | null;
}

export function bandRange(name: ViewportBand, bands: ViewportView['bands']): RecordBand {
  if (name === 'mobile') return { name, min: 0, max: bands.tablet.width };
  if (name === 'tablet') return { name, min: bands.tablet.width, max: bands.desktop.width };
  return { name, min: bands.desktop.width, max: null };
}

/**
 * 只改一档时的写回：Tailwind 写到这一档的断点上，普通 CSS 交给 Agent 写 @media；
 * 主题里没有 md / lg 断点、生效的类还带着 hover: 这类条件时也交给 Agent
 */
export function bandPlan(p: Plan, band: ViewportBand, view: ViewportView, breakpoints: Breakpoint[]): Plan {
  const w = p.write;
  if (w.kind === 'agent') return p;
  const name = t(`panel.viewport.${band}`);
  const agent = (reason: string): Plan => ({ ...p, view: { ...p.view, kind: 'agent', reason }, write: { kind: 'agent', reason } });
  if (w.kind !== 'tailwind') return agent(t('plan.band.css', { band: name }));
  const md = view.bands.tablet.prefix;
  const lg = view.bands.desktop.prefix;
  if (!md || !lg) return agent(t('plan.band.noPrefix', { band: name }));
  const v = w.utility ? splitCandidate(w.utility).variant : '';
  if (v && !breakpoints.some((b) => v === `${b.name}:`)) return agent(t('plan.band.variant', { band: name, cls: w.utility! }));
  const within = (lo: number, hi: number) => breakpoints.filter((b) => b.px > lo && b.px < hi).map((b) => b.name);
  const tablet = view.bands.tablet.width;
  const desktop = view.bands.desktop.width;
  const spec =
    band === 'mobile'
      ? { prefix: '', keep: md, inBand: within(0, tablet) }
      : band === 'tablet'
        ? { prefix: md, keep: lg, inBand: within(tablet, desktop) }
        : { prefix: lg, keep: null, inBand: within(desktop, Infinity) };
  return { ...p, write: { ...w, band: spec } };
}
