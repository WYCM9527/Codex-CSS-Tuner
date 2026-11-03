import type { ChangeKind, ChangeStatus, ChangeView, PreviewTarget, SourceLoc, Target } from '@css-tuner/protocol';
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
  kind: ChangeKind;
  key: string;
  status: ChangeStatus;
  createdAt: number;
  pageUrl: string;
  /** path：页面上的层级（面包屑），没有源码位置时让 Agent 能找到元素 */
  element: { label: string; source: SourceLoc | null; sourceIndex: number; sameSource: number; path?: string };
  /** 样式是 CSS 属性，props 是属性名，文字和换序为空 */
  props: string[];
  propLabel: string;
  /** 样式是属性值，文字是原文，换序是位置（1 起），props 是 JSON */
  from: string;
  to: string;
  value: string;
  token: string | null;
  /** 改动前的值（还原后校验用），键的含义同 verify 的 expected */
  original: Record<string, string>;
  /** 预览时页面上的值，写回源码后应得到同样的结果（应用后校验用） */
  expected?: Record<string, string>;
  view: Target;
  preview: PreviewTarget;
  previewId: string;
  write: WriteSpec;
  note?: string;
  patch?: AppliedPatch;
  /** 交给 Agent 时用的附加说明：换序后兄弟的新顺序、props 所属组件、文字来源 */
  detail?: { order?: string[]; component?: string; origin?: string };
}

/** 存下来的记录：0.2.0 及以前的没有 kind，都是样式改动 */
export type StoredRecord = Omit<ChangeRecord, 'kind'> & { kind?: ChangeKind };

export function upgradeRecord(r: StoredRecord): ChangeRecord {
  return r.kind ? (r as ChangeRecord) : { ...r, kind: 'style' };
}

export function recordView(r: ChangeRecord): ChangeView {
  return {
    id: r.id,
    kind: r.kind,
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
  };
}
