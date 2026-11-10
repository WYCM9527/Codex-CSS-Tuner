import type { ChangeStatus } from '@css-tuner/protocol';
import { rpc } from './client';
import type { ChangeSummary } from './rpc';

export interface ToolContext {
  /** 客户端给了工作目录（MCP roots）时用第一个 */
  defaultRoot(): Promise<string | null>;
  /** 调用这个工具的 Codex 对话 */
  thread?: string;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const projectRoot = {
  type: 'string',
  description: 'Absolute path of the project you are working in (your current working directory). Omit to use the project CSS Tuner was used with most recently.',
} as const;

const STATUSES: ChangeStatus[] = ['pending', 'handoff', 'applied', 'reverting', 'reverted'];

export const TOOLS = [
  {
    name: 'open_page',
    title: 'Open a page in CSS Tuner',
    description:
      'Start CSS Tuner for a project and get the URL to open in the in-app browser. For a dev server URL, CSS Tuner runs a local proxy that adds its tuning panel to the page (hot reload keeps working); for a local HTML file or folder it serves the files itself. If a CSS Tuner page is already open and connected, it navigates there.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { ...projectRoot, description: 'Absolute path of the project you are working in (your current working directory).' },
        url: {
          type: 'string',
          description: 'Dev server URL such as http://localhost:3000/pricing, or a local HTML file or folder (absolute, or relative to projectRoot). Defaults to http://localhost:5173/.',
        },
      },
      required: ['projectRoot'],
      additionalProperties: false,
    },
    annotations: { title: 'Open a page in CSS Tuner', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'status',
    title: 'CSS Tuner status',
    description: 'Show whether the CSS Tuner page is connected, which page it is on, and how many changes are pending, handed off, or applied. Set waitForPageMs to wait for the page to connect after opening it.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot,
        waitForPageMs: { type: 'integer', minimum: 0, maximum: 60000, description: 'Wait up to this long for the page to connect.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'CSS Tuner status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_handoff',
    title: 'Get changes to write into code',
    description:
      'Get the instructions for a batch of visual changes the user made in CSS Tuner: what changed on which element, the source location CSS Tuner found, and how to write it. Use the batch id from the CSS Tuner annotation or message. Without a batch, returns the latest batch still waiting; with includePending, takes the changes the user has not applied yet.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot,
        batch: { type: 'string', description: 'Batch id from the CSS Tuner annotation, e.g. "a1b2c3".' },
        includePending: { type: 'boolean', description: 'If no batch is waiting, hand off the changes the user has not applied yet.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Get changes to write into code', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'verify',
    title: 'Check changes on the page',
    description:
      'After editing the code for a handoff, ask CSS Tuner to check the live page: each change is marked applied when the page shows the new value, otherwise you get what the page shows now. Waits for hot reload (default 6 s).',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot,
        waitMs: { type: 'integer', minimum: 500, maximum: 30000, description: 'How long to keep checking (default 6000).' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Check changes on the page', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_changes',
    title: 'List CSS Tuner changes',
    description: 'List the changes in the CSS Tuner panel with their status (pending, handoff, applied, reverting, reverted) and source locations.',
    inputSchema: {
      type: 'object',
      properties: { projectRoot, status: { type: 'string', enum: STATUSES, description: 'Only changes with this status.' } },
      additionalProperties: false,
    },
    annotations: { title: 'List CSS Tuner changes', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'close_page',
    title: 'Stop CSS Tuner sites',
    description: "Stop the project's CSS Tuner proxy and static sites (the page loses its panel). Changes stay in the list.",
    inputSchema: {
      type: 'object',
      properties: { projectRoot, all: { type: 'boolean', description: 'Stop the sites of every project.' } },
      additionalProperties: false,
    },
    annotations: { title: 'Stop CSS Tuner sites', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

const STATUS_TEXT: Record<ChangeStatus, string> = {
  pending: 'not applied yet',
  handoff: 'waiting for the code change',
  applied: 'applied',
  reverting: 'waiting for the revert',
  reverted: 'reverted',
};

function line(c: ChangeSummary): string {
  const note = c.note ? ` — ${c.note}` : '';
  return `- [${STATUS_TEXT[c.status]}] ${c.element} ${c.change}: ${c.from} → ${c.to} (${c.where})${note}`;
}

function text(t: string, data?: object, isError = false): ToolResult {
  return { content: [{ type: 'text', text: t }], ...(data ? { structuredContent: data as Record<string, unknown> } : {}), ...(isError ? { isError } : {}) };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export async function callTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const root = str(args.projectRoot) ?? (await ctx.defaultRoot()) ?? undefined;
  const thread = ctx.thread;
  switch (name) {
    case 'open_page': {
      if (!root) return text('projectRoot is required: pass the absolute path of the project you are working in.', undefined, true);
      const r = await rpc('open', { root, url: str(args.url), thread });
      const lines = [`Open this URL in the in-app browser: ${r.url}`];
      if (r.kind === 'proxy') lines.push(`It shows ${r.target} with the CSS Tuner panel added.`);
      else lines.push('It serves the local files with the CSS Tuner panel added (no hot reload; CSS files reload when they change).');
      if (r.reachable === false) lines.push(`Warning: ${r.target} is not responding. Start the dev server first; the page retries by itself.`);
      if (r.connected) lines.push('A CSS Tuner page is already connected; it was sent to this address.');
      lines.push(
        'In the panel the user picks elements and tunes styles, text, order and props; the page previews them live. "Apply" puts a prompt with a CSS Tuner batch id into the composer of this chat for the user to send (or onto the clipboard when that is not possible).',
      );
      return text(lines.join('\n'), r);
    }
    case 'status': {
      const r = await rpc('status', { root, waitMs: num(args.waitForPageMs), thread });
      const counts = STATUSES.filter((s) => r.counts[s]).map((s) => `${r.counts[s]} ${STATUS_TEXT[s]}`);
      const lines = [
        `Project: ${r.project}`,
        r.page ? `Page (${r.connection}): ${r.page.target}${r.page.title ? ` — "${r.page.title}"` : ''}` : `Page: ${r.connection === 'idle' ? 'not open' : r.connection}`,
        ...r.sites.map((s) => `Site: ${s.url} → ${s.target ?? s.root} (${s.connected ? 'connected' : 'not connected'})`),
        `Changes: ${counts.length ? counts.join(', ') : 'none'}`,
        ...(r.notice ? [`Panel notice: ${r.notice}`] : []),
      ];
      return text(lines.join('\n'), r);
    }
    case 'get_handoff': {
      const r = await rpc('handoff', { root, batch: str(args.batch), pending: args.includePending === true, thread });
      if (!r.prompt) {
        const pending = r.changes.length;
        return text(
          pending
            ? `No batch is waiting. ${pending} change(s) are still being checked:\n${r.changes.map(line).join('\n')}`
            : 'No changes are waiting. The user has not applied anything in CSS Tuner yet; ask them to press Apply in the panel, or call get_handoff with includePending: true to take the unapplied changes.',
          r,
        );
      }
      const n = r.batch?.ids.length ?? r.changes.length;
      const footer = `\n\n---\nCSS Tuner batch ${r.batch?.id} (${r.batch?.mode}, ${n} change${n === 1 ? '' : 's'}). The page keeps showing the previews until the code matches. After editing, call verify.`;
      return text(r.prompt + footer, r);
    }
    case 'verify': {
      const r = await rpc('verify', { root, waitMs: num(args.waitMs), thread });
      if (!r.connected) {
        return text(
          `The CSS Tuner page is not connected, so nothing could be checked. Ask the user to open the page (open_page gives the URL), then call verify again.${r.changes.length ? `\n${r.changes.map(line).join('\n')}` : ''}`,
          r,
        );
      }
      if (!r.changes.length) {
        const latest = r.latest?.changes ?? [];
        return text(latest.length ? `Nothing is waiting to be checked. Latest batch ${r.latest?.batch}:\n${latest.map(line).join('\n')}` : 'Nothing is waiting to be checked.', r);
      }
      const ok = r.changes.filter((c) => c.status === 'applied' || c.status === 'reverted').length;
      return text(`Checked ${r.changes.length} change(s) on ${r.page}: ${ok} matched.\n${r.changes.map(line).join('\n')}`, r);
    }
    case 'list_changes': {
      const status = STATUSES.find((s) => s === args.status);
      const r = await rpc('changes', { root, status, thread });
      return text(r.changes.length ? r.changes.map(line).join('\n') : 'No changes.', r);
    }
    case 'close_page': {
      const r = await rpc('close', { root, all: args.all === true });
      return text(r.closed.length ? `Stopped ${r.closed.length} site(s).` : 'No CSS Tuner site was running.', r);
    }
    default:
      return text(`Unknown tool: ${name}`, undefined, true);
  }
}
