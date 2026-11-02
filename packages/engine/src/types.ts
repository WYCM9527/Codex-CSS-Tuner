/** 文件内容上的一处替换，偏移是 JS 字符串下标（UTF-16），与 VS Code 的 offsetAt 一致 */
export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export type EditResult =
  | {
      ok: true;
      file: string;
      edits: TextEdit[];
      /** 人读说明，如 "px-6 → px-10"、".card padding-top: 16px → var(--space-6)" */
      summary: string;
      /** Tailwind：去掉 / 加上的类名，还原时按类名语义回退（源码其他地方被改过也能还原） */
      classes?: { removed: string[]; added: string[]; attrAdded: boolean };
    }
  | { ok: false; reason: string };

/**
 * 把一处整段替换缩成只覆盖变化的部分，并对齐到空白边界（按类名粒度）：
 * "a px-6 py-4" → "a px-10 py-4" 只记 "px-6" → "px-10"，补丁小、还原时更容易重新定位
 */
export function minimizeEdit(source: string, e: TextEdit): TextEdit {
  const a = source.slice(e.start, e.end);
  const b = e.text;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  while (p > 0 && !/\s/.test(a[p - 1])) p--;
  while (s > 0 && !/\s/.test(a[a.length - s])) s--;
  return { start: e.start + p, end: e.end - s, text: b.slice(p, b.length - s) };
}

export function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** 编辑之间不能重叠，否则拒绝写回 */
export function overlapping(edits: TextEdit[]): boolean {
  const s = [...edits].sort((a, b) => a.start - b.start);
  for (let i = 1; i < s.length; i++) if (s[i].start < s[i - 1].end) return true;
  return false;
}
