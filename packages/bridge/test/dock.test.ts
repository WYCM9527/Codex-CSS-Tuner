import { afterEach, describe, expect, it, vi } from 'vitest';
import { frameUrl, wrapAllowed, wrapIntoFrame } from '../src/dock';
import { parsePanelState } from '../src/shell';

const FRAME = '/__css_tuner__/frame';

function setup(last: number | null, opts: { broken?: boolean } = {}) {
  const store = new Map<string, string>();
  if (last !== null) store.set('css-tuner:wrapped', String(last));
  const blocked = () => {
    if (opts.broken) throw new Error('blocked');
  };
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (blocked(), store.get(k) ?? null),
    setItem: (k: string, v: string) => (blocked(), store.set(k, v)),
  });
  const replace = vi.fn();
  const stop = vi.fn();
  vi.stubGlobal('location', { pathname: '/shop', search: '?q=1', hash: '#top', replace });
  vi.stubGlobal('window', { stop });
  vi.spyOn(Date, 'now').mockReturnValue(100_000);
  return { store, replace, stop };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('设备框页面的地址', () => {
  it('跟着面板走的框不带宽度，定宽的框带取整后的宽度；原来的地址整个放进 u', () => {
    expect(frameUrl(FRAME, null, '/a?b=1#c')).toBe(`${FRAME}?u=%2Fa%3Fb%3D1%23c`);
    expect(frameUrl(FRAME, 390.4, '/')).toBe(`${FRAME}?w=390&u=%2F`);
  });
});

describe('防止页面在框里框外来回跳', () => {
  it('上次放进框里不到 4 秒又回到顶层，这次不放；时钟往回拨了也照放', () => {
    expect(wrapAllowed(0, 100_000)).toBe(true);
    expect(wrapAllowed(100_000, 102_000)).toBe(false);
    expect(wrapAllowed(100_000, 104_000)).toBe(true);
    expect(wrapAllowed(200_000, 100_000)).toBe(true);
  });

  it('放进框里：停下这一页的加载，换成设备框页面，记下时间', () => {
    const { store, replace, stop } = setup(null);
    expect(wrapIntoFrame(FRAME, { stop: true })).toBe('wrapped');
    expect(stop).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith(`${FRAME}?u=%2Fshop%3Fq%3D1%23top`);
    expect(store.get('css-tuner:wrapped')).toBe('100000');
  });

  it('刚放过又回到了顶层：说是页面自己跳了出来，不再放', () => {
    const { replace, stop } = setup(98_000);
    expect(wrapIntoFrame(FRAME, { stop: true })).toBe('bounced');
    expect(stop).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('用户点了停靠：不管上次什么时候放过都放', () => {
    const { replace } = setup(98_000);
    expect(wrapIntoFrame(FRAME, { force: true })).toBe('wrapped');
    expect(replace).toHaveBeenCalledOnce();
  });

  it('sessionStorage 用不了：自动的不放（没法防来回跳），用户点的照放', () => {
    const { replace } = setup(null, { broken: true });
    expect(wrapIntoFrame(FRAME, { stop: true })).toBe('skipped');
    expect(replace).not.toHaveBeenCalled();
    expect(wrapIntoFrame(FRAME, { force: true })).toBe('wrapped');
    expect(replace).toHaveBeenCalledOnce();
  });
});

describe('记下来的面板状态', () => {
  const DEFAULT = { side: 'right', width: 380, collapsed: false, float: false };

  it('没记过、记坏了：默认停靠在右边', () => {
    expect(parsePanelState(null)).toEqual(DEFAULT);
    expect(parsePanelState('not json')).toEqual(DEFAULT);
    expect(parsePanelState('"right"')).toEqual(DEFAULT);
  });

  it('老版本记的状态没有浮动这一项：按停靠算', () => {
    expect(parsePanelState('{"side":"left","width":420,"collapsed":true}')).toEqual({ side: 'left', width: 420, collapsed: true, float: false });
  });

  it('浮动照记的来；宽度限在 300 到 720 之间，也不超过窗口给的上限', () => {
    expect(parsePanelState('{"float":true}').float).toBe(true);
    expect(parsePanelState('{"width":100}').width).toBe(300);
    expect(parsePanelState('{"width":9999}').width).toBe(720);
    expect(parsePanelState('{"width":700}', 500).width).toBe(500);
  });
});
