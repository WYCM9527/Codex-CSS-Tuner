import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classLiteralSites, indexCssRules, locateClassSite, lookupCssRule, type CssRuleSpec } from '../src';
import { unscopePage, unscopeSource } from '../src/sfc';

const VUE = join(__dirname, '../../../fixtures/vue3');
const SVELTE = join(__dirname, '../../../fixtures/svelte5');
// 文件不必存在：编译器按所在目录从 fixture 的依赖里加载
const VUE_FILE = join(VUE, 'src/Sample.vue');
const SVELTE_FILE = join(SVELTE, 'src/Sample.svelte');

const VUE_SRC = `<script setup lang="ts">
const btnClass = 'px-4 py-2';
defineProps<{ on: boolean }>();
</script>

<template>
  <section class="flex gap-4 p-4">
    <h1 class="text-2xl font-bold">t</h1>
    <p :class="['mt-2', on && 'text-brand', { 'font-bold': on }]">p</p>
    <span :class="{ 'bg-brand': on }">s</span>
    <i>none</i>
    <Badge class="ml-2" />
    <em :class="{ hidden: !on }">e</em>
    <b :class="btnClass">c</b>
  </section>
</template>

<style scoped>
.card { padding: 12px; }
.card-body :deep(p) { margin: 0; }
@media (min-width: 640px) { .card .title { color: red; } }
</style>
`;

const SVELTE_SRC = `<script lang="ts">
  let { on = false, hidden = false, class: className = '' } = $props();
  const tone = 'text-ink';
</script>

<main class="flex gap-4 {className}">
  <h1 class="text-2xl font-bold">t</h1>
  <p class={['mt-2', on && 'text-brand']}>p</p>
  <button class="px-3" class:bg-brand={on} class:hidden>b</button>
  <i>none</i>
  <span class:italic={on}>s</span>
  <Badge class="ml-2" />
  {#if on}<em class="p-1">e</em>{/if}
</main>

<style>
  .stats .stat:hover { color: red; }
  main :global(a:hover) { color: blue; }
</style>
`;

const tokens = (file: string, src: string, line: number, column: number) => {
  const s = locateClassSite(src, file, line, column);
  if ('error' in s) throw new Error(s.error);
  return s.tokens.map((t) => `${t.text}${t.editable ? '' : '!'}${t.seg.conditional ? '?' : ''}`);
};

describe('Vue 模板的 class', () => {
  it('静态 class、:class 的数组和对象都收进来；条件分支里的标成条件类', () => {
    expect(tokens(VUE_FILE, VUE_SRC, 7, 3)).toEqual(['flex', 'gap-4', 'p-4']);
    expect(tokens(VUE_FILE, VUE_SRC, 9, 5)).toEqual(['mt-2', 'text-brand?', 'font-bold?']);
    expect(tokens(VUE_FILE, VUE_SRC, 12, 5)).toEqual(['ml-2']);
  });

  it('组件的根元素会收到调用处透传的 class；inheritAttrs: false 时不会', () => {
    const root = locateClassSite(VUE_SRC, VUE_FILE, 7, 3);
    const inner = locateClassSite(VUE_SRC, VUE_FILE, 8, 5);
    expect('error' in root || root.passesClassName).toBe(true);
    expect('error' in inner || inner.passesClassName).toBe(false);
    const off = VUE_SRC.replace('defineProps', "defineOptions({ inheritAttrs: false });\ndefineProps");
    const r = locateClassSite(off, VUE_FILE, 8, 3);
    expect('error' in r || r.passesClassName).toBe(false);
  });

  it('<script setup> 里的类名常量', () => {
    const all = classLiteralSites(VUE_SRC, VUE_FILE);
    expect('error' in all ? all : all.map((s) => [s.name, s.line, s.column, s.tokens.map((t) => t.text).join(' ')])).toEqual([['btnClass', 2, 18, 'px-4 py-2']]);
  });

  it('pug 模板不解析', () => {
    const r = locateClassSite('<template lang="pug">div.a</template>', VUE_FILE, 1, 22);
    expect('error' in r && r.error).toContain('pug');
  });
});

describe('Svelte 标记的 class', () => {
  it('class 文本和表达式、class={[...]}、class: 指令；简写的 class:hidden 标成不能改', () => {
    expect(tokens(SVELTE_FILE, SVELTE_SRC, 6, 1)).toEqual(['flex', 'gap-4']);
    expect(tokens(SVELTE_FILE, SVELTE_SRC, 8, 3)).toEqual(['mt-2', 'text-brand?']);
    expect(tokens(SVELTE_FILE, SVELTE_SRC, 9, 3)).toEqual(['px-3', 'bg-brand?', 'hidden!?']);
    expect(tokens(SVELTE_FILE, SVELTE_SRC, 12, 3)).toEqual(['ml-2']);
    expect(tokens(SVELTE_FILE, SVELTE_SRC, 13, 11)).toEqual(['p-1']);
  });

  it('class 里引用了 className 参数：调用处的 class 会传到这里', () => {
    const s = locateClassSite(SVELTE_SRC, SVELTE_FILE, 6, 1);
    expect('error' in s || s.passesClassName).toBe(true);
  });

  it('<script> 里的类名常量', () => {
    const all = classLiteralSites(SVELTE_SRC, SVELTE_FILE);
    expect('error' in all ? all : all.map((s) => [s.name, s.line, s.tokens.map((t) => t.text).join(' ')])).toEqual([['tone', 3, 'text-ink']]);
  });
});

function spec(fullSelector: string, extra: Partial<CssRuleSpec> = {}): CssRuleSpec {
  return { selector: fullSelector, fullSelector, conditions: [], ordinal: 0, mode: 'edit', via: null, ...extra };
}

describe('组件样式块的规则', () => {
  const files: Record<string, string> = { [VUE_FILE]: VUE_SRC, [SVELTE_FILE]: SVELTE_SRC };
  const read = (f: string) => files[f] ?? null;

  it('Vue scoped：页面上带 [data-v-*] 的选择器对回源码，:deep() 也认', () => {
    const index = indexCssRules(VUE_FILE, read);
    expect(lookupCssRule(index, spec('.card[data-v-1a2b3c4d]'))).toEqual({ file: VUE_FILE, line: 19, selector: '.card' });
    expect(lookupCssRule(index, spec('.card-body[data-v-1a2b3c4d] p'))).toEqual({ file: VUE_FILE, line: 20, selector: '.card-body :deep(p)' });
    expect(lookupCssRule(index, spec('.card .title[data-v-1a2b3c4d]', { conditions: ['@media (min-width: 640px)'] }))).toMatchObject({ line: 21 });
  });

  it('Svelte：去掉 .svelte-* 和 :where(.svelte-*)，:global() 也认', () => {
    const index = indexCssRules(SVELTE_FILE, read);
    expect(lookupCssRule(index, spec('.stats.svelte-1abcde .stat:where(.svelte-1abcde):hover'))).toEqual({ file: SVELTE_FILE, line: 17, selector: '.stats .stat:hover' });
    expect(lookupCssRule(index, spec('main.svelte-1abcde a:hover'))).toEqual({ file: SVELTE_FILE, line: 18, selector: 'main :global(a:hover)' });
  });

  it('scss 等预处理器的样式块不解析，说明原因', () => {
    const scss = '<template><div class="x" /></template>\n<style lang="scss">.x { a { color: red } }</style>\n';
    const r = lookupCssRule(indexCssRules(VUE_FILE, () => scss), spec('.x[data-v-1a2b3c4d]'));
    expect('error' in r && r.error).toContain('scss');
  });
});

describe('作用域选择器的还原', () => {
  it('源码写法展开成编译后的结构', () => {
    expect(unscopeSource('.a :deep(.b)')).toBe('.a  .b');
    expect(unscopeSource('.a:deep(.b .c)')).toBe('.a .b .c');
    expect(unscopeSource(':slotted(.x):hover')).toBe('.x:hover');
    expect(unscopeSource('main :global(a:is(.x, .y))')).toBe('main a:is(.x, .y)');
    expect(unscopeSource('.a >>> .b')).toBe('.a .b');
  });

  it('页面上的作用域标记去掉', () => {
    expect(unscopePage('.a .b[data-v-7ba5bd90]:hover')).toBe('.a .b:hover');
    expect(unscopePage('.x[data-v-7ba5bd90-s]')).toBe('.x');
    expect(unscopePage('.stats.svelte-cjprq .stat:where(.svelte-cjprq)')).toBe('.stats .stat');
  });
});
