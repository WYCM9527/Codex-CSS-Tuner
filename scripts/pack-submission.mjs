// 生成提交到 OpenAI 插件目录用的 ZIP：插件文件夹原样打包，去掉门户「Skills only」路线不接受的截图。
// 用法：先 pnpm build，再 node scripts/pack-submission.mjs；输出 dist/css-tuner-<版本>-submission.zip
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = join(repo, 'plugins/css-tuner');
execFileSync(process.execPath, [join(repo, 'scripts/check-plugin.mjs')], { stdio: 'inherit' });

const manifest = JSON.parse(readFileSync(join(plugin, '.codex-plugin/plugin.json'), 'utf8'));
const out = join(repo, 'dist', `css-tuner-${manifest.version}-submission.zip`);
const errors = [];
const warnings = [];

const stage = mkdtempSync(join(tmpdir(), 'css-tuner-submission-'));
const root = join(stage, 'css-tuner');
try {
  cpSync(plugin, root, { recursive: true, filter: (src) => basename(src) !== '.DS_Store' && !(basename(dirname(src)) === 'assets' && basename(src).startsWith('screenshot')) });
  const m = structuredClone(manifest);
  delete m.interface.screenshots;
  writeFileSync(join(root, '.codex-plugin/plugin.json'), `${JSON.stringify(m, null, 2)}\n`);

  // 门户的 ZIP 规则：只有普通文件和目录，不超过 5000 项，单个文件不超过 100 MiB，解压后不超过 512 MiB，路径不超过 20 段
  let entries = 0;
  let total = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = relative(stage, abs);
      const st = lstatSync(abs);
      entries++;
      if (rel.split(sep).length > 20) errors.push(`${rel}: more than 20 path segments`);
      if (st.isSymbolicLink()) errors.push(`${rel}: symbolic links aren't allowed`);
      else if (st.isDirectory()) walk(abs);
      else if (!st.isFile()) errors.push(`${rel}: only regular files are allowed`);
      else {
        total += st.size;
        if (st.size > 100 * 1024 * 1024) errors.push(`${rel}: larger than 100 MiB`);
      }
    }
  };
  walk(root);
  if (entries > 5000) errors.push(`${entries} entries (at most 5000)`);
  if (total > 512 * 1024 * 1024) errors.push('larger than 512 MiB unpacked');
  if (m.hooks || m.apps || existsSync(join(root, 'hooks.json')) || existsSync(join(root, '.app.json'))) errors.push("hooks and apps can't be submitted");
  if (!m.extensions?.['com.openai']?.review?.demo_recording_url) warnings.push('No review.demo_recording_url yet: add the video walkthrough link to plugin.json, or enter it in Review details before submitting.');
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }

  mkdirSync(dirname(out), { recursive: true });
  rmSync(out, { force: true });
  // zip 保留可执行位，scripts/launch-mcp 解压后还能直接跑
  execFileSync('zip', ['-qrX', out, 'css-tuner'], { cwd: stage });
  const size = statSync(out).size;
  if (size > 100 * 1024 * 1024) {
    console.error(`✗ ${relative(repo, out)} is larger than 100 MB`);
    process.exit(1);
  }
  console.log(`✓ ${relative(repo, out)}: ${(size / 1024 / 1024).toFixed(1)} MB, ${entries} entries`);
  for (const w of warnings) console.warn(`! ${w}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
