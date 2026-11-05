import type { Breakpoint, ViewportBand, ViewportView } from './messages';

export const MOBILE_WIDTH = 390;

/** 普通 CSS 项目（和主题里没有 md、lg 的 Tailwind 项目）用的断点 */
export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { name: 'md', px: 768 },
  { name: 'lg', px: 1024 },
];

/** 平板从 md 起、桌面从 lg 起；主题里没有这个名字时用默认宽度，也就没有前缀 */
export function viewportBands(breakpoints: Breakpoint[], tailwind: boolean): ViewportView['bands'] {
  const at = (name: string) => {
    const own = breakpoints.find((b) => b.name === name);
    const width = own?.px ?? DEFAULT_BREAKPOINTS.find((b) => b.name === name)!.px;
    return { width, prefix: tailwind && own ? name : null };
  };
  return { mobile: { width: MOBILE_WIDTH, prefix: null }, tablet: at('md'), desktop: at('lg') };
}

/** 页面宽度落在哪一档：平板的宽度以下是手机，到桌面的宽度以下是平板 */
export function bandOf(width: number, bands: ViewportView['bands']): ViewportBand {
  if (width >= bands.desktop.width) return 'desktop';
  if (width >= bands.tablet.width) return 'tablet';
  return 'mobile';
}
