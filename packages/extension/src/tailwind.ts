import { statSync } from 'node:fs';
import { dirname } from 'node:path';
import { t } from '@css-tuner/protocol';
import { editTailwind, loadTailwindDesign, tailwindVersion, type TwDesign } from '@css-tuner/engine';

/** 首次解析 TSX、首次生成工具类 CSS 都要预热几百毫秒，加载完设计系统就先跑一遍，应用时才能 1 秒内生效 */
function warmUp(d: TwDesign) {
  const source = 'export const A = () => <div className="flex px-4 py-2 text-sm text-white bg-black rounded-md shadow-sm" />;\n';
  editTailwind(d, { file: '/warmup.tsx', source, line: 1, column: 24, props: ['padding-left', 'padding-right'], value: '1.5rem', token: '6', utility: 'px-4' });
}

/** 文件的修改时间拼起来，有一个变了（或被删了）就不一样 */
function stamp(files: string[]): string {
  return files
    .map((f) => {
      try {
        return String(statSync(f).mtimeMs);
      } catch {
        return '-';
      }
    })
    .join('|');
}

/** 按 CSS 入口文件缓存设计系统；入口文件（比如改了 @theme）或 v3 的 tailwind.config 改过就重新加载 */
export class TailwindService {
  private cache = new Map<string, { files: string[]; stamp: string; rem: number; design: Promise<TwDesign> }>();
  private versions = new Map<string, string | null>();

  constructor(private readonly log: (msg: string) => void) {}

  /** 入口文件所在项目装的 tailwindcss 版本号 */
  versionFor(entry: string): string | null {
    const dir = dirname(entry);
    if (!this.versions.has(dir)) this.versions.set(dir, tailwindVersion(dir));
    return this.versions.get(dir) ?? null;
  }

  designFor(entry: string, rem: number): Promise<TwDesign | null> {
    const hit = this.cache.get(entry);
    const now = stamp(hit?.files ?? [entry]);
    if (now.startsWith('-')) return Promise.resolve(null);
    if (hit && hit.stamp === now && hit.rem === rem) return hit.design.catch(() => null);
    const t0 = Date.now();
    const design = loadTailwindDesign(entry, { rem });
    const record = { files: [entry], stamp: stamp([entry]), rem, design };
    this.cache.set(entry, record);
    return design.then(
      (d) => {
        if (d.files.length) {
          record.files = d.files;
          record.stamp = stamp(d.files);
        }
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
