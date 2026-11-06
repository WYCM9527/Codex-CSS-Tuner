import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ProjectResolver } from '../src/project';

const root = mkdtempSync(join(tmpdir(), 'css-tuner-project-'));
const put = (rel: string, text = '') => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
// 两个项目都有 index.html：vite 项目排在前面
put('app/vite.config.ts');
put('app/index.html', '<!doctype html>');
put('site/package.json', '{}');
put('site/index.html', '<!doctype html>');
put('site/css/only-site.css');

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('页面源对应的项目根', () => {
  it('好几个项目都有的路径不记成页面源的根，找 HTML 文件时也不猜', () => {
    const p = new ProjectResolver(root);
    const url = 'http://127.0.0.1:3001/';
    expect(p.fileFor(url, '/index.html')).toBe(join(root, 'app/index.html'));
    expect(p.rootFor(url)).toBeNull();
    expect(p.htmlFileFor(url)).toBeNull();
  });

  it('只有一个项目有的路径记下根目录，之后按它找 HTML 文件', () => {
    const p = new ProjectResolver(root);
    const url = 'http://127.0.0.1:5500/';
    expect(p.fileFor(url, '/css/only-site.css')).toBe(join(root, 'site/css/only-site.css'));
    expect(p.rootFor(url)).toBe(join(root, 'site'));
    expect(p.htmlFileFor(url)).toBe(join(root, 'site/index.html'));
  });

  it('登记过的页面源直接用登记的根', () => {
    const p = new ProjectResolver(root);
    p.register('http://127.0.0.1:4100', join(root, 'app'));
    expect(p.htmlFileFor('http://127.0.0.1:4100/')).toBe(join(root, 'app/index.html'));
  });

  it('根路径下的图片在 public/ 里找', () => {
    put('app/public/img/hero.png');
    put('app/hero.png');
    const p = new ProjectResolver(root);
    p.register('http://127.0.0.1:4200', join(root, 'app'));
    expect(p.fileFor('http://127.0.0.1:4200/', '/img/hero.png')).toBe(join(root, 'app/public/img/hero.png'));
    // 根目录下真有同名文件时还是它优先
    expect(p.fileFor('http://127.0.0.1:4200/', '/hero.png')).toBe(join(root, 'app/hero.png'));
    expect(p.fileFor('http://127.0.0.1:4200/', 'http://127.0.0.1:4200/img/hero.png?v=2')).toBe(join(root, 'app/public/img/hero.png'));
  });
});
