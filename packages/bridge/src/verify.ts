import { sameValue, type PreviewTarget } from '@css-tuner/protocol';
import { clearPreview, resolveRule } from './preview';
import { baseOf, commitTextPreview, elementAtPath, fetchedText, fill, hasTextPreview, textNodesOf } from './text';
import { elOf, sleep, waitUntil } from './util';

export { sameValue };

type TextTarget = Extract<PreviewTarget, { kind: 'text' }>;

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
 */
export async function verify(
  id: string,
  target: PreviewTarget,
  expected: Record<string, string>,
  timeoutMs: number,
  refind: () => Promise<Element | null>,
) {
  if (target.kind === 'text') return verifyText(id, target, expected.text ?? '', timeoutMs, refind);
  if (target.kind !== 'inline' && target.kind !== 'rule') return { ok: false, actual: {}, waitedMs: 0 };
  const t0 = performance.now();
  const el = elOf(target.uid) ?? (await refind());
  const props = Object.keys(expected);
  const elapsed = () => performance.now() - t0;
  if (!el) {
    clearPreview(id);
    return { ok: false, actual: {}, waitedMs: 0 };
  }
  const left = () => Math.max(0, timeoutMs - elapsed());
  if (target.kind === 'inline') {
    const before = el.getAttribute('class');
    await waitUntil(() => !el.isConnected || el.getAttribute('class') !== before, timeoutMs);
  } else {
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
    await waitUntil(() => {
      if (!live || !live.isConnected) return true;
      actual = read(live, props);
      return allMatch(actual, expected);
    }, Math.min(left(), 1000));
    if (!live || !live.isConnected) {
      live = await refind();
      actual = live ? read(live, props) : {};
    }
  }
  return { ok: allMatch(actual, expected), actual, waitedMs: Math.round(elapsed()), changedMs };
}
