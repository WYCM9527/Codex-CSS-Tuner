/** 取消订阅、释放资源 */
export interface Disposable {
  dispose(): void;
}

export type Event<T> = (listener: (e: T) => void) => Disposable;

export function toDisposable(dispose: () => void): Disposable {
  return { dispose };
}

/** 一个监听出错不影响别的监听 */
export class Emitter<T> {
  private listeners = new Set<(e: T) => void>();

  readonly event: Event<T> = (listener) => {
    this.listeners.add(listener);
    return toDisposable(() => void this.listeners.delete(listener));
  };

  fire(e: T): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(e);
      } catch (err) {
        console.error(err);
      }
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
