import * as vscode from 'vscode';
import { t } from '@css-tuner/protocol';
import type { ChangeRecord } from './journal';
import type { ProjectResolver } from './project';

export interface HandoffContext {
  pageUrl: string | null;
  project: ProjectResolver;
  /** Tailwind 项目的 CSS 入口（设计令牌所在文件），普通 CSS 项目为 null */
  tailwindEntry: string | null;
  /** 项目装的 tailwindcss 版本号 */
  tailwindVersion?: string | null;
}

function where(rec: ChangeRecord, project: ProjectResolver): string {
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

/**
 * 交给 Agent 的结构化提示词：每条写清元素在哪、属性、原值 → 新值、为什么没能自动写回。
 * 冲突（应用后源码被改过、无法安全还原）的条目要求改回原值。
 */
export function buildPrompt(recs: ChangeRecord[], ctx: HandoffContext): string {
  const tw = !!ctx.tailwindEntry;
  const lines: string[] = [];
  lines.push(t('handoff.intro', { n: recs.length }));
  lines.push('');
  if (ctx.pageUrl) lines.push(t('handoff.page', { url: ctx.pageUrl }));
  if (ctx.tailwindEntry) {
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
    const props = rec.props.join(' / ');
    const value = valueText(rec.value, rec.token, tw);
    if (rec.status === 'conflict') {
      lines.push(t('handoff.revertTo', { props, value, from: rec.from }));
      if (rec.patch) lines.push(t('handoff.written', { summary: rec.patch.summary, file: ctx.project.label(rec.patch.file) }));
    } else {
      lines.push(t('handoff.change', { props, from: rec.from, to: value }));
    }
    const rule = ruleText(rec);
    if (rule) lines.push(t('handoff.rule', { rule }));
    else if (rec.view.label && rec.view.kind !== 'agent') lines.push(t('handoff.target', { label: rec.view.label }));
    const why = rec.note ?? (rec.write.kind === 'agent' ? rec.write.reason : null);
    if (why) lines.push(t('handoff.why', { why }));
  });
  lines.push('');
  lines.push(t('handoff.requirements'));
  lines.push(t('handoff.req.only'));
  lines.push(t(tw ? 'handoff.req.twTokens' : 'handoff.req.cssVars'));
  lines.push(t('handoff.req.scope'));
  lines.push(t('handoff.req.report'));
  return lines.join('\n');
}

export type PrefillResult = 'composer' | 'chat' | 'clipboard';

/**
 * 预填进新的 Agent 对话，只预填、不发送（由用户检查后按回车）。
 * Cursor 的 workbench.action.chat.open 新建对话、把文字强制填进输入框并聚焦，从不提交；
 * 它不可用时退回 composer.createNew（不会强制刷新输入框，文字可能要切换一下对话才显示）；
 * 都失败时只复制到剪贴板。无论哪种都会复制一份到剪贴板兜底。
 */
export async function prefill(text: string): Promise<PrefillResult> {
  await vscode.env.clipboard.writeText(text);
  try {
    await vscode.commands.executeCommand('workbench.action.chat.open', { query: text, isPartialQuery: true });
    return 'chat';
  } catch {
    /* 换下一条路 */
  }
  try {
    await vscode.commands.executeCommand('composer.createNew', { partialState: { unifiedMode: 'agent', text, richText: text }, openInNewTab: true });
    return 'composer';
  } catch {
    return 'clipboard';
  }
}
