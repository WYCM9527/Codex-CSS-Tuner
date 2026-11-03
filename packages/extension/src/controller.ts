import * as vscode from 'vscode';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import {
  getLocale,
  groupLabel,
  PROP_NAMES,
  sameValue,
  t,
  type BridgeEvent,
  type EditRequest,
  type ElementSnapshot,
  type ExtToPanel,
  type Notice,
  type PageInfo,
  type PanelState,
  type PanelToExt,
  type PreviewTarget,
  type PropValue,
  type RuleRef,
  type Scope,
  type SelectionView,
  type Target,
} from '@css-tuner/protocol';
import { hasArbitraryValue, previewCompanions, tailwindScales, type TwDesign } from '@css-tuner/engine';
import { Applier, SnapshotStore } from './applier';
import { BrowserAdapter } from './browser';
import { prefill, type PrefillResult } from './handoff';
import { Journal, type ChangeRecord } from './journal';
import { plan, planVar, sourceKeyOf, tailwindEntry, type Plan, type WriteSpec } from './planner';
import { ProjectResolver } from './project';
import { buildPrompt } from './prompt';
import { cssScales } from './scales';
import { commandCheck, liveCheck, type CheckItem } from './selfcheck';
import { BridgeServer } from './server';
import { PageSession } from './session';
import { ClassSiteReader, CssRuleLocator } from './sites';
import { StaticServer } from './static';
import { TailwindService } from './tailwind';
import { computeWrite } from './writer';

const BROWSER_KEY = 'cssTuner.browserId';

/**
 * 静态站点的根目录：从 HTML 所在目录往上找，取工作区内最高一层带 index.html 的目录，
 * 让 /css/a.css 这种根相对路径能解析；都没有就用 HTML 所在目录
 */
function siteRoot(htmlFile: string): string {
  const ws = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(htmlFile))?.uri.fsPath ?? null;
  let dir = dirname(htmlFile);
  let best = dir;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'index.html'))) best = dir;
    if (!ws || dir === ws) break;
    const up = dirname(dir);
    if (up === dir || !up.startsWith(ws)) break;
    dir = up;
  }
  return best;
}

/** 同一写回目标的标识：Tailwind 是 JSX 调用位置，CSS 是那条规则，交给 Agent 的是元素 */
export function targetKey(p: Plan, el: ElementSnapshot): string {
  const w = p.write;
  if (w.kind === 'tailwind') return `tw|${w.file}|${w.line}|${w.column}`;
  if (w.kind === 'css') return `css|${w.file}|${w.fullSelector}|${w.conditions.join('|')}|${w.ordinal}`;
  if (w.kind === 'theme') return `theme|${w.file}|${w.name}`;
  if (p.preview.kind === 'rule') return `agent|rule|${p.preview.rule.sheet.index}|${p.preview.rule.fullSelector}|${p.preview.rule.conditions.join('|')}|${p.preview.rule.ordinal}`;
  return `agent|${sourceKeyOf(el) ?? el.uid}`;
}

export class Controller implements vscode.Disposable {
  readonly browser = new BrowserAdapter();
  readonly server = new BridgeServer();
  readonly project = new ProjectResolver();
  readonly staticServer = new StaticServer();
  readonly classSites = new ClassSiteReader();
  readonly cssRules = new CssRuleLocator();
  readonly tailwind: TailwindService;
  readonly journal: Journal;
  readonly applier: Applier;
  session: PageSession | null = null;
  page: PageInfo | null = null;
  state: PanelState;

  private bundle: string | null = null;
  private post: ((msg: ExtToPanel) => void) | null = null;
  private pushTimer: NodeJS.Timeout | null = null;
  private disposables: vscode.Disposable[] = [];
  private sessionSubs: vscode.Disposable[] = [];
  private helloCount = 0;
  private lastSelection: { path: string; line: number; column: number; index: number } | null = null;
  private selectionWaiters: Array<(s: SelectionView | null) => void> = [];
  private plans = new Map<string, Plan>();
  /** 当前页面 Tailwind 入口的设计系统，不是 Tailwind 页面时为 null */
  private design: TwDesign | null = null;
  private editChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    readonly log: (msg: string) => void,
  ) {
    const cfg = vscode.workspace.getConfiguration('cssTuner');
    this.tailwind = new TailwindService(log);
    this.journal = new Journal(ctx.workspaceState);
    this.applier = new Applier(this, new SnapshotStore(ctx));
    this.state = {
      connection: 'idle',
      page: null,
      pickOn: false,
      scope: cfg.get<Scope>('tailwind.scope', 'instance'),
      selection: null,
      scales: null,
      changes: this.journal.views(),
      notice: null,
      defaultUrl: cfg.get<string>('defaultUrl', 'http://localhost:5173/'),
      busy: false,
      snap: cfg.get<boolean>('snap', true),
      locale: getLocale(),
    };
    this.disposables.push(
      this.journal,
      this.applier.snapshots,
      this.journal.onChange(() => {
        this.state.changes = this.journal.views();
        this.push();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.project.invalidate()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('cssTuner')) return;
        const c = vscode.workspace.getConfiguration('cssTuner');
        this.state.defaultUrl = c.get<string>('defaultUrl', this.state.defaultUrl);
        this.state.snap = c.get<boolean>('snap', this.state.snap);
        if (e.affectsConfiguration('cssTuner.tailwind.scope')) this.state.scope = c.get<Scope>('tailwind.scope', this.state.scope);
        // 写回策略变了：选中元素的写回目标按新设置重新判断（已记下的改动不变）
        if (this.state.selection) this.state.selection = this.buildSelection(this.state.selection.el);
        this.push();
      }),
    );
  }

  get remBase(): number {
    return vscode.workspace.getConfiguration('cssTuner').get<number>('remBase', 16);
  }

  /* ---------- 面板 ---------- */

  attachPanel(post: (msg: ExtToPanel) => void): vscode.Disposable {
    this.post = post;
    this.flush();
    return new vscode.Disposable(() => {
      if (this.post === post) this.post = null;
    });
  }

  push() {
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => this.flush(), 16);
  }

  private flush() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.post?.({ t: 'state', state: this.state });
  }

  notify(level: Notice['level'], text: string) {
    this.state.notice = { level, text };
    this.push();
    if (level === 'error') this.log(t('ext.log.error', { text }));
  }

  /** 面板最近一次报告就绪的时间（自测用） */
  panelReadyAt = 0;
  readonly panelErrors: string[] = [];

  async handle(msg: PanelToExt): Promise<void> {
    try {
      switch (msg.t) {
        case 'ready':
          this.panelReadyAt = Date.now();
          this.flush();
          return;
        case 'error':
          this.panelErrors.push(msg.message);
          this.log(t('ext.log.panelError', { message: msg.message }));
          return;
        case 'openPage':
          await this.openPage(msg.url);
          return;
        case 'pick':
          await this.setPick(msg.on);
          return;
        case 'select':
          await this.session?.call('select', { uid: msg.uid });
          return;
        case 'hover':
          await this.session?.call('hover', { uid: msg.uid });
          return;
        case 'edit':
          await this.edit(msg.edit);
          return;
        case 'resetProps':
          await this.resetProps(msg.props);
          return;
        case 'discard':
          await this.discard(msg.id);
          return;
        case 'clearDone':
          this.journal.clearDone();
          await this.sweepSnapshots();
          return;
        case 'setScope':
          this.state.scope = msg.scope;
          if (this.state.selection) this.state.selection = this.buildSelection(this.state.selection.el);
          this.push();
          return;
        case 'setSnap':
          this.state.snap = msg.on;
          await vscode.workspace.getConfiguration('cssTuner').update('snap', msg.on, vscode.ConfigurationTarget.Global);
          this.push();
          return;
        case 'openSource':
          await this.openSource(msg.file, msg.line, msg.column);
          return;
        case 'dismissNotice':
          this.state.notice = null;
          this.push();
          return;
        default:
          await this.handleMore(msg);
      }
    } catch (e) {
      this.notify('error', (e as Error).message);
    }
  }

  private async handleMore(msg: PanelToExt): Promise<void> {
    switch (msg.t) {
      case 'apply': {
        const r = await this.applier.apply(msg.ids);
        if (r.failed && !r.applied && !r.unverified) this.notify('warn', t('ext.apply.allFailed'));
        return;
      }
      case 'revert':
        await this.applier.revert(msg.id);
        return;
      case 'diff':
        await this.applier.diff(msg.id);
        return;
      case 'handoff':
        await this.handoff(msg.ids);
        return;
    }
  }

  /* ---------- 交给 Agent ---------- */

  /** 确定性写回处理不了的：未应用且只能交给 Agent 的、写回失败的、还原冲突的 */
  static agentable(r: ChangeRecord): boolean {
    return (r.status === 'pending' && r.write.kind === 'agent') || r.status === 'failed' || r.status === 'conflict';
  }

  /** 汇总成结构化提示词，预填进新的 Agent 对话（不发送） */
  async handoff(ids?: string[]): Promise<{ how: PrefillResult; prompt: string } | null> {
    const recs = (ids ? ids.map((id) => this.journal.get(id)) : this.journal.all()).filter((r): r is ChangeRecord => !!r && Controller.agentable(r));
    if (!recs.length) {
      this.notify('info', t('ext.handoff.none'));
      return null;
    }
    const entry = this.page ? tailwindEntry(this.page, this.project) : null;
    const prompt = buildPrompt([...recs].reverse(), {
      pageUrl: this.page?.url ?? recs[0].pageUrl,
      project: this.project,
      tailwindEntry: entry,
      tailwindVersion: entry ? this.tailwind.versionFor(entry) : null,
    });
    const how = await prefill(prompt);
    for (const r of recs) {
      // 撤掉预览：Agent 改完源码后页面要显示真实结果
      if (r.status === 'pending') await this.session?.call('clearPreview', { id: r.previewId }).catch(() => undefined);
      this.journal.update(r.id, { status: 'handoff' });
    }
    this.notify(
      'info',
      t(how === 'clipboard' ? 'ext.handoff.clipboard' : 'ext.handoff.prefilled', { n: recs.length }),
    );
    await this.refreshSelection();
    return { how, prompt };
  }

  /* ---------- 静态页 ---------- */

  /** 用内置静态服务打开本地 HTML 或文件夹（没有开发服务器的项目） */
  async serveStatic(target?: vscode.Uri): Promise<boolean> {
    let uri = target;
    if (!uri) {
      const active = vscode.window.activeTextEditor?.document.uri;
      if (active?.scheme === 'file' && /\.html?$/i.test(active.fsPath)) uri = active;
    }
    if (!uri) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        filters: { HTML: ['html', 'htm'] },
        openLabel: t('ext.static.openLabel'),
      });
      uri = picked?.[0];
    }
    if (!uri) return false;
    const path = uri.fsPath;
    const isDir = (() => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    })();
    const root = isDir ? path : siteRoot(path);
    const origin = await this.staticServer.serve(root);
    this.project.register(origin, root);
    const url = isDir ? `${origin}/` : this.staticServer.urlFor(root, path) ?? `${origin}/`;
    this.log(t('ext.log.static', { root, origin }));
    return this.openPage(url);
  }

  /** 本地文件在当前页面源下的地址（静态页写回 CSS 后重新加载 <link> 用） */
  urlForFile(file: string): string | null {
    if (!this.page) return null;
    const root = this.project.rootFor(this.page.url);
    if (!root) return null;
    const rel = relative(root, file);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
    return `${new URL(this.page.url).origin}/${rel.split(sep).map(encodeURIComponent).join('/')}`;
  }

  /* ---------- 页面连接 ---------- */

  private bridgeBundle(): string {
    if (!this.bundle) this.bundle = readFileSync(join(this.ctx.extensionPath, 'media', 'bridge.js'), 'utf8');
    return this.bundle;
  }

  /** 自检：内部命令在不在；live 时另开一个标签页，把注入、连接、选中、预览走一遍（不影响正在调参的页面） */
  async selfCheck(live: boolean): Promise<CheckItem[]> {
    const items = await commandCheck();
    if (!live || items.some((i) => i.required && !i.ok)) return items;
    const root = join(this.ctx.extensionPath, 'media', 'selfcheck');
    return [...items, ...(await liveCheck({ browser: this.browser, server: this.server, statics: this.staticServer, bundle: this.bridgeBundle(), root, log: this.log }))];
  }

  async openPage(url?: string): Promise<boolean> {
    const target = (url || this.state.defaultUrl).trim();
    // 本地 HTML 文件或文件夹：交给内置静态服务
    if (target.startsWith('file://')) return this.serveStatic(vscode.Uri.parse(target));
    if (isAbsolute(target) && existsSync(target)) return this.serveStatic(vscode.Uri.file(target));
    if (!/^https?:\/\//.test(target)) throw new Error(t('ext.open.badUrl', { target }));
    const cap = await this.browser.check();
    if (!cap.ok) {
      this.notify('error', t('ext.open.missingCommands', { missing: cap.missing.join(', ') }));
      return false;
    }
    this.state.connection = 'opening';
    this.state.notice = null;
    this.push();
    await this.server.start();

    let browserId = this.session?.browserId ?? this.ctx.workspaceState.get<string>(BROWSER_KEY) ?? null;
    if (browserId && (await this.browser.isOpen(browserId))) {
      const cur = await this.browser.url(browserId);
      if (cur !== target) await this.browser.navigate(browserId, target);
      await this.browser.focus(browserId);
    } else {
      browserId = await this.browser.open(target);
      await this.ctx.workspaceState.update(BROWSER_KEY, browserId);
    }

    if (!this.session || this.session.browserId !== browserId) {
      this.disposeSession();
      this.session = new PageSession(browserId, this.browser, this.server, this.bridgeBundle(), this.log);
      this.sessionSubs.push(
        this.session.onEvent((ev) => void this.onBridgeEvent(ev)),
        this.session.onState((s) => {
          this.state.connection = s === 'idle' ? 'idle' : s;
          if (s === 'lost') this.state.pickOn = false;
          this.push();
        }),
      );
    }

    const href = await this.browser.waitReady(browserId);
    if (!href || href.startsWith('chrome-error://')) {
      this.notify('error', t('ext.open.unreachable', { target }));
      this.state.connection = 'lost';
      this.push();
      return false;
    }
    await this.session.inject();
    const ok = await this.session.waitConnected(10000);
    if (!ok) this.notify('error', t('ext.open.notConnected'));
    // 会话一直连着（同一个标签页换地址）时不会再发状态变化，这里补上
    this.state.connection = ok ? 'connected' : 'lost';
    this.push();
    return ok;
  }

  private disposeSession() {
    for (const d of this.sessionSubs) d.dispose();
    this.sessionSubs = [];
    this.session?.dispose();
    this.session = null;
    this.helloCount = 0;
  }

  async setPick(on: boolean) {
    if (!this.session?.connected) {
      if (on) this.notify('warn', t('ext.pick.noPage'));
      return;
    }
    await this.session.call('setPick', { on });
    this.state.pickOn = on;
    this.push();
    if (on) await this.browser.focus(this.session.browserId);
  }

  /** 自测用：最近收到的桥接事件 */
  readonly trace: string[] = [];

  protected async onBridgeEvent(ev: BridgeEvent) {
    const t0 = Date.now();
    this.trace.push(`${t0 % 100000} ${ev.t}${'page' in ev && ev.page ? ` sheets=${ev.page.sheets.length}` : ''}${ev.t === 'select' ? ` el=${ev.el?.label ?? null}` : ''}`);
    if (this.trace.length > 200) this.trace.splice(0, 100);
    switch (ev.t) {
      case 'hello': {
        this.helloCount++;
        // 新文档：旧的选中元素已经不在了；换了页面就不再按源码位置找回
        const prev = this.page?.url;
        if (this.lastSelection && (!prev || !this.samePage(prev, ev.page.url))) this.lastSelection = null;
        this.state.selection = null;
        await this.setPage(ev.page);
        this.state.pickOn = false;
        this.push();
        await this.onHello(this.helloCount > 1);
        return;
      }
      case 'page':
        await this.setPage(ev.page);
        return;
      case 'pick':
        this.state.pickOn = ev.on;
        this.push();
        return;
      case 'select':
        await this.onSelect(ev.el);
        return;
      case 'log':
        return;
    }
  }

  private async setPage(page: PageInfo) {
    this.page = page;
    this.project.learnFromSheets(page.url, page.sheets.map((s) => s.devId).filter((d): d is string => !!d));
    this.state.page = { url: page.url, title: page.title };
    this.state.scales = await this.loadScales(page);
    // 样式表变了（懒加载的 CSS、热更新），写回目标要按新的样式表和设计系统重新判断
    if (this.state.selection) this.state.selection = this.buildSelection(this.state.selection.el);
    this.push();
  }

  /** 刻度：Tailwind 项目从项目自己的设计系统读，普通 CSS 用页面上的 CSS 变量 */
  protected async loadScales(page: PageInfo) {
    const entry = tailwindEntry(page, this.project);
    this.design = entry ? await this.tailwind.designFor(entry, this.remBase) : null;
    if (this.design) return tailwindScales(this.design, this.remBase);
    return cssScales(page, this.remBase);
  }

  /** 页面（重新）连上：刷新后按源码位置找回之前选中的元素，并把未应用的改动重新挂上预览 */
  protected async onHello(reconnect: boolean) {
    await this.restorePreviews();
    if (reconnect && this.lastSelection && this.session) {
      const { path, line, column, index } = this.lastSelection;
      await this.session.call('select', { source: { path, line, column, index }, waitMs: 4000 }, 8000).catch(() => null);
    }
  }

  samePage(a: string, b: string): boolean {
    try {
      const ua = new URL(a);
      const ub = new URL(b);
      return ua.origin === ub.origin && ua.pathname === ub.pathname;
    } catch {
      return a === b;
    }
  }

  private async restorePreviews() {
    const session = this.session;
    if (!session || !this.page) return;
    for (const rec of this.journal.pending()) {
      if (!this.samePage(rec.pageUrl, this.page.url)) continue;
      const src = rec.element.source;
      const uid = src
        ? await session.call('resolve', { source: { path: src.path, line: src.line, column: src.column, index: rec.element.sourceIndex }, waitMs: 3000 }, 6000).catch(() => null)
        : null;
      // 规则预览改的是样式表，元素找不回来也照样生效；其余都要作用在元素上
      if (!uid && rec.preview.kind !== 'rule') continue;
      const target = { ...rec.preview, uid: uid ?? rec.preview.uid } as PreviewTarget;
      this.journal.update(rec.id, { preview: target });
      await session
        .call('preview', { id: rec.previewId, target, ...(await this.previewValue(rec)) })
        .catch((e) => this.log(t('ext.log.restorePreviewFailed', { error: (e as Error).message })));
    }
  }

  /** 一条改动的预览值：样式是声明（含 Tailwind 令牌顺带的属性），文字和 props 是新值，换序的位置在目标里 */
  private async previewValue(rec: ChangeRecord): Promise<{ decls?: Record<string, string>; text?: string; prop?: PropValue }> {
    switch (rec.kind) {
      case 'text':
        return { text: rec.value };
      case 'prop':
        return { prop: JSON.parse(rec.value) as PropValue };
      case 'reorder':
        return {};
      default:
        return { decls: { ...(await this.companions(rec.write, rec.props, rec.value, rec.token)), ...Object.fromEntries(rec.props.map((p) => [p, rec.value])) } };
    }
  }

  protected async onSelect(el: ElementSnapshot | null) {
    if (!el) {
      this.state.selection = null;
      this.push();
      this.resolveSelectionWaiters();
      return;
    }
    if (el.source) this.lastSelection = { path: el.source.path, line: el.source.line, column: el.source.column, index: el.sourceIndex };
    this.state.selection = this.buildSelection(el);
    this.push();
    this.resolveSelectionWaiters();
  }

  protected buildSelection(el: ElementSnapshot): SelectionView {
    const pageUrl = this.page?.url ?? '';
    const file = el.source ? this.project.fileFor(pageUrl, el.source.path, el.source.file) : null;
    this.plans.clear();
    const targets: Record<string, Target> = {};
    if (this.page) {
      const cfg = vscode.workspace.getConfiguration('cssTuner');
      const ctx = {
        page: this.page,
        project: this.project,
        strategy: cfg.get<'editRule' | 'agent'>('css.strategy', 'editRule'),
        varStrategy: cfg.get<'editDefinition' | 'agent'>('vars.strategy', 'editDefinition'),
        scope: this.state.scope,
        classSite: (f: string, line: number, column: number) => this.classSites.site(f, line, column),
        classLiterals: (f: string) => this.classSites.literals(f),
        ruleSource: (entry: string, ref: RuleRef) => this.cssRules.sourceOf(entry, ref),
        isUtility: (candidate: string) => !!this.design?.valid(candidate),
      };
      for (const prop of PROP_NAMES) {
        const p = plan(el, prop, ctx);
        this.plans.set(prop, p);
        targets[prop] = p.view;
      }
      for (const v of el.vars ?? []) {
        const p = planVar(el, v.name, ctx);
        this.plans.set(v.name, p);
        targets[v.name] = p.view;
      }
    }
    return { el, file, targets, pending: this.pendingFor(el) };
  }

  /** 选中元素上仍未应用的改动值（同一写回目标、同一属性） */
  private pendingFor(el: ElementSnapshot): Record<string, string> {
    const out: Record<string, string> = {};
    const recs = this.journal.pending();
    if (!recs.length) return out;
    for (const rec of [...recs].reverse()) {
      for (const prop of rec.props) {
        const p = this.plans.get(prop);
        if (p && rec.key.startsWith(targetKey(p, el) + '|')) out[prop] = rec.value;
      }
    }
    return out;
  }

  private resolveSelectionWaiters() {
    const ws = this.selectionWaiters;
    this.selectionWaiters = [];
    for (const w of ws) w(this.state.selection);
  }

  /** 等下一次选中更新（自测用）；nonNull 时跳过中途的“取消选中” */
  nextSelection(timeoutMs = 5000, nonNull = false): Promise<SelectionView | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(this.state.selection), timeoutMs);
      const waiter = (s: SelectionView | null) => {
        if (nonNull && !s) {
          this.selectionWaiters.push(waiter);
          return;
        }
        clearTimeout(timer);
        resolve(s);
      };
      this.selectionWaiters.push(waiter);
    });
  }

  /* ---------- 编辑与预览 ---------- */

  edit(req: EditRequest): Promise<void> {
    const run = this.editChain.then(() => this.doEdit(req));
    this.editChain = run.catch(() => undefined);
    return run;
  }

  private async doEdit(req: EditRequest) {
    const sel = this.state.selection;
    const session = this.session;
    if (!sel || !session || !this.page || !req.props.length) return;
    const el = sel.el;
    const groups = new Map<string, { plan: Plan; props: string[] }>();
    for (const prop of req.props) {
      const p = this.plans.get(prop);
      if (!p) continue;
      const k = targetKey(p, el);
      const g = groups.get(k) ?? { plan: p, props: [] };
      g.props.push(prop);
      groups.set(k, g);
    }
    for (const [tk, g] of groups) {
      const props = [...g.props].sort();
      const key = `${tk}|${props.join(',')}`;
      const existing = this.journal.findPending(key);
      const previewId = existing?.previewId ?? key;
      const decls = { ...(await this.companions(g.plan.write, props, req.value, req.token ?? null)), ...Object.fromEntries(props.map((p) => [p, req.value])) };
      const res = await session.call('preview', { id: previewId, target: g.plan.preview, decls });
      for (const p of props) sel.pending[p] = req.value;
      if (req.phase !== 'commit') continue;

      const original = Object.fromEntries(props.map((p) => [p, existing?.original[p] ?? el.computed[p] ?? '']));
      const backToOriginal = props.every((p) => res.computed[p] !== undefined && sameValue(p, res.computed[p], original[p]));
      if (backToOriginal) {
        if (existing) this.journal.remove(existing.id);
        await session.call('clearPreview', { id: previewId });
        for (const p of props) delete sel.pending[p];
        continue;
      }
      const to = this.describeTo(g.plan, req);
      const expected = Object.fromEntries(props.filter((p) => res.computed[p] !== undefined).map((p) => [p, res.computed[p]]));
      const { view, write } = await this.withPolicy(g.plan, props, req);
      if (existing) {
        this.journal.update(existing.id, { value: req.value, token: req.token ?? null, to, expected, view, write });
      } else {
        this.journal.add({
          kind: 'style',
          key,
          pageUrl: this.page.url,
          element: {
            label: el.label,
            source: el.source,
            sourceIndex: el.sourceIndex,
            sameSource: el.sameSource,
            path: el.breadcrumb.map((b) => b.label).join(' > '),
          },
          props,
          propLabel: groupLabel(props),
          from: this.describeFrom(el, props[0], g.plan),
          to,
          value: req.value,
          token: req.token ?? null,
          original,
          expected,
          view,
          preview: g.plan.preview,
          previewId,
          write,
        });
      }
    }
    this.push();
  }

  /** 设置不允许任意值类名时，刻度外的值（引擎只能写成 px-[13.5px]）改交给 Agent */
  private async withPolicy(p: Plan, props: string[], req: EditRequest): Promise<Pick<Plan, 'view' | 'write'>> {
    if (p.write.kind !== 'tailwind' || req.token) return p;
    if (vscode.workspace.getConfiguration('cssTuner').get<string>('tailwind.arbitraryValues', 'allow') !== 'agent') return p;
    const res = await computeWrite({ write: p.write, props, value: req.value, token: null } as ChangeRecord, this.tailwind, this.remBase);
    if (!res.ok || !hasArbitraryValue(res.edits.map((e) => e.text).join(' '))) return p;
    const reason = t('ext.plan.offScale', { value: req.value });
    return { view: { ...p.view, kind: 'agent', reason }, write: { kind: 'agent', reason } };
  }

  /** Tailwind 令牌顺带设置的属性（text-lg 的行高），预览时一起设上，看到的就是应用后的样子 */
  private async companions(write: WriteSpec, props: string[], value: string, token: string | null): Promise<Record<string, string>> {
    if (write.kind !== 'tailwind' || token === null || !write.entry) return {};
    const d = await this.tailwind.designFor(write.entry, this.remBase);
    return d ? previewCompanions(d, props, value, token) : {};
  }

  private describeFrom(el: ElementSnapshot, prop: string, p: Plan): string {
    const w = el.winners[prop];
    if (p.write.kind === 'tailwind') return w?.rule?.utility ?? el.computed[prop] ?? '';
    if (w?.origin === 'rule' && p.write.kind === 'css' && p.write.mode === 'edit') return w.value;
    return el.computed[prop] ?? '';
  }

  private describeTo(p: Plan, req: EditRequest): string {
    if (p.write.kind === 'tailwind' && req.token) return req.token;
    return req.value;
  }

  /** 撤掉选中元素上这些属性的未应用改动 */
  async resetProps(props: string[]) {
    const sel = this.state.selection;
    if (!sel) return;
    for (const rec of this.journal.pending()) {
      if (!rec.props.some((p) => props.includes(p))) continue;
      const p = this.plans.get(rec.props[0]);
      if (p && rec.key.startsWith(targetKey(p, sel.el) + '|')) await this.discard(rec.id);
    }
  }

  async discard(id: string) {
    const rec = this.journal.get(id);
    if (!rec) return;
    await this.session?.call('clearPreview', { id: rec.previewId }).catch(() => undefined);
    this.journal.remove(id);
    await this.sweepSnapshots();
    if (this.state.selection) {
      for (const p of rec.props) delete this.state.selection.pending[p];
      await this.refreshSelection();
    }
  }

  /** 重新取一次选中元素的快照（预览变化后计算值会变） */
  async refreshSelection() {
    if (!this.session?.connected) return;
    const el = await this.session.call('snapshot', {}).catch(() => null);
    if (el) {
      this.state.selection = this.buildSelection(el);
      this.push();
    }
  }

  async openSource(file: string, line: number, column: number) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const pos = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
    await vscode.window.showTextDocument(doc, {
      selection: new vscode.Range(pos, pos),
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
    });
  }

  records(): ChangeRecord[] {
    return this.journal.all();
  }

  private sweepSnapshots() {
    return this.applier.snapshots.sweep(new Set(this.journal.all().map((r) => r.id)));
  }

  dispose() {
    void this.session?.detach();
    this.disposeSession();
    this.server.dispose();
    this.staticServer.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
