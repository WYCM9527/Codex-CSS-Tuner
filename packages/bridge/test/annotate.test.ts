import { afterEach, describe, expect, it, vi } from 'vitest';
import { installAnnotate, type AnnotateRequest, type AnnotateResult } from '../src/annotate';

type Win = { __CSS_TUNER_ANNOTATE__?: (req: AnnotateRequest) => AnnotateResult; __CSS_TUNER_CAN_ANNOTATE__?: () => boolean };

function setup(request?: (target: unknown, options: Record<string, unknown>) => { accepted?: boolean } | undefined) {
  const win: Win = {};
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', request ? { oai: { annotation: { request } } } : {});
  const target = { id: 'el' };
  const pick = vi.fn((_uids: string[]) => target as unknown as Element);
  installAnnotate(pick);
  return { win, target, pick };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('交给 Codex 的注释', () => {
  it('没有注释接口（不在 Codex 内置浏览器里）：说不可用，面板改走剪贴板', () => {
    const { win } = setup();
    expect(win.__CSS_TUNER_CAN_ANNOTATE__?.()).toBe(false);
    expect(win.__CSS_TUNER_ANNOTATE__?.({ comment: 'x' })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('落在按改动挑的元素上，评论截到 240 个字符', () => {
    const request = vi.fn((_t: unknown, _o: Record<string, unknown>) => ({ accepted: true }));
    const { win, target, pick } = setup(request);
    expect(win.__CSS_TUNER_CAN_ANNOTATE__?.()).toBe(true);
    const r = win.__CSS_TUNER_ANNOTATE__?.({ comment: '改'.repeat(300), uids: ['a', 'b'] });
    expect(r).toEqual({ ok: true });
    expect(pick).toHaveBeenCalledWith(['a', 'b']);
    const [t, options] = request.mock.calls[0];
    expect(t).toBe(target);
    expect(options.initialComment).toBe('改'.repeat(240));
    expect(options).not.toHaveProperty('metadata');
  });

  it('元数据按内置浏览器的规则整理：最多 6 项、键名合规、字符串 256 字以内、值只要标量', () => {
    const request = vi.fn((_t: unknown, _o: Record<string, unknown>) => ({ accepted: true }));
    const { win } = setup(request);
    win.__CSS_TUNER_ANNOTATE__?.({
      comment: 'c',
      metadata: {
        'CSS Tuner batch': 'a1b2c3',
        Changes: 2,
        '1bad': 'x',
        'bad.key': 'x',
        Long: 'x'.repeat(300),
        NaN: Number.NaN,
        Ok: true,
        Nothing: null,
        Nested: { a: 1 } as unknown as string,
        Sixth: 6,
        Seventh: 'dropped',
      },
    });
    expect(request.mock.calls[0][1].metadata).toEqual({
      'CSS Tuner batch': 'a1b2c3',
      Changes: 2,
      Long: 'x'.repeat(256),
      Ok: true,
      Nothing: null,
      Sixth: 6,
    });
  });

  it('元数据超过 2048 字节就整个不带，注释照常请求', () => {
    const request = vi.fn((_t: unknown, _o: Record<string, unknown>) => ({ accepted: true }));
    const { win } = setup(request);
    const metadata = Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map((k) => [k, '字'.repeat(200)]));
    expect(win.__CSS_TUNER_ANNOTATE__?.({ comment: 'c', metadata })).toEqual({ ok: true });
    expect(request.mock.calls[0][1]).not.toHaveProperty('metadata');
  });

  it('浏览器没接受（正有别的注释在等、没给权限）或者抛错：面板改走剪贴板', () => {
    expect(setup(() => ({ accepted: false })).win.__CSS_TUNER_ANNOTATE__?.({ comment: 'c' })).toEqual({ ok: false, reason: 'declined' });
    expect(setup(() => undefined).win.__CSS_TUNER_ANNOTATE__?.({ comment: 'c' })).toEqual({ ok: false, reason: 'declined' });
    const boom = setup(() => {
      throw new Error('not visible');
    });
    expect(boom.win.__CSS_TUNER_ANNOTATE__?.({ comment: 'c' })).toEqual({ ok: false, reason: 'error' });
  });
});
