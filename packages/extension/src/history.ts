import { changeName, t, type ChangeKind } from '@css-tuner/protocol';
import type { ChangeRecord } from './records';

/** 未应用的改动，按 key 各存一份 */
export type PendingSet = Map<string, ChangeRecord>;

/** 这一步动到的每条改动在某一时刻的样子，null 是那时没有这条 */
type State = Map<string, ChangeRecord | null>;

/** 这一步对每条改动做了什么：改值、删属性还是撤掉了；按钮提示用的时候才按当前界面语言拼 */
type Part = { op: 'edit' | 'removed' | 'dropped'; kind: ChangeKind; propLabel: string };

interface Step {
  parts: Part[];
  before: State;
  after: State;
}

/** 最多能撤销多少步 */
const LIMIT = 100;

/** 一条改动在这一步前后有没有变：值、显示的新值、令牌和删属性的内容都一样才算没变 */
const sig = (r: ChangeRecord | null | undefined) => (r ? JSON.stringify([r.id, r.value, r.to, r.token, r.removal ?? null]) : '');

/** 现在所有未应用的改动（深拷一份，撤销时整条放回去） */
export function pendingSet(records: ChangeRecord[]): PendingSet {
  return new Map(records.filter((r) => r.status === 'pending').map((r) => [r.key, structuredClone(r)]));
}

/**
 * 面板上的上一步 / 下一步，只管还没应用的改动：每步记下操作前后改动清单里变了的那几条，
 * 撤销放回之前的样子，重做放回之后的样子。中间应用（交给 Agent）或清掉了的，现在的清单和记下的对不上，
 * 这一步就作废，已经交给 Agent 的改动只能在清单里还原
 */
export class History {
  private undos: Step[] = [];
  private redos: Step[] = [];

  /** 一次操作前后的未应用改动有差别就记成一步，同时清掉重做；返回记了没有 */
  record(before: PendingSet, after: PendingSet): boolean {
    const b: State = new Map();
    const a: State = new Map();
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const x = before.get(key) ?? null;
      const y = after.get(key) ?? null;
      if (sig(x) === sig(y)) continue;
      b.set(key, x);
      a.set(key, y);
    }
    if (!a.size) return false;
    this.undos.push({ parts: partsOf(b, a), before: b, after: a });
    if (this.undos.length > LIMIT) this.undos.shift();
    this.redos = [];
    return true;
  }

  /** 丢掉和现在的改动清单对不上的最近几步 */
  prune(current: (key: string) => ChangeRecord | undefined) {
    const fits = (state: State) => [...state].every(([key, r]) => sig(current(key)) === sig(r));
    while (this.undos.length && !fits(this.undos[this.undos.length - 1].after)) this.undos.pop();
    while (this.redos.length && !fits(this.redos[this.redos.length - 1].before)) this.redos.pop();
  }

  /** 取出要撤销（重做）的一步挪到另一边，返回要把这些改动放回成什么样；没有可做的是 null */
  take(kind: 'undo' | 'redo', current: (key: string) => ChangeRecord | undefined): State | null {
    this.prune(current);
    const [from, to] = kind === 'undo' ? [this.undos, this.redos] : [this.redos, this.undos];
    const step = from.pop();
    if (!step) return null;
    to.push(step);
    return kind === 'undo' ? step.before : step.after;
  }

  /** 上一步、下一步各改的是什么（面板按钮的提示），没有是 null */
  labels(): { undo: string | null; redo: string | null } {
    const top = (steps: Step[]) => (steps.length ? labelOf(steps[steps.length - 1].parts) : null);
    return { undo: top(this.undos), redo: top(this.redos) };
  }
}

/** 这一步做了什么：改了哪个属性、删了哪个、撤掉了哪条 */
function partsOf(before: State, after: State): Part[] {
  return [...after].map(([key, r]): Part => {
    const { kind, propLabel } = r ?? before.get(key)!;
    return { op: !r ? 'dropped' : r.removal ? 'removed' : 'edit', kind, propLabel };
  });
}

/** 动到几条时说第一条和总数 */
function labelOf(parts: Part[]): string {
  const names = [
    ...new Set(
      parts.map((p) => {
        const label = changeName(p);
        return p.op === 'dropped' ? t('history.dropped', { label }) : p.op === 'removed' ? t('history.removed', { label }) : label;
      }),
    ),
  ];
  return names.length > 1 ? t('history.many', { label: names[0], n: names.length, more: names.length - 1 }) : names[0];
}
