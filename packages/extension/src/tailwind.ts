import { statSync } from 'node:fs';
import { dirname } from 'node:path';
import { t } from '@css-tuner/protocol';
import { editTailwind, loadTailwindDesign, tailwindVersion, type TwDesign } from '@css-tuner/engine';

/** 首次解析 TSX、首次生成工具类 CSS 都要预热几百毫秒，加载完设计系统就先跑一遍，应用时才能 1 秒内生效 */
function warmUp(d: TwDesign) {
  const source = 'export const A = () => <div className="flex px-4 py-2 text-sm text-white bg-black rounded-md shadow-sm" />;\n';
  editTailwind(d, { file: '/warmup.tsx', source, line: 1, column: 24, props: ['padding-left', 'padding-right'], value: '1.5rem', token: '6', utility: 'px-4' });
}

/** 按 CSS 入口文件缓存设计系统；入口文件改过（比如改了 @theme）就重新加载 */
export class TailwindService {
  private cache = new Map<string, { mtime: number; rem: number; design: Promise<TwDesign> }>();
  private versions = new Map<string, string | null>();

  constructor(private readonly log: (msg: string) => void) {}

  /** 入口文件所在项目装的 tailwindcss 版本号 */
  versionFor(entry: string): string | null {
    const dir = dirname(entry);
    if (!this.versions.has(dir)) this.versions.set(dir, tailwindVersion(dir));
    return this.versions.get(dir) ?? null;
  }

  designFor(entry: string, rem: number): Promise<TwDesign | null> {
    let mtime = 0;
    try {
      mtime = statSync(entry).mtimeMs;
    } catch {
      return Promise.resolve(null);
    }
    const hit = this.cache.get(entry);
    if (hit && hit.mtime === mtime && hit.rem === rem) return hit.design.catch(() => null);
    const t0 = Date.now();
    const design = loadTailwindDesign(entry, { rem });
    this.cache.set(entry, { mtime, rem, design });
    return design.then(
      (d) => {
        this.log(t('ext.log.twLoaded', { entry, ms: Date.now() - t0 }));
        setTimeout(() => {
          try {
            warmUp(d);
          } catch {
            /* 预热失败不影响使用 */
          }
        }, 0);
        return d;
      },
      (e) => {
        this.log(t('ext.log.twFailed', { error: (e as Error).message }));
        this.cache.delete(entry);
        return null;
      },
    );
  }
}
