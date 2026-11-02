/** 按顶层分隔符切分（忽略括号、方括号、引号、转义里的分隔符） */
export function splitTopLevel(s: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
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
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === sep && depth === 0) {
      out.push(s.slice(last, i).trim());
      last = i + 1;
    }
  }
  out.push(s.slice(last).trim());
  return out.filter(Boolean);
}

/** 展开 CSS 嵌套：子规则里的 & 换成 :is(父选择器)，没有 & 时按后代选择器拼接 */
export function resolveNested(parent: string | null, sel: string): string {
  if (!parent) return sel;
  return splitTopLevel(sel)
    .map((part) => (part.includes('&') ? part.replace(/&/g, `:is(${parent})`) : `:is(${parent}) ${part}`))
    .join(', ');
}

/**
 * 把选择器规范成可比较的形式，抹平源码写法和 CSSOM 序列化之间的差异：
 * 空白、组合符两侧空格、属性值引号、:before 这类旧伪元素写法、逗号后空格。
 */
export function normalizeSelector(sel: string): string {
  let s = sel.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/\[\s*([^\]=~|^$*\s]+)\s*([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*(i|s)?\s*\]/g, (_m, name, op, dq, sq, bare, flag) => {
    const v = dq ?? sq ?? bare ?? '';
    return `[${name}${op}"${v}"${flag ? ' ' + flag : ''}]`;
  });
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*([>+~])\s*/g, (m, c, off, str) => {
    const prev = str[off - 1];
    if (prev === '\\') return m;
    return ` ${c} `;
  });
  s = s.replace(/\s*,\s*/g, ', ');
  s = s.replace(/(^|[^:]):(before|after|first-line|first-letter)\b/g, '$1::$2');
  s = s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  return s;
}

/** at-rule 条件的规范形式，比较 "@media (min-width:768px)" 和 "@media (min-width: 768px)" */
export function normalizeCondition(cond: string): string {
  return cond
    .replace(/\s+/g, ' ')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s*,\s*/g, ', ')
    .trim()
    .toLowerCase();
}
