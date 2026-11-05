import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BORDER_WIDTH } from '@css-tuner/protocol';
import { loadTailwindDesign, previewCompanions, tailwindScales, type TwDesign } from '../src';

const TW4 = join(__dirname, '../../../fixtures/tw-react/src/index.css');
const TW3 = join(__dirname, '../../../fixtures/tw3-react/src/index.css');

describe.each([
  ['Tailwind 4', TW4],
  ['Tailwind 3', TW3],
])('%s 描边', (_name, entry) => {
  let d: TwDesign;
  beforeAll(async () => {
    d = await loadTailwindDesign(entry);
    d.canonical('p-4');
  }, 30_000);

  it('粗细类不算管着样式；预览时带上它顺带设的样式', () => {
    expect(d.info('border')!.hard).toEqual(new Set(BORDER_WIDTH));
    expect(previewCompanions(d, BORDER_WIDTH, '2')).toEqual(d.major === 3 ? {} : { 'border-top-style': 'var(--tw-border-style)', 'border-right-style': 'var(--tw-border-style)', 'border-bottom-style': 'var(--tw-border-style)', 'border-left-style': 'var(--tw-border-style)' });
  });

  it('刻度：粗细取设计系统生成的值', () => {
    expect(tailwindScales(d).borderWidth.map((s) => `${s.label}=${s.value}`)).toEqual(['0=0px', 'DEFAULT=1px', '2=2px', '4=4px', '8=8px']);
  });
});
