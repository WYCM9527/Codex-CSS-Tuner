import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { editCssRule, editTailwind, editThemeVar, type EditResult } from '@css-tuner/engine';
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

/** 文件在编辑器里有未保存的修改（写盘会和它冲突） */
export function isDirty(file: string): boolean {
  return vscode.workspace.textDocuments.some((d) => d.uri.scheme === 'file' && d.uri.fsPath === file && d.isDirty);
}

/** 把一条改动交给引擎，算出要写进源码的文本编辑；read 让同一批里后面的改动看到前面改完的内容 */
export async function computeWrite(rec: ChangeRecord, tailwind: TailwindService, rem: number, read: Reader = readDisk): Promise<EditResult> {
  const w = rec.write;
  if (w.kind === 'agent') return { ok: false, reason: w.reason };
  if (w.kind === 'tailwind') {
    if (!w.entry) return { ok: false, reason: '找不到 Tailwind 的 CSS 入口文件，无法确定设计系统' };
    const design = await tailwind.designFor(w.entry, rem);
    if (!design) return { ok: false, reason: '加载项目的 Tailwind 设计系统失败（详见输出面板）' };
    const source = read(w.file);
    if (source === null) return { ok: false, reason: `读不到 ${w.file}` };
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
    });
  }
  if (w.kind === 'theme') return editThemeVar({ file: w.file, read, name: w.name, value: rec.value });
  return editCssRule({
    file: w.file,
    read,
    spec: { selector: w.selector, fullSelector: w.fullSelector, conditions: w.conditions, ordinal: w.ordinal, mode: w.mode, via: w.via },
    props: rec.props,
    value: rec.value,
  });
}
