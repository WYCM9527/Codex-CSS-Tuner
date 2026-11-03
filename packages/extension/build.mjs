import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const fromEngine = createRequire(join(here, '../engine/package.json'));

function copyAssets() {
  const media = join(here, 'media');
  mkdirSync(media, { recursive: true });
  const bridge = join(here, '../bridge/dist/bridge.js');
  if (!existsSync(bridge)) throw new Error('先构建 @css-tuner/bridge（pnpm --filter @css-tuner/bridge build）');
  cpSync(bridge, join(media, 'bridge.js'));
  const panel = join(here, '../panel/dist');
  rmSync(join(media, 'panel'), { recursive: true, force: true });
  if (existsSync(panel)) cpSync(panel, join(media, 'panel'), { recursive: true });
  else console.warn('extension: 面板尚未构建，webview 会显示占位页');
}

const options = {
  entryPoints: [join(here, 'src/extension.ts')],
  outfile: join(here, 'dist/extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: 'linked',
  external: ['vscode', 'bufferutil', 'utf-8-validate'],
  // jsonc-parser 的 main 是 UMD，里面按参数 require 子模块，打包后找不到；改用它的 ESM 构建。
  // alias 从工作目录解析，而这个包只装在 engine 下，所以给绝对路径
  alias: { 'jsonc-parser': fromEngine.resolve('jsonc-parser/lib/esm/main.js') },
  logLevel: 'warning',
};

copyAssets();
if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('extension: watching');
} else {
  await build(options);
  console.log('extension: built dist/extension.js');
}
