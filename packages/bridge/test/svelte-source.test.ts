import { describe, expect, it } from 'vitest';
import { isLibFile } from '../src/locator';
import { svelteLocator } from '../src/svelte-source';

const KIT_ROOT = '/repo/node_modules/.pnpm/@sveltejs+kit@3.1.1/node_modules/@sveltejs/kit/src/runtime/components/root.svelte';
const LIB_BUTTON = '/repo/node_modules/ui-kit/dist/Button.svelte';

const el = (meta: unknown) => ({ __svelte_meta: meta }) as unknown as Element;

describe('Svelte 定位', () => {
  it('依赖包里的组件文件', () => {
    expect(isLibFile(KIT_ROOT)).toBe(true);
    expect(isLibFile('node_modules/ui-kit/A.svelte')).toBe(true);
    expect(isLibFile('../../node_modules/ui-kit/A.svelte')).toBe(true);
    expect(isLibFile('C:\\repo\\node_modules\\ui-kit\\A.svelte')).toBe(true);
    expect(isLibFile('src/routes/+page.svelte')).toBe(false);
    expect(isLibFile('/repo/src/my_node_modules/A.svelte')).toBe(false);
  });

  it('调用链走到依赖包里的组件层（SvelteKit 渲染页面的根组件）就停', async () => {
    const meta = {
      loc: { file: 'src/routes/+page.svelte', line: 7, column: 0 },
      parent: { type: 'component', file: KIT_ROOT, line: 38, column: 2, componentTag: 'Component', parent: null },
    };
    expect(await svelteLocator.sourceOf(el(meta))).toMatchObject({ path: 'src/routes/+page.svelte', file: null, line: 7, column: 1, component: '+page', viaOwner: false });
    expect((await svelteLocator.chain(el(meta), 3)).map((c) => c.loc.path)).toEqual(['src/routes/+page.svelte']);
  });

  it('依赖包里的组件渲染的元素回到业务代码里写着这个组件的标签，再往外接着找调用处', async () => {
    const main = { type: 'component', file: 'src/routes/+page.svelte', line: 3, column: 0, componentTag: 'Toolbar', parent: null };
    const meta = {
      loc: { file: LIB_BUTTON, line: 12, column: 2 },
      parent: { type: 'if', file: LIB_BUTTON, line: 10, column: 0, parent: { type: 'component', file: '/repo/src/lib/Toolbar.svelte', line: 5, column: 2, componentTag: 'Button', parent: main } },
    };
    expect(await svelteLocator.sourceOf(el(meta))).toMatchObject({ path: '/repo/src/lib/Toolbar.svelte', file: '/repo/src/lib/Toolbar.svelte', line: 5, column: 3, component: 'Toolbar', viaOwner: true });
    const chain = await svelteLocator.chain(el(meta), 3);
    expect(chain.map((c) => [c.loc.path, c.loc.line, c.callee])).toEqual([
      ['/repo/src/lib/Toolbar.svelte', 5, null],
      ['src/routes/+page.svelte', 3, 'Toolbar'],
    ]);
  });

  it('依赖包和业务代码之间不是组件调用时找不到位置', async () => {
    const meta = { loc: { file: LIB_BUTTON, line: 12, column: 2 }, parent: { type: 'each', file: 'src/App.svelte', line: 4, column: 0, parent: null } };
    expect(await svelteLocator.sourceOf(el(meta))).toBeNull();
    expect(await svelteLocator.chain(el(meta), 3)).toEqual([]);
  });

  it('snippet 渲染路径穿过的组件层不算调用处', async () => {
    // Card 里 {@render children()} 渲染的是 +page.svelte 写的内容：外面那层 Card 组件层不是这段内容的调用处
    const meta = {
      loc: { file: 'src/routes/+page.svelte', line: 13, column: 4 },
      parent: {
        type: 'render',
        file: 'src/lib/Card.svelte',
        line: 9,
        column: 2,
        parent: { type: 'component', file: 'src/routes/+page.svelte', line: 12, column: 2, componentTag: 'Card', parent: { type: 'component', file: KIT_ROOT, line: 38, column: 2, componentTag: 'Component', parent: null } },
      },
    };
    expect((await svelteLocator.chain(el(meta), 3)).map((c) => c.loc.path)).toEqual(['src/routes/+page.svelte']);
  });
});
