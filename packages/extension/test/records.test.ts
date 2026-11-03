import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, type RuleRef } from '@css-tuner/protocol';
import { buildPrompt } from '../src/prompt';
import { recordView, upgradeRecord, type ChangeRecord, type StoredRecord } from '../src/records';

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

  it('改动清单的视图带上类型', () => {
    expect(recordView(rec({ kind: 'reorder', from: '2', to: '1' }))).toMatchObject({ id: 'a1', kind: 'reorder', from: '2', to: '1', target: { kind: 'agent' } });
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
  });

  it('文字用 JSON 字符串给出原文和新文字，附上来源', () => {
    const p = buildPrompt([rec({ kind: 'text', props: [], from: 'Line 1\nLine 2', to: 'Say "hi"', value: 'Say "hi"', detail: { origin: 'messages/en.json hero.title' } })], ctx);
    expect(p).toContain('   - Text: "Line 1\\nLine 2" → "Say \\"hi\\""');
    expect(p).toContain('   - Where the text comes from: messages/en.json hero.title');
  });

  it('换序写出位置和兄弟的新顺序', () => {
    const p = buildPrompt([rec({ kind: 'reorder', props: [], from: '3', to: '1', value: '0', detail: { order: ['Team', 'Starter', 'Pro'] } })], ctx);
    expect(p).toContain('move it from position 3 to position 1 within the same parent');
    expect(p).toContain('   - New order of the siblings: Team, Starter, Pro');
    expect(p).toContain('when the list is rendered from an array, reorder the array');
  });

  it('props 写出组件和属性名', () => {
    const p = buildPrompt([rec({ kind: 'prop', props: ['variant'], propLabel: 'variant', from: '"primary"', to: '"ghost"', value: '"ghost"', detail: { component: 'Button' } })], ctx);
    expect(p).toContain('   - Prop variant of <Button>: "primary" → "ghost"');
  });

  it('冲突的条目要求改回原样，并给出当初写入的内容', () => {
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
    const patch = { file: '/repo/src/app.css', hashBefore: '', hashAfter: '', edits: [], summary: '.card { padding: 16px → 24px }', appliedAt: 0 };
    const p = buildPrompt(
      [
        rec({ status: 'conflict', patch, preview: { kind: 'rule', rule, uid: 'u1' } }),
        rec({ id: 'b2', kind: 'text', status: 'conflict', props: [], from: 'Old', to: 'New', value: 'New', patch }),
      ],
      { ...ctx, tailwindEntry: null },
    );
    expect(p).toContain('   - Change it back: padding-top is now 24px; restore 16px');
    expect(p).toContain('   - Active rule: `@media (width >= 48rem) .card`');
    expect(p).toContain('   - Change the text back: it is now "New"; restore "Old"');
    expect(p.match(/What was written: \.card \{ padding: 16px → 24px \} \(src\/app\.css\)/g)).toHaveLength(2);
    expect(p).toContain('Prefer the CSS variables');
  });

  it('跟随界面语言', () => {
    setLocale('zh-CN');
    const p = buildPrompt([rec({ kind: 'reorder', props: [], from: '2', to: '1', detail: { order: ['B', 'A'] } })], ctx);
    expect(p).toContain('请帮我把下面 1 处改动写进源码');
    expect(p).toContain('   - 顺序：在同一个父元素里从第 2 个移到第 1 个');
    expect(p).toContain('   - 兄弟元素的新顺序：B、A');
  });
});
