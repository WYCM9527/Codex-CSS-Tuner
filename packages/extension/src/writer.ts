import * as vscode from 'vscode';
import { readFileSync, writeFileSync } from 'node:fs';
import { t, type PropValue } from '@css-tuner/protocol';
import { editArrayOrder, editCssRule, editHtmlOrder, editHtmlText, editJsxAttr, editJsxOrder, editJsxProp, editJsxText, editMessage, editTailwind, editThemeVar, type EditResult } from '@css-tuner/engine';
import type { ChangeRecord } from './journal';
import type { TailwindService } from './tailwind';

export type Reader = (file: string) => string | null;

/** 写回直接读写磁盘：编辑器里打开着的文档在没有未保存修改时和磁盘一致 */
export const readDisk: Reader = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

/**
 * 原地同步写盘：截断和写入连在一起。异步写在两步之间要让出事件循环，扩展忙的时候文件会空上一阵，
 * 开发服务器这时读到空文件会把空模块缓存下来（Vite 只等 100ms），页面就白了
 */
export function writeDisk(file: string, text: string) {
  writeFileSync(file, text, 'utf8');
}

/** 文件在编辑器里有未保存的修改（写盘会和它冲突） */
export function isDirty(file: string): boolean {
  return vscode.workspace.textDocuments.some((d) => d.uri.scheme === 'file' && d.uri.fsPath === file && d.isDirty);
}

/** 把一条改动交给引擎，算出要写进源码的文本编辑；read 让同一批里后面的改动看到前面改完的内容 */
export async function computeWrite(rec: ChangeRecord, tailwind: TailwindService, rem: number, read: Reader = readDisk): Promise<EditResult> {
  const w = rec.write;
  if (w.kind === 'agent') return { ok: false, reason: w.reason };
  if (rec.removal && (w.kind === 'theme' || (w.kind === 'tailwind' && !rec.removal.classes?.length) || (w.kind === 'css' && w.mode !== 'edit'))) {
    return { ok: false, reason: t('ext.write.unsupported') };
  }
  if (w.kind === 'tailwind') {
    if (!w.entry) return { ok: false, reason: t('ext.write.noTwEntry') };
    const design = await tailwind.designFor(w.entry, rem);
    if (!design) return { ok: false, reason: t('ext.write.twLoadFailed') };
    const source = read(w.file);
    if (source === null) return { ok: false, reason: t('engine.readFailed', { file: w.file }) };
    return editTailwind(design, {
      file: w.file,
      source,
      line: w.line,
      column: w.column,
      props: rec.props,
      value: rec.value,
      token: rec.token,
      utility: w.utility,
      literal: w.literal,
      override: w.override,
      ...(rec.removal ? { remove: rec.removal.classes } : {}),
      ...(w.band ? { band: { ...w.band, original: { value: rec.original?.[rec.props[0]] ?? '', token: null } } } : {}),
    });
  }
  if (w.kind === 'theme') return editThemeVar({ file: w.file, read, name: w.name, value: rec.value });
  if (w.kind === 'css') {
    return editCssRule({
      file: w.file,
      read,
      spec: { selector: w.selector, fullSelector: w.fullSelector, conditions: w.conditions, ordinal: w.ordinal, mode: w.mode, via: w.via },
      props: rec.props,
      value: rec.value,
      ...(rec.removal ? { remove: true } : {}),
    });
  }
  if (w.kind === 'jsxText' || w.kind === 'jsxAttr' || w.kind === 'message' || w.kind === 'htmlText') {
    const source = read(w.file);
    if (source === null) return { ok: false, reason: t('engine.readFailed', { file: w.file }) };
    // 页面上的文字带着源码里的首尾空白（JSX 里 {" "} 隔开的那种），新文字原样套进去
    const from = rec.original.text ?? rec.from;
    const full = /^\s*/.exec(from)![0] + rec.value + /\s*$/.exec(from)![0];
    if (w.kind === 'jsxText') return editJsxText({ file: w.file, source, line: w.line, column: w.column, segment: w.segment, from, value: full });
    if (w.kind === 'jsxAttr') return editJsxAttr({ file: w.file, source, line: w.line, column: w.column, name: w.name, from, value: full });
    if (w.kind === 'message') return editMessage({ file: w.file, source, keyPath: w.keyPath, from, value: rec.value });
    return editHtmlText({ file: w.file, source, path: w.path, tag: w.tag, segment: w.segment, from, value: rec.value });
  }
  if (w.kind === 'jsxOrder' || w.kind === 'arrayOrder' || w.kind === 'htmlOrder') {
    const source = read(w.file);
    if (source === null) return { ok: false, reason: t('engine.readFailed', { file: w.file }) };
    if (w.kind === 'jsxOrder') return editJsxOrder({ file: w.file, source, sites: w.sites, order: w.order });
    if (w.kind === 'arrayOrder') return editArrayOrder({ file: w.file, source, line: w.line, column: w.column, count: w.count, order: w.order, read });
    return editHtmlOrder({ file: w.file, source, path: w.path, tags: w.tags, order: w.order });
  }
  if (w.kind === 'jsxProp') {
    const source = read(w.file);
    if (source === null) return { ok: false, reason: t('engine.readFailed', { file: w.file }) };
    const name = rec.props[0];
    const before = rec.original[name];
    const from = before === undefined || before === 'undefined' ? undefined : (JSON.parse(before) as PropValue);
    return editJsxProp({ file: w.file, source, line: w.line, column: w.column, name, value: JSON.parse(rec.value) as PropValue, from, tag: w.tag });
  }
  return { ok: false, reason: t('ext.write.unsupported') };
}
