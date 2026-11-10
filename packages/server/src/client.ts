import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isAlive, readInfo } from './daemon-info';
import { bundleDir, dataDir, extensionDataDir } from './paths';
import { compareVersions, type DaemonInfo, type ExtensionRpcMethod, type RpcMethod, type RpcMethods } from './rpc';
import { VERSION } from './version';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 各个方法最多等多久（verify、status 会在后台服务里等页面） */
const TIMEOUT: Partial<Record<RpcMethod, number>> = {
  verify: 45000,
  status: 70000,
  open: 20000,
  extensionOpen: 20000,
  extensionVerify: 45000,
};

async function post<M extends RpcMethod>(info: DaemonInfo, method: M, params: RpcMethods[M]['p'], timeoutMs?: number): Promise<RpcMethods[M]['r']> {
  const res = await fetch(`http://127.0.0.1:${info.port}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${info.token}` },
    body: JSON.stringify({ method, params }),
    signal: AbortSignal.timeout(timeoutMs ?? TIMEOUT[method] ?? 15000),
  });
  const body = (await res.json()) as { ok: boolean; result?: RpcMethods[M]['r']; error?: string };
  if (!body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.result as RpcMethods[M]['r'];
}

async function alive(info: DaemonInfo): Promise<{ version: string } | null> {
  try {
    return await post(info, 'ping', {}, 2000);
  } catch {
    return null;
  }
}

/** 日志超过 5MB 时换一个文件 */
function logFile(data: string): string {
  const dir = join(data, 'logs');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'daemon.log');
  try {
    if (statSync(file).size > 5 * 1024 * 1024) renameSync(file, `${file}.1`);
  } catch {
    /* 还没有日志 */
  }
  return file;
}

type DataVariable = 'CSS_TUNER_DATA' | 'CSS_TUNER_EXTENSION_DATA';

function spawnDaemon(data: string, dataVariable: DataVariable) {
  const script = join(bundleDir(), 'daemon.mjs');
  if (!existsSync(script)) throw new Error(`missing ${script}; run pnpm build`);
  const out = openSync(logFile(data), 'a');
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, [dataVariable]: data },
    windowsHide: true,
  });
  child.unref();
}

let cached: DaemonInfo | null = null;

/** 让后台服务退出，等到进程真的没了（站点的端口都放掉了） */
async function shutdown(info: DaemonInfo): Promise<void> {
  await post(info, 'shutdown', {}).catch(() => undefined);
  for (let i = 0; i < 100 && isAlive(info.pid); i++) await sleep(100);
}

/** 命令行的 stop：没在跑就返回 false */
export async function stopDaemon(): Promise<boolean> {
  const info = readInfo(dataDir());
  cached = null;
  if (!info || !(await alive(info))) return false;
  await shutdown(info);
  return true;
}

/**
 * 找到（或启动）后台服务：版本比自己旧就换掉；比自己新的照用（另一个对话里装了新版插件）
 */
export async function ensureDaemon(): Promise<DaemonInfo> {
  return ensureDaemonAt(dataDir(), 'CSS_TUNER_DATA');
}

async function ensureDaemonAt(data: string, dataVariable: DataVariable): Promise<DaemonInfo> {
  const known = readInfo(data);
  if (known) {
    const pong = await alive(known);
    if (pong && compareVersions(pong.version, VERSION) >= 0) return known;
    if (pong) await shutdown(known);
  }
  spawnDaemon(data, dataVariable);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await sleep(150);
    const info = readInfo(data);
    if (info && info.pid !== known?.pid && (await alive(info))) return info;
  }
  const again = readInfo(data);
  if (again && (await alive(again))) return again;
  throw new Error(`CSS Tuner background service didn't start; see ${join(data, 'logs', 'daemon.log')}`);
}

/** 调后台服务；连不上（服务退出了、换了版本）就重新找一次 */
export async function rpc<M extends RpcMethod>(method: M, params: RpcMethods[M]['p']): Promise<RpcMethods[M]['r']> {
  if (!cached) cached = await ensureDaemon();
  try {
    return await post(cached, method, params);
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') throw e;
    if (e instanceof TypeError || /ECONNREFUSED|fetch failed|unauthorized|stopping/i.test((e as Error).message)) {
      cached = await ensureDaemon();
      return post(cached, method, params);
    }
    throw e;
  }
}

export function startExtensionDaemon(): Promise<DaemonInfo> {
  return ensureDaemonAt(extensionDataDir(), 'CSS_TUNER_EXTENSION_DATA');
}

export async function stopExtensionDaemon(): Promise<boolean> {
  const info = readInfo(extensionDataDir());
  if (!info || !(await alive(info))) return false;
  await shutdown(info);
  return true;
}

/** 其他扩展会话命令只访问已经打开的会话。 */
export async function extensionRpc<M extends ExtensionRpcMethod>(method: M, params: RpcMethods[M]['p']): Promise<RpcMethods[M]['r']> {
  if (method === 'extensionOpen') {
    const info = await startExtensionDaemon();
    return post(info, method, params);
  }
  const info = readInfo(extensionDataDir());
  if (!info || !(await alive(info))) throw new Error('CSS Tuner extension companion is not running. Run extension start first.');
  return post(info, method, params);
}
