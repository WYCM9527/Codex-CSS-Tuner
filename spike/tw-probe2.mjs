import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const entry = process.argv[3];
const require = createRequire(join(root, 'package.json'));
const nodePath = createRequire(require.resolve('@tailwindcss/vite')).resolve('@tailwindcss/node');
const tw = await import(pathToFileURL(nodePath).href);
const css = readFileSync(join(root, entry), 'utf8');
const ds = await tw.__unstable__loadDesignSystem(css, { base: dirname(join(root, entry)) });

const props = (c) => {
  const out = ds.candidatesToCss([c])[0];
  if (!out) return null;
  const body = out.split('@property')[0];
  return [...body.matchAll(/^\s*([a-z-]+|--[\w-]+)\s*:\s*([^;]+);/gm)].map((m) => `${m[1]}: ${m[2]}`).join(' | ');
};

const cands = ['pl-4', 'ps-4', 'px-4', 'py-4', 'p-4', 'mx-auto', 'mt-2', 'gap-4', 'gap-x-2', 'size-4', 'w-full', 'max-w-3xl', 'min-h-0', 'text-lg', 'text-2xl', 'text-sm/6', 'leading-6', 'leading-tight', 'tracking-tight', 'font-semibold', 'font-bold', 'text-center', 'text-white', 'text-ink/70', 'bg-brand', 'bg-brand/10', 'opacity-90', 'shadow-md', 'shadow-none', 'rounded', 'rounded-none', 'rounded-t-lg', 'rounded-tl-lg', 'rounded-card', 'p-(--space-4)', 'text-(length:--x)', 'text-(color:--x)', 'bg-(--x)', 'p-[12px]', 'text-[#e8590c]', 'bg-[rgb(1_2_3/0.5)]', 'leading-[1.4]', 'tracking-[0.02em]', 'font-[650]', 'opacity-[0.35]', 'shadow-[0_1px_2px_rgb(0_0_0/0.2)]', 'rounded-[10px]', 'w-[240px]', 'p-0.5', 'p-px', '-mt-2', 'md:p-8', '!p-4', 'p-4!', 'hover:bg-white/20'];
const out = {};
for (const c of cands) out[c] = props(c);
console.log(JSON.stringify(out, null, 1));

const tryCanon = (list, opts) => {
  try {
    return ds.canonicalizeCandidates(list, opts);
  } catch (e) {
    return String(e);
  }
};
console.log('canon plain', JSON.stringify(tryCanon(['px-4', 'py-4'], { rem: 16 })));
console.log('canon collapse', JSON.stringify(tryCanon(['px-4', 'py-4'], { rem: 16, collapse: true })));
console.log('canon collapse2', JSON.stringify(tryCanon(['mt-2', 'mb-2', 'p-4'], { rem: 16, collapse: true })));
console.log('canon misc', JSON.stringify(tryCanon(['p-[12px]', 'w-[240px]', 'leading-[24px]', 'tracking-[-0.025em]', 'text-[18px]', 'font-[600]', 'opacity-[0.9]', 'opacity-[90%]', 'rounded-[14px]', 'bg-[#3b5bdb]', 'text-[#ffffff]', 'p-[var(--spacing-gutter)]', 'shadow-[0_4px_6px_-1px_rgb(0_0_0/0.1),0_2px_4px_-2px_rgb(0_0_0/0.1)]', 'p-[2.5rem]', 'gap-[1rem]', 'max-w-[48rem]'], { rem: 16 })));
console.log('parse', JSON.stringify(ds.parseCandidate('md:hover:px-6').map((c) => ({ variants: c.variants.map((v) => ds.printVariant(v)), important: c.important, root: c.root }))));
console.log('parse imp', JSON.stringify(ds.parseCandidate('p-4!').map((c) => ({ important: c.important, raw: c.raw }))));
console.log('keys', Object.keys(ds).join(','));
console.log('spacing', ds.resolveThemeValue('--spacing'), 'containers', JSON.stringify(Array.from(ds.theme.namespace('--container').entries()).slice(0, 20)));
console.log('leading', JSON.stringify(Array.from(ds.theme.namespace('--leading').entries())));
console.log('tracking', JSON.stringify(Array.from(ds.theme.namespace('--tracking').entries())));
console.log('weights', JSON.stringify(Array.from(ds.theme.namespace('--font-weight').entries())));
console.log('radius', JSON.stringify(Array.from(ds.theme.namespace('--radius').entries())));
console.log('colors', ds.theme.namespace('--color').size, JSON.stringify(Array.from(ds.theme.namespace('--color').entries()).filter(([k]) => !/-\d+$/.test(k))));
