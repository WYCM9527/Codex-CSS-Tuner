import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyEdits,
  classLiteralSites,
  editCssRule,
  editTailwind,
  indexCssRules,
  loadTailwindDesign,
  locateClassSite,
  lookupCssRule,
  revertTailwind,
  type CssRuleSpec,
  type TailwindEditInput,
  type TwDesign,
} from '../src';
import { unscopePage, unscopeSource } from '../src/sfc';

const VUE = join(__dirname, '../../../fixtures/vue3');
const SVELTE = join(__dirname, '../../../fixtures/svelte5');
// 文件不必存在：编译器按所在目录从 fixture 的依赖里加载
const VUE_FILE = join(VUE, 'src/Sample.vue');
const SVELTE_FILE = join(SVELTE, 'src/Sample.svelte');

const vueParse = createRequire(join(VUE, 'package.json'))('vue/compiler-sfc').parse as (s: string) => { errors: unknown[] };
const svelteParse = createRequire(join(SVELTE, 'package.json'))('svelte/compiler').parse as (s: string, o: object) => unknown;

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

let d: TwDesign;
beforeAll(async () => {
  d = await loadTailwindDesign(join(VUE, 'src/style.css'));
});

function run(file: string, source: string, input: Omit<TailwindEditInput, 'file' | 'source'>) {
  const r = editTailwind(d, { file, source, ...input });
  if (!r.ok) return { ok: false as const, reason: r.reason, out: '' };
  const out = applyEdits(source, r.edits);
  // 改完还得是合法的组件文件
  if (file.endsWith('.vue')) expect(vueParse(out).errors).toEqual([]);
  else svelteParse(out, { modern: true });
  return { ok: true as const, out, summary: r.summary, classes: r.classes };
}

const lineOf = (s: string, line: number) => s.split('\n')[line - 1];
const tokens = (file: string, src: string, line: number, column: number) => {
  const s = locateClassSite(src, file, line, column);
  if ('error' in s) throw new Error(s.error);
  return s.tokens.map((t) => `${t.text}${t.editable ? '' : '!'}${t.seg.conditional ? '?' : ''}`);
};

describe('Vue 模板的 class 写回', () => {
  it('静态 class、:class 的数组和对象都收进来；条件分支里的标成条件类', () => {
    expect(tokens(VUE_FILE, VUE_SRC, 7, 3)).toEqual(['flex', 'gap-4', 'p-4']);
    expect(tokens(VUE_FILE, VUE_SRC, 9, 5)).toEqual(['mt-2', 'text-brand?', 'font-bold?']);
    expect(tokens(VUE_FILE, VUE_SRC, 12, 5)).toEqual(['ml-2']);
  });

  it('替换静态 class 里的类', () => {
    const r = run(VUE_FILE, VUE_SRC, { line: 8, column: 5, props: ['font-size'], value: '1.25rem', token: 'xl', utility: 'text-2xl' });
    expect(r.ok && lineOf(r.out, 8)).toBe('    <h1 class="text-xl font-bold">t</h1>');
  });

  it('替换 :class 数组里的字符串', () => {
    const r = run(VUE_FILE, VUE_SRC, { line: 9, column: 5, props: ['margin-top'], value: '1rem', token: '4', utility: 'mt-2' });
    expect(r.ok && lineOf(r.out, 9)).toBe(`    <p :class="['mt-4', on && 'text-brand', { 'font-bold': on }]">p</p>`);
  });

  it('没有 class 时加的是 class 属性；只有条件类时在旁边加静态 class', () => {
    const a = run(VUE_FILE, VUE_SRC, { line: 11, column: 5, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '0.5rem', token: '2', utility: null });
    expect(a.ok && lineOf(a.out, 11)).toBe('    <i class="p-2">none</i>');
    const b = run(VUE_FILE, VUE_SRC, { line: 10, column: 5, props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '0.5rem', token: '2', utility: null });
    expect(b.ok && lineOf(b.out, 10)).toBe(`    <span class="p-2" :class="{ 'bg-brand': on }">s</span>`);
    // 还原时把加上的属性整个去掉
    const back = revertTailwind({ file: VUE_FILE, source: b.out, line: 10, column: 5, removed: [], added: ['p-2'], attrAdded: true });
    expect(back.ok && applyEdits(b.out, back.edits)).toBe(VUE_SRC);
  });

  it('对象的标识符键换成带连字符的类名时加引号', () => {
    const r = run(VUE_FILE, VUE_SRC, { line: 13, column: 5, props: ['display'], value: 'inline-flex', token: null, utility: 'hidden' });
    expect(r.ok && lineOf(r.out, 13)).toBe(`    <em :class="{ 'inline-flex': !on }">e</em>`);
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
    const r = run(VUE_FILE, VUE_SRC, { line: 2, column: 18, literal: true, props: ['padding-left', 'padding-right'], value: '1.5rem', token: '6', utility: 'px-4' });
    expect(r.ok && lineOf(r.out, 2)).toBe("const btnClass = 'px-6 py-2';");
  });

  it('pug 模板不解析', () => {
    const r = locateClassSite('<template lang="pug">div.a</template>', VUE_FILE, 1, 22);
    expect('error' in r && r.error).toContain('pug');
  });
});

describe('Svelte 标记的 class 写回', () => {
  it('class 文本和表达式、class={[...]}、class: 指令；简写的 class:hidden 不能改', () => {
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

  it('替换 class 文本、数组里的字符串和指令名', () => {
    const a = run(SVELTE_FILE, SVELTE_SRC, { line: 7, column: 3, props: ['font-size'], value: '1.25rem', token: 'xl', utility: 'text-2xl' });
    expect(a.ok && lineOf(a.out, 7)).toBe('  <h1 class="text-xl font-bold">t</h1>');
    const b = run(SVELTE_FILE, SVELTE_SRC, { line: 8, column: 3, props: ['margin-top'], value: '1rem', token: '4', utility: 'mt-2' });
    expect(b.ok && lineOf(b.out, 8)).toBe("  <p class={['mt-4', on && 'text-brand']}>p</p>");
    const c = run(SVELTE_FILE, SVELTE_SRC, { line: 9, column: 3, props: ['background-color'], value: '#1c1c1e', token: 'ink', utility: 'bg-brand' });
    expect(c.ok && lineOf(c.out, 9)).toBe('  <button class="px-3" class:bg-ink={on} class:hidden>b</button>');
  });

  it('没有 class 属性时加 class；只有 class: 指令时在旁边加静态 class', () => {
    const pad = { props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '0.5rem', token: '2', utility: null };
    const a = run(SVELTE_FILE, SVELTE_SRC, { line: 10, column: 3, ...pad });
    expect(a.ok && lineOf(a.out, 10)).toBe('  <i class="p-2">none</i>');
    const b = run(SVELTE_FILE, SVELTE_SRC, { line: 11, column: 3, ...pad });
    expect(b.ok && lineOf(b.out, 11)).toBe('  <span class="p-2" class:italic={on}>s</span>');
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

  it('只改样式块里的声明，模板和脚本原样不动', () => {
    const r = editCssRule({ file: VUE_FILE, read, spec: spec('.card[data-v-1a2b3c4d]'), props: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], value: '20px' });
    const out = r.ok ? applyEdits(VUE_SRC, r.edits) : r.reason;
    expect(out).toBe(VUE_SRC.replace('.card { padding: 12px; }', '.card { padding: 20px; }'));
    expect(r.ok && r.summary).toBe('.card { padding: 12px → 20px }');
    const s = editCssRule({ file: SVELTE_FILE, read, spec: spec('main.svelte-1abcde a:hover'), props: ['color'], value: 'red' });
    const sout = s.ok ? applyEdits(SVELTE_SRC, s.edits) : s.reason;
    expect(sout).toBe(SVELTE_SRC.replace('a:hover) { color: blue; }', 'a:hover) { color: red; }'));
  });

  it('scss 等预处理器的样式块不改，说明原因', () => {
    const scss = '<template><div class="x" /></template>\n<style lang="scss">.x { a { color: red } }</style>\n';
    const r = editCssRule({ file: VUE_FILE, read: () => scss, spec: spec('.x[data-v-1a2b3c4d]'), props: ['color'], value: 'blue' });
    expect(!r.ok && r.reason).toContain('scss');
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
