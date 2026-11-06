import { sameValue, type PreviewTarget } from '@css-tuner/protocol';
import { arrange, fetchedKids, findGroup, groupOf, matchIn, parentOf, unitShort } from './order';
import { sameOrder } from './sig';
import { beneath, clearPreview, hasPreview, previewAttached } from './preview';
import { probeProp } from './props';
import { findBySource } from './source';
import { baseOf, commitTextPreview, elementAtPath, fetchedText, fill, hasTextPreview, textAttached, textNodesOf } from './text';
import { elOf } from './util';

type TextTarget = Extract<PreviewTarget, { kind: 'text' }>;
type OrderTarget = Extract<PreviewTarget, { kind: 'order' }>;
type StyleTarget = Extract<PreviewTarget, { kind: 'inline' | 'rule' }>;
type Refind = () => Promise<Element | null>;

/**
 * attached：预览还作用在页面上（元素被重建、样式表被热更新换掉后会掉，服务端据此重新挂）；
 * found：页面上找得到这个元素（找不到时不用去重新挂预览）
 */
interface ProbeResult {
  ok: boolean;
  actual: Record<string, string>;
  attached: boolean;
  found: boolean;
}

/** 现在的元素：记下的那个被换掉了就按源码位置找回 */
async function live(uid: string, refind: Refind): Promise<Element | null> {
  const known = elOf(uid);
  return known?.isConnected ? known : refind();
}

/**
 * 换序：React 页面比对 DOM 里兄弟的样子（预览只用 CSS 挪位置，DOM 顺序就是源码给的）；
 * 纯 HTML 页面重新取页面 HTML 比对，对上了就把页面上的元素真的挪成这个顺序
 */
async function probeOrder(id: string, target: OrderTarget, expected: string, refind: Refind): Promise<ProbeResult> {
  const want = expected.split('\n');
  if (target.htmlPath) {
    const parentPath = target.htmlPath.slice(0, -1);
    const got = await fetchedKids(parentPath);
    const ok = !!got && sameOrder(got.sigs, want);
    if (ok) {
      clearPreview(id);
      const p = parentOf(target) ?? elementAtPath(parentPath);
      if (p) arrange(p, want);
    }
    return { ok, actual: { order: (got?.shorts ?? []).join(' · ') }, attached: ok || hasPreview(id), found: true };
  }
  const a = target.anchor;
  let p = parentOf(target) ?? (a ? (await findBySource(a.path, a.line, a.column, a.index))?.parentElement : null) ?? (await refind())?.parentElement ?? null;
  let hit = await matchIn(p, want, target.mapped);
  // p 可能已经不是这一组的父元素了（React 换掉了它，或者源码挪过、按旧位置找错了）：在整个页面里按指纹找
  if (!hit) {
    const found = await findGroup(want, target.mapped);
    if (found) {
      p = found.p;
      hit = found.units;
    }
  }
  if (hit) clearPreview(id);
  const shown = hit ?? (p?.isConnected ? await groupOf(p, target.mapped) : []);
  return { ok: !!hit, actual: { order: shown.map(unitShort).join(' · ') }, attached: !!hit || hasPreview(id), found: !!p };
}

/**
 * 文字：React 页面读预览底下 React 给的文字；纯 HTML 页面不会热更新，重新取页面 HTML 读出那段文字，
 * 对上了就把新文字留在页面上
 */
async function probeText(id: string, target: TextTarget, expected: string, refind: Refind): Promise<ProbeResult> {
  const want = expected.trim();
  if (target.htmlPath) {
    const actual = await fetchedText(target.htmlPath, target.segment);
    const ok = actual?.trim() === want;
    if (ok && hasTextPreview(id)) commitTextPreview(id, want);
    else if (ok) {
      const el = elOf(target.uid) ?? elementAtPath(target.htmlPath);
      const node = el ? textNodesOf(el)[target.segment] : undefined;
      if (node) node.data = fill(node.data, want);
    }
    return { ok, actual: { text: actual ?? '' }, attached: ok || textAttached(id), found: true };
  }
  const el = await live(target.uid, refind);
  const node = el ? textNodesOf(el)[target.segment] : undefined;
  const actual = node ? baseOf(node) : null;
  const ok = actual?.trim() === want;
  if (ok) clearPreview(id);
  return { ok, actual: { text: actual ?? '' }, attached: ok || textAttached(id), found: !!el };
}

/** 样式：临时撤下页面上的样式预览读计算值，读到的就是源码现在给的样子 */
async function probeStyle(id: string, target: StyleTarget, expected: Record<string, string>, refind: Refind): Promise<ProbeResult> {
  const props = Object.keys(expected);
  const el = await live(target.uid, refind);
  if (!el) return { ok: false, actual: {}, attached: previewAttached(id), found: false };
  const actual = beneath(() => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p).trim()]));
  });
  const ok = Object.entries(expected).every(([p, v]) => sameValue(p, actual[p] ?? '', v));
  if (ok) clearPreview(id);
  return { ok, actual, attached: ok || previewAttached(id, target.kind === 'inline' ? el : null), found: true };
}

/**
 * 交给 Codex 之后核对一条改动：读源码现在在页面上给出的值，不等待、不撤预览，服务端隔一会儿再来问；对上了才撤掉预览。
 * expected 的键随目标类型：样式是 CSS 属性名，text 是 "text"，order 是 "order"，props 是属性名
 */
export function probe(id: string, target: PreviewTarget, expected: Record<string, string>, refind: Refind): Promise<ProbeResult> {
  if (target.kind === 'text') return probeText(id, target, expected.text ?? '', refind);
  if (target.kind === 'order') return probeOrder(id, target, expected.order ?? '', refind);
  if (target.kind === 'props') return probeProp(id, target, expected, refind);
  return probeStyle(id, target, expected, refind);
}
