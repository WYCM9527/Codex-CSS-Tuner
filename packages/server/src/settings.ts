import { localeFrom, type Locale, type Scope } from '@css-tuner/protocol';
import { Emitter } from './events';
import type { Memento } from './store';
import { systemLocale } from './system';

export interface SettingsData {
  /** 界面语言：auto 跟随浏览器的界面语言（Codex 内置浏览器跟着 Codex），还不知道时跟随系统 */
  language: 'auto' | Locale;
  /** 面板地址栏的默认地址 */
  defaultUrl: string;
  /** rem 换算基准（px） */
  remBase: number;
  /** Tailwind 改样式：只改这个元素，还是同一处代码渲染的全部 */
  scope: Scope;
  /** 在编辑器里打开源码：auto 依次试 Cursor、VS Code；也可以写命令，{file} {line} {column} 换成位置 */
  editor: string;
  /** 图片和视频存到哪个文件夹，null 是「下载」 */
  assetsDir: string | null;
}

export const DEFAULT_SETTINGS: SettingsData = {
  language: 'auto',
  defaultUrl: 'http://localhost:5173/',
  remBase: 16,
  scope: 'instance',
  editor: 'auto',
  assetsDir: null,
};

const valid: { [K in keyof SettingsData]: (v: unknown) => boolean } = {
  language: (v) => v === 'auto' || v === 'zh-CN' || v === 'en',
  defaultUrl: (v) => typeof v === 'string' && v.length > 0,
  remBase: (v) => typeof v === 'number' && v > 0 && v < 100,
  scope: (v) => v === 'instance' || v === 'source',
  editor: (v) => typeof v === 'string' && v.length > 0,
  assetsDir: (v) => v === null || typeof v === 'string',
};

/** 全局设置（所有项目共用），存在数据目录的 settings.json 里 */
export class Settings {
  private readonly changed = new Emitter<keyof SettingsData>();
  readonly onChange = this.changed.event;

  constructor(private readonly store: Memento) {}

  get<K extends keyof SettingsData>(key: K): SettingsData[K] {
    const v = this.store.get<unknown>(key);
    return v !== undefined && valid[key](v) ? (v as SettingsData[K]) : DEFAULT_SETTINGS[key];
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    if (!valid[key](value)) throw new Error(`invalid setting ${key}: ${JSON.stringify(value)}`);
    if (this.get(key) === value) return;
    void this.store.update(key, value);
    this.changed.fire(key);
  }

  all(): SettingsData {
    return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, this.get(k as keyof SettingsData)])) as unknown as SettingsData;
  }

  /** 界面语言：设置里选了就用选的，auto 跟随浏览器（browserLang），不知道时跟随系统 */
  locale(browserLang?: string | null): Locale {
    const v = this.get('language');
    return v === 'auto' ? localeFrom(browserLang || systemLocale()) : v;
  }
}
