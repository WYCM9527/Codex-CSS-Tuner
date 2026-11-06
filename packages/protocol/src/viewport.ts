import type { Breakpoint, PageEnv, ViewportBand, ViewportPreset, ViewportView } from './messages';

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

type FrameEnv = Pick<PageEnv, 'w' | 'framed' | 'fit'>;

/** 页面现在是哪一档：设备框定了宽度时按框的宽度对上（对不上就看落在哪一档），不在设备框里或者框跟着剩下的地方走都是实际宽度 */
export function presetOf(env: FrameEnv | null, bands: ViewportView['bands']): ViewportPreset {
  if (!env?.framed || env.fit) return 'actual';
  return (['mobile', 'tablet', 'desktop'] as const).find((b) => bands[b].width === env.w) ?? bandOf(env.w, bands);
}

/** 页面已经按 width 显示了吗：null 是实际宽度（不在设备框里，或者框跟着剩下的地方走），数字是设备框定成了这个宽度 */
export function frameSettled(width: number | null, env: FrameEnv): boolean {
  return width === null ? !env.framed || env.fit : env.framed && !env.fit && env.w === width;
}
