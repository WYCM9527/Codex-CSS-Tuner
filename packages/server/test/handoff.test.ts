import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale, t } from '@css-tuner/protocol';
import { Applier, SnapshotStore } from '../src/applier';
import type { Controller } from '../src/controller';
import { existingChat, extensionDraft } from '../src/extension-sessions';
import { Journal, type ChangeRecord } from '../src/journal';
import { threadOf } from '../src/mcp';
import { MemoryStore } from '../src/store';
import { codexLink, openCodexLink } from '../src/system';

vi.mock('../src/system', async (importActual) => ({
  ...(await importActual<typeof import('../src/system')>()),
  copyText: vi.fn(async () => true),
  openCodexLink: vi.fn(async () => true),
}));

const THREAD = '00000000-0000-4000-8000-000000000001';

const record: Omit<ChangeRecord, 'id' | 'createdAt' | 'status'> = {
  kind: 'style',
  key: 'k',
  pageUrl: 'http://localhost:5173/',
  element: { label: 'h1.title', source: null, sourceIndex: 0, sameSource: 1 },
  props: ['padding-top'],
  propLabel: 'padding-top',
  from: '16px',
  to: '24px',
  value: '24px',
  token: null,
  original: {},
  view: { kind: 'agent', label: 'Agent', affects: 1, reason: 'why' },
  preview: { kind: 'inline', uid: 'u1', sourceKey: null },
  previewId: 'p1',
  write: { kind: 'agent', reason: 'why' },
};

const cleanups: Array<() => void> = [];

function setup(thread: string | null, prompt = 'the prompt') {
  const dir = mkdtempSync(join(tmpdir(), 'css-tuner-handoff-'));
  const journal = new Journal(new MemoryStore());
  journal.add(record);
  const notices: string[] = [];
  const c = {
    journal,
    thread,
    project: { workspace: dir },
    log: () => {},
    notify: (_level: string, text: string) => notices.push(text),
    showPrompt: vi.fn(),
    handoffPrompt: () => prompt,
  } as unknown as Controller;
  const applier = new Applier(c, new SnapshotStore(join(dir, 'snapshots')), new MemoryStore());
  cleanups.push(() => {
    applier.dispose();
    rmSync(dir, { recursive: true, force: true });
  });
  return { applier, notices };
}

beforeEach(() => {
  setLocale('en');
  vi.mocked(openCodexLink).mockClear();
  vi.mocked(openCodexLink).mockResolvedValue(true);
});

afterEach(() => {
  for (const f of cleanups.splice(0)) f();
});

it('reconnecting and repeating a verification note do not rewrite the journal', () => {
  const store = new MemoryStore();
  const save = vi.spyOn(store, 'update');
  const journal = new Journal(store);
  const { id } = journal.add(record);
  journal.update(id, { note: 'still waiting' });
  save.mockClear();

  journal.refreshPreviewUid(id, 'after-reload');
  journal.update(id, { note: 'still waiting' });

  expect(journal.views()[0].uid).toBe('after-reload');
  expect(save).not.toHaveBeenCalled();
  journal.update(id, { status: 'applied', note: undefined });
  expect(save).toHaveBeenCalledTimes(1);
});

describe('交给 Codex 对话的输入框', () => {
  it('知道是哪个对话时，用 codex:// 链接把完整提示词放进它的输入框', async () => {
    const { applier, notices } = setup(THREAD);
    const b = await applier.apply(undefined, { batch: 'abc123', via: 'composer' });
    expect(openCodexLink).toHaveBeenCalledWith(codexLink(THREAD, `the prompt\n\n${t('handoff.footer', { batch: 'abc123' })}`));
    expect(notices.at(-1)).toBe(t('ext.apply.composer', { n: 1 }));
    expect(b?.via).toBe('composer');
  });

  it('提示词太长、放不进链接时放一句话，让 Codex 按批次号来取', async () => {
    const { applier } = setup(THREAD, '中'.repeat(4_000));
    await applier.apply(undefined, { batch: 'abc123', via: 'composer' });
    expect(openCodexLink).toHaveBeenCalledWith(codexLink(THREAD, t('handoff.annotate.apply', { n: 1, batch: 'abc123' })));
  });

  it('链接打不开时按剪贴板的办，批次也记成剪贴板', async () => {
    vi.mocked(openCodexLink).mockResolvedValue(false);
    const { applier, notices } = setup(THREAD);
    const b = await applier.apply(undefined, { batch: 'abc123', via: 'composer' });
    expect(notices.at(-1)).toBe(t('ext.apply.clipboard', { n: 1 }));
    expect(b?.via).toBe('clipboard');
    expect(applier.batch('abc123')?.via).toBe('clipboard');
  });

  it('不知道是哪个对话时不开链接', async () => {
    const { applier, notices } = setup(null);
    await applier.apply(undefined, { batch: 'abc123', via: 'composer' });
    expect(openCodexLink).not.toHaveBeenCalled();
    expect(notices.at(-1)).toBe(t('ext.apply.clipboard', { n: 1 }));
  });
});

describe('codex:// 链接', () => {
  it('提示词编码在 prompt 参数里', () => {
    const prompt = '把 a & b 改成 calc(50% + 1rem)？\n#2';
    const url = codexLink(THREAD, prompt)!;
    expect(url.startsWith(`codex://threads/${THREAD}?prompt=`)).toBe(true);
    expect(new URL(url).searchParams.get('prompt')).toBe(prompt);
  });

  it('对话 id 不像 Codex 的就不生成', () => {
    expect(codexLink('../settings', 'hi')).toBeNull();
    expect(codexLink(`${THREAD}?prompt=x`, 'hi')).toBeNull();
  });
});

describe('MCP 工具调用带的对话', () => {
  it('从 _meta.threadId 里取，格式不对的不要', () => {
    expect(threadOf({ name: 'status', _meta: { threadId: THREAD, sessionId: THREAD } })).toBe(THREAD);
    expect(threadOf({ _meta: { threadId: 'not-a-thread' } })).toBeUndefined();
    expect(threadOf({ _meta: 'x' })).toBeUndefined();
    expect(threadOf({})).toBeUndefined();
    expect(threadOf(undefined)).toBeUndefined();
  });
});

describe('浏览器扩展交接', () => {
  it('只接受已有本地对话的深链接', () => {
    expect(existingChat(`codex://threads/${THREAD}`)).toBe(THREAD);
    expect(() => existingChat('codex://threads/new')).toThrow();
    expect(() => existingChat(`codex://threads/${THREAD}?prompt=wrong`)).toThrow();
  });

  it('长草稿用本机 CLI 读取并核对同一批次', () => {
    const batch = { id: 'abc123', prompt: '调'.repeat(4000) };
    const root = '/tmp/project root';
    const cli = "/tmp/Tuner's helper/cli.mjs";
    expect(codexLink(THREAD, extensionDraft(batch, 'session', cli, root))).toBeNull();
    const short = extensionDraft(batch, 'session', cli, root, true);
    const url = codexLink(THREAD, short)!;
    expect(new URL(url).searchParams.get('prompt')).toBe(short);
    expect(short).toContain(root);
    expect(short).toContain("'/tmp/Tuner'\\''s helper/cli.mjs' extension handoff --session 'session' --batch 'abc123'");
    expect(short).toContain("extension verify --session 'session' --batch 'abc123'");
  });
});
