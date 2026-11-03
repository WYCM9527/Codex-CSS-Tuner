import * as vscode from 'vscode';

const TS_EXTENSION = 'vscode.typescript-language-features';
/** 我们激活 TS 扩展的时刻：之后一段时间里项目可能还在加载，只有语法服务器在答，问不到类型 */
let warming = -Infinity;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 问语言服务在字符串字面量里 (line, column) 处（行列从 1 起）能补全哪些字面量：组件属性是字面量联合类型时就是它的可选值。
 * 只取 TS 给的字符串补全（Constant），两项以上才算；问不到或超时返回 null
 */
export async function literalCompletions(file: string, line: number, column: number, timeoutMs = 8000): Promise<string[] | null> {
  const t0 = Date.now();
  try {
    // 编辑器里打开过 TS 文件才会激活；没激活时补全只有按单词猜的
    const ts = vscode.extensions.getExtension(TS_EXTENSION);
    if (ts && !ts.isActive) {
      warming = Date.now();
      await ts.activate();
    }
    const uri = vscode.Uri.file(file);
    await vscode.workspace.openTextDocument(uri);
    const retry = Date.now() - warming < 20000;
    const budget = retry ? Math.max(timeoutMs, 15000) : timeoutMs;
    for (;;) {
      const left = budget - (Date.now() - t0);
      if (left <= 0) return null;
      const list = await Promise.race([
        vscode.commands.executeCommand<vscode.CompletionList | undefined>('vscode.executeCompletionItemProvider', uri, new vscode.Position(line - 1, column - 1)),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), left)),
      ]);
      const out: string[] = [];
      for (const item of list?.items ?? []) {
        if (item.kind !== vscode.CompletionItemKind.Constant) continue;
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        if (label && !out.includes(label)) out.push(label);
      }
      if (out.length >= 2 && out.length <= 50) return out;
      if (!retry || out.length) return null;
      await sleep(1500);
    }
  } catch {
    return null;
  }
}
