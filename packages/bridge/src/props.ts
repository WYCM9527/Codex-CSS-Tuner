import type { PreviewTarget, PropInfo, PropsInfo, PropValue, SourceLoc } from '@css-tuner/protocol';
import { canOverride, onCommit, replaceProps } from './devtools';
import { fiberOf, fiberSource, findBySource, locKey, nameOf, ownerOf, type DebugNode } from './source';
import { elOf } from './util';

type PropsTarget = Extract<PreviewTarget, { kind: 'props' }>;
type Props = Record<string, unknown>;

/** 样式和文字另有分区编辑；data-* 多是测试和埋点用的 */
const HIDDEN = new Set(['children', 'key', 'ref', 'className', 'class', 'style']);
const MAX_PROPS = 24;

/** 服务端组件的调试信息没有 tag，不是 fiber */
const isFiber = (n: DebugNode) => typeof n.tag === 'number';

const rootOf = (f: DebugNode) => {
  let n = f;
  for (let i = 0; n.return && i < 10000; i++) n = n.return;
  return n;
};

/**
 * 一对 fiber 里在当前树上的那个，已经卸载了返回 null。宿主节点上记的、owner 链上拿到的都可能是上一轮的那份，
 * 它的 memoizedProps 是旧的。照 React 的 findCurrentFiberUsingSlowPath 往上走到根，看根指向哪一边
 */
export function currentFiber(fiber: DebugNode): DebugNode | null {
  const alternate = fiber.alternate;
  if (!alternate) return rootOf(fiber).tag === 3 ? fiber : null;
  const mounted = (f: DebugNode) => rootOf(f).tag === 3;
  let a: DebugNode = fiber;
  let b: DebugNode = alternate;
  for (let guard = 0; guard < 10000; guard++) {
    const parentA = a.return;
    if (!parentA) break;
    const parentB = parentA.alternate;
    if (!parentB) {
      // Suspense 隐藏时中间插着一层没有副本的片段：跳过它
      const next = parentA.return;
      if (!next) break;
      a = b = next;
      continue;
    }
    // 两份父节点指着同一组子节点：低优先级更新跳过时子节点直接复用当前的
    if (parentA.child === parentB.child) {
      for (let c = parentA.child; c; c = c.sibling) {
        if (c === a) return mounted(parentA) ? fiber : null;
        if (c === b) return mounted(parentA) ? alternate : null;
      }
      return null;
    }
    if (a.return !== b.return) {
      a = parentA;
      b = parentB;
    } else {
      let found = false;
      for (const [p, q] of [
        [parentA, parentB],
        [parentB, parentA],
      ]) {
        for (let c = p.child; c && !found; c = c.sibling) {
          if (c === a) {
            found = true;
            a = p;
            b = q;
          } else if (c === b) {
            found = true;
            b = p;
            a = q;
          }
        }
        if (found) break;
      }
      if (!found) return null;
    }
    if (a.alternate !== b) return null;
  }
  if (a.tag !== 3) return null;
  return (a.stateNode as { current?: unknown } | null)?.current === a ? fiber : alternate;
}

/** 渲染这个元素的项目组件：沿 owner 链往外，第一个在业务代码里被调用的组件（库组件内部创建的跳过）；source 是调用处 */
export async function propsOwner(el: Element): Promise<{ node: DebugNode; source: SourceLoc; direct: boolean } | null> {
  // 元素上记的可能是上一轮的那份 fiber，它的 owner 也是旧的（服务端组件刷新后还是刷新前的调试信息）
  const host = fiberOf(el);
  let n = host ? ownerOf(currentFiber(host) ?? host) : null;
  for (let i = 0; n && i < 16; i++, n = ownerOf(n)) {
    const source = await fiberSource(n);
    if (source) return { node: n, source, direct: i === 0 };
  }
  return null;
}

/** 页面上由同一个调用处创建的这个组件的实例（当前树上的那份 fiber，按页面顺序） */
async function sameSite(node: DebugNode, source: SourceLoc): Promise<DebugNode[]> {
  const cur = currentFiber(node);
  if (!cur) return [];
  const top = rootOf(cur);
  const start = (top.stateNode as { current?: DebugNode } | null)?.current ?? top;
  const candidates: DebugNode[] = [];
  const stack = [start];
  for (let seen = 0; stack.length && seen < 50000; seen++) {
    const n = stack.pop()!;
    if (n.type === cur.type) candidates.push(n);
    if (n.sibling) stack.push(n.sibling);
    if (n.child) stack.push(n.child);
  }
  const want = locKey(source);
  const out: DebugNode[] = [];
  for (const n of candidates) {
    if (n === cur) out.push(n);
    else {
      const s = await fiberSource(n);
      if (s && locKey(s) === want) out.push(n);
    }
  }
  return out.length ? out : [cur];
}

const REACT_ELEMENTS = new Set([Symbol.for('react.element'), Symbol.for('react.transitional.element'), Symbol.for('react.portal')]);

function summaryOf(v: object): string {
  if (v instanceof Promise) return 'Promise';
  if (v instanceof Date) return 'Date';
  let keys: string[] = [];
  try {
    keys = Object.keys(v);
  } catch {
    /* 跨域对象之类 */
  }
  return keys.length ? `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }` : '{}';
}

function describe(name: string, v: unknown): PropInfo {
  switch (typeof v) {
    case 'string':
      return { name, type: 'string', value: v };
    case 'number':
      return Number.isFinite(v) ? { name, type: 'number', value: v } : { name, type: 'object', value: null, summary: String(v) };
    case 'boolean':
      return { name, type: 'boolean', value: v };
    case 'undefined':
      return { name, type: 'undefined', value: null };
    case 'function':
      return { name, type: 'function', value: null, summary: v.name ? `${v.name}()` : '() => …' };
    case 'object': {
      if (v === null) return { name, type: 'null', value: null };
      if (REACT_ELEMENTS.has((v as { $$typeof?: symbol }).$$typeof as symbol)) {
        const t = (v as { type?: unknown }).type as { displayName?: string; name?: string } | string | undefined;
        const tag = typeof t === 'string' ? t : t?.displayName || t?.name || 'Component';
        return { name, type: 'element', value: null, summary: `<${tag} />` };
      }
      if (Array.isArray(v)) return { name, type: 'array', value: null, summary: `[${v.length}]` };
      return { name, type: 'object', value: null, summary: summaryOf(v) };
    }
    default:
      return { name, type: 'object', value: null, summary: String(v) };
  }
}

/* ---------- 预览 ---------- */

interface Instance {
  /** 这个实例那一对 fiber 里的一个 */
  fiber: DebugNode;
  /** 预览前调用处有没有传这个 prop、传的什么 */
  had: boolean;
  original: unknown;
}

interface Entry {
  id: string;
  target: PropsTarget;
  value: PropValue;
  instances: Instance[];
  /** 实例都卸载了（热更新重新挂载）时按 anchor 找回，别找得太勤 */
  lostAt?: number;
}

const entries = new Map<string, Entry>();

/** 每个实例上最近一次由我们换上去的 props 对象：现在的 memoizedProps 还是它，说明父组件没重新渲染过，页面上的值是预览出来的 */
const ours = new WeakMap<object, object>();

const samePair = (a: DebugNode, b: DebugNode) => a === b || a.alternate === b;
const oursOf = (f: DebugNode) => ours.get(f) ?? (f.alternate ? ours.get(f.alternate) : undefined);

function put(cur: DebugNode, next: Props) {
  if (cur.alternate) ours.delete(cur.alternate);
  ours.set(cur, next);
  replaceProps(cur, next);
}

/** 现在的 props 是我们换上去的那份（还没被父组件的重新渲染替换掉） */
const isOurs = (cur: DebugNode) => {
  const p = cur.memoizedProps;
  return !!p && typeof p === 'object' && oursOf(cur) === p;
};

async function resolveInstances(target: PropsTarget): Promise<Instance[]> {
  if (!canOverride()) return [];
  let el = elOf(target.uid);
  if ((!el || !el.isConnected) && target.anchor) el = await findBySource(target.anchor.path, target.anchor.line, target.anchor.column, target.anchor.index);
  const owner = el && (await propsOwner(el));
  if (!owner || !isFiber(owner.node)) return [];
  return (await sameSite(owner.node, owner.source)).map((f) => {
    const props = (f.memoizedProps ?? {}) as Props;
    return { fiber: f, had: Object.prototype.hasOwnProperty.call(props, target.name), original: props[target.name] };
  });
}

function show(e: Entry) {
  for (const inst of e.instances) {
    const cur = currentFiber(inst.fiber);
    const props = cur?.memoizedProps as Props | undefined;
    if (cur && props && props[e.target.name] !== e.value) put(cur, { ...props, [e.target.name]: e.value });
  }
}

/** 预览一个 prop：同一个调用处创建的实例一起改，返回改了几个；拿不到 overrideProps（服务端组件、钩子挂晚了）时返回 0 */
export async function previewProp(id: string, target: PropsTarget, value: PropValue): Promise<number> {
  let e = entries.get(id);
  if (e && e.target.name !== target.name) {
    clearProp(id);
    e = undefined;
  }
  if (!e) {
    const instances = await resolveInstances(target);
    if (!instances.length) return 0;
    e = { id, target, value, instances };
    entries.set(id, e);
  }
  e.target = target;
  e.value = value;
  show(e);
  onCommit(scheduleReapply);
  return e.instances.length;
}

let queued = false;

/** React 每次提交后：提交阶段里不能接着排更新，放到微任务里（页面绘制前还来得及） */
function scheduleReapply() {
  if (queued || !entries.size) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    reapplyProps();
  });
}

/**
 * 父组件重新渲染会把预览值冲掉：现在的 props 不是我们换上去的那份、值又不对，就再换一次。
 * 源码里已经是预览值（应用后热更新）时不用管，撤预览时也不会退回旧值
 */
export function reapplyProps() {
  const groups = new Map<DebugNode, Map<string, PropValue>>();
  for (const e of entries.values()) {
    e.instances = e.instances.filter((inst) => !!currentFiber(inst.fiber));
    if (!e.instances.length) {
      void reattach(e);
      continue;
    }
    for (const inst of e.instances) {
      const cur = currentFiber(inst.fiber)!;
      const key = [...groups.keys()].find((k) => samePair(k, cur)) ?? cur;
      const g = groups.get(key) ?? new Map<string, PropValue>();
      g.set(e.target.name, e.value);
      groups.set(key, g);
    }
  }
  for (const [cur, want] of groups) {
    const props = cur.memoizedProps as Props | undefined;
    if (!props || isOurs(cur)) continue;
    if ([...want].every(([k, v]) => props[k] === v)) continue;
    put(cur, { ...props, ...Object.fromEntries(want) });
  }
}

/** 实例都卸载了（重新挂载、元素换了）：按元素的源码位置找回新的实例重新预览 */
async function reattach(e: Entry) {
  if (e.lostAt && Date.now() - e.lostAt < 300) return;
  e.lostAt = Date.now();
  const instances = await resolveInstances(e.target);
  if (!instances.length || entries.get(e.id) !== e) return;
  e.instances = instances;
  show(e);
}

/** 撤掉预览：页面上还是我们换上去的 props 时把这个 prop 放回原值；父组件重新渲染过就已经是源码里的值了 */
export function clearProp(id: string): boolean {
  const e = entries.get(id);
  if (!e) return false;
  entries.delete(id);
  for (const inst of e.instances) {
    const cur = currentFiber(inst.fiber);
    if (!cur || !isOurs(cur)) continue;
    const next = { ...(cur.memoizedProps as Props) };
    if (inst.had) next[e.target.name] = inst.original;
    else delete next[e.target.name];
    put(cur, next);
  }
  if (!entries.size) onCommit(null);
  return true;
}

export function clearAllProps(): number {
  const n = entries.size;
  for (const id of Array.from(entries.keys())) clearProp(id);
  return n;
}

export const hasPropPreview = (id: string) => entries.has(id);

/** 预览前的值：快照里显示原值，面板据此判断改回了没有 */
function baseOf(cur: DebugNode, name: string, value: unknown): { had: boolean; value: unknown } {
  for (const e of entries.values()) {
    if (e.target.name !== name) continue;
    const inst = e.instances.find((i) => samePair(i.fiber, cur));
    if (inst) return { had: inst.had, value: inst.original };
  }
  return { had: true, value };
}

/** 渲染这个元素的项目组件和它收到的 props */
export async function propsInfo(el: Element): Promise<PropsInfo | undefined> {
  const owner = await propsOwner(el);
  if (!owner) return undefined;
  const { node, source, direct } = owner;
  const server = !isFiber(node);
  const cur = server ? node : currentFiber(node);
  const raw = cur ? ((server ? cur.props : cur.memoizedProps) as Props | null | undefined) : null;
  if (!cur || !raw || typeof raw !== 'object') return undefined;
  const props: PropInfo[] = [];
  for (const name of Object.keys(raw)) {
    if (HIDDEN.has(name) || name.startsWith('data-')) continue;
    const base = server ? { had: true, value: raw[name] } : baseOf(cur, name, raw[name]);
    if (!base.had) continue;
    props.push(describe(name, base.value));
    if (props.length >= MAX_PROPS) break;
  }
  return {
    component: nameOf(node) ?? '?',
    source,
    props,
    server,
    live: !server && canOverride(),
    same: server ? 1 : (await sameSite(node, source)).length,
    direct,
  };
}

/* ---------- 交给 Codex 后核对 ---------- */

const asJson = (v: unknown) => (v === undefined ? 'undefined' : (JSON.stringify(v) ?? 'null'));

/**
 * 组件现在从源码收到的值：客户端组件要等父组件重新渲染过（props 不再是我们换上去的那份）才算数，
 * 服务端组件看最新的调试信息。对上了才撤掉预览
 */
export async function probeProp(id: string, target: PropsTarget, expected: Record<string, string>, refind: () => Promise<Element | null>) {
  const want = expected[target.name];
  const known = elOf(target.uid);
  const el = known?.isConnected ? known : await refind();
  const owner = el && (await propsOwner(el));
  let value: string | null = null;
  let fresh = false;
  if (owner && !isFiber(owner.node)) {
    value = asJson((owner.node.props as Props | undefined)?.[target.name]);
    fresh = true;
  } else if (owner) {
    const cur = currentFiber(owner.node);
    const props = cur?.memoizedProps as Props | undefined;
    if (cur && props) {
      value = asJson(props[target.name]);
      fresh = !isOurs(cur);
    }
  }
  const ok = fresh && value === want;
  if (ok) clearProp(id);
  return { ok, actual: { [target.name]: value ?? '' }, attached: ok || entries.has(id), found: !!el };
}
