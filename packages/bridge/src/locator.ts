import type { SourceLoc } from '@css-tuner/protocol';

/** 调用链的一层：[元素自己的位置, 渲染它的组件被调用的位置, 再外一层…]，callee 是这一层调用的组件 */
export interface ChainLink {
  loc: SourceLoc;
  callee: string | null;
}

/**
 * 一种框架的定位方式：从页面上的 DOM 元素找回它写在源码里的位置。
 * React 读 fiber 的调用栈，Vue 把 vnode 和模板对齐，Svelte 读编译器挂上的位置；都不是时按纯 HTML 处理。
 */
export interface Locator {
  /** 元素由这个框架渲染 */
  owns(el: Element): boolean;
  sourceOf(el: Element): Promise<SourceLoc | null>;
  chain(el: Element, depth: number): Promise<ChainLink[]>;
  /** 渲染这个元素的组件名 */
  ownerName(el: Element): string | null;
  /** 页面渲染完后预先解析一遍 */
  warm?(nodes: Element[]): void;
}

/** 依赖包里的组件文件：不是该改的代码，元素要回到业务代码里写着这个组件的地方 */
export const isLibFile = (path: string): boolean => /(?:^|[\\/])node_modules[\\/]/.test(path);
