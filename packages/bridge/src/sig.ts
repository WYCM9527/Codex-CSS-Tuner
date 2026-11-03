/** 各字符出现次数的哈希，和字符的先后无关 */
export function charPrint(s: string): string {
  const counts = new Map<number, number>();
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let h = 0x811c9dc5;
  for (const c of [...counts.keys()].sort((a, b) => a - b)) {
    h = Math.imul(h ^ c, 0x01000193);
    h = Math.imul(h ^ counts.get(c)!, 0x01000193);
  }
  return `${s.length}.${(h >>> 0).toString(36)}`;
}

/**
 * 文字的指纹（已去掉空白）：分两段，前一段不算数字（`0{i + 1}` 这种跟着位置变的编号、倒计时），后一段是全部文字；
 * 没有文字时用 extra（能区分这个元素的属性）
 */
export const textSig = (tag: string, text: string, extra: string) =>
  text ? `${tag}|t:${charPrint(text.replace(/\d/g, ''))}:${charPrint(text)}` : `${tag}|a:${extra}`;

export const coarse = (sig: string) => /^[^|]*\|t:[^:]*/.exec(sig)?.[0] ?? sig;
const coarseUnit = (sig: string) => sig.split(' + ').map(coarse).join(' + ');

/**
 * 页面上这一组（各项的指纹）是不是 want 的顺序。认一项时先比全部文字，
 * 再不算数字比（只在 want 的各项不算数字也互不相同时，不然认不出谁是谁）。
 * 可以有一项认不出来（轮播的文案、时钟这种自己会变的内容）：它和 want 里那个位置的一项都找不到别的对应，
 * 其余各项都在该在的位置上，它的位置也就确定了；改之前的顺序至少有两个位置不同，不会被当成已经生效
 */
export function sameOrder(got: string[], want: string[]): boolean {
  if (got.length !== want.length) return false;
  const cw = want.map(coarseUnit);
  const byCoarse = new Set(cw).size === cw.length;
  const same = (g: string, k: number) => g === want[k] || (byCoarse && coarseUnit(g) === cw[k]);
  const off = got.flatMap((g, k) => (same(g, k) ? [] : [k]));
  if (off.length === 0) return true;
  if (off.length > 1 || want.length < 3) return false;
  const k = off[0];
  return !want.some((_, j) => same(got[k], j)) && !got.some((g) => same(g, k));
}

/** 一组里的各项在 sigs 里是不是连着出现（按不算数字的指纹比，允许一项认不出来），找父元素时先用它筛 */
export function hasRun(sigs: string[], want: string[]): boolean {
  const flat = want.flatMap((w) => w.split(' + ')).map(coarse);
  const cs = sigs.map(coarse);
  for (let i = 0; i + flat.length <= cs.length; i++) {
    let off = 0;
    for (let j = 0; j < flat.length && off < 2; j++) if (cs[i + j] !== flat[j]) off++;
    if (off < 2) return true;
  }
  return false;
}
