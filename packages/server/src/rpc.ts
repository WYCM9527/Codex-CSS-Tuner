import { changeName, type ChangeStatus, type Connection, type ViewportPreset } from '@css-tuner/protocol';
import type { Batch } from './applier';
import type { ChangeRecord } from './journal';
import { recordView } from './records';
import type { SettingsData } from './settings';

/** 给 Codex 看的一条改动 */
export interface ChangeSummary {
  id: string;
  status: ChangeStatus;
  element: string;
  change: string;
  from: string;
  to: string;
  /** 代码位置，如 src/App.tsx:12 className */
  where: string;
  file?: string;
  line?: number;
  /** 只改这一档（mobile / tablet / desktop） */
  band?: string;
  note?: string;
  batch?: string;
}

export function summarize(rec: ChangeRecord): ChangeSummary {
  const v = recordView(rec);
  return {
    id: v.id,
    status: v.status,
    element: v.element,
    change: changeName(v),
    from: v.from,
    to: v.to,
    where: v.target.label,
    ...(v.target.file ? { file: v.target.file } : {}),
    ...(v.target.line ? { line: v.target.line } : {}),
    ...(rec.band ? { band: rec.band.name } : {}),
    ...(v.note ? { note: v.note } : {}),
    ...(rec.batch ? { batch: rec.batch } : {}),
  };
}

export interface SiteSummary {
  /** 在浏览器里打开的地址 */
  url: string;
  /** 代理的开发服务器（静态站点没有） */
  target: string | null;
  root: string | null;
  kind: 'proxy' | 'static';
  connected: boolean;
}

export interface OpenResult {
  project: string;
  url: string;
  target: string | null;
  kind: 'proxy' | 'static';
  /** 开发服务器有没有响应；静态站点是 null */
  reachable: boolean | null;
  connected: boolean;
}

export interface StatusResult {
  project: string;
  connection: Connection;
  page: { url: string; target: string; title: string } | null;
  viewport: ViewportPreset;
  sites: SiteSummary[];
  counts: Partial<Record<ChangeStatus, number>>;
  notice: string | null;
}

export interface HandoffResult {
  project: string;
  batch: Omit<Batch, 'prompt'> | null;
  prompt: string | null;
  changes: ChangeSummary[];
}

export interface VerifyResult {
  project: string;
  connected: boolean;
  page: string | null;
  changes: ChangeSummary[];
  /** 没有在等核对的改动时，最近交出的那一批现在的状态：页面更新后面板往往已经自己核对完了 */
  latest?: { batch: string; changes: ChangeSummary[] };
}

export interface ExtensionOpenResult {
  session: string;
  url: string;
  port: number;
  pairingCode: string;
  browserLink?: string;
  expiresAt: number;
  chat: string;
}

export interface ExtensionStatusResult {
  session: string;
  project: string;
  url: string;
  chat: string;
  connected: boolean;
  paired: boolean;
}

/** thread 是调用工具的 Codex 对话，带了 root 时记给那个项目 */
export interface RpcMethods {
  ping: { p: Record<string, never>; r: { version: string; pid: number; projects: string[] } };
  open: { p: { root: string; url?: string; thread?: string }; r: OpenResult };
  status: { p: { root?: string; waitMs?: number; thread?: string }; r: StatusResult };
  handoff: { p: { root?: string; batch?: string; pending?: boolean; thread?: string }; r: HandoffResult };
  verify: { p: { root?: string; waitMs?: number; thread?: string }; r: VerifyResult };
  changes: { p: { root?: string; status?: ChangeStatus; thread?: string }; r: { project: string; changes: ChangeSummary[] } };
  close: { p: { root?: string; all?: boolean }; r: { closed: string[] } };
  settings: { p: { set?: Partial<SettingsData> }; r: SettingsData };
  shutdown: { p: Record<string, never>; r: boolean };
  extensionOpen: { p: { root: string; url: string; chat: string; cliPath: string; direct?: boolean }; r: ExtensionOpenResult };
  extensionStatus: { p: { session: string }; r: ExtensionStatusResult };
  extensionHandoff: { p: { session: string; batch: string }; r: HandoffResult };
  extensionVerify: { p: { session: string; batch: string; waitMs?: number }; r: VerifyResult & { batch: string } };
  extensionClose: { p: { session: string }; r: { closed: boolean } };
}

export type RpcMethod = keyof RpcMethods;
export type ExtensionRpcMethod = Extract<RpcMethod, `extension${string}`>;

/** 后台服务的连接信息，写在数据目录的 daemon.json 里（只有自己能读） */
export interface DaemonInfo {
  pid: number;
  port: number;
  token: string;
  version: string;
  startedAt: number;
}

/** 版本号比较：a 比 b 新返回正数 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
