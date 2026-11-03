import { t } from '@css-tuner/protocol';
import type { ProjectResolver } from './project';
import type { ChangeRecord } from './records';

export interface HandoffContext {
  pageUrl: string | null;
  project: Pick<ProjectResolver, 'label'>;
  /** Tailwind 项目的 CSS 入口（设计令牌所在文件），普通 CSS 项目为 null */
  tailwindEntry: string | null;
  /** 项目装的 tailwindcss 版本号 */
  tailwindVersion?: string | null;
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

/** 这一条要做的改动；冲突（应用后源码被改过、无法安全还原）的条目要求改回原样 */
function changeLines(rec: ChangeRecord, tw: boolean): string[] {
  const back = rec.status === 'conflict';
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
      if (rec.detail?.order?.length) lines.push(t('handoff.reorder.order', { order: rec.detail.order.join(t('common.listSep')) }));
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
      const props = rec.props.join(' / ');
      const value = valueText(rec.value, rec.token, tw);
      return [back ? t('handoff.revertTo', { props, value, from: rec.from }) : t('handoff.change', { props, from: rec.from, to: value })];
    }
  }
}

/**
 * 交给 Agent 的结构化提示词：每条写清元素在哪、改什么、原值 → 新值、为什么没能自动写回。
 * 冲突的条目要求改回原值。
 */
export function buildPrompt(recs: ChangeRecord[], ctx: HandoffContext): string {
  const tw = !!ctx.tailwindEntry;
  const has = (kind: ChangeRecord['kind']) => recs.some((r) => r.kind === kind);
  const lines: string[] = [];
  lines.push(t('handoff.intro', { n: recs.length }));
  lines.push('');
  if (ctx.pageUrl) lines.push(t('handoff.page', { url: ctx.pageUrl }));
  if (ctx.tailwindEntry && has('style')) {
    const tailwind = ctx.tailwindVersion ? `Tailwind ${ctx.tailwindVersion}` : 'Tailwind';
    lines.push(t('handoff.tailwind', { tailwind, file: ctx.project.label(ctx.tailwindEntry) }));
  }
  lines.push('');
  recs.forEach((rec, i) => {
    const loc = where(rec, ctx.project);
    lines.push(
      t('handoff.element', {
        i: i + 1,
        label: rec.element.label,
        loc: loc ? t('common.paren', { text: loc }) : '',
        same: rec.element.sameSource > 1 ? t('handoff.sameSource', { n: rec.element.sameSource }) : '',
      }),
    );
    lines.push(...changeLines(rec, tw));
    if (rec.status === 'conflict' && rec.patch) lines.push(t('handoff.written', { summary: rec.patch.summary, file: ctx.project.label(rec.patch.file) }));
    const rule = rec.kind === 'style' ? ruleText(rec) : null;
    if (rule) lines.push(t('handoff.rule', { rule }));
    else if (rec.view.label && rec.view.kind !== 'agent') lines.push(t('handoff.target', { label: rec.view.label }));
    const why = rec.note ?? (rec.write.kind === 'agent' ? rec.write.reason : null);
    if (why) lines.push(t('handoff.why', { why }));
  });
  lines.push('');
  lines.push(t('handoff.requirements'));
  lines.push(t('handoff.req.only'));
  if (has('style')) lines.push(t(tw ? 'handoff.req.twTokens' : 'handoff.req.cssVars'));
  if (has('text')) lines.push(t('handoff.req.text'));
  if (has('reorder')) lines.push(t('handoff.req.reorder'));
  if (has('prop')) lines.push(t('handoff.req.prop'));
  lines.push(t('handoff.req.scope'));
  lines.push(t('handoff.req.report'));
  return lines.join('\n');
}
