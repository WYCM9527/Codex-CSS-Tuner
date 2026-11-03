import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { t } from '@css-tuner/protocol';

export type SfcKind = 'vue' | 'svelte';

export function sfcKind(file: string): SfcKind | null {
  const f = file.replace(/[?#].*$/, '').toLowerCase();
  if (f.endsWith('.vue')) return 'vue';
  if (f.endsWith('.svelte')) return 'svelte';
  return null;
}

interface VuePos {
  offset: number;
  line: number;
  column: number;
}

export interface VueLoc {
  start: VuePos;
  end: VuePos;
}

export interface VueProp {
  /** 6 普通属性，7 指令 */
  type: number;
  name: string;
  loc: VueLoc;
  value?: { loc: VueLoc };
  arg?: { content: string; isStatic: boolean };
  exp?: { loc: VueLoc };
}

export interface VueNode {
  /** 1 元素 */
  type: number;
  tag: string;
  /** 0 元素，1 组件，2 slot，3 template */
  tagType: number;
  props: VueProp[];
  children?: VueNode[];
  loc: VueLoc;
}

interface VueBlock {
  loc: VueLoc;
  lang?: string;
  src?: string;
}

interface VueDescriptor {
  template: (VueBlock & { ast?: { children: VueNode[] } }) | null;
  script: VueBlock | null;
  scriptSetup: VueBlock | null;
  styles: VueBlock[];
}

export interface SvelteNode {
  type: string;
  start: number;
  end: number;
  name?: string;
  [k: string]: unknown;
}

interface SvelteBlock {
  content: { start: number; end: number };
  attributes: Array<{ name: string; value: unknown }>;
}

interface SvelteRoot {
  fragment: { nodes: SvelteNode[] };
  css: SvelteBlock | null;
  instance: SvelteBlock | null;
  module: SvelteBlock | null;
}

const PKG: Record<SfcKind, string> = { vue: 'vue/compiler-sfc', svelte: 'svelte/compiler' };
const compilers = new Map<string, unknown>();

/** 编译器从项目自己的依赖里加载（Vue 项目必有 vue，Svelte 项目必有 svelte），解析结果和项目用的版本一致 */
function compilerFor<T>(kind: SfcKind, file: string): T {
  try {
    const req = createRequire(join(dirname(file), '__css_tuner__.js'));
    const path = req.resolve(PKG[kind]);
    let mod = compilers.get(path);
    if (!mod) {
      mod = req(path);
      compilers.set(path, mod);
    }
    return mod as T;
  } catch (e) {
    throw new Error(t('engine.sfc.noCompiler', { pkg: PKG[kind], error: (e as Error).message }));
  }
}

export type Parsed = { kind: 'vue'; descriptor: VueDescriptor } | { kind: 'svelte'; root: SvelteRoot };

const parsed = new Map<string, { source: string; result: Parsed }>();

/** 解析结果按文件缓存到内容变化为止；语法错误或缺编译器时抛出（消息已本地化） */
export function parseSfc(source: string, file: string): Parsed {
  const hit = parsed.get(file);
  if (hit && hit.source === source) return hit.result;
  const kind = sfcKind(file);
  if (!kind) throw new Error(`not a .vue or .svelte file: ${file}`);
  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (e) {
      throw new Error(t('engine.jsx.parseFailed', { error: (e as Error).message }));
    }
  };
  let result: Parsed;
  if (kind === 'vue') {
    const { parse } = compilerFor<{ parse: (s: string, o: object) => { descriptor: VueDescriptor } }>('vue', file);
    result = { kind, descriptor: guard(() => parse(source, { filename: file, sourceMap: false }).descriptor) };
  } else {
    const { parse } = compilerFor<{ parse: (s: string, o: object) => SvelteRoot }>('svelte', file);
    result = { kind, root: guard(() => parse(source, { modern: true, filename: file })) };
  }
  parsed.set(file, { source, result });
  if (parsed.size > 32) parsed.delete(parsed.keys().next().value as string);
  return result;
}

/** 只留下 ranges 里的文字，其余换成空格（换行保留）：偏移和行列都和原文件一致 */
function keepOnly(source: string, ranges: Array<[number, number]>): string {
  const blank = (s: string) => s.replace(/[^\n\r]/g, ' ');
  let out = '';
  let at = 0;
  for (const [s, e] of [...ranges].sort((a, b) => a[0] - b[0])) {
    out += blank(source.slice(at, s)) + source.slice(s, e);
    at = e;
  }
  return out + blank(source.slice(at));
}

function svelteLang(b: SvelteBlock): string | null {
  const a = b.attributes.find((x) => x.name === 'lang');
  const v = Array.isArray(a?.value) ? (a.value[0] as { data?: string } | undefined)?.data : null;
  return v ?? null;
}

const CSS_LANGS = new Set(['css', 'postcss', 'pcss']);
const SCRIPT_TS = new Set(['ts', 'tsx']);

/** <style> 块里的 CSS（scss / less 等跳过，记进 skipped），其余部分换成空格 */
export function styleSource(source: string, file: string): { css: string; skipped: string[] } {
  const p = parseSfc(source, file);
  const keep: Array<[number, number]> = [];
  const skipped: string[] = [];
  const add = (start: number, end: number, lang: string | null | undefined) => {
    if (!lang || CSS_LANGS.has(lang)) keep.push([start, end]);
    else skipped.push(lang);
  };
  if (p.kind === 'vue') {
    for (const s of p.descriptor.styles) if (!s.src) add(s.loc.start.offset, s.loc.end.offset, s.lang);
  } else if (p.root.css) {
    add(p.root.css.content.start, p.root.css.content.end, svelteLang(p.root.css));
  }
  return { css: keep.length ? keepOnly(source, keep) : '', skipped };
}

/** <script> 块里的代码，其余部分换成空格；ts 表示要按 TypeScript 解析 */
export function scriptSource(source: string, file: string): { code: string; ts: boolean } {
  const p = parseSfc(source, file);
  const keep: Array<[number, number]> = [];
  let ts = false;
  if (p.kind === 'vue') {
    for (const s of [p.descriptor.script, p.descriptor.scriptSetup]) {
      if (!s || s.src) continue;
      keep.push([s.loc.start.offset, s.loc.end.offset]);
      if (s.lang && SCRIPT_TS.has(s.lang)) ts = true;
    }
  } else {
    for (const s of [p.root.module, p.root.instance]) {
      if (!s) continue;
      keep.push([s.content.start, s.content.end]);
      if (SCRIPT_TS.has(svelteLang(s) ?? '')) ts = true;
    }
  }
  return { code: keepOnly(source, keep), ts };
}

/** 找到 open 位置的 ( 对应的 ) */
function closeParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** :deep(x) 换成 " x"（Vue 把它编译成后代选择器），:global(x) / :slotted(x) 换成 x */
function unwrap(sel: string, re: RegExp, lead: string): string {
  let out = sel;
  for (let m = re.exec(out); m; m = re.exec(out)) {
    const open = m.index + m[0].length - 1;
    const close = closeParen(out, open);
    if (close < 0) break;
    out = out.slice(0, m.index) + lead + out.slice(open + 1, close) + out.slice(close + 1);
    re.lastIndex = 0;
  }
  return out;
}

/** 源码里样式块的选择器换成编译后去掉作用域标记的样子：展开 :deep() / :global() / :slotted() 这类写法 */
export function unscopeSource(sel: string): string {
  let s = unwrap(sel, /(?:::v-deep|:deep)\(/, ' ');
  s = unwrap(s, /(?:::v-slotted|:slotted|::v-global|:global)\(/, '');
  return s.replace(/\s*(?:>>>|\/deep\/|::v-deep)\s*/g, ' ').replace(/:global\s+/g, '');
}

/** 页面上编译后的选择器去掉作用域标记：Vue 的 [data-v-xxxxxxxx]，Svelte 的 .svelte-xxxx 和 :where(.svelte-xxxx) */
export function unscopePage(sel: string): string {
  return sel
    .replace(/\[data-v-[0-9a-f]{8}(?:-s)?\]/g, '')
    .replace(/:where\(\.svelte-[a-z0-9]+\)/g, '')
    .replace(/\.svelte-[a-z0-9]+/g, '');
}
