import { randomBytes } from 'node:crypto';
import type { ChangeView } from '@css-tuner/protocol';
import { Emitter } from './events';
import { recordView, upgradeRecord, type ChangeRecord, type StoredRecord } from './records';
import type { Memento } from './store';

export type { ChangeRecord } from './records';

const KEY = 'cssTuner.changes';

export class Journal {
  private records: ChangeRecord[];
  private readonly changed = new Emitter<void>();
  readonly onChange = this.changed.event;

  constructor(private readonly state: Memento) {
    this.records = state.get<StoredRecord[]>(KEY, []).map(upgradeRecord);
  }

  all(): ChangeRecord[] {
    return this.records;
  }

  get(id: string): ChangeRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  pending(): ChangeRecord[] {
    return this.records.filter((r) => r.status === 'pending');
  }

  /** 预览留在页面上的：还没应用的，和交给 Codex 还没核对上的 */
  previewing(): ChangeRecord[] {
    return this.records.filter((r) => r.status === 'pending' || r.status === 'handoff');
  }

  /** 交给 Codex、在等它改代码的（应用或还原） */
  waiting(): ChangeRecord[] {
    return this.records.filter((r) => r.status === 'handoff' || r.status === 'reverting');
  }

  findPending(key: string): ChangeRecord | undefined {
    return this.records.find((r) => r.status === 'pending' && r.key === key);
  }

  add(rec: Omit<ChangeRecord, 'id' | 'createdAt' | 'status'>): ChangeRecord {
    const full: ChangeRecord = { ...rec, id: randomBytes(6).toString('hex'), createdAt: Date.now(), status: 'pending' };
    this.records.unshift(full);
    this.save();
    return full;
  }

  update(id: string, patch: Partial<ChangeRecord>) {
    const r = this.get(id);
    if (!r || (Object.keys(patch) as (keyof ChangeRecord)[]).every((key) => Object.is(r[key], patch[key]))) return;
    Object.assign(r, patch);
    this.save();
  }

  /** The DOM identifier changes on reload. Refresh the panel without writing project history. */
  refreshPreviewUid(id: string, uid: string) {
    const r = this.get(id);
    if (!r || r.preview.uid === uid) return;
    r.preview = { ...r.preview, uid };
    this.changed.fire();
  }

  /** 撤销 / 重做：把一条记录整条换成记下的样子，不在清单里的按创建时间放回原来的位置 */
  put(rec: ChangeRecord) {
    const i = this.records.findIndex((r) => r.id === rec.id);
    if (i >= 0) this.records[i] = rec;
    else {
      const at = this.records.findIndex((r) => r.createdAt < rec.createdAt);
      this.records.splice(at < 0 ? this.records.length : at, 0, rec);
    }
    this.save();
  }

  remove(id: string) {
    this.records = this.records.filter((r) => r.id !== id);
    this.save();
  }

  clear() {
    this.records = [];
    this.save();
  }

  clearDone() {
    this.records = this.records.filter((r) => r.status !== 'applied' && r.status !== 'reverted');
    this.save();
  }

  views(): ChangeView[] {
    return this.records.map(recordView);
  }

  private save() {
    void this.state.update(KEY, this.records);
    this.changed.fire();
  }

  dispose() {
    this.changed.dispose();
  }
}
