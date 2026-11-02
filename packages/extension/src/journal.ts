import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { ChangeStatus, ChangeView, PreviewTarget, SourceLoc, Target } from '@css-tuner/protocol';
import type { WriteSpec } from './planner';

/** 写回后记录下的补丁：在文件里替换掉的区域和前后文锚点，还原时据此定位 */
export interface AppliedPatch {
  file: string;
  /** 写回前、后的完整文件内容哈希，用于判断文件是否被别人改过 */
  hashBefore: string;
  hashAfter: string;
  edits: PatchEdit[];
  /** 写回时生成的人读说明，如 "px-6 → px-10" */
  summary: string;
  /** Tailwind：文件被别人改过时按类名语义还原 */
  classes?: { removed: string[]; added: string[]; attrAdded: boolean; line: number; column: number; literal?: boolean };
  appliedAt: number;
}

export interface PatchEdit {
  /** 写回后文件中的起点偏移 */
  offset: number;
  oldText: string;
  newText: string;
  /** 写回后 newText 前后各一段原文，用于文件被改动后重新定位 */
  before: string;
  after: string;
}

export interface ChangeRecord {
  id: string;
  key: string;
  status: ChangeStatus;
  createdAt: number;
  pageUrl: string;
  /** path：页面上的层级（面包屑），没有源码位置时让 Agent 能找到元素 */
  element: { label: string; source: SourceLoc | null; sourceIndex: number; sameSource: number; path?: string };
  props: string[];
  propLabel: string;
  from: string;
  to: string;
  value: string;
  token: string | null;
  /** 改动前各属性的计算值（还原后校验用） */
  original: Record<string, string>;
  /** 预览时页面上的计算值，写回源码后应得到同样的结果（应用后校验用） */
  expected?: Record<string, string>;
  view: Target;
  preview: PreviewTarget;
  previewId: string;
  write: WriteSpec;
  note?: string;
  patch?: AppliedPatch;
}

const KEY = 'cssTuner.changes';

export class Journal {
  private records: ChangeRecord[];
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onChange = this.changed.event;

  constructor(private readonly state: vscode.Memento) {
    this.records = state.get<ChangeRecord[]>(KEY, []);
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
    return this.records.map((r) => ({
      id: r.id,
      status: r.status,
      element: r.element.label,
      props: r.props,
      propLabel: r.propLabel,
      from: r.from,
      to: r.to,
      target: r.view,
      note: r.note,
      pageUrl: r.pageUrl,
      createdAt: r.createdAt,
    }));
  }

  private save() {
    void this.state.update(KEY, this.records);
    this.changed.fire();
  }

  dispose() {
    this.changed.dispose();
  }
}
