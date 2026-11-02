import postcss, { type AtRule, type Declaration } from 'postcss';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { EditResult } from '../types';
import { appendDecls, importPath, valueRange } from './edit';

export interface ThemeVarInput {
  /** 含 @import "tailwindcss" 的 CSS 入口（@import 进来的本地文件会顺着找） */
  file: string;
  read: (file: string) => string | null;
  /** 主题变量名，如 --color-brand */
  name: string;
  value: string;
}

interface Found {
  file: string;
  source: string;
  decl: Declaration;
}

interface Block {
  file: string;
  source: string;
  at: AtRule;
}

const MAX_IMPORT_DEPTH = 8;

interface Scan {
  found: Found[];
  blocks: Block[];
  entry: string | null;
  /** 入口文件最后一条顶层 @import 结束的位置（新建 @theme 块放在它后面） */
  importsEnd: number;
  errors: string[];
}

/** 按 Tailwind 读到的顺序列出 @theme 块和其中的同名声明（后出现的生效） */
function scan(input: ThemeVarInput): Scan {
  const out: Scan = { found: [], blocks: [], entry: null, importsEnd: 0, errors: [] };
  const { found, blocks, errors } = out;
  const visit = (file: string, depth: number, seen: Set<string>) => {
    if (depth > MAX_IMPORT_DEPTH || seen.has(file)) return;
    const source = input.read(file);
    if (source === null) {
      errors.push(`读不到 ${file}`);
      return;
    }
    let root: postcss.Root;
    try {
      root = postcss.parse(source, { from: file });
    } catch (e) {
      errors.push(`解析 ${file} 失败：${(e as Error).message}`);
      return;
    }
    if (depth === 0) {
      out.entry = source;
      for (const n of root.nodes) {
        if (n.type === 'atrule' && n.name.toLowerCase() === 'import') out.importsEnd = n.source?.end?.offset ?? out.importsEnd;
      }
    }
    const next = new Set(seen).add(file);
    root.walkAtRules((at) => {
      const name = at.name.toLowerCase();
      if (name === 'theme') {
        blocks.push({ file, source, at });
        at.each((n) => {
          if (n.type === 'decl' && n.prop === input.name) found.push({ file, source, decl: n });
        });
      } else if (name === 'import') {
        const imp = importPath(at);
        if (!imp) return;
        const target = isAbsolute(imp.path) && !imp.path.startsWith('/') ? imp.path : resolve(dirname(file), imp.path);
        visit(target, depth + 1, next);
      }
    });
  };
  visit(input.file, 0, new Set());
  return out;
}

/**
 * 改 Tailwind 主题变量：项目里声明过就改最后生效的那条，
 * 没声明过（用的是默认主题的值）就加进入口文件的 @theme 块，没有 @theme 块就新建一个。
 */
export function editThemeVar(input: ThemeVarInput): EditResult {
  const v = input.value.trim();
  if (!input.name.startsWith('--')) return { ok: false, reason: `${input.name} 不是 CSS 变量` };
  if (!v || /[;{}]/.test(v)) return { ok: false, reason: `变量值 ${v || '（空）'} 不合法` };
  const { found, blocks, entry, importsEnd, errors } = scan(input);
  if (entry === null) return { ok: false, reason: errors[0] ?? `读不到 ${input.file}` };

  const last = found[found.length - 1];
  if (last) {
    const range = valueRange(last.source, last.decl);
    if (!range) return { ok: false, reason: `定位不到 ${input.name} 的声明` };
    if (last.decl.value.trim() === v) return { ok: false, reason: '值没有变化' };
    return {
      ok: true,
      file: last.file,
      edits: [{ start: range.start, end: range.end, text: v }],
      summary: `@theme { ${input.name}: ${last.decl.value} → ${v} }`,
    };
  }

  const own = blocks.find((b) => b.file === input.file && !/\breference\b/.test(b.at.params));
  if (own) {
    const edits = appendDecls(own.at, own.source, [[input.name, v]]);
    if (!edits.length) return { ok: false, reason: '没法往 @theme 块里加声明' };
    return { ok: true, file: own.file, edits, summary: `@theme { + ${input.name}: ${v} }` };
  }
  const lineEnd = entry.indexOf('\n', importsEnd);
  const at = importsEnd === 0 ? 0 : lineEnd < 0 ? entry.length : lineEnd + 1;
  const lead = at > 0 && entry[at - 1] !== '\n' ? '\n' : '';
  const text = at === 0 ? `@theme {\n  ${input.name}: ${v};\n}\n\n` : `${lead}\n@theme {\n  ${input.name}: ${v};\n}\n`;
  return { ok: true, file: input.file, edits: [{ start: at, end: at, text }], summary: `+ @theme { ${input.name}: ${v} }` };
}
