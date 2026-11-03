import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const base = JSON.parse(read('package.nls.json')) as Record<string, string>;

describe('package.json 的本地化文案', () => {
  it('引用的 %键% 都在 package.nls.json 里', () => {
    const used = [...read('package.json').matchAll(/"%([^%"]+)%"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(10);
    expect(used.filter((k) => !(k in base))).toEqual([]);
  });

  it('各语言文件的键和英文一致', () => {
    const files = readdirSync(root).filter((f) => /^package\.nls\..+\.json$/.test(f));
    expect(files).toContain('package.nls.zh-cn.json');
    for (const f of files) expect(Object.keys(JSON.parse(read(f))).sort(), f).toEqual(Object.keys(base).sort());
  });
});
