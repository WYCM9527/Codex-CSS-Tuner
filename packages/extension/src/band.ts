import type { ViewportBand, ViewportView } from '@css-tuner/protocol';

/** 改动只管视口的哪一档：档名和宽度范围（max 不含，桌面没有上限） */
export interface RecordBand {
  name: ViewportBand;
  min: number;
  max: number | null;
}

export function bandRange(name: ViewportBand, bands: ViewportView['bands']): RecordBand {
  if (name === 'mobile') return { name, min: 0, max: bands.tablet.width };
  if (name === 'tablet') return { name, min: bands.tablet.width, max: bands.desktop.width };
  return { name, min: bands.desktop.width, max: null };
}
