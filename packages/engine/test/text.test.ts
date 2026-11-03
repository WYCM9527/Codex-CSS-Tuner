import { describe, expect, it } from 'vitest';
import { applyEdits, editHtmlText, editJsxAttr, editJsxText, editMessage, jsxAttrSite, jsxChildSite, matchMessage, messageKeyPaths, readMessage } from '../src';

const F = '/p/src/App.tsx';

/** 源码里第 n 个 `<tag` 的行列（行列从 1 开始） */
function at(source: string, tag: string, n = 0): { line: number; column: number } {
  let i = -1;
  for (let k = 0; k <= n; k++) i = source.indexOf(`<${tag}`, i + 1);
  const before = source.slice(0, i).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

function text(source: string, tag: string, segment: number, from: string, value: string, n = 0) {
  const r = editJsxText({ file: F, source, ...at(source, tag, n), segment, from, value });
  return r.ok ? applyEdits(source, r.edits) : r.reason;
}

describe('JSX 文字', () => {
  it('同一行的字面量只改变化的几个字', () => {
    const src = `export const A = () => <h1 className="t">Hello world</h1>;`;
    const r = editJsxText({ file: F, source: src, ...at(src, 'h1'), segment: 0, from: 'Hello world', value: 'Hello there' });
    expect(r.ok && r.edits).toEqual([{ start: src.indexOf('world'), end: src.indexOf('world') + 5, text: 'there' }]);
  });

  it('多行文字保留缩进和换行，跨行的改动会合并成一行', () => {
    const src = `const A = () => (\n  <p>\n    点选元素，\n    拖动数值。\n  </p>\n);`;
    expect(jsxChildSite(src, F, ...Object.values(at(src, 'p')) as [number, number], 0)).toEqual({ kind: 'literal', value: '点选元素， 拖动数值。' });
    expect(text(src, 'p', 0, '点选元素， 拖动数值。', '点选元素， 调整数值。')).toBe(`const A = () => (\n  <p>\n    点选元素，\n    调整数值。\n  </p>\n);`);
    expect(text(src, 'p', 0, '点选元素， 拖动数值。', '点选元素，拖动数值。')).toBe(`const A = () => (\n  <p>\n    点选元素，拖动数值。\n  </p>\n);`);
  });

  it('下标和运行时 children 一致：跳过纯空白和注释，内嵌标签前后的空格要保留', () => {
    const src = `const A = () => (\n  <p>\n    {/* 说明 */}\n    Hello <b>bold</b> tail\n  </p>\n);`;
    const { line, column } = at(src, 'p');
    expect(jsxChildSite(src, F, line, column, 0)).toEqual({ kind: 'literal', value: 'Hello ' });
    expect(jsxChildSite(src, F, line, column, 2)).toEqual({ kind: 'literal', value: ' tail' });
    expect(text(src, 'p', 0, 'Hello ', 'Hi ')).toContain('    Hi <b>bold</b> tail');
    expect(text(src, 'p', 2, ' tail', ' end')).toContain('<b>bold</b> end\n');
  });

  it('含花括号、尖括号或实体写法时改用表达式', () => {
    const src = `const A = () => <h2>Price</h2>;`;
    expect(text(src, 'h2', 0, 'Price', 'a < b {c}')).toBe(`const A = () => <h2>{"a < b {c}"}</h2>;`);
    expect(text(src, 'h2', 0, 'Price', 'Tom &amp; Jerry')).toBe(`const A = () => <h2>{"Tom &amp; Jerry"}</h2>;`);
  });

  it('字符串和模板字符串表达式按各自的转义规则改', () => {
    const src = "const A = () => <p>{'It is'} {`tpl`}</p>;";
    const { line, column } = at(src, 'p');
    expect(jsxChildSite(src, F, line, column, 2)).toEqual({ kind: 'literal', value: 'tpl' });
    expect(text(src, 'p', 0, 'It is', "It's")).toBe("const A = () => <p>{'It\\'s'} {`tpl`}</p>;");
    expect(text(src, 'p', 2, 'tpl', 'a`${b}')).toBe("const A = () => <p>{'It is'} {`a\\`\\${b}`}</p>;");
  });

  it('源码里的文字和页面上的对不上、或不是字面量时不改', () => {
    const src = `const A = ({ title }) => <h2>{title}</h2>;`;
    const { line, column } = at(src, 'h2');
    expect(jsxChildSite(src, F, line, column, 0)).toEqual({ kind: 'dynamic', code: 'title' });
    expect(text(src, 'h2', 0, 'x', 'y')).toMatch(/rather than a literal|不是写死的字面量/);
    expect(text(`const A = () => <h2>Now</h2>;`, 'h2', 0, 'Before', 'After')).toMatch(/changed|已经变了/);
  });

  it('同一行有多个元素时按列找', () => {
    const src = `const A = () => <div><span>one</span><span>two</span></div>;`;
    expect(text(src, 'span', 0, 'two', '2', 1)).toBe(`const A = () => <div><span>one</span><span>2</span></div>;`);
  });
});

describe('调用处的字符串属性', () => {
  const src = `const A = () => <Card title="第一张卡片" note={'旁注'} />;`;
  const pos = at(src, 'Card');

  it('读出属性的写法', () => {
    expect(jsxAttrSite(src, F, pos.line, pos.column, 'title')).toEqual({ kind: 'literal', value: '第一张卡片' });
    expect(jsxAttrSite(src, F, pos.line, pos.column, 'missing')).toHaveProperty('error');
  });

  it('改属性字符串，含引号或实体时改用表达式', () => {
    const edit = (name: string, from: string, value: string) => {
      const r = editJsxAttr({ file: F, source: src, ...pos, name, from, value });
      return r.ok ? applyEdits(src, r.edits) : r.reason;
    };
    expect(edit('title', '第一张卡片', '第 1 张卡片')).toBe(`const A = () => <Card title="第 1 张卡片" note={'旁注'} />;`);
    expect(edit('title', '第一张卡片', 'say "hi"')).toBe(`const A = () => <Card title={"say \\"hi\\""} note={'旁注'} />;`);
    expect(edit('note', '旁注', '脚注')).toBe(`const A = () => <Card title="第一张卡片" note={'脚注'} />;`);
  });
});

describe('多语言消息', () => {
  const app = [
    `import { useTranslation } from 'react-i18next';`,
    `export function Hero() {`,
    `  const { t } = useTranslation();`,
    `  return <h1>{t('hero.title')}</h1>;`,
    `}`,
    `export function Admin() {`,
    `  const { t: ta } = useTranslation('admin', { keyPrefix: 'page' });`,
    `  return <h2>{ta('title')}</h2>;`,
    `}`,
    `export async function Server() {`,
    `  const t = await getTranslations('Home');`,
    `  return <p>{t('intro')}</p>;`,
    `}`,
  ].join('\n');

  it('认出 t() 调用和它所在组件的命名空间', () => {
    const site = (tag: string) => {
      const { line, column } = at(app, tag);
      return jsxChildSite(app, F, line, column, 0);
    };
    expect(site('h1')).toMatchObject({ kind: 'message', ref: { key: 'hero.title', ns: null, prefix: null, lib: 'i18next' } });
    expect(site('h2')).toMatchObject({ kind: 'message', ref: { key: 'title', ns: 'admin', prefix: 'page', lib: 'i18next' } });
    expect(site('p')).toMatchObject({ kind: 'message', ref: { key: 'intro', ns: 'Home', lib: 'next-intl' } });
  });

  it('消息路径', () => {
    expect(messageKeyPaths({ key: 'hero.title', ns: null, prefix: null, lib: 'i18next' })).toEqual([['hero', 'title']]);
    expect(messageKeyPaths({ key: 'common:save', ns: null, prefix: null, lib: 'i18next' })).toEqual([['common', 'save'], ['save']]);
    expect(messageKeyPaths({ key: 'intro', ns: 'Home.Hero', prefix: null, lib: 'next-intl' })).toEqual([['Home', 'Hero', 'intro']]);
  });

  const en = `{\n  "hero": { "title": "Welcome" },\n  "same": "OK"\n}\n`;
  const zh = `{\n  // 中文\n  "hero": { "title": "欢迎" },\n  "same": "OK",\n}\n`;
  const files = [
    { file: '/p/src/locales/en.json', source: en },
    { file: '/p/src/locales/zh-CN.json', source: zh },
  ];

  it('按页面文字找到当前语言的文件，分不出时按 <html lang> 挑', () => {
    expect(matchMessage(files, { key: 'hero.title', ns: null, prefix: null, lib: 'i18next' }, '欢迎', 'zh-CN')).toEqual({ file: '/p/src/locales/zh-CN.json', keyPath: ['hero', 'title'] });
    expect(matchMessage(files, { key: 'same', ns: null, prefix: null, lib: 'i18next' }, 'OK', 'zh-CN')).toEqual({ file: '/p/src/locales/zh-CN.json', keyPath: ['same'] });
    expect(matchMessage(files, { key: 'same', ns: null, prefix: null, lib: 'i18next' }, 'OK', null)).toHaveProperty('reason');
    expect(matchMessage(files, { key: 'hero.title', ns: null, prefix: null, lib: 'i18next' }, 'Hello', 'en')).toHaveProperty('reason');
  });

  it('几条语言线索按顺序试，前一条分不出来再看下一条', () => {
    const same = { key: 'same', ns: null, prefix: null, lib: 'i18next' } as const;
    expect(matchMessage(files, same, 'OK', ['zh', 'en'])).toEqual({ file: '/p/src/locales/zh-CN.json', keyPath: ['same'] });
    expect(matchMessage(files, same, 'OK', [null, 'fr', 'en'])).toEqual({ file: '/p/src/locales/en.json', keyPath: ['same'] });
    expect(matchMessage(files, same, 'OK', [])).toHaveProperty('reason');
  });

  it('改 JSON 的值，保留注释、尾逗号和其他格式', () => {
    const r = editMessage({ file: '/p/zh.json', source: zh, keyPath: ['hero', 'title'], from: '欢迎', value: '欢迎回来 "朋友"' });
    expect(r.ok).toBe(true);
    const out = r.ok ? applyEdits(zh, r.edits) : '';
    expect(out).toBe(`{\n  // 中文\n  "hero": { "title": "欢迎回来 \\"朋友\\"" },\n  "same": "OK",\n}\n`);
    expect(readMessage(out, ['hero', 'title'])).toBe('欢迎回来 "朋友"');
    expect(editMessage({ file: '/p/zh.json', source: zh, keyPath: ['hero', 'title'], from: '别的', value: 'x' })).toHaveProperty('ok', false);
  });
});

describe('纯 HTML 文字', () => {
  const html = `<!doctype html>\n<html lang="zh-CN">\n  <head><title>t</title></head>\n  <body>\n    <main>\n      <h2 class="t">静态页 &amp; 样例</h2>\n      <p>第一段\n        <b>粗</b> 第二段</p>\n    </main>\n  </body>\n</html>\n`;

  const edit = (path: number[], tag: string, segment: number, from: string, value: string) => {
    const r = editHtmlText({ file: '/p/index.html', source: html, path, tag, segment, from, value });
    return r.ok ? applyEdits(html, r.edits) : r.reason;
  };

  it('按下标路径找到元素，原文有实体时整段替换并转义', () => {
    expect(edit([1, 0, 0], 'h2', 0, '静态页 & 样例', '静态页 <样例>')).toContain('<h2 class="t">静态页 &lt;样例&gt;</h2>');
  });

  it('只改变化的部分，保留换行和缩进', () => {
    expect(edit([1, 0, 1], 'p', 0, '第一段', '第 1 段')).toContain('<p>第 1 段\n        <b>粗</b> 第二段</p>');
    expect(edit([1, 0, 1], 'p', 1, '第二段', '第 2 段')).toContain('<b>粗</b> 第 2 段</p>');
  });

  it('路径上的标签对不上就不改', () => {
    expect(edit([1, 0, 0], 'p', 0, '静态页 & 样例', 'x')).toMatch(/doesn't match|对不上/);
  });
});
