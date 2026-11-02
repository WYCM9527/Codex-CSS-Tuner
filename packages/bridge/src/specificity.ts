import { resolveNested, splitTopLevel } from '@css-tuner/protocol';

export { resolveNested, splitTopLevel };

export type Spec = [number, number, number];

const ZERO: Spec = [0, 0, 0];
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const FORGIVING = new Set(['is', 'not', 'has', 'matches', 'any', '-webkit-any']);

function isHex(ch: string): boolean {
  return /[0-9a-f]/i.test(ch);
}

function isIdentChar(ch: string): boolean {
  return /[A-Za-z0-9_-]/.test(ch) || ch.charCodeAt(0) > 127;
}

/** 跳过一个标识符（支持 \: \/ 和 \31 这类转义，Tailwind 类名依赖这个） */
function skipIdent(s: string, i: number): number {
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      i++;
      if (i < s.length && isHex(s[i])) {
        let n = 0;
        while (i < s.length && n < 6 && isHex(s[i])) {
          i++;
          n++;
        }
        if (s[i] === ' ') i++;
      } else i++;
      continue;
    }
    if (isIdentChar(ch)) i++;
    else break;
  }
  return i;
}

/** 从开括号位置读到匹配的闭括号，返回 [内容, 闭括号之后的位置] */
function readGroup(s: string, i: number, open: string, close: string): [string, number] {
  let depth = 0;
  const start = i + 1;
  let quote: string | null = null;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return [s.slice(start, i), i + 1];
    }
  }
  return [s.slice(start), s.length];
}

export function compareSpec(a: Spec, b: Spec): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function add(a: Spec, b: Spec): Spec {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function maxSpecificity(list: string): Spec {
  let best = ZERO;
  for (const part of splitTopLevel(list)) {
    const s = specificity(part);
    if (compareSpec(s, best) > 0) best = s;
  }
  return best;
}

/** 单个复合选择器的优先级（Selectors Level 4） */
export function specificity(sel: string): Spec {
  let spec: Spec = [0, 0, 0];
  let i = 0;
  while (i < sel.length) {
    const ch = sel[i];
    if (ch === '\\') {
      spec = add(spec, [0, 0, 1]);
      i = skipIdent(sel, i);
    } else if (ch === '#') {
      spec = add(spec, [1, 0, 0]);
      i = skipIdent(sel, i + 1);
    } else if (ch === '.') {
      spec = add(spec, [0, 1, 0]);
      i = skipIdent(sel, i + 1);
    } else if (ch === '[') {
      spec = add(spec, [0, 1, 0]);
      i = readGroup(sel, i, '[', ']')[1];
    } else if (ch === ':') {
      if (sel[i + 1] === ':') {
        spec = add(spec, [0, 0, 1]);
        i = skipIdent(sel, i + 2);
        if (sel[i] === '(') i = readGroup(sel, i, '(', ')')[1];
        continue;
      }
      const end = skipIdent(sel, i + 1);
      const name = sel.slice(i + 1, end).toLowerCase();
      i = end;
      if (LEGACY_PSEUDO_ELEMENTS.has(name)) {
        spec = add(spec, [0, 0, 1]);
      } else if (sel[i] === '(') {
        const [args, next] = readGroup(sel, i, '(', ')');
        i = next;
        if (name === 'where') {
          // 0
        } else if (FORGIVING.has(name)) {
          spec = add(spec, maxSpecificity(args));
        } else if (name === 'nth-child' || name === 'nth-last-child') {
          spec = add(spec, [0, 1, 0]);
          const of = /\sof\s/i.exec(args);
          if (of) spec = add(spec, maxSpecificity(args.slice(of.index + of[0].length)));
        } else {
          spec = add(spec, [0, 1, 0]);
        }
      } else {
        spec = add(spec, [0, 1, 0]);
      }
    } else if (isIdentChar(ch) && !/[0-9]/.test(ch)) {
      spec = add(spec, [0, 0, 1]);
      i = skipIdent(sel, i);
    } else {
      i++;
    }
  }
  return spec;
}

const DYNAMIC_PSEUDO = /:(?:hover|focus|focus-visible|focus-within|active|visited|target|checked|indeterminate|placeholder-shown|autofill|user-invalid|user-valid|open|popover-open)\b/g;

/** 去掉动态伪类，用于统计"这条规则会影响多少元素" */
export function staticSelector(sel: string): string {
  return sel.replace(DYNAMIC_PSEUDO, '');
}
