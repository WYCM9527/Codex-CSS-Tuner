import * as vscode from 'vscode';

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
