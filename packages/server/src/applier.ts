import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { t, type HandoffVia } from '@css-tuner/protocol';
import type { Controller } from './controller';
import type { Disposable } from './events';
import type { ChangeRecord } from './journal';
import type { PromptMode } from './prompt';
import type { Memento } from './store';
import { codexLink, copyText, openCodexLink } from './system';
import { watchTree } from './watch';

/** 文件变了之后隔多久核对：热更新一般几百毫秒到一两秒，大一些的 Next 项目里服务端组件要好几秒 */
const AFTER_CHANGE = [300, 1000, 2500, 6000];
/** 页面重新连上（多半是改的文件让开发服务器整页刷新了）、样式表变了之后 */
const AFTER_HELLO = [500, 2500];
/** 没看到文件变化时也隔一会儿核对一次：Codex 改的文件可能在项目目录外，或者被监听漏掉 */
const POLL_MS = 4000;
/** 构建产物和依赖的变化不算 Codex 改了代码 */
const IGNORED = /[\\/](node_modules|\.git|dist|\.next|\.nuxt|\.svelte-kit|\.output|\.turbo|\.cache|coverage)[\\/]/;
/** 交接批次留最近这么多个 */
const MAX_BATCHES = 20;
const BATCH_KEY = 'cssTuner.batches';

const hash = (s: string) => createHash('sha1').update(s).digest('hex');

function readDisk(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

const shortValues = (v: Record<string, string>) =>
  Object.entries(v)
    .map(([k, x]) => `${k}: ${x}`)
    .join('; ');

/** 批次号：短，方便写在注释里、Codex 照着取 */
export function newBatchId(): string {
  return randomBytes(4).toString('hex').slice(0, 6);
}

/** 交给 Codex 的一批改动：面板点「应用」「还原」，或者 Codex 自己来取未应用的 */
export interface Batch {
  id: string;
  mode: PromptMode;
  ids: string[];
  at: number;
  /** composer：codex:// 链接放进对话输入框；annotation：注释接口；clipboard：剪贴板；mcp：Codex 用 get_handoff 取走的 */
  via: HandoffVia | 'mcp';
  prompt: string;
  pageUrl: string;
}

/** 第一次交给 Codex 前的文件内容，存在项目的数据目录里 */
export class SnapshotStore {
  constructor(private readonly dir: string) {}

  private fileOf(id: string) {
    return join(this.dir, `${id}.txt`);
  }

  async save(id: string, text: string) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.fileOf(id), text);
  }

  async load(id: string): Promise<string | null> {
    return readDisk(this.fileOf(id));
  }

  /** 删掉已不在改动清单里的快照 */
  async sweep(keep: Set<string>) {
    let names: string[] = [];
    try {
      names = readdirSync(this.dir);
    } catch {
      return;
    }
    for (const name of names) {
      const id = name.replace(/\.txt$/, '');
      if (!keep.has(id)) rmSync(join(this.dir, name), { force: true });
    }
  }
}

/**
 * 应用和还原都交给 Codex：把改动整理成提示词，用 codex:// 链接放进 Codex 对话的输入框，或者经注释接口交给 Codex
 * （Codex 按批次号取完整提示词），或者复制到剪贴板。交出去的改动预览留在页面上，Codex 改了文件、页面热更新后读预览底下源码给的值来核对，对上了才撤预览
 */
export class Applier implements Disposable {
  private watcher: Disposable | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  /** 文件变化、页面变化各自排的几次核对，再来一次就重排 */
  private readonly timers = new Map<'file' | 'page', ReturnType<typeof setTimeout>[]>();
  /** 最近一次看到项目里的文件变化 */
  private changedAt = 0;
  /** 变过、还没让页面重新加载的 CSS 文件（没有热更新的页面用） */
  private readonly css = new Set<string>();
  private running: Promise<void> | null = null;
  /** 核对途中又要核对一轮：记下这一轮要不要切到别的档 */
  private queued: boolean | null = null;
  /** 交出去时面板上显示的提示；等着的都核对完了换成「改好了」 */
  private handoffNotice: string | null = null;

  constructor(
    private readonly c: Controller,
    readonly snapshots: SnapshotStore,
    private readonly store: Memento,
  ) {}

  batches(): Batch[] {
    return this.store.get<Batch[]>(BATCH_KEY, []);
  }

  batch(id: string): Batch | null {
    return this.batches().find((b) => b.id === id) ?? null;
  }

  private remember(b: Batch) {
    const list = [b, ...this.batches().filter((x) => x.id !== b.id)].slice(0, MAX_BATCHES);
    void this.store.update(BATCH_KEY, list);
  }

  /**
   * 应用：不给 ids 是全部未应用的；给了 ids 时还在等 Codex 改的再发一次（上一次没发出去、或者没改对）。
   * via 是面板交出去的方式（mcp 是 Codex 自己来取的，不用再递）；dry 只整理提示词（测试用）
   */
  async apply(ids?: string[], opts: { batch?: string; via?: Batch['via']; dry?: boolean } = {}): Promise<Batch | null> {
    const c = this.c;
    const recs = (ids ? ids.map((id) => c.journal.get(id)) : c.journal.pending())
      .filter((r): r is ChangeRecord => !!r && (r.status === 'pending' || r.status === 'handoff'))
      .sort((a, b) => a.createdAt - b.createdAt);
    if (!recs.length) {
      if (opts.via !== 'mcp') c.notify('info', t('ext.apply.none'));
      return null;
    }
    const batch = this.makeBatch(recs, 'apply', opts);
    const sentAt = Date.now();
    for (const rec of recs) {
      const snapshot = rec.snapshot ?? (await this.snapshot(rec));
      c.journal.update(rec.id, { status: 'handoff', sentAt, note: undefined, batch: batch.id, ...(snapshot ? { snapshot } : {}) });
    }
    c.log(t('apply.sentLog', { n: recs.length }));
    if (!opts.dry) await this.deliver(batch);
    this.track();
    return batch;
  }

  /** 还原：交给 Codex 把代码改回原样，页面上核对上原值后标成已还原 */
  async revert(id: string, opts: { batch?: string; via?: Batch['via']; dry?: boolean } = {}): Promise<Batch | null> {
    const c = this.c;
    const rec = c.journal.get(id);
    if (!rec || (rec.status !== 'applied' && rec.status !== 'reverting')) return null;
    const batch = this.makeBatch([rec], 'revert', opts);
    c.journal.update(id, { status: 'reverting', sentAt: Date.now(), note: undefined, batch: batch.id });
    if (!opts.dry) await this.deliver(batch);
    this.track();
    return batch;
  }

  private makeBatch(recs: ChangeRecord[], mode: PromptMode, opts: { batch?: string; via?: Batch['via'] }): Batch {
    const batch: Batch = {
      id: opts.batch && /^[\w-]{3,24}$/.test(opts.batch) ? opts.batch : newBatchId(),
      mode,
      ids: recs.map((r) => r.id),
      at: Date.now(),
      via: opts.via ?? 'clipboard',
      prompt: this.c.handoffPrompt(recs, mode),
      pageUrl: recs[0].pageUrl,
    };
    this.remember(batch);
    return batch;
  }

  /**
   * composer 用 codex:// 链接把提示词放进 Codex 对话的输入框（完整提示词放不进链接时放一句话，Codex 按批次号来取），打不开就按剪贴板的办；
   * 注释接口已经请 Codex 打开了带批次号的注释框。完整提示词都另外复制到剪贴板备用，写不进去就让面板显示出来
   */
  private async deliver(b: Batch) {
    const c = this.c;
    if (b.via === 'mcp') return;
    const prompt = `${b.prompt}\n\n${t('handoff.footer', { batch: b.id })}`;
    const copied = await copyText(prompt);
    const n = b.ids.length;
    const sent = (text: string) => {
      this.handoffNotice = text;
      c.notify('info', text);
    };
    if (b.via === 'composer') {
      const thread = c.thread;
      const short = t(b.mode === 'apply' ? 'handoff.annotate.apply' : 'handoff.annotate.revert', { n, batch: b.id });
      const link = thread ? (codexLink(thread, prompt) ?? codexLink(thread, short)) : null;
      if (link && (await openCodexLink(link))) {
        sent(t(b.mode === 'apply' ? 'ext.apply.composer' : 'ext.revert.composer', { n }));
        return;
      }
      b.via = 'clipboard';
      this.remember(b);
    }
    if (b.via === 'annotation') {
      sent(t(b.mode === 'apply' ? 'ext.apply.annotation' : 'ext.revert.annotation', { n, batch: b.id }));
      return;
    }
    if (copied) {
      sent(t(b.mode === 'apply' ? 'ext.apply.clipboard' : 'ext.revert.clipboard', { n }));
      return;
    }
    c.showPrompt(prompt, b.mode);
  }

  /** 存下改动所在文件现在的样子；改动没有落在某个文件上（找不到源码位置）时不存 */
  private async snapshot(rec: ChangeRecord): Promise<ChangeRecord['snapshot']> {
    const file = 'file' in rec.write ? rec.write.file : rec.view.file;
    const text = file ? readDisk(file) : null;
    if (!file || text === null) return undefined;
    await this.snapshots.save(rec.id, text);
    return { file, hash: hash(text) };
  }

  /** 有在等 Codex 的改动时盯着项目里的文件变化、定时核对，都等完了就停 */
  track() {
    const waiting = this.c.journal.waiting().length > 0;
    if (waiting && !this.watcher) {
      this.watcher = watchTree(this.c.project.workspace, (file) => this.changed(file));
      this.poll = setInterval(() => void this.probe(false), POLL_MS);
    } else if (!waiting && this.watcher) {
      this.stop();
    }
  }

  /** 页面重新连上、换了页面、样式表变了（热更新）：过一会儿核对（不切档：切宽度本身也会让页面变） */
  soon() {
    if (this.c.journal.waiting().length) this.schedule('page', AFTER_HELLO, false);
  }

  private changed(file: string) {
    if (IGNORED.test(file)) return;
    this.changedAt = Date.now();
    if (/\.css$/i.test(file)) this.css.add(file);
    this.schedule('file', AFTER_CHANGE, true);
  }

  /** 按这几个时间点核对；settle：最后一次时文件已经改完一阵了，切到别的档核对、核对不了的也给个结果 */
  private schedule(kind: 'file' | 'page', delays: number[], settle: boolean) {
    for (const timer of this.timers.get(kind) ?? []) clearTimeout(timer);
    this.timers.set(
      kind,
      delays.map((ms, i) => setTimeout(() => void this.probe(settle && i === delays.length - 1), ms)),
    );
  }

  private stop() {
    this.watcher?.dispose();
    this.watcher = null;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    for (const list of this.timers.values()) for (const timer of list) clearTimeout(timer);
    this.timers.clear();
  }

  /** 核对一轮在等 Codex 的改动；settled：文件改完一阵了 */
  probe(settled: boolean): Promise<void> {
    if (this.running) {
      this.queued = (this.queued ?? false) || settled;
      return this.running;
    }
    this.running = this.pass(settled)
      .catch((e) => this.c.log(String(e)))
      .finally(() => {
        this.running = null;
        const next = this.queued;
        this.queued = null;
        if (next !== null) void this.probe(next);
      });
    return this.running;
  }

  /**
   * Codex 说改完了（verify 工具）：当作文件已经改过，隔几次核对直到都对上或者到时间，返回核对的是哪几条。
   * ids 不给时是所有在等 Codex 的
   */
  async verify(waitMs: number, ids?: string[]): Promise<string[]> {
    const c = this.c;
    const wanted = new Set(ids ?? c.journal.waiting().map((r) => r.id));
    this.changedAt = Date.now();
    const deadline = Date.now() + waitMs;
    const open = () => [...wanted].some((id) => {
      const s = c.journal.get(id)?.status;
      return s === 'handoff' || s === 'reverting';
    });
    for (const ms of [300, 700, 1200, 2000, 3000]) {
      await new Promise((r) => setTimeout(r, Math.min(ms, Math.max(0, deadline - Date.now()))));
      await this.reloadAllSheets();
      await this.probe(Date.now() + ms >= deadline);
      if (!open() || Date.now() >= deadline) break;
    }
    if (open()) await this.probe(true);
    return [...wanted];
  }

  private async pass(settled: boolean) {
    const c = this.c;
    const page = c.page;
    if (!c.session?.connected || !page) return;
    await this.reloadSheets();
    const recs = c.journal.waiting().filter((r) => c.samePage(r.pageUrl, page.url));
    if (!recs.length) return;
    let done = 0;
    for (const rec of recs) if (await this.check(rec, settled)) done++;
    if (done) {
      c.log(t('apply.matchedLog', { n: done }));
      await c.refreshSelection();
      if (this.handoffNotice && !c.journal.waiting().length) {
        c.swapNotice(this.handoffNotice, 'info', t('apply.allDone'));
        this.handoffNotice = null;
      }
    }
    this.track();
  }

  /** 核对一条：对上了标成已应用 / 已还原；没对上、预览又掉了（元素被重建、样式表被换掉）就重新挂上 */
  private async check(rec: ChangeRecord, settled: boolean): Promise<boolean> {
    const c = this.c;
    const back = rec.status === 'reverting';
    const expected = back ? this.revertExpected(rec) : rec.expected;
    const touched = this.changedAt > (rec.sentAt ?? 0);
    const finish = (note?: string) => c.journal.update(rec.id, { status: back ? 'reverted' : 'applied', note });
    if (!expected || !Object.keys(expected).length) {
      // 页面上没有能比的值：文件改完一阵了就当作改好了，请用户自己看一眼
      if (!settled || !touched) return false;
      if (!back) await c.session?.call('clearPreview', { id: rec.previewId }).catch(() => undefined);
      finish(t('apply.unchecked'));
      return true;
    }
    const src = rec.element.source;
    const r = await c.session
      ?.call(
        'probe',
        {
          id: rec.previewId,
          target: rec.preview,
          expected,
          source: src ? { path: src.path, line: src.line, column: src.column, index: rec.element.sourceIndex } : undefined,
        },
        8000,
      )
      .catch(() => null);
    // 核对途中被放弃、重新发过
    if (!r || c.journal.get(rec.id)?.status !== rec.status) return false;
    if (r.ok) {
      finish();
      return true;
    }
    if (!back && !r.attached && (r.found || rec.preview.kind === 'rule')) {
      // 同一处后来又改了的也重新挂一遍，盖在这条上面
      const above = c.journal.previewing().filter((x) => x.key === rec.key && x.createdAt > rec.createdAt);
      for (const x of [rec, ...above.reverse()]) await c.showPreview(x);
    }
    const actual = shortValues(r.actual);
    if (settled && touched && actual) c.journal.update(rec.id, { note: t('apply.still', { actual }) });
    return false;
  }

  /**
   * 还原后要核对的原值。描边样式是 none 时粗细总算成 0：同一处改描边样式的那条还生效着，
   * 还原粗细后页面上是这个样式的默认粗细，和记下的原值对不上，这几边的粗细不核对
   */
  private revertExpected(rec: ChangeRecord): Record<string, string> {
    const target = (r: ChangeRecord) => r.key.slice(0, r.key.lastIndexOf('|'));
    const live = new Set(
      this.c.journal
        .all()
        .filter((r) => r.id !== rec.id && target(r) === target(rec) && (r.status === 'applied' || r.status === 'reverting'))
        .flatMap((r) => r.props),
    );
    return Object.fromEntries(Object.entries(rec.original).filter(([p]) => !/^border-\w+-width$/.test(p) || !live.has(p.replace(/width$/, 'style'))));
  }

  /** 没有热更新的页面（内置静态服务、普通文件服务）：让改过的 CSS 对应的 <link> 重新加载 */
  private async reloadSheets() {
    const s = this.c.session;
    if (!s?.connected || !this.css.size) return;
    const hrefs = [...this.css].map((f) => this.c.urlForFile(f)).filter((u): u is string => !!u);
    this.css.clear();
    if (hrefs.length) await s.call('reloadSheets', { hrefs }).catch(() => 0);
  }

  /** 静态页上不知道改了哪个 CSS 文件（监听不到）：等着的改动是样式表里的规则时整个重新加载一遍 */
  private async reloadAllSheets() {
    const s = this.c.session;
    if (!s?.connected || this.c.site?.kind !== 'static') return;
    if (this.css.size) return this.reloadSheets();
    await s.call('reloadSheets', {}).catch(() => 0);
  }

  dispose() {
    this.stop();
  }
}
