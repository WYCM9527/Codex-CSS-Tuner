import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { bundleDir } from './paths';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (options: string[] | null) => void>();

function settleAll() {
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
  worker = null;
}

/** TS 语言服务跑在 worker 里：第一次建工程要好几秒，不能卡住页面和面板的消息 */
function ensureWorker(): Worker | null {
  if (worker) return worker;
  const file = join(bundleDir(), 'ts-worker.mjs');
  if (!existsSync(file)) return null;
  const w = new Worker(file);
  w.unref();
  w.on('message', (msg: { id: number; options: string[] | null }) => {
    pending.get(msg.id)?.(msg.options);
    pending.delete(msg.id);
  });
  w.on('error', settleAll);
  w.on('exit', settleAll);
  worker = w;
  return w;
}

/**
 * 问项目自己的 TypeScript：字符串字面量里 (line, column) 处（行列从 1 起）能补全哪些字面量，组件属性是字面量联合类型时就是它的可选值。
 * 两项以上才算；项目没装 TypeScript、问不到或超时返回 null
 */
export function literalCompletions(file: string, line: number, column: number, timeoutMs = 15000): Promise<string[] | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(null);
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, timeoutMs);
    pending.set(id, (options) => {
      clearTimeout(timer);
      resolve(options);
    });
    w.postMessage({ id, file, line, column });
  });
}

export function disposeCompletions(): void {
  void worker?.terminate();
  settleAll();
}
