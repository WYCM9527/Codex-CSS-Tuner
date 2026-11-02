/* ---------- 页面侧快照 ---------- */

export interface SourceLoc {
  /** 生成代码所在模块 URL（去掉 ?t= 等查询串） */
  url: string;
  /** 原始源码在开发服务器上的路径，如 /src/App.tsx、/@fs/abs/path.tsx；sourcemap 给出 file:// 源时是本地绝对路径 */
  path: string;
  /** 本地绝对路径：开发态 JSX 转换写进代码的 fileName，或 sourcemap 里的 file:// 源（拿不到时为 null） */
  file: string | null;
  line: number;
  column: number;
  component: string | null;
  /** 元素由库组件渲染，沿 owner 链回退到了业务代码的调用处 */
  viaOwner: boolean;
}

/** 渲染这个元素的组件在哪里被调用：className 经组件参数传进来时，类名写在调用处 */
export interface CallerLoc {
  source: SourceLoc;
  /** 被调用的组件 */
  component: string | null;
  /** 同源元素里，调用链到这一层也相同的元素数（改这一处会影响几个元素） */
  same: number;
}

export interface SheetRef {
  index: number;
  /** 样式表的源文件：Vite 的 data-vite-dev-id，或外链 CSS 的 sourcemap 里唯一的本地源（Turbopack） */
  devId: string | null;
  href: string | null;
}

export interface SheetInfo extends SheetRef {
  inline: boolean;
  tailwind: boolean;
  ruleCount: number;
}

export interface RuleRef {
  sheet: SheetRef;
  /** 规则在样式表 cssRules 树里的下标路径，用于 CSSOM 预览 */
  path: number[];
  /** 规则自身的 selectorText（嵌套规则是相对写法） */
  selector: string;
  /** 展开嵌套后的完整选择器 */
  fullSelector: string;
  /** 外层 at-rule，从外到内，如 "@media (width >= 48rem)"、"@layer utilities" */
  conditions: string[];
  layer: string | null;
  /** 同一样式表里、完整选择器和条件都相同的规则中，这是第几条（0 起），用于在源码里区分重复出现的选择器 */
  ordinal: number;
  /** 文档里命中该选择器的元素数（去掉 :hover 等动态伪类后计数） */
  matchCount: number;
  /** Tailwind：规则是元素上某个类名生成的工具类时，给出未转义的类名 */
  utility: string | null;
}

export type WinnerOrigin = 'inline' | 'rule' | 'inherited' | 'initial';

export interface DeclWinner {
  value: string;
  important: boolean;
  origin: WinnerOrigin;
  rule: RuleRef | null;
  inheritedFrom: Crumb | null;
  /** 值实际来自哪个声明：属性本身、逻辑别名（padding-inline-start）或简写（padding） */
  via: string | null;
}

export interface Crumb {
  uid: string;
  label: string;
  /** 渲染出它的 React 组件（开发态 fiber 的 owner） */
  component?: string | null;
  /** 子元素个数 */
  kids?: number;
}

export interface ElementSnapshot {
  uid: string;
  tag: string;
  id: string | null;
  classes: string[];
  label: string;
  rect: { x: number; y: number; w: number; h: number };
  /** 从 body 下第一层到当前元素（含） */
  breadcrumb: Crumb[];
  children: Crumb[];
  source: SourceLoc | null;
  /** 同一 JSX 调用位置创建的元素数 */
  sameSource: number;
  /** 在同源元素里按文档顺序排第几（0 起），刷新后据此找回同一个元素 */
  sourceIndex: number;
  /** 从近到远，最多 3 层 */
  callers: CallerLoc[];
  /** 同源元素里带着这个类名的个数（改变体字符串时据此估算影响范围） */
  classCounts: Record<string, number>;
  /** 含 vars 里各变量：计算值和定义它的声明，键是变量名 */
  computed: Record<string, string>;
  winners: Record<string, DeclWinner>;
  vars: UsedVar[];
  /** 命中的作者样式规则，按层叠优先级从低到高 */
  rules: RuleRef[];
  inline: Record<string, string>;
  fontSizePx: number;
  rootFontSizePx: number;
}

export interface CssVar {
  name: string;
  value: string;
  kind: 'length' | 'color' | 'number' | 'other';
}

/** 选中元素的样式引用到的 CSS 变量（Tailwind 内部的 --tw-* 不算） */
export interface UsedVar extends CssVar {
  /** 元素上哪些属性引用了它 */
  props: string[];
}

export interface PageInfo {
  url: string;
  title: string;
  react: boolean;
  vite: boolean;
  sheets: SheetInfo[];
  rootVars: CssVar[];
}

/* ---------- 桥接脚本 <-> 扩展 ---------- */

export type BridgeEvent =
  | { t: 'hello'; session: string; page: PageInfo }
  | { t: 'page'; page: PageInfo }
  | { t: 'select'; el: ElementSnapshot | null }
  | { t: 'pick'; on: boolean }
  | { t: 'log'; level: 'info' | 'warn' | 'error'; msg: string };

export type PreviewTarget =
  /**
   * depth：写回落在第几层调用处，预览只作用于调用链到这一层也相同的同源元素；
   * withClass：写回落在变体字符串里，预览只作用于带着这个类名的同源元素
   */
  | { kind: 'inline'; uid: string; sourceKey: string | null; depth?: number; withClass?: string }
  | { kind: 'rule'; rule: RuleRef; uid: string };

export interface SelectQuery {
  uid?: string;
  selector?: string;
  index?: number;
  source?: { path: string; line: number; column: number; index?: number };
  /** 元素暂时不在（页面刚加载、React 还没提交）时最多等多久 */
  waitMs?: number;
}

export interface BridgeMethods {
  ping: { p: Record<string, never>; r: 'pong' };
  pageInfo: { p: Record<string, never>; r: PageInfo };
  setPick: { p: { on: boolean }; r: boolean };
  select: { p: SelectQuery; r: ElementSnapshot | null };
  /** 只定位元素、不改变选中，返回 uid（刷新后重新挂预览用） */
  resolve: { p: SelectQuery; r: string | null };
  snapshot: { p: Record<string, never>; r: ElementSnapshot | null };
  preview: { p: { id: string; target: PreviewTarget; decls: Record<string, string> }; r: { computed: Record<string, string>; count: number } };
  clearPreview: { p: { id: string }; r: boolean };
  clearAllPreviews: { p: Record<string, never>; r: number };
  /** 面板结构树上悬停的元素，在页面上描边；null 取消 */
  hover: { p: { uid: string | null }; r: boolean };
  verify: {
    /** source：热更新后元素可能被重建，按源码位置重新找回（不能用当前选中的元素） */
    p: { id: string; target: PreviewTarget; expected: Record<string, string>; timeoutMs: number; source?: { path: string; line: number; column: number; index: number } };
    /** changedMs：等到 className / 样式表变化用了多久（排查热更新慢在哪） */
    r: { ok: boolean; actual: Record<string, string>; waitedMs: number; changedMs?: number };
  };
  reloadSheets: { p: { hrefs?: string[] }; r: number };
}

export type BridgeMethod = keyof BridgeMethods;

export interface BridgeRequest {
  t: 'req';
  id: number;
  m: BridgeMethod;
  p: unknown;
}

export interface BridgeReply {
  t: 'res';
  id: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

/* ---------- 面板 <-> 扩展 ---------- */

export type Scope = 'instance' | 'source';

export interface EditRequest {
  props: string[];
  value: string;
  /** 吸附到的刻度：Tailwind 主题键（如 "5"、"lg"、"tri-void"）或 CSS 变量名（如 "--space-2"） */
  token?: string | null;
  phase: 'live' | 'commit';
}

export type TargetKind = 'tailwind' | 'css' | 'agent';

export interface Target {
  kind: TargetKind;
  /** 人读的位置，如 "src/App.tsx:12 className" 或 "styles.css .card" */
  label: string;
  file?: string;
  line?: number;
  column?: number;
  affects: number;
  reason?: string;
}

export interface SelectionView {
  el: ElementSnapshot;
  file: string | null;
  targets: Record<string, Target>;
  pending: Record<string, string>;
}

export interface ScaleStep {
  label: string;
  value: string;
  px?: number;
  token?: string | null;
}

export interface Scales {
  mode: 'tailwind' | 'css';
  rem: number;
  spacing: ScaleStep[];
  size: ScaleStep[];
  radius: ScaleStep[];
  fontSize: ScaleStep[];
  fontWeight: ScaleStep[];
  lineHeight: ScaleStep[];
  letterSpacing: ScaleStep[];
  shadow: ScaleStep[];
  colors: ScaleStep[];
  opacity: ScaleStep[];
  zIndex: ScaleStep[];
}

export type ChangeStatus = 'pending' | 'applied' | 'unverified' | 'failed' | 'reverted' | 'conflict' | 'handoff';

export interface ChangeView {
  id: string;
  status: ChangeStatus;
  element: string;
  props: string[];
  propLabel: string;
  from: string;
  to: string;
  target: Target;
  /** 写回细节（如 "p-4 → p-5"）或失败原因 */
  note?: string;
  pageUrl: string;
  createdAt: number;
}

export type Connection = 'idle' | 'opening' | 'connected' | 'lost';

export interface Notice {
  level: 'info' | 'warn' | 'error';
  text: string;
}

export interface PanelState {
  connection: Connection;
  page: { url: string; title: string } | null;
  pickOn: boolean;
  scope: Scope;
  selection: SelectionView | null;
  scales: Scales | null;
  changes: ChangeView[];
  notice: Notice | null;
  defaultUrl: string;
  busy: boolean;
  /** 数值吸附到刻度（按住 Alt 临时关闭） */
  snap: boolean;
}

export type PanelToExt =
  | { t: 'ready' }
  | { t: 'openPage'; url: string }
  | { t: 'pick'; on: boolean }
  | { t: 'select'; uid: string }
  | { t: 'hover'; uid: string | null }
  | { t: 'edit'; edit: EditRequest }
  | { t: 'resetProps'; props: string[] }
  | { t: 'apply'; ids?: string[] }
  | { t: 'revert'; id: string }
  | { t: 'discard'; id: string }
  | { t: 'openSource'; file: string; line: number; column: number }
  | { t: 'diff'; id: string }
  | { t: 'handoff'; ids?: string[] }
  | { t: 'setScope'; scope: Scope }
  | { t: 'setSnap'; on: boolean }
  | { t: 'clearDone' }
  | { t: 'dismissNotice' }
  /** 面板里的未捕获异常，写进扩展的输出面板 */
  | { t: 'error'; message: string };

export type ExtToPanel = { t: 'state'; state: PanelState };
