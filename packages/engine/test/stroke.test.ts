import { join } from 'node:path';
import postcss from 'postcss';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import { BORDER, BORDER_COLOR, BORDER_STYLE, BORDER_WIDTH } from '@css-tuner/protocol';
import { applyEdits, editCssRule, editTailwind, loadTailwindDesign, previewCompanions, revertTailwind, tailwindScales, type CssRuleSpec, type TailwindEditInput, type TwDesign } from '../src';

const CSS_FILE = '/p/a.css';
const CSS = `.card {
  padding: 16px 20px;
  border: 1px solid #ddd;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.1);
}
.line { border: 1px solid var(--line); }
.top { border-top: 2px dashed; }
.box { border-width: 1px 2px; border-color: red !important; }
.text { font: 12px/1.4 sans-serif; }
.one { color: red; border: 0; }
`;

function spec(selector: string, extra: Partial<CssRuleSpec> = {}): CssRuleSpec {
  return { selector, fullSelector: selector, conditions: [], ordinal: 0, mode: 'edit', via: null, ...extra };
}

function css(selector: string, props: string[], value: string, extra: { remove?: boolean; mode?: 'add' } = {}) {
  const r = editCssRule({ file: CSS_FILE, read: () => CSS, spec: spec(selector, extra.mode ? { mode: extra.mode } : {}), props, value, remove: extra.remove });
  if (!r.ok) return { ok: false as const, reason: r.reason, out: '' };
  const out = applyEdits(CSS, r.edits);
  postcss.parse(out);
  return { ok: true as const, out, summary: r.summary };
}

describe('CSS 描边', () => {
  it('border 简写里换粗细、颜色，没写的分量补在后面', () => {
    expect(css('.card', BORDER_WIDTH, '2px').out).toContain('  border: 2px solid #ddd;\n');
    expect(css('.card', BORDER_COLOR, '#f00').out).toContain('  border: 1px solid #f00;\n');
    expect(css('.top', ['border-top-color'], '#f00').out).toContain('.top { border-top: 2px dashed #f00; }');
    expect(css('.top', BORDER_COLOR, '#f00').out).toContain('.top { border-top: 2px dashed #f00; border-right-color: #f00; border-bottom-color: #f00; border-left-color: #f00; }');
  });

  it('值里的变量归到唯一缺的分量', () => {
    expect(css('.line', BORDER_COLOR, '#f00').out).toContain('.line { border: 1px solid #f00; }');
    expect(css('.line', BORDER_STYLE, 'dashed').out).toContain('.line { border: 1px dashed var(--line); }');
  });

  it('border-width 按位置改，只改一边的 border 简写追加长写', () => {
    expect(css('.box', ['border-top-width'], '3px').out).toContain('.box { border-width: 3px 2px 1px; border-color: red !important; }');
    expect(css('.card', ['border-left-width'], '4px').out).toContain('  box-shadow: 0 1px 2px rgb(0 0 0 / 0.1);\n  border-left-width: 4px;\n}');
  });

  it('加到元素自己的规则里：四边同值写简写', () => {
    expect(css('.one', BORDER_WIDTH, '1px', { mode: 'add' }).out).toContain('.one { color: red; border: 0; border-width: 1px; }');
  });
});

describe('CSS 删属性', () => {
  it('整条声明删掉，连同前面的换行和缩进', () => {
    const r = css('.card', ['box-shadow'], '', { remove: true });
    expect(r.out).toContain('  background: #fff;\n}');
    expect(r.ok && r.summary).toBe('.card { - box-shadow: 0 1px 2px rgb(0 0 0 / 0.1) }');
    expect(css('.card', ['background-color'], '', { remove: true }).out).toContain('  border: 1px solid #ddd;\n  box-shadow');
    expect(css('.card', BORDER, '', { remove: true }).out).toContain('  padding: 16px 20px;\n  background: #fff;\n');
    expect(css('.one', BORDER, '', { remove: true }).out).toContain('.one { color: red; }');
  });

  it('只删简写的一部分：剩下的改写成长写', () => {
    expect(css('.card', BORDER_COLOR, '', { remove: true }).out).toContain('  padding: 16px 20px;\n  border-width: 1px;\n  border-style: solid;\n  background: #fff;');
    expect(css('.card', ['padding-left'], '', { remove: true }).out).toContain('.card {\n  padding-top: 16px;\n  padding-right: 20px;\n  padding-bottom: 16px;\n  border:');
    expect(css('.box', BORDER_COLOR, '', { remove: true }).out).toContain('.box { border-width: 1px 2px; }');
    expect(css('.box', ['border-top-color'], '', { remove: true }).out).toContain(
      '.box { border-width: 1px 2px; border-right-color: red !important; border-bottom-color: red !important; border-left-color: red !important; }',
    );
  });

  it('删不了的情况给出原因', () => {
    expect(css('.text', ['font-size'], '', { remove: true }).reason).toContain('font: 12px/1.4 sans-serif');
    expect(css('.text', ['box-shadow'], '', { remove: true }).ok).toBe(false);
    expect(css('.one', ['box-shadow'], '', { mode: 'add', remove: true }).ok).toBe(false);
  });
});

const TW4 = join(__dirname, '../../../fixtures/tw-react/src/index.css');
const TW3 = join(__dirname, '../../../fixtures/tw3-react/src/index.css');
const JSX_FILE = '/p/App.tsx';
const SRC = `export function A() {
  return (
    <div className="rounded border border-brand p-4 shadow-sm" data-a>
      <span className="px-2">x</span>
    </div>
  );
}
`;

function tw(d: TwDesign, line: number, input: Omit<TailwindEditInput, 'file' | 'source' | 'line' | 'column'>, column = line === 3 ? 5 : 7) {
  const r = editTailwind(d, { file: JSX_FILE, source: SRC, line, column, ...input });
  if (!r.ok) return { ok: false as const, reason: r.reason, line: '' };
  const out = applyEdits(SRC, r.edits);
  parse(out, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  return { ok: true as const, line: out.split('\n')[line - 1], summary: r.summary, classes: r.classes };
}

describe.each([
  ['Tailwind 4', TW4],
  ['Tailwind 3', TW3],
])('%s 描边和删类名', (_name, entry) => {
  let d: TwDesign;
  beforeAll(async () => {
    d = await loadTailwindDesign(entry);
    d.canonical('p-4');
  }, 30_000);

  it('粗细：border → border-2，没有描边的加 border', () => {
    expect(tw(d, 3, { props: BORDER_WIDTH, value: '2px', token: '2', utility: 'border' }).line).toContain('className="rounded border-2 border-brand p-4 shadow-sm"');
    expect(tw(d, 3, { props: BORDER_WIDTH, value: '3px', token: null, utility: 'border' }).line).toMatch(/className="rounded border-(3|\[3px\]) border-brand p-4 shadow-sm"/);
    expect(tw(d, 4, { props: BORDER_WIDTH, value: '1px', token: '', utility: null }).line).toContain('className="px-2 border"');
    expect(tw(d, 4, { props: ['border-top-width'], value: '2px', token: '2', utility: null }).line).toContain('className="px-2 border-t-2"');
  });

  it('颜色、样式', () => {
    expect(tw(d, 3, { props: BORDER_COLOR, value: '#1c1c1e', token: 'ink', utility: 'border-brand' }).line).toContain(' border border-ink p-4 ');
    expect(tw(d, 3, { props: BORDER_COLOR, value: '#ff0000', token: null, utility: 'border-brand' }).line).toContain(' border border-[#ff0000] p-4 ');
    expect(tw(d, 3, { props: BORDER_STYLE, value: 'dashed', token: null, utility: null }).line).toContain('className="rounded border border-brand p-4 shadow-sm border-dashed"');
    expect(tw(d, 3, { props: ['border-bottom-color'], value: '#1c1c1e', token: 'ink', utility: 'border-brand' }).line).toContain(' border border-brand border-b-ink p-4 ');
  });

  it('粗细类不算管着样式，改样式时不动它', () => {
    expect(d.info('border')!.hard).toEqual(new Set(BORDER_WIDTH));
    expect(previewCompanions(d, BORDER_WIDTH, '2px', '2')).toEqual(d.major === 3 ? {} : { 'border-top-style': 'var(--tw-border-style)', 'border-right-style': 'var(--tw-border-style)', 'border-bottom-style': 'var(--tw-border-style)', 'border-left-style': 'var(--tw-border-style)' });
  });

  it('删属性：去掉生效的类，还原时放回', () => {
    const r = tw(d, 3, { props: BORDER, value: '', token: null, utility: 'border', remove: ['border', 'border-brand'] });
    expect(r.line).toContain('className="rounded p-4 shadow-sm"');
    expect(r.ok && r.summary).toBe('border border-brand → ∅');
    const res = editTailwind(d, { file: JSX_FILE, source: SRC, line: 3, column: 5, props: ['box-shadow'], value: '', token: null, utility: 'shadow-sm', remove: ['shadow-sm'] });
    if (!res.ok) throw new Error(res.reason);
    const out = applyEdits(SRC, res.edits);
    expect(out.split('\n')[2]).toContain('className="rounded border border-brand p-4"');
    const back = revertTailwind({ file: JSX_FILE, source: out, line: 3, column: 5, removed: ['shadow-sm'], added: [], attrAdded: false });
    expect(back.ok && applyEdits(out, back.edits).split('\n')[2]).toContain('className="rounded border border-brand p-4 shadow-sm"');
  });

  it('类还管着别的属性时不删', () => {
    expect(tw(d, 3, { props: ['padding-left'], value: '', token: null, utility: 'p-4', remove: ['p-4'] }).reason).toContain('p-4');
    expect(tw(d, 3, { props: ['box-shadow'], value: '', token: null, utility: 'shadow-md', remove: ['shadow-md'] }).ok).toBe(false);
  });

  it('刻度：粗细取设计系统生成的值', () => {
    expect(tailwindScales(d).borderWidth.map((s) => `${s.label}=${s.value}`)).toEqual(['0=0px', 'DEFAULT=1px', '2=2px', '4=4px', '8=8px']);
  });
});
