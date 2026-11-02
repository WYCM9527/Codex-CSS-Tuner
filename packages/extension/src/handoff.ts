import * as vscode from 'vscode';
import type { ChangeRecord } from './journal';
import type { ProjectResolver } from './project';

export interface HandoffContext {
  pageUrl: string | null;
  project: ProjectResolver;
  /** Tailwind 项目的 CSS 入口（设计令牌所在文件），普通 CSS 项目为 null */
  tailwindEntry: string | null;
}

function where(rec: ChangeRecord, project: ProjectResolver): string {
  const src = rec.element.source;
  const file = src?.file ?? (rec.view.file || null);
  const parts: string[] = [];
  if (file && src) parts.push(`${project.label(file)}:${src.line}:${src.column}`);
  else if (src) parts.push(`${src.path}:${src.line}:${src.column}`);
  if (src?.component) parts.push(`组件 ${src.component}`);
  if (!src && rec.element.path) parts.push(`页面位置 ${rec.element.path}`);
  return parts.join('，');
}

function valueText(v: string, token: string | null, tailwind: boolean): string {
  if (!token || token === v) return v;
  return tailwind ? `${v}（Tailwind 令牌 ${token}）` : `${v}（${token}）`;
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
  lines.push(`请帮我把下面 ${recs.length} 处样式改动写进源码。这些值是我在页面上用 CSS Tuner 实时预览确认过的；扩展没法安全地自动写回，原因附在每一条后面。`);
  lines.push('');
  if (ctx.pageUrl) lines.push(`页面：${ctx.pageUrl}`);
  if (ctx.tailwindEntry) lines.push(`项目用 Tailwind 4，设计令牌在 ${ctx.project.label(ctx.tailwindEntry)} 里。`);
  lines.push('');
  recs.forEach((rec, i) => {
    const loc = where(rec, ctx.project);
    lines.push(`${i + 1}. 元素 \`${rec.element.label}\`${loc ? `（${loc}）` : ''}${rec.element.sameSource > 1 ? `，同一处代码渲染了 ${rec.element.sameSource} 个元素` : ''}`);
    const props = rec.props.join(' / ');
    if (rec.status === 'conflict') {
      lines.push(`   - 请改回原值：${props} 现在是 ${valueText(rec.value, rec.token, tw)}，改回 ${rec.from}`);
      if (rec.patch) lines.push(`   - 当初写入的是：${rec.patch.summary}（${ctx.project.label(rec.patch.file)}）`);
    } else {
      lines.push(`   - ${props}：${rec.from} → ${valueText(rec.value, rec.token, tw)}`);
    }
    const rule = ruleText(rec);
    if (rule) lines.push(`   - 当前生效的规则：\`${rule}\``);
    else if (rec.view.label && rec.view.kind !== 'agent') lines.push(`   - 写回位置：${rec.view.label}`);
    const why = rec.note ?? (rec.write.kind === 'agent' ? rec.write.reason : null);
    if (why) lines.push(`   - 没能自动写回：${why}`);
  });
  lines.push('');
  lines.push('要求：');
  lines.push('- 只改上面列出的属性，不要动其他样式和逻辑；');
  lines.push(tw ? '- 优先用项目已有的 Tailwind 令牌（已在条目里给出），不要写任意值，除非没有对应令牌；' : '- 优先用项目已有的 CSS 变量（已在条目里给出）；');
  lines.push('- 一处代码渲染了多个元素时，按条目说明决定只改这一处还是改源头，拿不准就先问我；');
  lines.push('- 改完列出改了哪些文件的哪几行。');
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
