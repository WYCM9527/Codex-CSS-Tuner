import { build } from 'esbuild';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'extensions/chromium');
const output = join(root, 'dist/css-tuner-chrome');
await mkdir(output, { recursive: true });
await Promise.all([
  build({
    entryPoints: {
      bridge: join(root, 'packages/bridge/src/chrome-entry.ts'),
      content: join(root, 'packages/panel/src/chrome-entry.tsx'),
    },
    outdir: output,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome116',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'panel-css',
      setup(build) {
        build.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
          path: relative(root, resolve(args.resolveDir, args.path.replace(/\?inline$/, ''))), namespace: 'panel-css',
        }));
        build.onLoad({ filter: /.*/, namespace: 'panel-css' }, async (args) => {
          const file = resolve(root, args.path);
          return { contents: await readFile(file, 'utf8'), loader: 'text', resolveDir: dirname(file) };
        });
      },
    }],
  }),
  ...['manifest.json', 'background.js', 'connect.js', 'dock.css', 'popup.html', 'popup.css', 'popup.js'].map((file) => cp(join(source, file), join(output, file))),
  cp(join(source, 'icon.png'), join(output, 'icon.png')),
  cp(join(root, 'LICENSE'), join(output, 'LICENSE')),
]);
console.log(`Chrome extension built in ${output}`);
