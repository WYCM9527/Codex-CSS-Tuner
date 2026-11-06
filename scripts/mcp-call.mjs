// 像 Codex 那样调一次插件的 MCP 工具（走插件自己的启动脚本），端到端测试时代替 Codex 取交接、核对。
// 用法：node scripts/mcp-call.mjs <工具> '<JSON 参数>'，比如 node scripts/mcp-call.mjs get_handoff '{"projectRoot":"/abs/path"}'
// CSS_TUNER_DATA 换数据目录，和 cli.mjs 用同一个才能连到同一个后台服务
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const plugin = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'plugins/css-tuner');
const [tool, raw = '{}'] = process.argv.slice(2);
if (!tool) {
  console.error("usage: node scripts/mcp-call.mjs <tool> '<json args>'");
  process.exit(64);
}
const child = spawn(join(plugin, 'scripts/launch-mcp'), ['./server/mcp.mjs'], { cwd: plugin, stdio: ['pipe', 'pipe', 'inherit'] });
const waiting = new Map();
createInterface({ input: child.stdout }).on('line', (line) => {
  const msg = JSON.parse(line);
  waiting.get(msg.id)?.(msg);
});
let seq = 0;
const call = (method, params) =>
  new Promise((res) => {
    const id = ++seq;
    waiting.set(id, res);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-call', version: '0' } });
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
const r = await call('tools/call', { name: tool, arguments: JSON.parse(raw) });
if (r.error) {
  console.error(r.error.message);
  process.exitCode = 1;
} else {
  for (const c of r.result.content) if (c.type === 'text') console.log(c.text);
  if (r.result.isError) process.exitCode = 1;
}
child.stdin.end();
child.kill();
