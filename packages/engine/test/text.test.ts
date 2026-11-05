import { describe, expect, it } from 'vitest';
import { jsxAttrSite, jsxChildSite, matchMessage, messageKeyPaths } from '../src';

const F = '/p/src/App.tsx';

/** 源码里第 n 个 `<tag` 的行列（行列从 1 开始） */
function at(source: string, tag: string, n = 0): { line: number; column: number } {
  let i = -1;
  for (let k = 0; k <= n; k++) i = source.indexOf(`<${tag}`, i + 1);
  const before = source.slice(0, i).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

const child = (source: string, tag: string, index: number, n = 0) => {
  const { line, column } = at(source, tag, n);
  return jsxChildSite(source, F, line, column, index);
};

describe('JSX 文字的写法', () => {
  it('多行文字按 JSX 的规则折叠空白', () => {
    const src = `const A = () => (\n  <p>\n    点选元素，\n    拖动数值。\n  </p>\n);`;
    expect(child(src, 'p', 0)).toEqual({ kind: 'literal', value: '点选元素， 拖动数值。' });
    expect(child(`const A = () => <p>\ta\tb  </p>;`, 'p', 0)).toEqual({ kind: 'literal', value: ' a b  ' });
  });

  it('下标和运行时 children 一致：跳过纯空白和注释，内嵌标签前后的空格要保留', () => {
    const src = `const A = () => (\n  <p>\n    {/* 说明 */}\n    Hello <b>bold</b> tail\n  </p>\n);`;
    expect(child(src, 'p', 0)).toEqual({ kind: 'literal', value: 'Hello ' });
    expect(child(src, 'p', 1)).toEqual({ kind: 'dynamic', code: '<b>bold</b>' });
    expect(child(src, 'p', 2)).toEqual({ kind: 'literal', value: ' tail' });
    expect(child(src, 'p', 3)).toHaveProperty('error');
  });

  it('字符串和模板字符串表达式算字面量，变量算代码决定的', () => {
    const src = "const A = () => <p>{'It is'} {`tpl`}</p>;";
    expect(child(src, 'p', 0)).toEqual({ kind: 'literal', value: 'It is' });
    expect(child(src, 'p', 2)).toEqual({ kind: 'literal', value: 'tpl' });
    expect(child(`const A = ({ title }) => <h2>{title}</h2>;`, 'h2', 0)).toEqual({ kind: 'dynamic', code: 'title' });
  });

  it('同一行有多个元素时按列找', () => {
    const src = `const A = () => <div><span>one</span><span>two</span></div>;`;
    expect(child(src, 'span', 0, 1)).toEqual({ kind: 'literal', value: 'two' });
  });
});

describe('调用处的字符串属性', () => {
  const src = `const A = () => <Card title="第一张卡片" note={'旁注'} sub={x} />;`;
  const pos = at(src, 'Card');

  it('读出属性的写法', () => {
    expect(jsxAttrSite(src, F, pos.line, pos.column, 'title')).toEqual({ kind: 'literal', value: '第一张卡片' });
    expect(jsxAttrSite(src, F, pos.line, pos.column, 'note')).toEqual({ kind: 'literal', value: '旁注' });
    expect(jsxAttrSite(src, F, pos.line, pos.column, 'sub')).toEqual({ kind: 'dynamic', code: 'x' });
    expect(jsxAttrSite(src, F, pos.line, pos.column, 'missing')).toHaveProperty('error');
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
    expect(child(app, 'h1', 0)).toMatchObject({ kind: 'message', ref: { key: 'hero.title', ns: null, prefix: null, lib: 'i18next' } });
    expect(child(app, 'h2', 0)).toMatchObject({ kind: 'message', ref: { key: 'title', ns: 'admin', prefix: 'page', lib: 'i18next' } });
    expect(child(app, 'p', 0)).toMatchObject({ kind: 'message', ref: { key: 'intro', ns: 'Home', lib: 'next-intl' } });
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
});
