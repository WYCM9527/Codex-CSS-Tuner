import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DaemonInfo } from './rpc';

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** 后台服务写的连接信息（端口、令牌、版本） */
export function readInfo(data: string): DaemonInfo | null {
  try {
    const v = JSON.parse(readFileSync(join(data, 'daemon.json'), 'utf8')) as DaemonInfo;
    return v && typeof v.port === 'number' && typeof v.token === 'string' ? v : null;
  } catch {
    return null;
  }
}
