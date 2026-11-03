import { sameValue, type PreviewTarget } from '@css-tuner/protocol';
import { arrange, fetchedKids, findGroup, groupOf, matchIn, movableKids, parentOf, sigOf, unitShort } from './order';
import { sameOrder } from './sig';
import { clearPreview, hasPreview, resolveRule } from './preview';
import { verifyProp } from './props';
import { findBySource } from './source';
import { baseOf, commitTextPreview, elementAtPath, fetchedText, fill, hasTextPreview, textNodesOf } from './text';
import { elOf, sleep, waitUntil } from './util';

export { sameValue };

type TextTarget = Extract<PreviewTarget, { kind: 'text' }>;
type OrderTarget = Extract<PreviewTarget, { kind: 'order' }>;

/**
 * 换序：React 页面等热更新把 DOM 换成新顺序（一变就撤掉模拟预览，免得叠在新顺序上再挪一遍），再比对兄弟的样子；
 * 纯 HTML 页面重新取页面 HTML 比对，对上了就把页面上的元素真的挪成这个顺序
 */
async function verifyOrder(id: string, target: OrderTarget, expected: string, timeoutMs: number, refind: () => Promise<Element | null>) {
  const t0 = performance.now();
  const elapsed = () => performance.now() - t0;
  const left = () => Math.max(0, timeoutMs - elapsed());
  const want = expected.split('\n');
  if (target.htmlPath) {
    const parentPath = target.htmlPath.slice(0, -1);
    let got: Awaited<ReturnType<typeof fetchedKids>> = null;
    for (;;) {
      got = await fetchedKids(parentPath);
      if ((got && sameOrder(got.sigs, want)) || left() <= 0) break;
      await sleep(Math.min(300, left()));
    }
    clearPreview(id);
    const ok = !!got && sameOrder(got.sigs, want);
    const p = parentOf(target) ?? elementAtPath(parentPath);
    if (ok && p) arrange(p, want);
    return { ok, actual: { order: (got?.shorts ?? []).join(' · ') }, waitedMs: Math.round(elapsed()) };
  }
  const a = target.anchor;
  const parentNow = async () => parentOf(target) ?? (a ? (await findBySource(a.path, a.line, a.column, a.index))?.parentElement : null) ?? (await refind())?.parentElement ?? null;
  let p = await parentNow();
  const kidsKey = () => (p && p.isConnected ? movableKids(p).map(sigOf).join('\n') : '');
  let before = kidsKey();
  let changedMs = -1;
  // 页面一变就撤掉模拟预览，免得叠在新顺序上再挪一遍
  const changed = () => {
    if (changedMs >= 0) return;
    changedMs = Math.round(elapsed());
    clearPreview(id);
  };
  // 整页刷新后重新校验时页面上已经是新顺序，不用再等变化
  let hit = await matchIn(p, want, target.mapped);
  let searched = elapsed();
  while (!hit && left() > 0) {
    if (p?.isConnected) {
      if (await waitUntil(() => !p!.isConnected || kidsKey() !== before, Math.min(left(), 500))) {
        changed();
        searched = -Infinity;
      }
    } else {
      // 找不到父元素时也要真的睡一会儿：只在微任务里打转会卡住页面，热更新的消息就一直进不来
      await sleep(Math.min(left(), 200));
      p = await parentNow();
    }
    before = kidsKey();
    hit = await matchIn(p, want, target.mapped);
    // p 可能已经不是这一组的父元素了（React 换掉了它，或者源码挪过、按旧位置找错了）：隔一会儿在整个页面里按指纹找
    if (!hit && elapsed() - searched >= 500) {
      searched = elapsed();
      const found = await findGroup(want, target.mapped);
      if (found) {
        p = found.p;
        hit = found.units;
      }
    }
  }
  if (hit) changed();
  else clearPreview(id);
  const shown = hit ?? (p?.isConnected ? await groupOf(p, target.mapped) : []);
  return { ok: !!hit, actual: { order: shown.map(unitShort).join(' · ') }, waitedMs: Math.round(elapsed()), changedMs };
}

/**
 * 文字：React 页面等热更新把文字改成新值（有预览时看的是预览底下 React 的值）再撤掉预览；
 * 纯 HTML 页面不会热更新，重新取页面 HTML 读出那段文字，对上了就把新文字留在页面上
 */
async function verifyText(id: string, target: TextTarget, expected: string, timeoutMs: number, refind: () => Promise<Element | null>) {
  const t0 = performance.now();
  const elapsed = () => performance.now() - t0;
  const left = () => Math.max(0, timeoutMs - elapsed());
  const want = expected.trim();
  if (target.htmlPath) {
    let actual: string | null = null;
    for (;;) {
      actual = await fetchedText(target.htmlPath, target.segment);
      if (actual?.trim() === want || left() <= 0) break;
      await sleep(Math.min(300, left()));
    }
    const ok = actual?.trim() === want;
    if (!ok) clearPreview(id);
    else if (hasTextPreview(id)) commitTextPreview(id, want);
    else {
      const el = elOf(target.uid) ?? elementAtPath(target.htmlPath);
      const node = el ? textNodesOf(el)[target.segment] : undefined;
      if (node) node.data = fill(node.data, want);
    }
    return { ok, actual: { text: actual ?? '' }, waitedMs: Math.round(elapsed()) };
  }
  let el = elOf(target.uid) ?? (await refind());
  const current = (): string | null => {
    const node = el && el.isConnected ? textNodesOf(el)[target.segment] : undefined;
    return node ? baseOf(node) : null;
  };
  let actual = current();
  while (actual?.trim() !== want && left() > 0) {
    if (el && el.isConnected) {
      await waitUntil(() => {
        if (!el || !el.isConnected) return true;
        actual = current();
        return actual?.trim() === want;
      }, Math.min(left(), 1000));
    } else {
      // 整页刷新后元素可能还没渲染出来
      await sleep(Math.min(150, left()));
    }
    if (!el || !el.isConnected) {
      el = await refind();
      actual = current();
    }
  }
  const changedMs = Math.round(elapsed());
  clearPreview(id);
  return { ok: actual?.trim() === want, actual: { text: actual ?? '' }, waitedMs: changedMs, changedMs };
}

function read(el: Element, props: string[]): Record<string, string> {
  const cs = getComputedStyle(el);
  return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p).trim()]));
}

function allMatch(actual: Record<string, string>, expected: Record<string, string>): boolean {
  return Object.entries(expected).every(([p, v]) => sameValue(p, actual[p] ?? '', v));
}

/**
 * 写回后等热更新到达再比对计算样式：
 * - Tailwind（内联预览）：等元素 className 变化后撤掉预览，再轮询到与预览值一致（新工具类的 CSS 可能晚于 className 到达）；
 * - 语义 CSS（CSSOM 预览）：等 <style> 被替换（旧规则脱离文档），再比对。
 * 页面上已经没有这条预览时（整页刷新过，或上一轮核对已经撤掉）读到的就是真实样式，直接轮询比对。
 */
export async function verify(
  id: string,
  target: PreviewTarget,
  expected: Record<string, string>,
  timeoutMs: number,
  refind: () => Promise<Element | null>,
) {
  if (target.kind === 'text') return verifyText(id, target, expected.text ?? '', timeoutMs, refind);
  if (target.kind === 'order') return verifyOrder(id, target, expected.order ?? '', timeoutMs, refind);
  if (target.kind === 'props') return verifyProp(id, target, expected, timeoutMs, refind);
  if (target.kind !== 'inline' && target.kind !== 'rule') return { ok: false, actual: {}, waitedMs: 0 };
  const t0 = performance.now();
  const props = Object.keys(expected);
  const elapsed = () => performance.now() - t0;
  const left = () => Math.max(0, timeoutMs - elapsed());
  let found = elOf(target.uid) ?? (await refind());
  // 整页刷新后马上来核对时，页面可能还没渲染出这个元素（或还认不出它的源码位置）
  while (!found && left() > 0) {
    await sleep(Math.min(150, left()));
    found = await refind();
  }
  if (!found) {
    clearPreview(id);
    return { ok: false, actual: {}, waitedMs: Math.round(elapsed()) };
  }
  const el = found;
  const previewing = hasPreview(id);
  if (previewing && target.kind === 'inline') {
    const before = el.getAttribute('class');
    await waitUntil(() => !el.isConnected || el.getAttribute('class') !== before, timeoutMs);
  } else if (previewing && target.kind === 'rule') {
    const liveBefore = resolveRule(target.rule);
    if (liveBefore) {
      await waitUntil(() => {
        const now = resolveRule(target.rule);
        return !now || now !== liveBefore;
      }, timeoutMs);
    }
  }
  const changedMs = Math.round(elapsed());
  clearPreview(id);
  let live: Element | null = el.isConnected ? el : await refind();
  let actual = live ? read(live, props) : {};
  while (!allMatch(actual, expected) && left() > 0) {
    if (live && live.isConnected) {
      await waitUntil(() => {
        if (!live || !live.isConnected) return true;
        actual = read(live, props);
        return allMatch(actual, expected);
      }, Math.min(left(), 1000));
    } else {
      await sleep(Math.min(150, left()));
    }
    if (!live || !live.isConnected) {
      live = await refind();
      actual = live ? read(live, props) : {};
    }
  }
  return { ok: allMatch(actual, expected), actual, waitedMs: Math.round(elapsed()), changedMs };
}
