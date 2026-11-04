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
  /** 交给 Agent 时用的附加说明：换序后兄弟的新顺序、props 所属组件和它的调用处、文字来源 */
  detail?: { order?: string[]; component?: string; site?: string; origin?: string };
  /**
   * 删属性：每个属性删掉之后页面上的值（面板显示、应用后核对）、删之前的写法（撤掉删除再改时当原值显示；
   * 删除预览开着时元素快照里已经读不到），Tailwind 还有要去掉的类（各属性当前生效的类名）
   */
  removal?: { values: Record<string, string>; from?: Record<string, string>; classes?: string[] };
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
    ...(r.kind === 'reorder' && r.status === 'pending' ? { simulated: true } : {}),
    ...(r.removal ? { remove: true } : {}),
    pageUrl: r.pageUrl,
    createdAt: r.createdAt,
  };
}

/** hash 路由（`#/effects`、`#!/a`）是页面的一部分；普通锚点（`#faq`）和没有 hash 都算根路由 */
const hashRoute = (u: URL) => /^#!?(\/[^?]*)/.exec(u.hash)?.[1].replace(/(.)\/$/, '$1') ?? '/';

/** 两个地址是不是同一个页面：查询参数和普通锚点不算 */
export function samePage(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname === ub.pathname && hashRoute(ua) === hashRoute(ub);
  } catch {
    return a === b;
  }
}

/** 换序记下的位置：JSX 和数组是第一项的行列，HTML 是父元素的路径（前面加上深度） */
function orderPos(r: ChangeRecord): number[] | null {
  const w = r.write;
  if (w.kind === 'jsxOrder') return [w.sites[0].line, w.sites[0].column];
  if (w.kind === 'arrayOrder') return [w.line, w.column];
  if (w.kind === 'htmlOrder') return [w.path.length, ...w.path];
  return null;
}

/**
 * 同一批里应用的先后：样式和文字先改，换序后改；换序之间位置靠后（HTML 是更深）的先改。
 * 每条记下的位置都是改之前的文件里的：换序只是把几块原样挪动，块里的内容和整段的长度不变，
 * 所以先改里层再挪外层，里层的位置就不会过期；互不相交的两段谁先改都一样
 */
export function applyFirst(a: ChangeRecord, b: ChangeRecord): number {
  const pa = orderPos(a);
  const pb = orderPos(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? -1) - (pa[i] ?? -1);
    if (d) return d;
  }
  return 0;
}
