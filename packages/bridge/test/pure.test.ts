import { describe, expect, it } from 'vitest';
import { maxSpecificity, resolveNested, specificity, splitTopLevel, staticSelector } from '../src/specificity';
import { clientModuleUrl, distDirOf, joinPath, projectRootOf, serverModuleUrl } from '../src/next';
import { decodeMappings, extractMapUrl, filePathOf, originalPosition, originalPositionFor, sourcesOf } from '../src/sourcemap';
import { unescapeIdent } from '../src/util';

describe('specificity', () => {
  it('基础选择器', () => {
    expect(specificity('div')).toEqual([0, 0, 1]);
    expect(specificity('.card .title')).toEqual([0, 2, 0]);
    expect(specificity('#app > ul li.active')).toEqual([1, 1, 2]);
    expect(specificity('a:hover::before')).toEqual([0, 1, 2]);
    expect(specificity('input[type="text"]')).toEqual([0, 1, 1]);
  });

  it('Tailwind 转义类名算一个类', () => {
    expect(specificity('.md\\:px-6')).toEqual([0, 1, 0]);
    expect(specificity('.hover\\:bg-tri-void\\/80:hover')).toEqual([0, 2, 0]);
    expect(specificity('.p-4\\.5')).toEqual([0, 1, 0]);
  });

  it(':where / :is / :not / :has / :nth-child(of)', () => {
    expect(specificity(':where(.a, #b) .c')).toEqual([0, 1, 0]);
    expect(specificity(':is(.a, #b) .c')).toEqual([1, 1, 0]);
    expect(specificity('li:not(.x)')).toEqual([0, 1, 1]);
    expect(specificity('.a:has(> img)')).toEqual([0, 1, 1]);
    expect(specificity(':nth-child(2n of .item)')).toEqual([0, 2, 0]);
    expect(specificity('.group-hover\\:x:is(:where(.group):hover *)')).toEqual([0, 2, 0]);
  });

  it('选择器列表取最大', () => {
    expect(maxSpecificity('.a, #b, div')).toEqual([1, 0, 0]);
  });
});

describe('splitTopLevel / resolveNested', () => {
  it('忽略括号和引号里的逗号', () => {
    expect(splitTopLevel(':is(.a, .b), [data-x="1,2"], .c')).toEqual([':is(.a, .b)', '[data-x="1,2"]', '.c']);
  });

  it('展开嵌套', () => {
    expect(resolveNested('.panel', '& .row')).toBe(':is(.panel) .row');
    expect(resolveNested('.panel', '.row')).toBe(':is(.panel) .row');
    expect(resolveNested('.a, .b', '&:hover, & > .c')).toBe(':is(.a, .b):hover, :is(.a, .b) > .c');
    expect(resolveNested(null, '.x')).toBe('.x');
  });

  it('统计影响元素数时去掉动态伪类', () => {
    expect(staticSelector('.btn:hover')).toBe('.btn');
    expect(staticSelector('.hover\\:x:hover')).toBe('.hover\\:x');
  });
});

describe('sourcemap', () => {
  it('解码 VLQ 并映射到原始位置', () => {
    // 第 1 行第 0 列 → 源 0 第 0 行第 0 列；第 2 行第 4 列 → 源 0 第 2 行第 2 列
    const map = { sources: ['App.tsx'], mappings: 'AAAA;IAEE' };
    const decoded = decodeMappings(map.mappings);
    expect(originalPositionFor(map, decoded, 1, 1)).toEqual({ source: 'App.tsx', line: 1, column: 1 });
    expect(originalPositionFor(map, decoded, 2, 5)).toEqual({ source: 'App.tsx', line: 3, column: 3 });
    expect(originalPositionFor(map, decoded, 2, 9)).toEqual({ source: 'App.tsx', line: 3, column: 3 });
  });

  it('分段 sourcemap（Turbopack）：按偏移找到所在段，列偏移只作用于段的第一行', () => {
    const app = { sources: ['file:///p/src/App.tsx'], mappings: 'AAAA;IAEE' };
    const lib = { sources: ['file:///p/node_modules/react/jsx.js'], mappings: 'AAAA', ignoreList: [0] };
    const map = { sections: [{ offset: { line: 3, column: 0 }, map: app }, { offset: { line: 10, column: 4 }, map: lib }] };
    expect(originalPosition(map, 2, 1)).toBeNull();
    expect(originalPosition(map, 4, 1)).toEqual({ source: 'file:///p/src/App.tsx', line: 1, column: 1, ignored: false });
    expect(originalPosition(map, 5, 6)).toEqual({ source: 'file:///p/src/App.tsx', line: 3, column: 3, ignored: false });
    expect(originalPosition(map, 11, 5)).toEqual({ source: 'file:///p/node_modules/react/jsx.js', line: 1, column: 1, ignored: true });
    expect(sourcesOf(map)).toEqual(['file:///p/src/App.tsx', 'file:///p/node_modules/react/jsx.js']);
  });

  it('file:// 源转本地路径，CSS 里的 sourceMappingURL 注释也认', () => {
    expect(filePathOf('file:///Users/me/vibe%20coding/%E5%8F%AF/src/a.tsx')).toBe('/Users/me/vibe coding/可/src/a.tsx');
    expect(filePathOf('file:///C:/proj/a.css')).toBe('C:/proj/a.css');
    expect(filePathOf('turbopack:///[project]/a.css')).toBeNull();
    expect(extractMapUrl('.a{}\n/*# sourceMappingURL=x._.css.map*/')).toBe('x._.css.map');
    expect(extractMapUrl('x()\n//# sourceMappingURL=data:application/json;base64,e30=')).toBe('data:application/json;base64,e30=');
  });
});

describe('Next.js 栈帧', () => {
  const dist = '/Users/me/vibe coding/my site/.next/dev';
  const chunk = 'file:///Users/me/vibe%20coding/my%20site/.next/dev/server/chunks/ssr/%5Broot-of-the-server%5D__1sns-o6._.js';

  it('服务端组件帧去掉伪造前缀和 ?N 计数，热更新后的 ?id= 保留并解掉多的一层编码', () => {
    expect(serverModuleUrl(`about://React/Server/${chunk}?68`)).toBe(chunk);
    expect(serverModuleUrl(`rsc://React/Server/${chunk}`)).toBe(chunk);
    const hmr = 'file:///Users/me/vibe%2520coding/p/.next/dev/server/chunks/ssr/%255Broot%255D__x._.js?id=%255Bproject%255D/src/app/page.tsx+%255Bapp-rsc%255D+(ecmascript)';
    expect(serverModuleUrl(`about://React/Server/${hmr}?3`)).toBe(
      'file:///Users/me/vibe%20coding/p/.next/dev/server/chunks/ssr/%5Broot%5D__x._.js?id=%5Bproject%5D/src/app/page.tsx+%5Bapp-rsc%5D+(ecmascript)',
    );
    expect(serverModuleUrl('http://127.0.0.1:3000/_next/static/chunks/a.js')).toBeNull();
  });

  it('从服务端帧认出构建目录，推出项目根', () => {
    expect(distDirOf(`about://React/Server/${chunk}?68`)).toBe(dist);
    expect(distDirOf('about://React/Server/file:///C:/proj/.next/dev/server/app/page.js?1')).toBe('C:/proj/.next/dev');
    expect(distDirOf('http://127.0.0.1:3000/_next/static/chunks/a.js')).toBeNull();
    expect(projectRootOf(dist)).toBe('/Users/me/vibe coding/my site');
    expect(projectRootOf('/p/build/dev')).toBe('/p');
    expect(projectRootOf('/p/out')).toBe('/p');
    expect(joinPath('/Users/me/p', 'app/[locale]/page.tsx')).toBe('/Users/me/p/app/[locale]/page.tsx');
  });

  it('客户端 chunk 帧换成构建目录里的 file:// 路径，带上查询串', () => {
    expect(clientModuleUrl('http://127.0.0.1:3000/_next/static/chunks/src_a.js?id=7', dist)).toBe(
      'file:///Users/me/vibe coding/my site/.next/dev/static/chunks/src_a.js?id=7',
    );
    expect(clientModuleUrl('http://127.0.0.1:3000/_next/static/chunks/a.js', 'C:/proj/.next/dev')).toBe('file:///C:/proj/.next/dev/static/chunks/a.js');
    expect(clientModuleUrl('http://127.0.0.1:3000/src/App.tsx', dist)).toBeNull();
  });
});

describe('unescapeIdent', () => {
  it('还原 Tailwind 类名', () => {
    expect(unescapeIdent('md\\:px-6')).toBe('md:px-6');
    expect(unescapeIdent('hover\\:bg-tri-void\\/80')).toBe('hover:bg-tri-void/80');
    expect(unescapeIdent('p-4\\.5')).toBe('p-4.5');
    expect(unescapeIdent('w-\\[37\\%\\]')).toBe('w-[37%]');
    expect(unescapeIdent('\\31 23')).toBe('123');
  });
});
