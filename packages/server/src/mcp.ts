import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { THREAD_ID } from './system';
import { TOOLS, callTool, type ToolContext } from './tools';
import { VERSION } from './version';

type Id = string | number;
interface Message {
  jsonrpc: '2.0';
  id?: Id | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `CSS Tuner lets the user tweak a local web page visually (styles, text, order, component props) in a panel inside the page, then hands the changes to you to write into the source code.
- open_page starts a local proxy in front of the dev server and returns a URL; open it in the in-app browser.
- "Apply" in the panel puts a prompt with a CSS Tuner batch id into the composer of the chat that opened the page. When a message or annotation mentions a batch without the details, call get_handoff with that batch id and follow the returned instructions.
- After editing the code, call verify so CSS Tuner checks the live page, then report what matched and what didn't.`;

/** Codex 调工具时在 _meta.threadId 里带着是哪个对话 */
export function threadOf(params: Record<string, unknown> | undefined): string | undefined {
  const meta = params?._meta;
  const id = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).threadId : undefined;
  return typeof id === 'string' && THREAD_ID.test(id) ? id : undefined;
}

/**
 * MCP 服务（stdio，一行一个 JSON-RPC 消息）：Codex 每个对话起一个，工具调用转给后台服务。
 * 日志只写标准错误，标准输出只给协议消息
 */
export function runMcp(): void {
  const send = (msg: Message) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const reply = (id: Id, result: unknown) => send({ jsonrpc: '2.0', id, result });
  const fail = (id: Id, code: number, message: string) => send({ jsonrpc: '2.0', id, error: { code, message } });

  let seq = 0;
  const waiting = new Map<Id, (m: Message) => void>();
  const request = (method: string, params?: Record<string, unknown>, timeoutMs = 5000): Promise<Message | null> =>
    new Promise((resolve) => {
      const id = `css-tuner-${++seq}`;
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve(null);
      }, timeoutMs);
      waiting.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
    });

  let clientRoots = false;
  const ctx: ToolContext = {
    async defaultRoot() {
      if (!clientRoots) return null;
      const res = await request('roots/list');
      const roots = (res?.result as { roots?: Array<{ uri: string }> } | undefined)?.roots ?? [];
      const first = roots.find((r) => r.uri.startsWith('file://'));
      return first ? fileURLToPath(first.uri) : null;
    },
  };

  const handle = async (msg: Message) => {
    if (msg.method === undefined) {
      // 我们发出去的请求（roots/list）的回复
      if (msg.id !== undefined && msg.id !== null) waiting.get(msg.id)?.(msg);
      return;
    }
    const id = msg.id;
    const notification = id === undefined || id === null;
    switch (msg.method) {
      case 'initialize': {
        const asked = String(msg.params?.protocolVersion ?? '');
        clientRoots = !!(msg.params?.capabilities as { roots?: unknown } | undefined)?.roots;
        reply(id!, {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'css-tuner', title: 'CSS Tuner', version: VERSION },
          instructions: INSTRUCTIONS,
        });
        return;
      }
      case 'ping':
        if (!notification) reply(id, {});
        return;
      case 'tools/list':
        if (!notification) reply(id, { tools: TOOLS });
        return;
      case 'tools/call': {
        if (notification) return;
        const name = String(msg.params?.name ?? '');
        const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          reply(id, await callTool(name, args, { ...ctx, thread: threadOf(msg.params) }));
        } catch (e) {
          reply(id, { content: [{ type: 'text', text: (e as Error).message }], isError: true });
        }
        return;
      }
      default:
        if (!notification) fail(id, -32601, `Method not found: ${msg.method}`);
    }
  };

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: Message;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    handle(msg).catch((e) => console.error('[css-tuner]', e));
  });
  rl.on('close', () => process.exit(0));
}
