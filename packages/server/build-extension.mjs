import { build } from 'esbuild';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../dist/css-tuner-extension-companion');
const fromEngine = createRequire(join(here, '../engine/package.json'));
const { version } = JSON.parse(readFileSync(join(here, '../../extensions/chromium/manifest.json'), 'utf8'));

rmSync(join(out, 'chunks'), { recursive: true, force: true });
await build({
  entryPoints: {
    daemon: join(here, 'src/bin/extension-daemon.ts'),
    cli: join(here, 'src/bin/extension-cli.ts'),
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
  legalComments: 'eof',
  define: { __CSS_TUNER_VERSION__: JSON.stringify(version) },
  banner: { js: "import { createRequire as __cssTunerRequire } from 'node:module';\nconst require = __cssTunerRequire(import.meta.url);" },
  external: ['bufferutil', 'utf-8-validate'],
  alias: { 'jsonc-parser': fromEngine.resolve('jsonc-parser/lib/esm/main.js') },
});
copyFileSync(join(here, '../../LICENSE'), join(out, 'LICENSE'));
console.log(`extension companion: built ${out}`);
