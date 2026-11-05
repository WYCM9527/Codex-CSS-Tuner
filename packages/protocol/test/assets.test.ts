import { describe, expect, it } from 'vitest';
import { cssImageUrls, fileNameOf, largestCandidate, parseSrcset, sanitizeFileName, uniqueFileName, unwrapOptimizer, withExtension } from '../src/assets';

describe('srcset', () => {
  it('宽度和像素密度描述符', () => {
    expect(parseSrcset('/a-640.png 640w, /a-1280.png 1280w')).toEqual([
      { url: '/a-640.png', w: 640 },
      { url: '/a-1280.png', w: 1280 },
    ]);
    expect(parseSrcset('a.png, a@2x.png 2x,a@3x.png 3x')).toEqual([{ url: 'a.png' }, { url: 'a@2x.png', x: 2 }, { url: 'a@3x.png', x: 3 }]);
  });

  it('data: 地址里的逗号不切开', () => {
    expect(parseSrcset('data:image/png;base64,AAAA 1x, /b.png 2x')).toEqual([
      { url: 'data:image/png;base64,AAAA', x: 1 },
      { url: '/b.png', x: 2 },
    ]);
  });

  it('挑最大的：有宽度描述符按宽度，否则按密度', () => {
    expect(largestCandidate(parseSrcset('/s.png 320w, /l.png 1280w, /m.png 640w'))?.url).toBe('/l.png');
    expect(largestCandidate(parseSrcset('/a.png, /b.png 2x'))?.url).toBe('/b.png');
    expect(largestCandidate([])).toBeNull();
  });
});

describe('CSS 图片值', () => {
  it('多层背景里取出每个 url()，渐变跳过', () => {
    expect(cssImageUrls('url("http://x/a.png"), linear-gradient(red, blue), url(http://x/b.jpg)')).toEqual(['http://x/a.png', 'http://x/b.jpg']);
    expect(cssImageUrls('none')).toEqual([]);
  });

  it('image-set 取密度最大的那项', () => {
    expect(cssImageUrls('image-set(url("http://x/a.png") 1x, url("http://x/a@2x.png") 2x)')).toEqual(['http://x/a@2x.png']);
    expect(cssImageUrls('-webkit-image-set("a.avif" type("image/avif") 1x, "b.png" 2dppx)')).toEqual(['b.png']);
  });

  it('地址里带括号和引号', () => {
    expect(cssImageUrls('url("http://x/a(1).png")')).toEqual(['http://x/a(1).png']);
  });
});

describe('图片优化服务还原原图', () => {
  it('Next.js 和 Vercel', () => {
    expect(unwrapOptimizer('http://localhost:3000/_next/image?url=%2Fimages%2Fhero.jpg&w=640&q=75')).toBe('http://localhost:3000/images/hero.jpg');
    expect(unwrapOptimizer('https://a.com/_next/image?url=https%3A%2F%2Fcdn.b.com%2Fp.png&w=1080&q=75')).toBe('https://cdn.b.com/p.png');
    expect(unwrapOptimizer('https://a.com/_vercel/image?url=%2Fp.webp&w=256')).toBe('https://a.com/p.webp');
  });

  it('Astro 和 Nuxt', () => {
    expect(unwrapOptimizer('http://localhost:4321/_image?href=%2Fsrc%2Fhero.png&w=800&f=webp')).toBe('http://localhost:4321/src/hero.png');
    expect(unwrapOptimizer('http://localhost:3000/_ipx/w_640&f_webp/images/a.jpg')).toBe('http://localhost:3000/images/a.jpg');
    expect(unwrapOptimizer('http://localhost:3000/_ipx/_/https://cdn.c.com/a.jpg')).toBe('https://cdn.c.com/a.jpg');
  });

  it('普通地址不动', () => {
    expect(unwrapOptimizer('http://localhost:5173/hero.png')).toBeNull();
    expect(unwrapOptimizer('data:image/png;base64,AAAA')).toBeNull();
  });
});

describe('文件名', () => {
  it('取地址里的文件名，去掉查询串，解码', () => {
    expect(fileNameOf('http://x/img/hero.png?v=3')).toBe('hero.png');
    expect(fileNameOf('http://x/%E5%B0%81%E9%9D%A2.jpg')).toBe('封面.jpg');
    expect(fileNameOf('http://x/dir/')).toBe('');
    expect(fileNameOf('data:image/png;base64,AAAA')).toBe('');
  });

  it('没有认识的扩展名时按类型补', () => {
    expect(withExtension('photo-123', 'image/jpeg')).toBe('photo-123.jpg');
    expect(withExtension('hero.png', 'image/webp')).toBe('hero.png');
    expect(withExtension('thumb.php', 'image/png; charset=binary')).toBe('thumb.php.png');
    expect(withExtension('clip', null)).toBe('clip');
  });

  it('重名加序号，不分大小写', () => {
    const taken = new Set<string>();
    expect(uniqueFileName('hero.png', taken)).toBe('hero.png');
    expect(uniqueFileName('Hero.png', taken)).toBe('Hero-2.png');
    expect(uniqueFileName('hero.png', taken)).toBe('hero-3.png');
    expect(uniqueFileName('icon', taken)).toBe('icon');
    expect(uniqueFileName('icon', taken)).toBe('icon-2');
  });

  it('不能用的字符换掉', () => {
    expect(sanitizeFileName('a/b:c*?.svg')).toBe('a-b-c-.svg');
    expect(sanitizeFileName('..hidden')).toBe('hidden');
    expect(sanitizeFileName('  星标  ')).toBe('星标');
  });
});
