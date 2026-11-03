/** Vue 单文件组件模板里的一个元素（含组件、<template>、<slot>）；文字、插值和注释不留 */
export interface TNode {
  tag: string;
  /** 开始标签的 "<" 在 .vue 文件里的偏移 */
  start: number;
  /** 属性名 → 值（没写值时为 true），指令和简写原样保留：v-if、:class、#header */
  attrs: Map<string, string | true>;
  children: TNode[];
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** 内容是纯文字的元素：里面的 "<" 不是标签 */
const RAW_TAGS = new Set(['script', 'style', 'textarea', 'title']);
const TAG_START = /<([A-Za-z][^\s/>]*)/y;
const SPACE = /\s/;

interface StartTag {
  name: string;
  attrs: Map<string, string | true>;
  /** ">" 之后的位置 */
  end: number;
  selfClosing: boolean;
}

function readStartTag(src: string, lt: number): StartTag | null {
  TAG_START.lastIndex = lt;
  const m = TAG_START.exec(src);
  if (!m) return null;
  const attrs = new Map<string, string | true>();
  const n = src.length;
  let p = lt + m[0].length;
  while (p < n) {
    const c = src[p];
    if (c === '>') return { name: m[1], attrs, end: p + 1, selfClosing: false };
    if (c === '/') {
      if (src[p + 1] === '>') return { name: m[1], attrs, end: p + 2, selfClosing: true };
      p++;
      continue;
    }
    if (SPACE.test(c)) {
      p++;
      continue;
    }
    let q = p + 1;
    while (q < n && !SPACE.test(src[q]) && src[q] !== '=' && src[q] !== '>' && src[q] !== '/') q++;
    const name = src.slice(p, q);
    p = q;
    while (p < n && SPACE.test(src[p])) p++;
    if (src[p] !== '=') {
      attrs.set(name, true);
      continue;
    }
    p++;
    while (p < n && SPACE.test(src[p])) p++;
    const quote = src[p];
    if (quote === '"' || quote === "'") {
      const close = src.indexOf(quote, p + 1);
      if (close < 0) return null;
      attrs.set(name, src.slice(p + 1, close));
      p = close + 1;
    } else {
      let r = p;
      while (r < n && !SPACE.test(src[r]) && src[r] !== '>') r++;
      attrs.set(name, src.slice(p, r));
      p = r;
    }
  }
  return null;
}

/** from 之后第一个 </name> 结束的位置（不区分大小写）；没有时为 -1 */
function afterClose(src: string, name: string, from: number): number {
  const re = new RegExp(`</${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*>`, 'gi');
  re.lastIndex = from;
  const m = re.exec(src);
  return m ? m.index + m[0].length : -1;
}

/** 解析模板块的内容，直到和 root 配对的 </template>；结构不完整时返回 false */
function parseChildren(src: string, from: number, root: TNode): boolean {
  const stack: TNode[] = [root];
  const n = src.length;
  let pos = from;
  while (pos < n) {
    const lt = src.indexOf('<', pos);
    const mustache = src.indexOf('{{', pos);
    // 插值里可以写 a < b
    if (mustache >= 0 && (lt < 0 || mustache < lt)) {
      const end = src.indexOf('}}', mustache + 2);
      if (end < 0) return false;
      pos = end + 2;
      continue;
    }
    if (lt < 0) return false;
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) return false;
      pos = end + 3;
      continue;
    }
    if (src[lt + 1] === '/') {
      const gt = src.indexOf('>', lt + 2);
      if (gt < 0) return false;
      const name = src.slice(lt + 2, gt).trim();
      pos = gt + 1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag !== name) continue;
        if (i === 0) return true;
        stack.length = i;
        break;
      }
      continue;
    }
    if (src[lt + 1] === '!') {
      const gt = src.indexOf('>', lt + 2);
      if (gt < 0) return false;
      pos = gt + 1;
      continue;
    }
    const tag = readStartTag(src, lt);
    if (!tag) {
      pos = lt + 1;
      continue;
    }
    const node: TNode = { tag: tag.name, start: lt, attrs: tag.attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    pos = tag.end;
    if (tag.selfClosing || VOID_TAGS.has(tag.name)) continue;
    if (RAW_TAGS.has(tag.name)) {
      pos = afterClose(src, tag.name, pos);
      if (pos < 0) return false;
      continue;
    }
    stack.push(node);
  }
  return false;
}

/** .vue 文件顶层 <template> 块的元素树（根节点就是那个 <template>）；没有模板、用了 pug 等别的语言或结构不完整时为 null */
export function parseVueTemplate(src: string): TNode | null {
  let pos = 0;
  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    if (lt < 0) return null;
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) return null;
      pos = end + 3;
      continue;
    }
    const tag = readStartTag(src, lt);
    if (!tag) {
      pos = lt + 1;
      continue;
    }
    if (tag.name === 'template' && !tag.selfClosing) {
      const lang = tag.attrs.get('lang');
      if ((typeof lang === 'string' && lang !== 'html') || tag.attrs.has('src')) return null;
      const root: TNode = { tag: 'template', start: lt, attrs: tag.attrs, children: [] };
      return parseChildren(src, tag.end, root) ? root : null;
    }
    // <script>、<style> 和自定义块：整块跳过
    pos = tag.selfClosing ? tag.end : afterClose(src, tag.name, tag.end);
    if (pos < 0) return null;
  }
  return null;
}

/** 偏移 → 行列（都从 1 起） */
export function lineColAt(src: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = src.indexOf('\n'); i >= 0 && i < offset; i = src.indexOf('\n', i + 1)) {
    line++;
    last = i;
  }
  return { line, column: offset - last };
}
