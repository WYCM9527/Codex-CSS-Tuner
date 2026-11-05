import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, type RuleRef } from '@css-tuner/protocol';
import { buildPrompt } from '../src/prompt';
import { recordView, samePage, upgradeRecord, type ChangeRecord, type StoredRecord } from '../src/records';

const project = { label: (f: string) => f.replace('/repo/', '') };

function rec(over: Partial<ChangeRecord>): ChangeRecord {
  return {
    id: 'a1',
    kind: 'style',
    key: 'k',
    status: 'pending',
    createdAt: 1,
    pageUrl: 'http://localhost:5173/',
    element: { label: 'h1.title', source: { url: '', path: '/src/App.tsx', file: '/repo/src/App.tsx', line: 12, column: 7, component: 'App', viaOwner: false }, sourceIndex: 0, sameSource: 1 },
    props: ['padding-top'],
    propLabel: 'padding-top',
    from: '16px',
    to: '24px',
    value: '24px',
    token: null,
    original: {},
    view: { kind: 'agent', label: 'Agent', affects: 1, reason: 'why' },
    preview: { kind: 'inline', uid: 'u1', sourceKey: null },
    previewId: 'p1',
    write: { kind: 'agent', reason: 'why' },
    ...over,
  };
}

describe('改动记录', () => {
  it('0.2.0 及以前存下的记录没有 kind，读出来按样式改动处理', () => {
    const { kind: _, ...old } = rec({});
    const stored: StoredRecord = old;
    expect(upgradeRecord(stored).kind).toBe('style');
    expect(upgradeRecord({ ...old, kind: 'text' }).kind).toBe('text');
  });

  it('0.10.0 以前扩展自己写回的记录：状态换成交给 Agent 的那一套，写回前的文件留着对比', () => {
    const patch = { file: '/repo/src/App.tsx', hashBefore: 'h0' };
    expect(upgradeRecord({ ...rec({}), status: 'unverified', patch })).toMatchObject({ status: 'applied', snapshot: { file: '/repo/src/App.tsx', hash: 'h0' } });
    expect(upgradeRecord({ ...rec({}), status: 'conflict', patch }).status).toBe('applied');
    expect(upgradeRecord({ ...rec({}), status: 'failed' }).status).toBe('pending');
    const up = upgradeRecord({ ...rec({}), status: 'applied', patch });
    expect(up.status).toBe('applied');
    expect('patch' in up).toBe(false);
  });

  it('改动清单的视图带上类型；换序在等 Agent 时也还是模拟的', () => {
    expect(recordView(rec({ kind: 'reorder', from: '2', to: '1' }))).toMatchObject({ id: 'a1', kind: 'reorder', from: '2', to: '1', target: { kind: 'agent' }, simulated: true });
    expect(recordView(rec({ kind: 'reorder', status: 'handoff' })).simulated).toBe(true);
    expect(recordView(rec({ kind: 'reorder', status: 'applied' })).simulated).toBeUndefined();
    expect(recordView(rec({})).remove).toBeUndefined();
    expect(recordView(rec({ removal: { values: { 'padding-top': '0px' } } })).remove).toBe(true);
  });

  it('同一个页面：查询参数和普通锚点不算，hash 路由算', () => {
    const home = 'http://127.0.0.1:5178/';
    expect(samePage(home, 'http://127.0.0.1:5178/?x=1#faq')).toBe(true);
    expect(samePage(home, 'http://127.0.0.1:5178/#/')).toBe(true);
    expect(samePage(home, 'http://127.0.0.1:5178/#/effects')).toBe(false);
    expect(samePage('http://127.0.0.1:5178/#/effects/', 'http://127.0.0.1:5178/#/effects?tag=a')).toBe(true);
    expect(samePage('http://127.0.0.1:5178/#!/a', 'http://127.0.0.1:5178/#/a')).toBe(true);
    expect(samePage(home, 'http://127.0.0.1:5178/zh')).toBe(false);
  });
});

describe('交给 Agent 的提示词', () => {
  afterEach(() => setLocale('en'));
  const ctx = { pageUrl: 'http://localhost:5173/', project, tailwindEntry: '/repo/src/index.css', tailwindVersion: '4.3.3' };

  it('样式改动沿用原来的写法，只在有样式改动时提 Tailwind 令牌', () => {
    const style = buildPrompt([rec({ token: '6', value: '1.5rem', to: '6' })], ctx);
    expect(style).toContain('   - padding-top: 16px → 1.5rem (Tailwind token 6)');
    expect(style).toContain('Tailwind 4.3.3');
    expect(style).toContain('Prefer the Tailwind tokens');
    const text = buildPrompt([rec({ kind: 'text', props: [], propLabel: 'Text', from: 'Hello', to: 'Hi "there"', value: 'Hi "there"' })], ctx);
    expect(text).not.toContain('Tailwind');
    expect(text).toContain('For translated text, change only the current language');
    const v3 = buildPrompt([rec({ token: '6', value: '1.5rem', to: '6' })], { ...ctx, tailwindVersion: '3.4.19', tailwindTokens: '/repo/tailwind.config.ts' });
    expect(v3).toContain('The project uses Tailwind 3.4.19; its design tokens are in tailwind.config.ts.');
  });

  it('文字用 JSON 字符串给出原文和新文字，附上来源', () => {
    const p = buildPrompt([rec({ kind: 'text', props: [], from: 'Line 1\nLine 2', to: 'Say "hi"', value: 'Say "hi"', detail: { origin: 'messages/en.json hero.title' } })], ctx);
    expect(p).toContain('   - Text: "Line 1\\nLine 2" → "Say \\"hi\\""');
    expect(p).toContain('   - Where the text comes from: messages/en.json hero.title');
  });

  it('换序写出位置和兄弟的新顺序；还原时给出要恢复的顺序', () => {
    const reorder = { kind: 'reorder' as const, props: [], from: '3', to: '1', value: '0', detail: { order: ['Team', 'Starter', 'Pro'], was: ['Starter', 'Pro', 'Team'] } };
    const p = buildPrompt([rec(reorder)], ctx);
    expect(p).toContain('move it from position 3 to position 1 within the same parent');
    expect(p).toContain('   - New order of the siblings: Team, Starter, Pro');
    expect(p).toContain('when the list is rendered from an array, reorder the array');
    const back = buildPrompt([rec({ ...reorder, status: 'applied' })], ctx, 'revert');
    expect(back).toContain('   - Order of the siblings to restore: Starter, Pro, Team');
    expect(back).not.toContain('New order');
  });

  it('一处代码影响页面上几处时写明，按要改的这处代码算，不按元素本身算', () => {
    const shared = { kind: 'tailwind' as const, label: 'src/Card.tsx:5 className', affects: 2 };
    expect(buildPrompt([rec({ view: shared })], ctx)).toContain('changing this code affects 2 places on the page');
    const callSite = rec({ kind: 'prop', props: ['size'], element: { ...rec({}).element, sameSource: 3 }, view: { kind: 'source', label: 'src/Buttons.tsx:10 <Button> size', affects: 1 } });
    expect(buildPrompt([callSite], ctx)).not.toContain('places on the page');
  });

  it('删属性写成去掉声明；还原时要求加回来', () => {
    const removal = { propLabel: 'border', props: ['border-top-width', 'border-top-style'], from: 'border border-brand', to: 'removed', value: '', removal: { values: { 'border-top-width': '0px' }, classes: ['border', 'border-brand'] } };
    const p = buildPrompt([rec(removal)], ctx);
    expect(p).toContain('   - Remove the declaration of border (now border border-brand) so the element falls back to what it would be without it');
    expect(p).not.toContain('border-top-width');
    expect(buildPrompt([rec({ ...removal, status: 'applied' })], ctx, 'revert')).toContain('   - Put back the removed declaration of border (it was border border-brand)');
  });

  it('只说要改成什么样：有代码位置时给出位置，找不到位置时给出说明，不提「没能自动写回」', () => {
    const located = buildPrompt([rec({ view: { kind: 'tailwind', label: 'src/App.tsx:12 className', affects: 1 }, write: { kind: 'tailwind', file: '/repo/src/App.tsx', line: 12, column: 7, utility: 'pt-4', entry: null } })], ctx);
    expect(located).toContain('   - Location in the code: src/App.tsx:12 className');
    expect(located).not.toContain('Note:');
    expect(located).not.toMatch(/written back|write-back/i);
    expect(buildPrompt([rec({})], ctx)).toContain('   - Note: why');
  });

  it('再发一次时附上上一次改完页面上是什么样', () => {
    const p = buildPrompt([rec({ status: 'handoff', note: 'The code changed, but the page now shows padding-top: 20px' })], ctx);
    expect(p).toContain('   - After the previous attempt: The code changed, but the page now shows padding-top: 20px');
    expect(buildPrompt([rec({ note: 'old' })], ctx)).not.toContain('After the previous attempt');
  });

  it('props 写出组件和属性名；交给 Agent 时附上调用处，并要求只改调用处', () => {
    const p = buildPrompt([rec({ kind: 'prop', props: ['variant'], propLabel: 'variant', from: '"primary"', to: '"ghost"', value: '"ghost"', detail: { component: 'Button', site: 'src/App.tsx:18' } })], ctx);
    expect(p).toContain('   - Prop variant of <Button>: "primary" → "ghost"');
    expect(p).toContain('   - Call site: src/App.tsx:18');
    expect(p).toContain("- Change props only at the component's call site");
    expect(p).not.toContain('Tailwind');
  });

  it('还原：要求改回原样，只改这几处', () => {
    const rule: RuleRef = {
      sheet: { index: 0, devId: null, href: null },
      path: [0],
      selector: '.card',
      fullSelector: '.card',
      conditions: ['@media (width >= 48rem)', '@layer base'],
      layer: 'base',
      ordinal: 0,
      matchCount: 2,
      utility: null,
    };
    const p = buildPrompt(
      [
        rec({ status: 'applied', preview: { kind: 'rule', rule, uid: 'u1' } }),
        rec({ id: 'b2', kind: 'text', status: 'applied', props: [], from: 'Old', to: 'New', value: 'New' }),
      ],
      { ...ctx, tailwindEntry: null },
      'revert',
    );
    expect(p).toContain('Please change the 2 changes below back in the source code');
    expect(p).toContain('   - Change it back: padding-top is now 24px; restore 16px');
    expect(p).toContain('   - Active rule: `@media (width >= 48rem) .card`');
    expect(p).toContain('   - Change the text back: it is now "New"; restore "Old"');
    expect(p).toContain('- Change back only the spots listed above; keep any later edits');
    expect(p).not.toContain('Prefer the CSS variables');
  });

  it('跟随界面语言', () => {
    setLocale('zh-CN');
    const p = buildPrompt([rec({ kind: 'reorder', props: [], from: '2', to: '1', detail: { order: ['B', 'A'] } })], ctx);
    expect(p).toContain('请帮我把下面 1 处改动写进源码');
    expect(p).toContain('   - 顺序：在同一个父元素里从第 2 个移到第 1 个');
    expect(p).toContain('   - 兄弟元素的新顺序：B、A');
  });
});
