/**
 * React 开发构建初始化时把渲染器的内部接口交给 __REACT_DEVTOOLS_GLOBAL_HOOK__，DevTools 改 props 用的 overrideProps 就在里面。
 * 桥接脚本在新文档最开头执行，赶在 React 之前挂一个兼容的钩子；页面已经有钩子（DevTools 扩展、React Refresh 的占位钩子）时只包一层
 */

type Path = Array<string | number>;

/** 渲染器交给 DevTools 的内部接口（只用到这几项；生产构建没有 override 系列） */
interface RendererInternals {
  bundleType?: number;
  version?: string;
  rendererPackageName?: string;
  overrideProps?: (fiber: object, path: Path, value: unknown) => void;
}

interface Tap {
  renderers: Map<number, RendererInternals>;
  /** 钩子是我们挂的（页面上原本没有） */
  own: boolean;
  /** 每次 React 提交后调用；桥接脚本重新执行时由新实例替换 */
  onCommit: (() => void) | null;
}

interface Hook {
  renderers?: Map<number, RendererInternals>;
  inject?: (internals: RendererInternals) => number;
  onCommitFiberRoot?: (...args: unknown[]) => unknown;
  __cssTunerTap?: Tap;
  /** Cursor 版 CSS Tuner 的桥接也会挂在这个钩子上（两个可能同时在页面里） */
  __cssTuner?: { own?: boolean };
}

const KEY = '__REACT_DEVTOOLS_GLOBAL_HOOK__';

const hookOf = () => (window as unknown as Record<string, Hook | undefined>)[KEY];

export function installHook(): void {
  const w = window as unknown as Record<string, Hook | undefined>;
  let hook = w[KEY];
  if (hook?.__cssTunerTap) return;
  const own = !hook || hook.__cssTuner?.own === true;
  if (!hook) {
    let next = 1;
    const renderers = new Map<number, RendererInternals>();
    const noop = () => undefined;
    hook = {
      renderers,
      supportsFiber: true,
      inject(internals: RendererInternals) {
        const id = next++;
        renderers.set(id, internals);
        return id;
      },
      onScheduleFiberRoot: noop,
      onCommitFiberRoot: noop,
      onPostCommitFiberRoot: noop,
      onCommitFiberUnmount: noop,
      checkDCE: noop,
    } as Hook;
    w[KEY] = hook;
  }
  const tap: Tap = { renderers: new Map(hook.renderers ?? []), own, onCommit: null };
  const inject = hook.inject;
  if (typeof inject === 'function') {
    hook.inject = function (this: unknown, internals: RendererInternals) {
      const id = inject.call(this, internals);
      tap.renderers.set(id, internals);
      return id;
    };
  }
  const commit = hook.onCommitFiberRoot;
  hook.onCommitFiberRoot = function (this: unknown, ...args: unknown[]) {
    const r = typeof commit === 'function' ? commit.apply(this, args) : undefined;
    try {
      tap.onCommit?.();
    } catch {
      /* 预览出错不能影响页面渲染 */
    }
    return r;
  };
  hook.__cssTunerTap = tap;
}

const tapOf = () => hookOf()?.__cssTunerTap ?? null;

/** 页面用了 React：拿到过渲染器，或者钩子是页面自己（DevTools、React Refresh）挂的 */
export function reactHooked(): boolean {
  const hook = hookOf();
  if (!hook) return false;
  const tap = hook.__cssTunerTap;
  return !tap || !tap.own || tap.renderers.size > 0;
}

function overrider(): RendererInternals | null {
  for (const r of tapOf()?.renderers.values() ?? []) if (typeof r.overrideProps === 'function') return r;
  return null;
}

/** 能预览 props：React 开发构建在我们的钩子挂上之后才初始化 */
export function canOverride(): boolean {
  return !!overrider();
}

/**
 * 把组件收到的 props 整个换成 props 并让它立刻重渲染（路径为空时 overrideProps 直接用传进去的对象，
 * 渲染完 memoizedProps 就是它，据此认出父组件有没有重新渲染过）。fiber 要传当前树上的那份
 */
export function replaceProps(fiber: object, props: object): boolean {
  const r = overrider();
  if (!r) return false;
  r.overrideProps!(fiber, [], props);
  return true;
}

export function onCommit(fn: (() => void) | null) {
  const tap = tapOf();
  if (tap) tap.onCommit = fn;
}
