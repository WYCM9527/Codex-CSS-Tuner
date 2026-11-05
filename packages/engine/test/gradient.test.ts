import { join } from 'node:path';
import postcss from 'postcss';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import { BORDER_COLOR } from '@css-tuner/protocol';
import { applyEdits, editCssRule, editTailwind, loadTailwindDesign, revertTailwind, type CssRuleSpec, type TailwindEditInput, type TwDesign } from '../src';

const JSX_FILE = '/p/App.tsx';
const source = (dir: string) => `export function A() {
  return (
    <div className="rounded ${dir} from-red-500 to-blue-500 p-4" data-a>
      <span className="px-2">x</span>
    </div>
  );
}
`;

const IMAGE = ['background-image'];

describe.each([
  ['Tailwind 4', join(__dirname, '../../../fixtures/tw-react/src/index.css'), 'bg-linear-to-r'],
  ['Tailwind 3', join(__dirname, '../../../fixtures/tw3-react/src/index.css'), 'bg-gradient-to-r'],
])('%s 渐变', (_name, entry, dir) => {
  let d: TwDesign;
  const SRC = source(dir);
  beforeAll(async () => {
    d = await loadTailwindDesign(entry);
  }, 30_000);

  function tw(line: number, input: Omit<TailwindEditInput, 'file' | 'source' | 'line' | 'column' | 'props' | 'token'> & { props?: string[] }) {
    const r = editTailwind(d, { file: JSX_FILE, source: SRC, line, column: line === 3 ? 5 : 7, props: IMAGE, token: null, ...input });
    if (!r.ok) return { ok: false as const, reason: r.reason, line: '', out: '' };
    const out = applyEdits(SRC, r.edits);
    parse(out, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    return { ok: true as const, line: out.split('\n')[line - 1], out, summary: r.summary, classes: r.classes! };
  }

  // 主题色：v4 的 red-500 是 oklch，v3 是十六进制；浏览器读回来的写法又不一样
  const red = () => (d.major >= 4 ? 'oklch(0.637 0.237 25.331)' : 'rgb(239, 68, 68)');
  const blue = () => (d.major >= 4 ? 'oklch(0.623 0.214 259.815)' : 'rgb(59, 130, 246)');
  const interp = () => (d.major >= 4 ? ' in oklab' : '');

  it('新加渐变：方向类加色标类，颜色认回主题色名', () => {
    expect(tw(4, { value: `linear-gradient(to right${interp()}, ${red()} 0%, ${blue()} 100%)`, utility: null }).line).toContain(`className="px-2 ${dir} from-red-500 to-blue-500"`);
  });

  it('只改角度：色标类原样保留，只换方向类', () => {
    const r = tw(3, { value: `linear-gradient(45deg${interp()}, ${red()} 0%, ${blue()} 100%)`, utility: dir });
    const next = d.major >= 4 ? 'bg-linear-45' : 'bg-[linear-gradient(45deg,var(--tw-gradient-stops))]';
    expect(r.line).toContain(`className="rounded ${next} from-red-500 to-blue-500 p-4"`);
    expect(r.ok && r.summary).toBe(`${dir} → ${next}`);
    const back = revertTailwind({ file: JSX_FILE, source: r.out, line: 3, column: 5, removed: r.ok ? r.classes.removed : [], added: r.ok ? r.classes.added : [], attrAdded: false });
    expect(back.ok && applyEdits(r.out, back.edits)).toBe(SRC);
  });

  it('加中间色标、改位置：只补变了的类', () => {
    const r = tw(3, { value: `linear-gradient(to right${interp()}, ${red()} 10%, #ffffff 30%, ${blue()} 100%)`, utility: dir });
    expect(r.line).toContain(`className="rounded ${dir} from-red-500 to-blue-500 from-10% via-white via-30% p-4"`);
  });

  it('换色标颜色：主题里没有的写成任意值', () => {
    const r = tw(3, { value: `linear-gradient(to right${interp()}, ${red()} 0%, #123456 100%)`, utility: dir });
    expect(r.line).toContain(`className="rounded ${dir} from-red-500 to-[#123456] p-4"`);
  });

  it('写不成标准类的整个写成 bg-[…]，色标类一起去掉', () => {
    const four = 'linear-gradient(90deg, #f00 0%, #0f0 33%, #00f 66%, #000 100%)';
    expect(tw(3, { value: four, utility: dir }).line).toContain('className="rounded bg-[linear-gradient(90deg,#f00_0%,#0f0_33%,#00f_66%,#000_100%)] p-4"');
    const layered = 'linear-gradient(#ffffff, #ffffff), linear-gradient(90deg, #ff0000 0%, #0000ff 100%)';
    expect(tw(3, { value: layered, utility: dir }).line).toContain('className="rounded bg-[linear-gradient(#ffffff,#ffffff),linear-gradient(90deg,#ff0000_0%,#0000ff_100%)] p-4"');
    expect(tw(3, { value: 'none', utility: dir }).line).toContain('className="rounded bg-none p-4"');
  });

  it('径向渐变', () => {
    const r = tw(4, { value: `radial-gradient(${d.major >= 4 ? 'in oklab, ' : ''}#ff0000 0%, #0000ff 100%)`, utility: null });
    expect(r.line).toContain(`className="px-2 ${d.major >= 4 ? 'bg-radial' : 'bg-[radial-gradient(var(--tw-gradient-stops))]'} from-[#ff0000] to-[#0000ff]"`);
  });

  it('删背景图：方向类和同一变体的色标类一起去掉，还原时放回', () => {
    const r = tw(3, { value: '', utility: dir, remove: [dir] });
    expect(r.line).toContain('className="rounded p-4"');
    expect(r.ok && r.summary).toBe(`${dir} from-red-500 to-blue-500 → ∅`);
    const back = revertTailwind({ file: JSX_FILE, source: r.out, line: 3, column: 5, removed: r.ok ? r.classes.removed : [], added: [], attrAdded: false });
    expect(back.ok && applyEdits(r.out, back.edits).split('\n')[2]).toContain(`className="rounded p-4 ${dir} from-red-500 to-blue-500"`);
  });

  it('渐变描边要的裁剪和铺设范围', () => {
    expect(tw(3, { props: ['background-clip'], value: 'padding-box, border-box', utility: null }).line).toContain(' p-4 [background-clip:padding-box,border-box]"');
    expect(tw(3, { props: ['background-origin'], value: 'border-box', utility: null }).line).toContain(' p-4 bg-origin-border"');
    expect(tw(3, { props: BORDER_COLOR, value: 'transparent', utility: null }).line).toContain(' p-4 border-transparent"');
  });
});

const CSS_FILE = '/p/a.css';
const CSS = `.a { background: linear-gradient(red, blue); }
.b { background: #fff; }
.c { background: url(a.png) no-repeat center; }
.d { background-image: linear-gradient(red, blue); }
`;

function spec(selector: string): CssRuleSpec {
  return { selector, fullSelector: selector, conditions: [], ordinal: 0, mode: 'edit', via: null };
}

function css(selector: string, props: string[], value: string, remove = false) {
  const r = editCssRule({ file: CSS_FILE, read: () => CSS, spec: spec(selector), props, value, remove });
  if (!r.ok) return { ok: false as const, reason: r.reason, out: '' };
  const out = applyEdits(CSS, r.edits);
  postcss.parse(out);
  return { ok: true as const, out };
}

describe('CSS 渐变', () => {
  const G = 'linear-gradient(90deg, #f00 0%, #00f 100%)';
  it('只写了背景图的 background 简写整个替换；带颜色、位置的在后面补长写', () => {
    expect(css('.a', IMAGE, G).out).toContain(`.a { background: ${G}; }`);
    expect(css('.b', IMAGE, G).out).toContain(`.b { background: #fff; background-image: ${G}; }`);
    expect(css('.c', IMAGE, G).out).toContain(`.c { background: url(a.png) no-repeat center; background-image: ${G}; }`);
    expect(css('.d', IMAGE, G).out).toContain(`.d { background-image: ${G}; }`);
  });

  it('渐变描边的裁剪范围补在简写后面', () => {
    expect(css('.b', ['background-clip'], 'padding-box, border-box').out).toContain('.b { background: #fff; background-clip: padding-box, border-box; }');
  });

  it('删背景图：只写了背景图的简写整条删掉', () => {
    expect(css('.a', IMAGE, '', true).out).toContain('.a { }');
    expect(css('.d', IMAGE, '', true).out).toContain('.d { }');
    expect(css('.c', IMAGE, '', true).ok).toBe(false);
  });
});
