/** 刚把页面放进设备框页面，这么久之内它又回到了顶层：多半是页面自己跳出了 iframe，这次就不再放，免得来回跳 */
const GUARD_MS = 4000;
const GUARD_KEY = 'css-tuner:wrapped';

/** 设备框页面的地址：path 是放进框里的页面 */
export function frameUrl(frame: string, path: string): string {
  return `${frame}?${new URLSearchParams({ u: path })}`;
}

export function wrapAllowed(last: number, now: number): boolean {
  return now < last || now - last >= GUARD_MS;
}

/**
 * 面板停靠时把页面换成设备框页面，页面放进框里。启动时（stop）先停下这一页的加载，免得页面自己的脚本白跑一遍；
 * force 是用户刚点了停靠，不管上次什么时候放过。
 * 返回 wrapped 是已经在换了；bounced 是刚放过又回到了顶层；skipped 是记不下时间，没法防来回跳，不放
 */
export function wrapIntoFrame(frame: string, opts: { force?: boolean; stop?: boolean } = {}): 'wrapped' | 'bounced' | 'skipped' {
  const now = Date.now();
  try {
    if (!opts.force && !wrapAllowed(Number(sessionStorage.getItem(GUARD_KEY)) || 0, now)) return 'bounced';
    sessionStorage.setItem(GUARD_KEY, String(now));
  } catch {
    if (!opts.force) return 'skipped';
  }
  if (opts.stop) window.stop();
  location.replace(frameUrl(frame, location.pathname + location.search + location.hash));
  return 'wrapped';
}
