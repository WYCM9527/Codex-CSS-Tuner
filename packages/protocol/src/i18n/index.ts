import { en } from './en';
import { zhCN } from './zh-CN';

export type Locale = 'en' | 'zh-CN';
export type MsgKey = keyof typeof en;
export type MsgParams = Record<string, string | number>;

export const CATALOGS: Record<Locale, Record<MsgKey, string>> = { en, 'zh-CN': zhCN };

let current: Locale = 'en';

/** 浏览器或系统的语言（如 zh-CN、zh-tw、en-US）换算成界面语言：中文一律用简体，其余用英文 */
export function localeFrom(lang: string | null | undefined): Locale {
  return /^zh(-|$)/i.test(lang ?? '') ? 'zh-CN' : 'en';
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** `{name}` 换成参数；`{n|单数|复数}` 按 n 是否为 1 选写法（英文用，中文文案直接写 `{n}`） */
export function format(text: string, params?: MsgParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (m, name: string, one?: string, other?: string) => {
    const v = params[name];
    if (v === undefined) return m;
    if (one !== undefined) return Number(v) === 1 ? one : (other ?? one);
    return String(v);
  });
}

export function t(key: MsgKey, params?: MsgParams): string {
  return format(CATALOGS[current][key] ?? en[key] ?? key, params);
}

/** 文案里用到的参数名（含单复数写法），测试两种语言的占位符一致用 */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)(?:\|[^|}]*\|[^}]*)?\}/g)].map((m) => m[1]))].sort();
}
