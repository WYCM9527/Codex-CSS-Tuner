import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const fromEngine = createRequire(join(here, '../engine/package.json'));
const { version } = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
/** 插件包里的服务端：mcp.json 指向这里的 mcp.mjs */
const out = join(here, '../../plugins/css-tuner/server');

function copyAssets() {
  const pub = join(out, 'public');
  rmSync(pub, { recursive: true, force: true });
  mkdirSync(pub, { recursive: true });
  const bridge = join(here, '../bridge/dist/bridge.js');
  if (!existsSync(bridge)) throw new Error('先构建 @css-tuner/bridge（pnpm --filter @css-tuner/bridge build）');
  cpSync(bridge, join(pub, 'bridge.js'));
  const panel = join(here, '../panel/dist');
  if (!existsSync(join(panel, 'index.js'))) throw new Error('先构建 @css-tuner/panel（pnpm --filter @css-tuner/panel build）');
  cpSync(panel, join(pub, 'panel'), { recursive: true });
  // 面板页由本地服务生成（带连接参数），开发用的 index.html 不要
  rmSync(join(pub, 'panel', 'index.html'), { force: true });
}

const options = {
  entryPoints: {
    mcp: join(here, 'src/bin/mcp.ts'),
    daemon: join(here, 'src/bin/daemon.ts'),
    cli: join(here, 'src/bin/cli.ts'),
    'ts-worker': join(here, 'src/ts-worker.ts'),
  },
  outdir: out,
  outExtension: { '.js': '.mjs' },
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  minifyWhitespace: true,
  minifySyntax: true,
  legalComments: 'none',
  define: { __CSS_TUNER_VERSION__: JSON.stringify(version) },
  // 打包进来的 CommonJS 依赖（ws、postcss）里还有 require
  banner: { js: "import { createRequire as __cssTunerRequire } from 'node:module';\nconst require = __cssTunerRequire(import.meta.url);" },
  external: ['bufferutil', 'utf-8-validate'],
  // jsonc-parser 的 main 是 UMD，里面按参数 require 子模块，打包后找不到；改用它的 ESM 构建。
  // alias 从工作目录解析，而这个包只装在 engine 下，所以给绝对路径
  alias: { 'jsonc-parser': fromEngine.resolve('jsonc-parser/lib/esm/main.js') },
  logLevel: 'warning',
};

rmSync(join(out, 'chunks'), { recursive: true, force: true });
copyAssets();
if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('server: watching');
} else {
  await build(options);
  console.log(`server: built ${out}`);
}
