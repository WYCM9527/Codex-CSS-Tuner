import * as vscode from 'vscode';
import { localeFrom, setLocale, t } from '@css-tuner/protocol';
import { SCHEME } from './applier';
import { Controller } from './controller';
import { PanelProvider } from './panel';
import { summarizeCheck } from './selfcheck';
import { maybeRunSelfTest } from './selftest';

let controller: Controller | null = null;

export function activate(ctx: vscode.ExtensionContext) {
  setLocale(localeFrom(vscode.env.language));
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
          : await vscode.window.showInputBox({ prompt: t('ext.open.prompt'), value: c.state.defaultUrl, ignoreFocusOut: true });
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
  out.appendLine(t('check.startupLog', { text }));
  const missing = items.filter((i) => i.required && !i.ok).map((i) => i.command ?? i.name);
  c.notify('error', t('check.startupMissing', { missing: missing.join(t('common.listSep')) }));
  const pick = await vscode.window.showWarningMessage(t('check.startupWarn', { version: vscode.version }), t('common.details'));
  if (pick) out.show(true);
}

async function runSelfCheck(c: Controller, out: vscode.OutputChannel, live: boolean) {
  const items = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t('check.progress') }, () => c.selfCheck(live));
  const { ok, degraded, text } = summarizeCheck(items);
  out.appendLine(t('check.log', { version: vscode.version, text }));
  if (!ok) {
    const pick = await vscode.window.showErrorMessage(t('check.failed'), t('common.details'));
    if (pick) out.show(true);
  } else if (degraded) {
    const pick = await vscode.window.showWarningMessage(t('check.degraded'), t('common.details'));
    if (pick) out.show(true);
  } else {
    void vscode.window.showInformationMessage(t('check.passed', { n: items.length }));
  }
  return items;
}

export function deactivate() {
  controller?.dispose();
  controller = null;
}
