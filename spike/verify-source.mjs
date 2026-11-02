import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 用法：node verify-source.mjs <结果文件> <target 名>=<项目根目录> ...
const results = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const roots = Object.fromEntries(process.argv.slice(3).map((arg) => {
  const i = arg.indexOf('=');
  return [arg.slice(0, i), arg.slice(i + 1)];
}));

for (const step of results.steps) {
  if (!step.name.endsWith(':sourceProbe') || !step.detail.ok) continue;
  const name = step.name.split(':')[0];
  const root = roots[name];
  if (!root) { console.log(`${name}: 没有给出项目根目录（${name}=/path/to/project）`); continue; }
  const { results: items } = step.detail.value;
  let exact = 0, sameLineTag = 0, owner = 0, miss = 0;
  const misses = [];
  for (const it of items) {
    if (!it.orig) { miss++; misses.push({ why: 'no orig', it }); continue; }
    let src = it.orig.source;
    let file = src.startsWith('/') && existsSync(src) ? src : join(root, src.replace(/^\/+/, ''));
    if (!existsSync(file)) {
      const u = new URL(it.frame.url);
      file = join(root, decodeURIComponent(u.pathname));
    }
    if (!existsSync(file)) { miss++; misses.push({ why: 'file not found', src, it }); continue; }
    const lines = readFileSync(file, 'utf8').split('\n');
    const line = lines[it.orig.line - 1] || '';
    const at = line.slice(it.orig.column - 1);
    const tagRe = new RegExp('^<' + it.tag + '[\\s>/]');
    if (it.hops === 0 && tagRe.test(at)) exact++;
    else if (it.hops === 0 && line.includes('<' + it.tag)) sameLineTag++;
    else if (it.hops > 0) owner++;
    else { miss++; misses.push({ why: 'tag mismatch', file: file.replace(root, ''), line: it.orig.line, col: it.orig.column, text: line.trim().slice(0, 100), tag: it.tag, cls: it.className.slice(0, 60) }); }
  }
  console.log(JSON.stringify({ name, total: items.length, exact, sameLineTag, ownerFallback: owner, miss }, null, 0));
  for (const m of misses.slice(0, 8)) console.log('  MISS', JSON.stringify(m).slice(0, 400));
  const sampleSources = [...new Set(items.filter((x) => x.orig).map((x) => x.orig.source))].slice(0, 5);
  console.log('  sources sample:', JSON.stringify(sampleSources));
}
