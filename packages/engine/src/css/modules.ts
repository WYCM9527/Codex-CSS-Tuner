/**
 * CSS Modules：开发服务器把类名换成带哈希的名字，页面上看到的选择器和源文件对不上。
 * 各打包器的命名都是“本地类名 + 分隔符 + 哈希”的组合：
 *   Vite       `_btn_x1y2z_3`
 *   webpack    `Button_btn__x1y2z`
 *   Turbopack  `Button-module__x1y2z__btn`
 * 不依赖具体格式：在哈希类名里按 `_` / `-` 边界找源文件里出现过的本地类名，取最长的那个。
 */

export const isCssModule = (file: string): boolean => /\.module\.(css|pcss|postcss|scss|sass|less)$/i.test(file);

const CLASS = /\.((?:\\.|[\w-]|[^\x00-\x7f])+)/g;

export function localClasses(selectors: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const s of selectors) for (const m of s.matchAll(CLASS)) out.add(m[1]);
  return out;
}

const edge = (c: string | undefined) => c === undefined || c === '_' || c === '-';

export function localizeClass(name: string, locals: Set<string>): string | null {
  if (locals.has(name)) return name;
  let best: string | null = null;
  for (const l of locals) {
    if (best !== null && l.length <= best.length) continue;
    for (let i = name.indexOf(l); i !== -1; i = name.indexOf(l, i + 1)) {
      if (edge(i === 0 ? undefined : name[i - 1]) && edge(name[i + l.length])) {
        best = l;
        break;
      }
    }
  }
  return best;
}

/** 把选择器里的哈希类名换回本地类名；认不出的保持原样 */
export function localizeSelector(selector: string, locals: Set<string>): string {
  return selector.replace(CLASS, (all, cls: string) => {
    const l = localizeClass(cls, locals);
    return l === null ? all : `.${l}`;
  });
}
