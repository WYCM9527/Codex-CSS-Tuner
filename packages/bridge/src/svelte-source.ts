import type { SourceLoc } from '@css-tuner/protocol';
import { isLibFile, type ChainLink, type Locator } from './locator';

/*
 * Svelte 5 开发态在每个元素上挂着 __svelte_meta：loc 是元素在 .svelte 文件里的位置
 * （路径相对项目根，行从 1 起、列从 0 起），parent 是渲染它的块（if、each、render）和组件，一层层往外。
 */

interface SvelteLoc {
  file: string;
  line: number;
  column: number;
}

interface SvelteParent extends SvelteLoc {
  type: string;
  parent?: SvelteParent | null;
  componentTag?: string;
}

interface SvelteMeta {
  loc?: SvelteLoc | null;
  parent?: SvelteParent | null;
}

const metaOf = (el: Element): SvelteMeta | null => (el as unknown as { __svelte_meta?: SvelteMeta }).__svelte_meta ?? null;

const isAbsolute = (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);

function componentOf(file: string): string {
  return file.replace(/^.*[\\/]/, '').replace(/\.svelte$/, '');
}

function toLoc(l: SvelteLoc, viaOwner = false): SourceLoc {
  return { url: l.file, path: l.file, file: isAbsolute(l.file) ? l.file : null, line: l.line, column: l.column + 1, component: componentOf(l.file), viaOwner };
}

interface Placed {
  loc: SourceLoc;
  /** 位置所在的那一层，调用处从它往外找 */
  layer: SvelteLoc;
  outer: SvelteParent | null | undefined;
}

/** 元素写在哪：依赖包里的组件渲染的元素，回到业务代码里写着这个组件的标签 */
function place(m: SvelteMeta | null): Placed | null {
  if (!m?.loc) return null;
  if (!isLibFile(m.loc.file)) return { loc: toLoc(m.loc), layer: m.loc, outer: m.parent };
  for (let p = m.parent; p; p = p.parent) {
    if (isLibFile(p.file)) continue;
    return p.type === 'component' ? { loc: toLoc(p, true), layer: p, outer: p.parent } : null;
  }
  return null;
}

export const svelteLocator: Locator = {
  owns: (el) => !!metaOf(el),
  sourceOf: async (el) => place(metaOf(el))?.loc ?? null,
  /**
   * 组件 C 在哪被调用：往外第一个组件层、且它里面那一层还在 C 的文件里。
   * snippet 和插槽内容的渲染路径会穿过别的组件，那些组件层不是 C 的调用处；
   * 调用处在依赖包里（比如 SvelteKit 渲染页面的根组件）就到头了
   */
  chain: async (el, depth) => {
    const first = place(metaOf(el));
    if (!first) return [];
    const out: ChainLink[] = [{ loc: first.loc, callee: null }];
    let file = first.layer.file;
    let inner: SvelteLoc = first.layer;
    for (let p = first.outer; p && out.length <= depth; inner = p, p = p.parent) {
      if (p.type !== 'component' || inner.file !== file) continue;
      if (isLibFile(p.file)) break;
      out.push({ loc: toLoc(p), callee: p.componentTag ?? componentOf(file) });
      file = p.file;
    }
    return out;
  },
  ownerName: (el) => {
    const loc = metaOf(el)?.loc;
    return loc ? componentOf(loc.file) : null;
  },
};
