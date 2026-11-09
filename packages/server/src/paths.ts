import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 数据目录：每个 Codex 对话的 MCP 服务、命令行和后台服务都要找到同一个（后台服务只有一个），
 * 所以固定放在 ~/.css-tuner；CSS_TUNER_DATA 可以换地方（测试用）
 */
export function dataDir(): string {
  const v = process.env.CSS_TUNER_DATA;
  return resolve(v && !v.includes('${') ? v : join(homedir(), '.css-tuner'));
}

/** Chrome 扩展的后台服务单独存放数据，不使用 MCP 插件的数据目录。 */
export function extensionDataDir(): string {
  const v = process.env.CSS_TUNER_EXTENSION_DATA;
  const dir = resolve(v && !v.includes('${') ? v : join(homedir(), '.css-tuner-extension'));
  if (dir === dataDir() || dir === join(homedir(), '.css-tuner')) {
    throw new Error('CSS_TUNER_EXTENSION_DATA must use a directory separate from the CSS Tuner plugin');
  }
  return dir;
}

/** 每个项目一个子目录：改动清单、交给 Codex 前的文件副本、交接批次 */
export function projectDir(data: string, root: string): string {
  const abs = resolve(root);
  const hash = createHash('sha1').update(abs).digest('hex').slice(0, 10);
  const name = basename(abs).replace(/[^\w.-]+/g, '_').slice(0, 40) || 'root';
  return join(data, 'projects', `${name}-${hash}`);
}

/** 构建产物所在目录（server/*.mjs）：bridge.js 和面板在旁边的 public/ 里；共用的代码在 chunks/ 下 */
export function bundleDir(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return basename(dir) === 'chunks' ? dirname(dir) : dir;
}
