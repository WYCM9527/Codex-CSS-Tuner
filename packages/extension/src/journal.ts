import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { ChangeView } from '@css-tuner/protocol';
import { recordView, upgradeRecord, type ChangeRecord, type StoredRecord } from './records';

export type { AppliedPatch, ChangeRecord, PatchEdit } from './records';

const KEY = 'cssTuner.changes';

export class Journal {
  private records: ChangeRecord[];
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onChange = this.changed.event;

  constructor(private readonly state: vscode.Memento) {
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
    if (!r) return;
    Object.assign(r, patch);
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
    this.records = this.records.filter((r) => r.status === 'pending' || r.status === 'failed' || r.status === 'conflict' || r.status === 'unverified');
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
