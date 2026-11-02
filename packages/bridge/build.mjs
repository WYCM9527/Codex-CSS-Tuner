import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist', 'bridge.js');

const result = await build({
  entryPoints: [join(here, 'src', 'index.ts')],
  bundle: true,
  format: 'iife',
  globalName: '__cssTunerBridge',
  target: 'es2022',
  platform: 'browser',
  minify: false,
  legalComments: 'none',
  write: false,
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, result.outputFiles[0].text);
console.log(`bridge: ${(result.outputFiles[0].text.length / 1024).toFixed(1)} KB → ${out}`);
