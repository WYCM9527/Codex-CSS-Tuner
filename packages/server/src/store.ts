import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** 键值存储，用法同 VS Code 的 Memento */
export interface Memento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): Promise<void>;
}

const open = new Set<JsonStore>();
let exitHooked = false;

function readJson(file: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * 存成一个 JSON 文件：改了以后攒一会儿再写（写的是那时的最新值），先写临时文件再改名，进程退出前写完。
 * 存进来的对象不复制，调用方接着改它、再 update 一次就行
 */
export class JsonStore implements Memento {
  private data: Record<string, unknown>;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    readonly file: string,
    private readonly delayMs = 250,
  ) {
    this.data = readJson(file) ?? {};
    open.add(this);
    if (!exitHooked) {
      exitHooked = true;
      process.on('exit', () => {
        for (const s of open) s.flush();
      });
    }
  }

  get<T>(key: string, fallback?: T): T | undefined {
    const v = this.data[key];
    return v === undefined ? fallback : (v as T);
  }

  update(key: string, value: unknown): Promise<void> {
    if (value === undefined) delete this.data[key];
    else this.data[key] = value;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.delayMs);
    return Promise.resolve();
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      renameSync(tmp, this.file);
    } catch (e) {
      console.error(`[css-tuner] 写不进 ${this.file}: ${(e as Error).message}`);
    }
  }

  close(): void {
    this.flush();
    open.delete(this);
  }
}

/** 测试和自检用：只在内存里 */
export class MemoryStore implements Memento {
  private data = new Map<string, unknown>();

  get<T>(key: string, fallback?: T): T | undefined {
    return this.data.has(key) ? (this.data.get(key) as T) : fallback;
  }

  update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.data.delete(key);
    else this.data.set(key, value);
    return Promise.resolve();
  }
}
