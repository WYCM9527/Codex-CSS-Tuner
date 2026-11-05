import { t } from '@css-tuner/protocol';
import type { RecordBand } from './band';
import type { ProjectResolver } from './project';
import type { ChangeRecord } from './records';

export interface HandoffContext {
  pageUrl: string | null;
  project: Pick<ProjectResolver, 'label'>;
  /** Tailwind 项目的 CSS 入口（设计令牌所在文件），普通 CSS 项目为 null */
  tailwindEntry: string | null;
  /** 项目装的 tailwindcss 版本号 */
  tailwindVersion?: string | null;
  /** 设计令牌不在 CSS 入口里时（v3 的 tailwind.config）写的文件 */
  tailwindTokens?: string | null;
}

function where(rec: ChangeRecord, project: HandoffContext['project']): string {
  const src = rec.element.source;
  const file = src?.file ?? (rec.view.file || null);
  const parts: string[] = [];
  if (file && src) parts.push(`${project.label(file)}:${src.line}:${src.column}`);
  else if (src) parts.push(`${src.path}:${src.line}:${src.column}`);
  if (src?.component) parts.push(t('handoff.component', { name: src.component }));
  if (!src && rec.element.path) parts.push(t('handoff.pagePath', { path: rec.element.path }));
  return parts.join(t('common.comma'));
}

function valueText(value: string, token: string | null, tailwind: boolean): string {
  if (!token || token === value) return value;
  return t(tailwind ? 'handoff.twToken' : 'handoff.token', { value, token });
}

function ruleText(rec: ChangeRecord): string | null {
  if (rec.preview.kind !== 'rule') return null;
  const r = rec.preview.rule;
  const cond = r.conditions.filter((c) => !c.startsWith('@layer')).join(' ');
  return `${cond ? `${cond} ` : ''}${r.fullSelector}`;
}

/** 只改视口一档的改动管的宽度范围 */
function bandLine(b: RecordBand): string {
  if (b.min <= 0 && b.max !== null) return t('handoff.band.below', { max: b.max });
  if (b.max === null) return t('handoff.band.above', { min: b.min });
  return t('handoff.band.between', { min: b.min, last: b.max - 1 });
}

/** 应用：照预览改进源码；还原：把之前应用的改回原样 */
export type PromptMode = 'apply' | 'revert';

/** 这一条要做的改动；back 是改回原样 */
function changeLines(rec: ChangeRecord, tw: boolean, back: boolean): string[] {
  switch (rec.kind) {
    case 'text': {
      const from = JSON.stringify(rec.from);
      const to = JSON.stringify(rec.to);
      const lines = [back ? t('handoff.text.revert', { value: to, from }) : t('handoff.text', { from, to })];
      if (rec.detail?.origin) lines.push(t('handoff.text.origin', { origin: rec.detail.origin }));
      return lines;
    }
    case 'reorder': {
      const lines = [back ? t('handoff.reorder.revert', { from: rec.from, to: rec.to }) : t('handoff.reorder', { from: rec.from, to: rec.to })];
      const order = back ? rec.detail?.was : rec.detail?.order;
      if (order?.length) lines.push(t(back ? 'handoff.reorder.was' : 'handoff.reorder.order', { order: order.join(t('common.listSep')) }));
      return lines;
    }
    case 'prop': {
      const component = rec.detail?.component ?? '?';
      const name = rec.props[0] ?? rec.propLabel;
      const lines = [back ? t('handoff.prop.revert', { component, name, value: rec.to, from: rec.from }) : t('handoff.prop', { component, name, from: rec.from, to: rec.to })];
      if (rec.detail?.site && rec.view.kind === 'agent') lines.push(t('handoff.prop.site', { site: rec.detail.site }));
      return lines;
    }
    default: {
      if (rec.removal) return [back ? t('handoff.remove.revert', { props: rec.propLabel, from: rec.from }) : t('handoff.remove', { props: rec.propLabel, from: rec.from })];
      const props = rec.props.join(' / ');
      const value = valueText(rec.value, rec.token, tw);
      return [back ? t('handoff.revertTo', { props, value, from: rec.from }) : t('handoff.change', { props, from: rec.from, to: value })];
    }
  }
}

/**
 * 交给 Agent 的结构化提示词：每条写清元素在哪、原值 → 新值（还原时反过来）、管哪个宽度，
 * 只说要改成什么样，怎么写由 Agent 按项目的写法决定
 */
export function buildPrompt(recs: ChangeRecord[], ctx: HandoffContext, mode: PromptMode = 'apply'): string {
  const tw = !!ctx.tailwindEntry;
  const back = mode === 'revert';
  const has = (kind: ChangeRecord['kind']) => recs.some((r) => r.kind === kind);
  const lines: string[] = [];
  lines.push(t(back ? 'handoff.revert.intro' : 'handoff.intro', { n: recs.length }));
  lines.push('');
  if (ctx.pageUrl) lines.push(t('handoff.page', { url: ctx.pageUrl }));
  if (ctx.tailwindEntry && has('style')) {
    const tailwind = ctx.tailwindVersion ? `Tailwind ${ctx.tailwindVersion}` : 'Tailwind';
    lines.push(t('handoff.tailwind', { tailwind, file: ctx.project.label(ctx.tailwindTokens ?? ctx.tailwindEntry) }));
  }
  lines.push('');
  recs.forEach((rec, i) => {
    const loc = where(rec, ctx.project);
    lines.push(
      t('handoff.element', {
        i: i + 1,
        label: rec.element.label,
        loc: loc ? t('common.paren', { text: loc }) : '',
        same: rec.view.affects > 1 ? t('handoff.sameSource', { n: rec.view.affects }) : '',
      }),
    );
    lines.push(...changeLines(rec, tw, back));
    if (rec.band) lines.push(bandLine(rec.band));
    const rule = rec.kind === 'style' ? ruleText(rec) : null;
    if (rule) lines.push(t('handoff.rule', { rule }));
    else if (rec.view.label && rec.view.kind !== 'agent') lines.push(t('handoff.target', { label: rec.view.label }));
    if (rec.write.kind === 'agent') lines.push(t('handoff.why', { why: rec.write.reason }));
    // 再发一次：上一次改完页面上是什么样
    if (rec.note && (rec.status === 'handoff' || rec.status === 'reverting')) lines.push(t('handoff.last', { note: rec.note }));
  });
  lines.push('');
  lines.push(t('handoff.requirements'));
  lines.push(t(back ? 'handoff.req.revertOnly' : 'handoff.req.only'));
  if (!back && has('style')) lines.push(t(tw ? 'handoff.req.twTokens' : 'handoff.req.cssVars'));
  if (has('text')) lines.push(t('handoff.req.text'));
  if (!back && has('reorder')) lines.push(t('handoff.req.reorder'));
  if (has('prop')) lines.push(t('handoff.req.prop'));
  if (!back && recs.some((r) => r.band)) lines.push(t(tw ? 'handoff.req.bandTw' : 'handoff.req.bandCss'));
  lines.push(t('handoff.req.scope'));
  lines.push(t('handoff.req.report'));
  return lines.join('\n');
}
