import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { Disposable } from './events';

/**
 * 盯着一个目录树里的文件变化（递归）。不支持递归监听的平台上什么也不做，
 * 核对还有定时轮询兜底
 */
export function watchTree(root: string, onChange: (file: string) => void): Disposable {
  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(root, { recursive: true }, (_event, name) => {
      if (name) onChange(join(root, name.toString()));
    });
    watcher.on('error', () => {
      watcher?.close();
      watcher = null;
    });
  } catch {
    watcher = null;
  }
  return { dispose: () => watcher?.close() };
}
