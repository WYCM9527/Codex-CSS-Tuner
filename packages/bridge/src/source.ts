import type { CallerLoc, SourceLoc } from '@css-tuner/protocol';
import type { ChainLink, Locator } from './locator';
import { reactLocator } from './react-source';
import { svelteLocator } from './svelte-source';
import { vueLocator } from './vue-source';

export { fiberOf, fiberSource, hasReact, nameOf, ownerOf, propsChain, type DebugNode } from './react-source';

/** 纯 HTML：没有框架信息，文字和换序按元素在 HTML 文件里的路径写回（htmlPathOf） */
const htmlLocator: Locator = {
  owns: () => true,
  sourceOf: async () => null,
  chain: async () => [],
  ownerName: () => null,
};

const LOCATORS = [reactLocator, vueLocator, svelteLocator];

export function locatorOf(el: Element): Locator {
  return LOCATORS.find((l) => l.owns(el)) ?? htmlLocator;
}

/** 元素不由任何框架渲染（写在 HTML 文件里） */
export function isPlainHtml(el: Element): boolean {
  return locatorOf(el) === htmlLocator;
}

/**
 * 服务端渲染的页面激活之前，元素上还没有框架挂的信息，会被当成纯 HTML，生效的样式也还是服务端内联的那份。
 * Nuxt 挂载完才在容器上放 __vue_app__；SvelteKit 开发态激活前一刻同步删掉内联的 <style data-sveltekit>
 */
function hydrating(): boolean {
  const nuxt = document.getElementById('__nuxt') as (HTMLElement & { __vue_app__?: unknown }) | null;
  if (nuxt && !nuxt.__vue_app__) return true;
  return !!document.querySelector('style[data-sveltekit]');
}

/** 认得出的服务端渲染页面等它激活完，最多等 timeout */
export async function whenHydrated(timeout = 5000): Promise<void> {
  const until = performance.now() + timeout;
  while (hydrating() && performance.now() < until) await new Promise((r) => setTimeout(r, 50));
}

export function sourceOf(el: Element): Promise<SourceLoc | null> {
  return locatorOf(el).sourceOf(el);
}

/** 渲染这个元素的组件名，不是框架渲染的元素为 null */
export function ownerName(el: Element): string | null {
  return locatorOf(el).ownerName(el);
}

export function locKey(s: SourceLoc): string {
  return `${s.path}:${s.line}:${s.column}`;
}

function chainOf(el: Element, depth: number): Promise<ChainLink[]> {
  return locatorOf(el).chain(el, depth);
}

async function chainKeys(el: Element, depth: number): Promise<string[]> {
  return (await chainOf(el, depth)).map((c) => locKey(c.loc));
}

/** depth > 0 时只留下调用链前 depth 层也和 el 相同的元素 */
async function sameChain(el: Element, peers: Element[], depth: number): Promise<Element[]> {
  if (depth <= 0) return peers;
  const want = (await chainKeys(el, depth)).slice(1, depth + 1).join('|');
  const keep = await Promise.all(peers.map(async (p) => p === el || (await chainKeys(p, depth)).slice(1, depth + 1).join('|') === want));
  return peers.filter((_, i) => keep[i]);
}

export async function callersOf(el: Element, peers: Element[], depth = 3): Promise<CallerLoc[]> {
  const chain = (await chainOf(el, depth)).slice(1);
  const out: CallerLoc[] = [];
  for (const [i, c] of chain.entries()) {
    out.push({ source: c.loc, component: c.callee, same: (await sameChain(el, peers, i + 1)).length });
  }
  return out;
}

function allElements(): Element[] {
  return Array.from(document.body.querySelectorAll('*'));
}

async function bySource(want: string): Promise<Element[]> {
  const nodes = allElements();
  const locs = await Promise.all(nodes.map((n) => sourceOf(n)));
  return nodes.filter((_, i) => {
    const s = locs[i];
    return !!s && locKey(s) === want;
  });
}

/** 找出和 el 由源码里同一处创建的所有元素（按映射后的原始位置比较，热更新换了模块版本也能对上） */
export async function sameSourceElements(el: Element, depth = 0): Promise<Element[]> {
  const target = await sourceOf(el);
  if (!target) return [el];
  const peers = await bySource(locKey(target));
  if (!peers.includes(el)) {
    peers.push(el);
    peers.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }
  return depth > 0 ? sameChain(el, peers, depth) : peers;
}

export async function findBySource(path: string, line: number, column: number, index = 0): Promise<Element | null> {
  const hits = await bySource(`${path}:${line}:${column}`);
  return hits[index] ?? hits[0] ?? null;
}

let warmTimer: ReturnType<typeof setTimeout> | null = null;

/** 页面渲染完就预先解析一遍，选中时不用等（React 还要趁热更新前用当时的 sourcemap 解析） */
export function warmSources(delay = 600) {
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    warmTimer = null;
    const nodes = allElements();
    for (const l of LOCATORS) l.warm?.(nodes);
  }, delay);
}
