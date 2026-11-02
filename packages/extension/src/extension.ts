import * as vscode from 'vscode';
import { SCHEME } from './applier';
import { Controller } from './controller';
import { PanelProvider } from './panel';
import { summarizeCheck } from './selfcheck';
import { maybeRunSelfTest } from './selftest';

let controller: Controller | null = null;

export function activate(ctx: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel('CSS Tuner');
  const log = (msg: string) => out.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
  const c = new Controller(ctx, log);
  controller = c;
  const panel = new PanelProvider(ctx, c);
  ctx.subscriptions.push(
    out,
    c,
    vscode.window.registerWebviewViewProvider(PanelProvider.id, panel, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, c.applier.snapshots),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('cssTuner.openPage', async (url?: string) => {
      const target =
        typeof url === 'string'
          ? url
          : await vscode.window.showInputBox({ prompt: '要调参的页面地址', value: c.state.defaultUrl, ignoreFocusOut: true });
      if (!target) return;
      panel.reveal();
      await c.handle({ t: 'openPage', url: target });
    }),
    vscode.commands.registerCommand('cssTuner.togglePick', () => c.handle({ t: 'pick', on: !c.state.pickOn })),
    vscode.commands.registerCommand('cssTuner.applyAll', () => c.handle({ t: 'apply' })),
    vscode.commands.registerCommand('cssTuner.handoff', () => c.handle({ t: 'handoff' })),
    vscode.commands.registerCommand('cssTuner.serveStatic', async (uri?: vscode.Uri) => {
      panel.reveal();
      try {
        await c.serveStatic(uri instanceof vscode.Uri ? uri : undefined);
      } catch (e) {
        c.notify('error', (e as Error).message);
      }
    }),
    vscode.commands.registerCommand('cssTuner.selfCheck', () => runSelfCheck(c, out, true)),
  );

  void maybeRunSelfTest(ctx, c).then((ran) => {
    if (!ran) void startupCheck(c, out);
  });
}

/** 启动时只查内部命令在不在（不开页面），缺了就提示 */
async function startupCheck(c: Controller, out: vscode.OutputChannel) {
  const items = await c.selfCheck(false);
  const { ok, text } = summarizeCheck(items);
  if (ok) return;
  out.appendLine(`启动自检：\n${text}`);
  const missing = items.filter((i) => i.required && !i.ok).map((i) => i.name.replace(/^内置浏览器命令 /, ''));
  c.notify('error', `当前 Cursor 缺少内置浏览器命令（${missing.join('、')}），调参功能暂不可用。可以运行“CSS Tuner: 自检”查看详情，或升级插件。`);
  const pick = await vscode.window.showWarningMessage(`CSS Tuner：当前 Cursor（${vscode.version}）缺少内置浏览器命令，调参功能暂不可用。`, '查看详情');
  if (pick) out.show(true);
}

async function runSelfCheck(c: Controller, out: vscode.OutputChannel, live: boolean) {
  const items = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'CSS Tuner 自检中…' }, () => c.selfCheck(live));
  const { ok, degraded, text } = summarizeCheck(items);
  out.appendLine(`自检（Cursor ${vscode.version}）：\n${text}`);
  if (!ok) {
    const pick = await vscode.window.showErrorMessage('CSS Tuner 自检没通过，调参功能暂不可用。', '查看详情');
    if (pick) out.show(true);
  } else if (degraded) {
    const pick = await vscode.window.showWarningMessage('CSS Tuner 自检通过，但有部分可选能力不可用。', '查看详情');
    if (pick) out.show(true);
  } else {
    void vscode.window.showInformationMessage(`CSS Tuner 自检通过（${items.length} 项）。`);
  }
  return items;
}

export function deactivate() {
  controller?.dispose();
  controller = null;
}
