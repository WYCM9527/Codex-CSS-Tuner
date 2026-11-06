// 端到端冒烟：起打包好的 MCP 服务（它会拉起后台服务），走一遍握手、列工具、打开静态页、查状态、关掉。
// 用法：node scripts/mcp-smoke.mjs [项目目录] [地址]（默认 fixtures/static-html 和 index.html）
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = join(repo, 'plugins/css-tuner');
const project = resolve(process.argv[2] ?? join(repo, 'fixtures/static-html'));
const url = process.argv[3] ?? 'index.html';
const data = process.env.CSS_TUNER_DATA ?? mkdtempSync(join(tmpdir(), 'css-tuner-smoke-'));
const keep = !!process.env.CSS_TUNER_DATA || process.argv.includes('--keep');

const child = spawn(join(plugin, 'scripts/launch-mcp'), ['./server/mcp.mjs'], {
  cwd: plugin,
  env: { ...process.env, CSS_TUNER_DATA: data },
  stdio: ['pipe', 'pipe', 'inherit'],
});
const waiting = new Map();
let seq = 0;
createInterface({ input: child.stdout }).on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.id !== undefined && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  } else console.log('<-', line);
});
const call = (method, params) =>
  new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => rej(new Error(`${method} timed out`)), 60000);
    waiting.set(id, (m) => {
      clearTimeout(timer);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
const tool = async (name, args) => {
  const r = await call('tools/call', { name, arguments: args });
  console.log(`\n## ${name}${r.isError ? ' (error)' : ''}\n${r.content.map((c) => c.text).join('\n')}`);
  return r;
};

try {
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  console.log('server:', init.serverInfo, 'protocol:', init.protocolVersion);
  notify('notifications/initialized');
  const { tools } = await call('tools/list', {});
  console.log('tools:', tools.map((t) => t.name).join(', '));
  const open = await tool('open_page', { projectRoot: project, url });
  const page = open.structuredContent?.url;
  if (page) {
    const res = await fetch(page, { headers: { accept: 'text/html', 'sec-fetch-dest': 'document' } });
    const html = await res.text();
    console.log(`\nGET ${page} → ${res.status}, bridge tag ${html.includes('/__css_tuner__/bridge.js') ? 'injected' : 'MISSING'}`);
    const bridge = await fetch(new URL('/__css_tuner__/bridge.js', page));
    console.log(`GET bridge.js → ${bridge.status}, ${(await bridge.text()).length} bytes`);
  }
  await tool('status', { projectRoot: project });
  await tool('get_handoff', { projectRoot: project });
  if (!process.argv.includes('--leave-open')) await tool('close_page', { projectRoot: project });
} catch (e) {
  console.error('smoke failed:', e);
  process.exitCode = 1;
} finally {
  child.stdin.end();
  if (!keep) {
    const stop = spawn(process.execPath, [join(plugin, 'server/cli.mjs'), 'stop'], { env: { ...process.env, CSS_TUNER_DATA: data }, stdio: 'inherit' });
    await new Promise((r) => stop.on('exit', r));
    rmSync(data, { recursive: true, force: true });
  } else console.log(`\ndata dir kept: ${data}`);
}
