import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '@css-tuner/protocol';
import { History, pendingSet } from '../src/history';
import type { ChangeRecord } from '../src/records';

function rec(over: Partial<ChangeRecord>): ChangeRecord {
  return {
    id: 'a1',
    kind: 'style',
    key: 'k1',
    status: 'pending',
    createdAt: 1,
    pageUrl: 'http://localhost:5173/',
    element: { label: 'div.card', source: null, sourceIndex: 0, sameSource: 1 },
    props: ['padding-top'],
    propLabel: 'padding-top',
    from: '16px',
    to: '24px',
    value: '24px',
    token: null,
    original: { 'padding-top': '16px' },
    view: { kind: 'agent', label: 'Agent', affects: 1, reason: 'why' },
    preview: { kind: 'inline', uid: 'u1', sourceKey: null },
    previewId: 'p1',
    write: { kind: 'agent', reason: 'why' },
    ...over,
  };
}

/** 模拟改动清单：按 key 找未应用的 */
class List {
  recs: ChangeRecord[] = [];
  find = (key: string) => this.recs.find((r) => r.status === 'pending' && r.key === key);
  set(key: string, r: ChangeRecord | null) {
    this.recs = this.recs.filter((x) => x.key !== key);
    if (r) this.recs.push(structuredClone(r));
  }
  /** 一次操作：返回前后的未应用改动 */
  op(run: () => void): [Map<string, ChangeRecord>, Map<string, ChangeRecord>] {
    const before = pendingSet(this.recs);
    run();
    return [before, pendingSet(this.recs)];
  }
  replay(state: Map<string, ChangeRecord | null> | null) {
    for (const [key, r] of state ?? []) this.set(key, r);
  }
}

describe('撤销 / 重做', () => {
  let h: History;
  let list: List;
  beforeEach(() => {
    setLocale('zh-CN');
    h = new History();
    list = new List();
  });

  it('同一属性连续改几次，一步步退回去再重做回来', () => {
    expect(h.record(...list.op(() => list.set('k1', rec({ value: '20px', to: '20px' }))))).toBe(true);
    expect(h.record(...list.op(() => list.set('k1', rec({ value: '24px', to: '24px' }))))).toBe(true);
    expect(h.labels()).toEqual({ undo: 'padding-top', redo: null });

    list.replay(h.take('undo', list.find));
    expect(list.find('k1')?.value).toBe('20px');
    list.replay(h.take('undo', list.find));
    expect(list.find('k1')).toBeUndefined();
    expect(h.take('undo', list.find)).toBeNull();
    expect(h.labels()).toEqual({ undo: null, redo: 'padding-top' });

    list.replay(h.take('redo', list.find));
    list.replay(h.take('redo', list.find));
    expect(list.find('k1')?.value).toBe('24px');
    expect(h.labels().redo).toBeNull();
  });

  it('没有变化的操作不算一步；新的一步清掉重做', () => {
    expect(h.record(...list.op(() => undefined))).toBe(false);
    h.record(...list.op(() => list.set('k1', rec({}))));
    list.replay(h.take('undo', list.find));
    expect(h.labels().redo).toBe('padding-top');
    h.record(...list.op(() => list.set('k2', rec({ id: 'b1', key: 'k2', propLabel: 'color', props: ['color'] }))));
    expect(h.labels()).toEqual({ undo: 'color', redo: null });
  });

  it('重置和删属性的步骤说明', () => {
    h.record(...list.op(() => list.set('k1', rec({}))));
    h.record(...list.op(() => list.set('k1', null)));
    expect(h.labels().undo).toBe('重置 padding-top');
    h.record(...list.op(() => list.set('k3', rec({ id: 'c1', key: 'k3', propLabel: 'border', removal: { values: { 'border-top-width': '0px' } } }))));
    expect(h.labels().undo).toBe('删除 border');
    h.record(...list.op(() => {
      list.set('k1', rec({}));
      list.set('k2', rec({ id: 'b1', key: 'k2', propLabel: 'border-width' }));
    }));
    expect(h.labels().undo).toBe('padding-top 和另外 1 项');
  });

  it('应用过的改动不再撤销：对不上的那步作废，更早的照样能撤', () => {
    h.record(...list.op(() => list.set('k1', rec({}))));
    h.record(...list.op(() => list.set('k2', rec({ id: 'b1', key: 'k2', propLabel: 'color' }))));
    list.recs.find((r) => r.key === 'k2')!.status = 'applied';
    h.prune(list.find);
    expect(h.labels().undo).toBe('padding-top');
    list.replay(h.take('undo', list.find));
    expect(list.find('k1')).toBeUndefined();
    expect(list.recs.find((r) => r.key === 'k2')?.status).toBe('applied');
  });

  it('撤销放回的是整条记录（同一个 id），删属性改成普通改动后能退回删除', () => {
    const removal = rec({ id: 'r1', key: 'k4', propLabel: 'background-color', value: '', to: '删除', removal: { values: { 'background-color': 'rgba(0, 0, 0, 0)' } } });
    h.record(...list.op(() => list.set('k4', removal)));
    h.record(...list.op(() => list.set('k4', { ...removal, value: '#fff', to: '#fff', removal: undefined })));
    list.replay(h.take('undo', list.find));
    expect(list.find('k4')).toMatchObject({ id: 'r1', value: '', removal: { values: { 'background-color': 'rgba(0, 0, 0, 0)' } } });
  });
});
