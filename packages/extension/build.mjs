import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

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
