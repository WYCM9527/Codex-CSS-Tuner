import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const entry = process.argv[3];
const require = createRequire(join(root, 'package.json'));

function resolveTwNode() {
  const tries = [
    () => require.resolve('@tailwindcss/node'),
    () => createRequire(require.resolve('@tailwindcss/vite')).resolve('@tailwindcss/node'),
    () => createRequire(require.resolve('@tailwindcss/postcss')).resolve('@tailwindcss/node'),
  ];
  for (const t of tries) {
    try { return t(); } catch {}
  }
  return null;
}

const nodePath = resolveTwNode();
const tw = await import(pathToFileURL(nodePath).href);
const css = readFileSync(join(root, entry), 'utf8');

const t0 = performance.now();
const ds = await tw.__unstable__loadDesignSystem(css, { base: dirname(join(root, entry)) });
const loadMs = Math.round(performance.now() - t0);

const classes = ['p-5', 'p-4.5', 'p-[18px]', 'bg-tri-void', 'text-tri-muted', 'md:px-6', 'rounded-lg', 'shadow-md', 'opacity-50', 'text-[11px]', 'font-mono', 'gap-3', 'w-[37%]', 'hover:bg-tri-void/80', 'not-a-class'];
const cssOut = ds.candidatesToCss(classes);

const canon = ds.canonicalizeCandidates(['p-[16px]', 'mt-[20px]', 'text-[14px]', 'p-[18px]', 'rounded-[8px]', 'bg-[#ff0000]', 'px-[1rem]', 'opacity-[0.5]'], { rem: 16 });

const ns = (n) => {
  const m = ds.theme.namespace(n);
  return { size: m.size, sample: Array.from(m.entries()).slice(0, 6) };
};

const t1 = performance.now();
const list = ds.getClassList();
const listMs = Math.round(performance.now() - t1);

const parsed = ds.parseCandidate('md:hover:px-6').map((c) => ({ kind: c.kind, root: c.root, value: c.value, variants: c.variants.map((v) => ds.printVariant(v)) }));

console.log(JSON.stringify({
  nodePath,
  loadMs,
  candidatesToCss: Object.fromEntries(classes.map((c, i) => [c, cssOut[i]])),
  canonicalize: canon,
  themes: {
    color: ns('--color'),
    spacing: ns('--spacing'),
    radius: ns('--radius'),
    shadow: ns('--shadow'),
    text: ns('--text'),
    fontWeight: ns('--font-weight'),
    font: ns('--font'),
  },
  resolveThemeValue: {
    spacing: ds.resolveThemeValue('--spacing'),
    triVoid: ds.resolveThemeValue('--color-tri-void'),
  },
  classList: { count: list.length, listMs, sample: list.slice(0, 3) },
  parsed,
}, null, 2));
