import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { t } from '@css-tuner/protocol';
import { applyEdits, overlapping, revertTailwind, type TextEdit } from '@css-tuner/engine';
import type { Controller } from './controller';
import type { AppliedPatch, ChangeRecord, PatchEdit } from './journal';
import { computeWrite, isDirty, readDisk, type Reader } from './writer';

export const SCHEME = 'css-tuner';
const CONTEXT = 40;

const verifyMs = () => vscode.workspace.getConfiguration('cssTuner').get<number>('verifyTimeoutMs', 8000);

const hash = (s: string) => createHash('sha1').update(s).digest('hex');

/**
 * 写回前的文件内容，存在扩展的工作区存储里：既是“对比”视图的左侧，也是字节级还原的依据。
 * 同时提供 css-tuner: 虚拟文档（对比视图里“应用后会变成这样”的一侧）。
 */
export class SnapshotStore implements vscode.TextDocumentContentProvider {
  private readonly dir: vscode.Uri;
  private readonly virtual = new Map<string, string>();
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  constructor(ctx: vscode.ExtensionContext) {
    this.dir = vscode.Uri.joinPath(ctx.storageUri ?? ctx.globalStorageUri, 'snapshots');
  }

  private fileOf(id: string) {
    return vscode.Uri.joinPath(this.dir, `${id}.txt`);
  }

  async save(id: string, text: string) {
    await vscode.workspace.fs.createDirectory(this.dir);
    await vscode.workspace.fs.writeFile(this.fileOf(id), Buffer.from(text, 'utf8'));
  }

  async load(id: string): Promise<string | null> {
    try {
      return Buffer.from(await vscode.workspace.fs.readFile(this.fileOf(id))).toString('utf8');
    } catch {
      return null;
    }
  }

  /** 删掉已不在改动清单里的快照 */
  async sweep(keep: Set<string>) {
    let entries: [string, vscode.FileType][] = [];
    try {
      entries = await vscode.workspace.fs.readDirectory(this.dir);
    } catch {
      return;
    }
    for (const [name] of entries) {
      const id = name.replace(/\.txt$/, '');
      if (!keep.has(id)) await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.dir, name)).then(undefined, () => undefined);
    }
  }

  uri(kind: 'before' | 'proposed', id: string, file: string, text?: string): vscode.Uri {
    const uri = vscode.Uri.from({ scheme: SCHEME, path: `/${kind}/${id}/${basename(file)}` });
    if (text !== undefined) {
      this.virtual.set(uri.toString(), text);
      this.changed.fire(uri);
    }
    return uri;
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const v = this.virtual.get(uri.toString());
    if (v !== undefined) return v;
    const [, kind, id] = uri.path.split('/');
    if (kind === 'before') return (await this.load(id)) ?? t('apply.snapshotGone');
    return '';
  }

  dispose() {
    this.changed.dispose();
  }
}

/** 写回后的编辑在新文件里的位置和前后文，文件被别人改过时据此重新定位 */
function patchEdits(before: string, after: string, edits: TextEdit[]): PatchEdit[] {
  let delta = 0;
  return [...edits]
    .sort((a, b) => a.start - b.start)
    .map((e) => {
      const offset = e.start + delta;
      delta += e.text.length - (e.end - e.start);
      return {
        offset,
        oldText: before.slice(e.start, e.end),
        newText: e.text,
        before: after.slice(Math.max(0, offset - CONTEXT), offset),
        after: after.slice(offset + e.text.length, offset + e.text.length + CONTEXT),
      };
    });
}

/** 按前后文在改过的文件里找回写入的文本；找不到或不唯一就放弃（宁可报冲突也不改错地方） */
function relocate(cur: string, edits: PatchEdit[]): TextEdit[] | null {
  const out: TextEdit[] = [];
  for (const e of edits) {
    let at = -1;
    for (const k of [CONTEXT, 16, 6, 0]) {
      const pre = k ? e.before.slice(-k) : '';
      const post = k ? e.after.slice(0, k) : '';
      const needle = pre + e.newText + post;
      if (!needle) break;
      const first = cur.indexOf(needle);
      if (first < 0) continue;
      if (cur.indexOf(needle, first + 1) >= 0) break;
      at = first + pre.length;
      break;
    }
    if (at < 0) return null;
    out.push({ start: at, end: at + e.newText.length, text: e.oldText });
  }
  return overlapping(out) ? null : out;
}

/** 两段文本之间的最小替换（不拆开 \r\n） */
function minimalEdit(cur: string, target: string): TextEdit {
  const n = Math.min(cur.length, target.length);
  let p = 0;
  while (p < n && cur.charCodeAt(p) === target.charCodeAt(p)) p++;
  if (p > 0 && cur[p - 1] === '\r') p--;
  let s = 0;
  while (s < n - p && cur.charCodeAt(cur.length - 1 - s) === target.charCodeAt(target.length - 1 - s)) s++;
  if (s > 0 && cur[cur.length - s] === '\n' && cur[cur.length - s - 1] === '\r') s--;
  return { start: p, end: cur.length - s, text: target.slice(p, target.length - s) };
}

const shortValues = (v: Record<string, string>) =>
  Object.entries(v)
    .map(([k, x]) => `${k}: ${x}`)
    .join('; ');

export interface ApplyReport {
  applied: number;
  failed: number;
  unverified: number;
  /** 从点击到页面校验通过的耗时 */
  ms: number;
  writeMs: number;
  /** 每条改动在页面上等到变化、等到数值一致各用了多久 */
  verify?: Array<{ changedMs: number; waitedMs: number } | null>;
  writtenAt?: number;
}

export class Applier {
  /** 每个文件最近一次由扩展写入后的哈希，还原时据此判断文件有没有被外部改过 */
  private lastWritten = new Map<string, string>();

  constructor(
    private readonly c: Controller,
    readonly snapshots: SnapshotStore,
  ) {}

  /**
   * 应用：同一批改动在内存里依次计算（后一条看到前一条改完的内容），每个文件只写一次盘、触发一次热更新；
   * 写盘前先让页面开始等变化，再逐条核对页面上的值是否和预览时一致。
   * 直接写磁盘而不是“编辑 + 保存”：保存会触发保存时格式化，还原就做不到字节级一致。
   */
  async apply(ids?: string[]): Promise<ApplyReport> {
    const c = this.c;
    const t0 = Date.now();
    const recs = (ids ? ids.map((id) => c.journal.get(id)).filter((r): r is ChangeRecord => !!r) : c.journal.pending())
      .filter((r) => (r.status === 'pending' || r.status === 'failed') && r.write.kind !== 'agent')
      .sort((a, b) => a.createdAt - b.createdAt);
    const report: ApplyReport = { applied: 0, failed: 0, unverified: 0, ms: 0, writeMs: 0 };
    if (!recs.length) return report;
    c.state.busy = true;
    c.push();
    try {
      const originals = new Map<string, string>();
      const texts = new Map<string, string>();
      const read: Reader = (f) => texts.get(f) ?? readDisk(f);
      const written: Array<{ rec: ChangeRecord; patch: Omit<AppliedPatch, 'hashAfter' | 'edits'>; edits: TextEdit[]; before: string; after: string }> = [];

      for (const rec of recs) {
        const r = await computeWrite(rec, c.tailwind, c.remBase, read);
        if (!r.ok) {
          c.journal.update(rec.id, { status: 'failed', note: r.reason });
          report.failed++;
          continue;
        }
        if (isDirty(r.file)) {
          c.journal.update(rec.id, { status: 'failed', note: t('apply.unsaved', { file: basename(r.file) }) });
          report.failed++;
          continue;
        }
        const before = read(r.file);
        if (before === null) {
          c.journal.update(rec.id, { status: 'failed', note: t('engine.readFailed', { file: r.file }) });
          report.failed++;
          continue;
        }
        if (!originals.has(r.file)) originals.set(r.file, before);
        const after = applyEdits(before, r.edits);
        texts.set(r.file, after);
        const w = rec.write;
        written.push({
          rec,
          before,
          after,
          edits: r.edits,
          patch: {
            file: r.file,
            hashBefore: hash(before),
            summary: r.summary,
            classes: r.classes && w.kind === 'tailwind' ? { ...r.classes, line: w.line, column: w.column, ...(w.literal ? { literal: true } : {}) } : undefined,
            appliedAt: Date.now(),
          },
        });
      }
      if (!written.length) return report;

      // 先让页面开始等热更新，再写盘
      const checks = written.map(({ rec }) => this.verify(rec, rec.expected));
      const changed: string[] = [];
      for (const [file, text] of texts) {
        if (text === originals.get(file)) continue;
        await vscode.workspace.fs.writeFile(vscode.Uri.file(file), Buffer.from(text, 'utf8'));
        this.lastWritten.set(file, hash(text));
        changed.push(file);
      }
      report.writeMs = Date.now() - t0;
      await this.reloadSheets(changed);
      report.writtenAt = Date.now();
      for (const { rec, before, after, edits, patch } of written) {
        await this.snapshots.save(rec.id, before);
        c.journal.update(rec.id, { patch: { ...patch, hashAfter: hash(after), edits: patchEdits(before, after, edits) } });
      }

      const results = await Promise.all(checks);
      report.verify = results.map((v) => (v && v !== 'skip' ? { changedMs: v.changedMs ?? -1, waitedMs: v.waitedMs } : null));
      written.forEach(({ rec, patch }, i) => {
        const v = results[i];
        if (v === 'skip') {
          c.journal.update(rec.id, { status: 'applied', note: t('apply.notOnPage', { summary: patch.summary }) });
          report.applied++;
        } else if (v && v.ok) {
          c.journal.update(rec.id, { status: 'applied', note: patch.summary });
          report.applied++;
        } else {
          const actual = v ? shortValues(v.actual) : '';
          c.journal.update(rec.id, {
            status: 'unverified',
            note: actual ? t('apply.unverifiedStill', { summary: patch.summary, actual }) : t('apply.unverifiedNoChange', { summary: patch.summary }),
          });
          report.unverified++;
        }
      });
      report.ms = Date.now() - t0;
      c.log(t('apply.log', { n: written.length, writeMs: report.writeMs, ms: report.ms }));
      const late = written.filter((_, i) => results[i] !== 'skip' && !(results[i] as { ok?: boolean } | null)?.ok);
      if (late.length) void this.verifyLate(late.map(({ rec }) => rec.id));
      return report;
    } finally {
      c.state.busy = false;
      c.push();
      await c.refreshSelection();
    }
  }

  /**
   * 热更新比校验时限还慢（大一些的 Next 项目里服务端组件要好几秒）：后台再等一轮，
   * 等到了就改成已生效；这期间被还原或重新应用过的不动
   */
  private async verifyLate(ids: string[]) {
    const c = this.c;
    // 写的文件让开发服务器整页刷新了（如 Vite 里被普通模块引入的多语言 JSON）：等页面重新连上再核对
    if (c.session && !c.session.connected) await c.session.waitConnected(verifyMs());
    await Promise.all(
      ids.map(async (id) => {
        const rec = c.journal.get(id);
        if (!rec || rec.status !== 'unverified') return;
        const hashAfter = rec.patch?.hashAfter;
        const v = await this.verify(rec, rec.expected, verifyMs() * 2);
        const now = c.journal.get(id);
        if (!now || now.status !== 'unverified' || now.patch?.hashAfter !== hashAfter || !now.patch) return;
        if (v === 'skip' || !v?.ok) return;
        c.journal.update(id, { status: 'applied', note: now.patch.summary });
        c.log(t('apply.lateVerified', { summary: now.patch.summary }));
        c.push();
      }),
    );
  }

  /** 页面上核对一条改动的结果；不在当前页面或没连上时跳过 */
  private verify(rec: ChangeRecord, expected: Record<string, string> | undefined, timeoutMs = verifyMs()) {
    const s = this.c.session;
    if (!s?.connected || !expected || !Object.keys(expected).length || !this.c.page || !this.c.samePage(rec.pageUrl, this.c.page.url)) {
      return Promise.resolve('skip' as const);
    }
    const src = rec.element.source;
    return s
      .call(
        'verify',
        {
          id: rec.previewId,
          target: rec.preview,
          expected,
          timeoutMs,
          source: src ? { path: src.path, line: src.line, column: src.column, index: rec.element.sourceIndex } : undefined,
        },
        timeoutMs + 3000,
      )
      .catch(() => null);
  }

  /** 没有热更新的页面（内置静态服务、普通文件服务）：让写过的 CSS 对应的 <link> 重新加载 */
  private async reloadSheets(files: string[]) {
    const s = this.c.session;
    const css = files.filter((f) => /\.css$/i.test(f));
    if (!s?.connected || !css.length) return;
    const hrefs = css.map((f) => this.c.urlForFile(f)).filter((u): u is string => !!u);
    if (hrefs.length) await s.call('reloadSheets', { hrefs }).catch(() => 0);
  }

  /**
   * 还原一条已应用的改动：
   * 文件自应用后没动过 → 用快照字节级恢复；
   * 动过 → Tailwind 按类名语义回退、CSS 按前后文找回写入的文本，找不到就报冲突，不硬改。
   */
  async revert(id: string): Promise<'exact' | 'partial' | 'conflict' | null> {
    const c = this.c;
    const rec = c.journal.get(id);
    const p = rec?.patch;
    if (!rec || !p) return null;
    if (isDirty(p.file)) {
      c.notify('warn', t('revert.unsaved', { file: basename(p.file) }));
      return null;
    }
    const cur = readDisk(p.file);
    if (cur === null) {
      c.journal.update(id, { status: 'conflict', note: t('revert.readFailed', { file: p.file }) });
      return 'conflict';
    }
    c.state.busy = true;
    c.push();
    try {
      let edits: TextEdit[] | null = null;
      let exact = false;
      let reason = '';
      if (hash(cur) === p.hashAfter) {
        const before = await this.snapshots.load(id);
        if (before !== null && hash(before) === p.hashBefore) {
          edits = [minimalEdit(cur, before)];
          exact = true;
        }
      }
      if (!edits && p.classes) {
        const r = revertTailwind({ file: p.file, source: cur, ...p.classes });
        if (r.ok) edits = r.edits;
        else reason = r.reason;
      }
      if (!edits && !p.classes && p.edits.length) edits = relocate(cur, p.edits);
      if (!edits) {
        c.journal.update(id, {
          status: 'conflict',
          note: t('revert.conflict', { reason: reason ? t('common.paren', { text: reason }) : '' }),
        });
        return 'conflict';
      }
      const check = this.verify(rec, rec.original);
      const known = this.lastWritten.get(p.file);
      const external =
        known !== undefined
          ? hash(cur) !== known
          : !c.journal.all().some((r) => r.id !== id && r.patch?.file === p.file && (r.status === 'applied' || r.status === 'unverified'));
      const next = applyEdits(cur, edits);
      if (next !== cur) {
        await vscode.workspace.fs.writeFile(vscode.Uri.file(p.file), Buffer.from(next, 'utf8'));
        this.lastWritten.set(p.file, hash(next));
        await this.reloadSheets([p.file]);
      }
      const v = await check;
      const kept = exact || !external ? '' : t('revert.partial');
      const actual = v && v !== 'skip' && !v.ok ? shortValues(v.actual) : '';
      const stale = v && v !== 'skip' && !v.ok ? (actual ? t('revert.staleStill', { actual }) : t('revert.staleNoChange')) : '';
      c.journal.update(id, { status: 'reverted', note: t('revert.done', { summary: p.summary, kept, stale }) });
      return exact ? 'exact' : 'partial';
    } finally {
      c.state.busy = false;
      c.push();
      await c.refreshSelection();
    }
  }

  /** 对比：已应用的看“写回前 ↔ 现在”，未应用的看“现在 ↔ 应用后会变成” */
  async diff(id: string) {
    const c = this.c;
    const rec = c.journal.get(id);
    if (!rec) return;
    if (rec.patch) {
      const left = this.snapshots.uri('before', id, rec.patch.file);
      const title = t('diff.beforeNow', { file: basename(rec.patch.file) });
      await vscode.commands.executeCommand('vscode.diff', left, vscode.Uri.file(rec.patch.file), title, { preview: true });
      return;
    }
    const r = await computeWrite(rec, c.tailwind, c.remBase);
    if (!r.ok) {
      c.notify('warn', t('diff.failed', { reason: r.reason }));
      return;
    }
    const cur = readDisk(r.file) ?? '';
    const right = this.snapshots.uri('proposed', id, r.file, applyEdits(cur, r.edits));
    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(r.file), right, t('diff.nowAfter', { file: basename(r.file), summary: r.summary }), { preview: true });
  }
}
