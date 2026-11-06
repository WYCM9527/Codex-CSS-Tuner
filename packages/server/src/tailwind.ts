import { statSync } from 'node:fs';
import { dirname } from 'node:path';
import { t } from '@css-tuner/protocol';
import { loadTailwindDesign, tailwindVersion, type TwDesign } from '@css-tuner/engine';

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
        return d;
      },
      (e) => {
        const error = (e as Error).message;
        // lightningcss 这类原生模块加载失败时，真正的错误被它自己吞掉，只剩一句找不到 .node 文件
        const native = /\.node\b|dlopen/.test(error) ? ` ${t('ext.log.nativeModule', { node: process.execPath })}` : '';
        this.log(t('ext.log.twFailed', { error }) + native);
        this.cache.delete(entry);
        return null;
      },
    );
  }
}
