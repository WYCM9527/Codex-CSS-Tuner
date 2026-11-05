import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import { applyEdits, editTailwind, loadTailwindDesign, revertTailwind, type TailwindBand, type TailwindEditInput, type TwDesign } from '../src';

const FIX = join(__dirname, '../../../fixtures');
const MOBILE = { prefix: '', keep: 'md', inBand: ['sm'] };
const TABLET = { prefix: 'md', keep: 'lg', inBand: [] };
const DESKTOP = { prefix: 'lg', keep: null, inBand: ['xl', '2xl'] };
const P = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
const PX = ['padding-left', 'padding-right'];
const at = (cls: string) => `export const X = () => <div className="${cls}" />;\n`;

describe.each([
  ['Tailwind 4', 'tw-react', 'bg-linear-to-r', 'bg-linear-to-b'],
  ['Tailwind 3', 'tw3-react', 'bg-gradient-to-r', 'bg-gradient-to-b'],
])('只改一档（%s）', (_name, dir, right, down) => {
  let d: TwDesign;
  beforeAll(async () => {
    d = await loadTailwindDesign(join(FIX, dir, 'src/index.css'));
    d.canonical('p-4');
  }, 30_000);

  const band = (b: Omit<TailwindBand, 'original'>, original = { value: '0px', token: null }): TailwindBand => ({ ...b, original });

  /** 改完后的 className；写不了时是原因 */
  function run(cls: string, input: Omit<TailwindEditInput, 'file' | 'source' | 'line' | 'column'>) {
    const source = at(cls);
    const r = editTailwind(d, { file: '/x.tsx', source, line: 1, column: 24, ...input });
    if (!r.ok) return { cls: null, reason: r.reason };
    const out = applyEdits(source, r.edits);
    parse(out, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    const back = r.classes ? revertTailwind({ file: '/x.tsx', source: out, line: 1, column: 24, ...r.classes }) : null;
    return { cls: /className="([^"]*)"/.exec(out)![1], summary: r.summary, reverted: back?.ok ? applyEdits(out, back.edits) === source : false };
  }
  const p2 = (cls: string, utility: string | null, b: Omit<TailwindBand, 'original'>) => run(cls, { props: P, value: '0.5rem', token: '2', utility, band: band(b) });

  it('手机：改基础类，平板起没有自己的值时在 md: 上补回原值', () => {
    const r = p2('p-4 text-sm', 'p-4', MOBILE);
    expect(r.cls).toBe('p-2 md:p-4 text-sm');
    expect(r.summary).toBe('p-4 → p-2 md:p-4');
    expect(r.reverted).toBe(true);
  });

  it('手机：sm: 或 md: 上已有同类的类时不用补；只有 lg: 上有时照样补 md:', () => {
    expect(p2('p-4 md:p-6', 'p-4', MOBILE).cls).toBe('p-2 md:p-6');
    expect(p2('p-4 sm:p-5', 'p-4', MOBILE).cls).toBe('p-2 sm:p-5');
    expect(p2('p-4 lg:p-8', 'p-4', MOBILE).cls).toBe('p-2 md:p-4 lg:p-8');
  });

  it('手机档里的断点（sm:）生效时改它本身，往上照样补', () => {
    expect(p2('p-4 sm:p-5', 'sm:p-5', MOBILE).cls).toBe('p-4 sm:p-2 md:p-5');
  });

  it('平板：生效的是基础类时在 md: 上另加，桌面没有自己的值时补 lg:', () => {
    const r = p2('p-4', 'p-4', TABLET);
    expect(r.cls).toBe('p-4 md:p-2 lg:p-4');
    expect(r.reverted).toBe(true);
  });

  it('平板：已有 md: 的改它本身；lg: 上有值时不补', () => {
    expect(p2('p-4 md:p-6', 'md:p-6', TABLET).cls).toBe('p-4 md:p-2 lg:p-6');
    expect(p2('p-4 md:p-6 lg:p-8', 'md:p-6', TABLET).cls).toBe('p-4 md:p-2 lg:p-8');
    expect(p2('p-4 xl:p-8', 'p-4', TABLET).cls).toBe('p-4 xl:p-8 md:p-2 lg:p-4');
  });

  it('桌面：写到 lg:，不用补', () => {
    expect(p2('p-4 md:p-6', 'md:p-6', DESKTOP).cls).toBe('p-4 md:p-6 lg:p-2');
    expect(p2('p-4 lg:p-8', 'lg:p-8', DESKTOP).cls).toBe('p-4 lg:p-2');
  });

  it('只改左右：另加的类和补回的原值都只管左右', () => {
    expect(run('p-4', { props: PX, value: '0.5rem', token: '2', utility: 'p-4', band: band(MOBILE) }).cls).toBe('p-4 px-2 md:px-4');
  });

  it('颜色：补回原来的主题色', () => {
    expect(run('text-gray-900 p-4', { props: ['color'], value: '#ef4444', token: 'red-500', utility: 'text-gray-900', band: band(MOBILE) }).cls).toBe('text-red-500 md:text-gray-900 p-4');
  });

  it('原来没有类时按原来的值补', () => {
    const r = run('text-sm', { props: P, value: '0.5rem', token: '2', utility: null, band: band(MOBILE, { value: '0px', token: null }) });
    expect(r.cls).toMatch(/^text-sm p-2 md:p-(0|\[0px\])$/);
  });

  it('渐变：手机改方向，原来那组挪到 md: 上补回', () => {
    const red = d.major >= 4 ? 'oklch(0.637 0.237 25.331)' : 'rgb(239, 68, 68)';
    const blue = d.major >= 4 ? 'oklch(0.623 0.214 259.815)' : 'rgb(59, 130, 246)';
    const interp = d.major >= 4 ? ' in oklab' : '';
    const r = run(`${right} from-red-500 to-blue-500`, { props: ['background-image'], value: `linear-gradient(to bottom${interp}, ${red} 0%, ${blue} 100%)`, token: null, utility: right, band: band(MOBILE) });
    expect(r.cls).toBe(`${down} md:${right} md:from-red-500 md:to-blue-500 from-red-500 to-blue-500`);
    expect(r.reverted).toBe(true);
  });

  it('删属性：只删这一档的类，更宽的档原来跟着它的挪到上面一档', () => {
    const rm = (cls: string, remove: string, b: Omit<TailwindBand, 'original'>) => run(cls, { props: P, value: '', token: null, utility: remove, remove: [remove], band: band(b) });
    expect(rm('p-4 md:p-6', 'md:p-6', TABLET).cls).toBe('p-4 lg:p-6');
    expect(rm('p-4 md:p-6 lg:p-8', 'md:p-6', TABLET).cls).toBe('p-4 lg:p-8');
    expect(rm('p-4', 'p-4', MOBILE).cls).toBe('md:p-4');
    expect(rm('p-4 md:p-6', 'p-4', MOBILE).cls).toBe('md:p-6');
    const lower = rm('p-4', 'p-4', TABLET);
    expect(lower.cls).toBeNull();
    expect(lower.reason).toContain('p-4');
  });
});
