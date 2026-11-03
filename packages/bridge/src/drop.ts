/** 页面上拖动换序时的落点、插入线和预览要挪的距离：只做几何计算，不碰 DOM */

/**
 * 指针在 (x, y) 时的插入位置（0..n，按页面上现在看到的顺序）：找离指针最近的一项，看指针在它中线的哪一侧
 */
export function dropSlot(boxes: DOMRect[], x: number, y: number, axis: 'x' | 'y'): number {
  let best = 0;
  let dist = Infinity;
  boxes.forEach((b, i) => {
    const dx = Math.max(b.left - x, 0, x - b.right);
    const dy = Math.max(b.top - y, 0, y - b.bottom);
    const d = Math.hypot(dx, dy);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  const b = boxes[best];
  const after = axis === 'y' ? y > b.top + b.height / 2 : x > b.left + b.width / 2;
  return best + (after ? 1 : 0);
}

/** 插入线的位置：在第 slot 项前面（slot = n 时在最后一项后面） */
export function slotLine(boxes: DOMRect[], slot: number, axis: 'x' | 'y'): { x: number; y: number; w: number; h: number } {
  const prev = boxes[slot - 1];
  const next = boxes[slot];
  if (axis === 'y') {
    const y = prev && next ? (prev.bottom + next.top) / 2 : prev ? prev.bottom + 2 : next.top - 2;
    const ref = next ?? prev;
    return { x: ref.left, y: y - 1, w: ref.width, h: 2 };
  }
  const x = prev && next && Math.abs(prev.top - next.top) < Math.min(prev.height, next.height) / 2 ? (prev.right + next.left) / 2 : next ? next.left - 2 : prev.right + 2;
  const ref = next ?? prev;
  return { x: x - 1, y: ref.top, w: 2, h: ref.height };
}

/** 竖直方向重叠超过矮的那个的一半，算同一行 */
const onSameRow = (a: DOMRect, b: DOMRect) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) / 2;

/**
 * 普通流里各项按新顺序摆放要挪的 [dx, dy]（下标是原来的第几项）：排成一列或一行时按各项大小和原来的间距重新排；
 * 有几项挤在同一行（块级元素后面跟着一排按钮）、或一行排满折到下一行时，每项挪到新位置上原来那一项的地方
 */
export function flowOffsets(boxes: DOMRect[], order: number[], axis: 'x' | 'y'): Array<[number, number]> {
  const out = boxes.map((): [number, number] => [0, 0]);
  const linear = boxes.every((b, k) => k === 0 || onSameRow(boxes[k - 1], b) === (axis === 'x'));
  if (!linear) {
    order.forEach((i, k) => {
      out[i] = [boxes[k].left - boxes[i].left, boxes[k].top - boxes[i].top];
    });
    return out;
  }
  const lead = (b: DOMRect) => (axis === 'y' ? b.top : b.left);
  const size = (b: DOMRect) => (axis === 'y' ? b.height : b.width);
  let pos = lead(boxes[0]);
  for (let k = 0; k < boxes.length; k++) {
    const i = order[k];
    const d = pos - lead(boxes[i]);
    out[i] = axis === 'x' ? [d, 0] : [0, d];
    pos += size(boxes[i]);
    if (k + 1 < boxes.length) pos += lead(boxes[k + 1]) - (lead(boxes[k]) + size(boxes[k]));
  }
  return out;
}
