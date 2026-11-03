import { parse } from '@babel/parser';

export type Node = { type: string; start: number; end: number; loc: { start: { line: number; column: number } }; [k: string]: any };

export const SKIP_KEYS = new Set(['loc', 'start', 'end', 'extra', 'range', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens', 'errors']);

export function walk(node: unknown, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const c of node) walk(c, visit, parent);
    return;
  }
  const n = node as Node;
  if (typeof n.type !== 'string') return;
  visit(n, parent);
  for (const k of Object.keys(n)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = n[k];
    if (v && typeof v === 'object') walk(v, visit, n);
  }
}

export function parseModule(source: string, filename: string): Node {
  const ts = /\.(c|m)?tsx?$/.test(filename);
  return parse(source, {
    sourceType: 'module',
    plugins: ts ? ['jsx', 'typescript'] : ['jsx'],
    errorRecovery: true,
  }) as unknown as Node;
}
