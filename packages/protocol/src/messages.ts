import type { Locale } from './i18n';

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
  /** 元素自己的文字；页面脚本没分析时缺省 */
  text?: TextInfo;
  /** 同一个父元素下可以互换位置的兄弟 */
  order?: OrderInfo;
  /** 渲染这个元素的项目组件和它收到的 props（只有 React） */
  props?: PropsInfo;
}

/** 元素的一段直接子文本 */
export interface TextSegment {
  /** 文本节点原样（含首尾空白）；正在预览时是预览前的值 */
  value: string;
  /** React：文本在元素 JSX children 里的下标（和运行时 children 数组一致）；不是元素自己的 JSX 直接写的为 null */
  child: number | null;
  /**
   * 沿组件调用链找到的、值和这段文字相等的 prop：depth 对应 callers 的层级（1 起），
   * 0 表示元素由库组件渲染、prop 写在元素自己的源码位置上；name 是 children 时 child 是它在 children 数组里的下标
   */
  props: Array<{ depth: number; name: string; child?: number }>;
}

export interface TextInfo {
  /** 直接子文本节点里非空白的那些，按文档顺序 */
  segments: TextSegment[];
  /** 纯 HTML 页面：元素从 <html> 起逐层的子元素下标 */
  htmlPath: number[] | null;
  /** <html lang>，挑多语言文件时用 */
  lang: string | null;
}

/** 兄弟组里的一项：父元素 JSX children 里的一个元素、组件调用或 {…} 表达式，页面上可能对应几个元素 */
export interface OrderUnit {
  /** 这一项渲染出的元素，按页面顺序（多数只有一个） */
  uids: string[];
  label: string;
  /** 这一项在 JSX 里的位置（元素自己或组件的调用处）；.map() 渲染的各项共用一个 */
  source: SourceLoc | null;
  /** 宿主元素的标签名或组件名，写回前和源码里这一项的 JSX 名字核对 */
  name: string;
  /** 页面上的样子（标签和文字开头），按新顺序排出来就是校验时期望看到的 */
  sig: string;
}

export interface OrderInfo {
  /** 同一个父元素下可以互换位置的兄弟（含自己），按页面顺序 */
  units: OrderUnit[];
  /** 自己在 units 里的下标 */
  index: number;
  /** 父元素的排列方式：flex / grid 预览时写 order，其余按位移量做 transform */
  layout: 'flex' | 'grid' | 'flow';
  axis: 'x' | 'y';
  /** 兄弟由 .map() 渲染时它们共用的 JSX 位置（path:line:column），写回改数组顺序；写死的兄弟为 null */
  mapped: string | null;
  /** 纯 HTML 页面：元素自己从 <html> 起逐层的子元素下标 */
  htmlPath: number[] | null;
}

export type PropValue = string | number | boolean | null;

export interface PropInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'object' | 'array' | 'function' | 'element';
  /** 基本类型的值；对象、函数、React 元素为 null，只读 */
  value: PropValue;
  /** 只读值的类型说明，如 "() => void" */
  summary?: string;
}

export interface PropsInfo {
  component: string;
  /** 组件的调用处（属性写在这里） */
  source: SourceLoc | null;
  props: PropInfo[];
  /** 服务端组件：页面上不能预览，应用后才看得到效果 */
  server: boolean;
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
  /** 在页面上双击改文字：live 是输入过程中，commit 是回车或失焦；按 Esc 时把开始编辑时的文字作为 commit 发回来 */
  | { t: 'editText'; uid: string; segment: number; value: string; phase: 'live' | 'commit' }
  /** 在页面上拖动选中元素的把手换位置：to 是放下处在兄弟组里的位置（按页面上现在看到的顺序，0 起） */
  | { t: 'reorder'; uid: string; to: number }
  | { t: 'log'; level: 'info' | 'warn' | 'error'; msg: string };

export type PreviewTarget =
  /**
   * depth：写回落在第几层调用处，预览只作用于调用链到这一层也相同的同源元素；
   * withClass：写回落在变体字符串里，预览只作用于带着这个类名的同源元素
   */
  | { kind: 'inline'; uid: string; sourceKey: string | null; depth?: number; withClass?: string }
  | { kind: 'rule'; rule: RuleRef; uid: string }
  /** 元素第 segment 段直接子文本；sourceKey、depth 的含义同 inline，同源实例一起改；纯 HTML 页面带 htmlPath，写回后重新取页面 HTML 校验 */
  | { kind: 'text'; uid: string; sourceKey: string | null; segment: number; depth?: number; htmlPath?: number[] }
  /**
   * 兄弟组换序：新顺序第 k 个位置放原来的第 order[k] 项。不动真实 DOM，flex / grid 父元素写 order，其余按位移量做 transform。
   * uid 是组里的一个元素，mapped 同 OrderInfo；anchor 是这个元素的源码位置（刷新、热更新后按它找回这一组）；
   * 纯 HTML 页面带 htmlPath（元素自己的），写回后重新取页面 HTML 校验
   */
  | { kind: 'order'; uid: string; order: number[]; mapped: string | null; anchor?: { path: string; line: number; column: number; index: number }; htmlPath?: number[] }
  /** 用 React 开发构建的 overrideProps 改渲染这个元素的组件的一个 prop */
  | { kind: 'props'; uid: string; name: string };

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
  /** 样式目标用 decls，text 目标用 text，props 目标用 prop；order 目标的位置在目标里 */
  preview: {
    p: { id: string; target: PreviewTarget; decls?: Record<string, string>; text?: string; prop?: PropValue };
    r: { computed: Record<string, string>; count: number };
  };
  clearPreview: { p: { id: string }; r: boolean };
  clearAllPreviews: { p: Record<string, never>; r: number };
  /** 面板结构树上悬停的元素，在页面上描边；null 取消 */
  hover: { p: { uid: string | null }; r: boolean };
  verify: {
    /**
     * expected 的键随目标类型：样式是 CSS 属性名，text 是 "text"，order 是 "order"（兄弟的 sig 按期望的顺序排，一行一项），props 是属性名（值为 JSON）。
     * source：热更新后元素可能被重建，按源码位置重新找回（不能用当前选中的元素）
     */
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

/** source：写进 JSX、HTML 或多语言文件（文字、换序、props） */
export type TargetKind = 'tailwind' | 'css' | 'source' | 'agent';

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
  /** 元素的每段文字和它的写回目标 */
  texts?: TextView[];
  /** 选中元素所在的兄弟组（少于两项时缺省） */
  order?: OrderView;
}

export interface OrderView {
  /** 兄弟按现在的顺序（有未应用的换序时是换过之后的） */
  items: Array<{ uid: string; label: string; component?: string | null }>;
  /** 选中元素在 items 里的位置 */
  index: number;
  axis: 'x' | 'y';
  pending: boolean;
  target: Target;
}

export type TextOrigin = 'jsx' | 'prop' | 'message' | 'html' | 'dynamic';

export interface TextView {
  segment: number;
  /** 去掉首尾空白的文字：有未应用的改动时是改动后的值 */
  value: string;
  pending: boolean;
  /** 文字写在哪：JSX 字面量、调用处的属性、多语言文件、HTML 文件，或动态内容（交给 Agent） */
  origin: TextOrigin;
  target: Target;
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

/** 改动类型：样式、文字、同一父元素内换序、组件 props */
export type ChangeKind = 'style' | 'text' | 'reorder' | 'prop';

export interface ChangeView {
  id: string;
  kind: ChangeKind;
  status: ChangeStatus;
  element: string;
  props: string[];
  propLabel: string;
  /** 样式是属性值，文字是原文，换序是位置（1 起），props 是 JSON */
  from: string;
  to: string;
  target: Target;
  /** 写回细节（如 "p-4 → p-5"）或失败原因 */
  note?: string;
  /** 页面上的预览是模拟出来的（换序用 order / transform 摆出来，真实 DOM 没动） */
  simulated?: boolean;
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
  /** 界面语言，跟随编辑器的显示语言 */
  locale: Locale;
}

export type PanelToExt =
  | { t: 'ready' }
  | { t: 'openPage'; url: string }
  | { t: 'pick'; on: boolean }
  | { t: 'select'; uid: string }
  | { t: 'hover'; uid: string | null }
  | { t: 'edit'; edit: EditRequest }
  /** 改选中元素第 segment 段文字 */
  | { t: 'editText'; segment: number; value: string; phase: 'live' | 'commit' }
  /** 把选中元素兄弟组里 uid 所在的那项挪到第 to 个（按现在的顺序，0 起）：live 只预览（结构树拖动中），commit 记进改动清单 */
  | { t: 'reorder'; uid: string; to: number; phase: 'live' | 'commit' }
  /** 改渲染选中元素的组件的一个 prop */
  | { t: 'editProp'; name: string; value: PropValue; phase: 'live' | 'commit' }
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
