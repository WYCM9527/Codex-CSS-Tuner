import { sameValue, type PreviewTarget } from '@css-tuner/protocol';
import { clearPreview, resolveRule } from './preview';
import { elOf, waitUntil } from './util';

export { sameValue };

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
