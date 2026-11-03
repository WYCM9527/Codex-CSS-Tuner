import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { t } from '@css-tuner/protocol';
import { physical } from '../physical';

/** @tailwindcss/node 的 __unstable__loadDesignSystem 返回值里用到的部分 */
export interface RawDesignSystem {
  candidatesToCss(candidates: string[]): Array<string | null>;
  canonicalizeCandidates?(candidates: string[], opts?: { rem?: number }): string[];
  theme: { namespace(ns: string): Map<string | null, string> };
  resolveThemeValue(path: string): string | undefined;
}

export interface UtilityInfo {
  /** 工具类确定设置的物理长属性 */
  hard: Set<string>;
  /** 只是给个默认值、可被别的工具类覆盖的属性（如 text-lg 的行高） */
  soft: Set<string>;
  /** 物理属性 → 生成的值 */
  values: Map<string, string>;
  important: boolean;
}

const DECL = /^\s*(--[\w-]+|[a-z-]+)\s*:\s*(.+?)\s*;\s*$/gm;

export class TwDesign {
  private cssCache = new Map<string, string | null>();
  private infoCache = new Map<string, UtilityInfo | null>();

  constructor(
    readonly raw: RawDesignSystem,
    readonly rem = 16,
  ) {}

  css(candidate: string): string | null {
    if (this.cssCache.has(candidate)) return this.cssCache.get(candidate)!;
    let out: string | null = null;
    try {
      out = this.raw.candidatesToCss([candidate])[0] ?? null;
    } catch {
      out = null;
    }
    this.cssCache.set(candidate, out);
    return out;
  }

  valid(candidate: string): boolean {
    return this.css(candidate) !== null;
  }

  info(candidate: string): UtilityInfo | null {
    if (this.infoCache.has(candidate)) return this.infoCache.get(candidate)!;
    const css = this.css(candidate);
    let info: UtilityInfo | null = null;
    if (css) {
      const body = css.split('@property')[0];
      info = { hard: new Set(), soft: new Set(), values: new Map(), important: false };
      for (const m of body.matchAll(DECL)) {
        const prop = m[1];
        if (prop.startsWith('--')) continue;
        let value = m[2];
        if (/\s!important$/.test(value)) {
          info.important = true;
          value = value.replace(/\s*!important$/, '');
        }
        const soft = /^var\(--tw-[\w-]+\s*,/.test(value);
        for (const p of physical(prop)) {
          (soft ? info.soft : info.hard).add(p);
          info.values.set(p, value);
        }
      }
      for (const p of info.hard) info.soft.delete(p);
    }
    this.infoCache.set(candidate, info);
    return info;
  }

  /** 规范写法：p-[16px] → p-4、bg-[#3b5bdb] → bg-brand */
  canonical(candidate: string): string {
    if (!this.raw.canonicalizeCandidates) return candidate;
    try {
      return this.raw.canonicalizeCandidates([candidate], { rem: this.rem })[0] ?? candidate;
    } catch {
      return candidate;
    }
  }

  namespace(ns: string): Array<[string | null, string]> {
    try {
      return Array.from(this.raw.theme.namespace(ns).entries());
    } catch {
      return [];
    }
  }

  themeValue(path: string): string | null {
    try {
      return this.raw.resolveThemeValue(path) ?? null;
    } catch {
      return null;
    }
  }
}

/** 从项目里找 @tailwindcss/node：直接依赖，或者 @tailwindcss/vite / postcss / cli 带进来的 */
export function resolveTailwindNode(fromDir: string): string | null {
  const req = createRequire(join(fromDir, '__css_tuner__.js'));
  const tries = [
    () => req.resolve('@tailwindcss/node'),
    () => createRequire(req.resolve('@tailwindcss/vite')).resolve('@tailwindcss/node'),
    () => createRequire(req.resolve('@tailwindcss/postcss')).resolve('@tailwindcss/node'),
    () => createRequire(req.resolve('@tailwindcss/cli')).resolve('@tailwindcss/node'),
  ];
  for (const t of tries) {
    try {
      return t();
    } catch {
      /* 继续试下一个 */
    }
  }
  return null;
}

/** 项目装的 tailwindcss 版本号（从包入口往上找它的 package.json），找不到返回 null */
export function tailwindVersion(fromDir: string): string | null {
  let dir: string;
  try {
    dir = dirname(createRequire(join(fromDir, '__css_tuner__.js')).resolve('tailwindcss'));
  } catch {
    return null;
  }
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string; version?: string };
      if (pkg.name === 'tailwindcss') return pkg.version ?? null;
    } catch {
      /* 继续往上找 */
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** 用项目自己的 Tailwind 版本加载设计系统；entryFile 是含 @import "tailwindcss" 的 CSS 入口 */
export async function loadTailwindDesign(entryFile: string, opts: { rem?: number; css?: string } = {}): Promise<TwDesign> {
  const base = dirname(entryFile);
  const nodePath = resolveTailwindNode(base);
  if (!nodePath) throw new Error(t('engine.tw.noNode'));
  const mod = (await import(pathToFileURL(nodePath).href)) as {
    __unstable__loadDesignSystem?: (css: string, o: { base: string }) => Promise<RawDesignSystem>;
  };
  if (typeof mod.__unstable__loadDesignSystem !== 'function') throw new Error(t('engine.tw.noDesignApi'));
  const css = opts.css ?? readFileSync(entryFile, 'utf8');
  const ds = await mod.__unstable__loadDesignSystem(css, { base });
  return new TwDesign(ds, opts.rem ?? 16);
}
