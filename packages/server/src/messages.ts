import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { matchMessage, type MessageMatch, type MessageRef } from '@css-tuner/engine';
import type { PathGuard } from './project';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.vite', 'coverage', 'out', '.nuxt', '.output', '.svelte-kit']);
/** 明显是配置的 JSON，不会是多语言文件 */
const CONFIG = /^(package(-lock)?|[jt]sconfig(\..+)?|components|vercel|turbo|biome|nx|lerna|renovate|composer|\.eslintrc|\.prettierrc|\.babelrc)\.json$/i;
const MAX_FILES = 400;
const MAX_SIZE = 1 << 20;
const MAX_DEPTH = 6;
const LIST_TTL = 5000;

/** 在项目里找文字对应的多语言消息：扫一遍 JSON 文件（列表短时间缓存，内容按 mtime 缓存） */
export class MessageFiles {
  private lists = new Map<string, { at: number; files: string[] }>();
  private contents = new Map<string, { mtime: number; size: number; source: string }>();

  constructor(private readonly pathGuard?: PathGuard) {}

  private checked(path: string): string | null {
    return this.pathGuard ? this.pathGuard(path) : path;
  }

  private list(path: string): string[] {
    const root = this.checked(path);
    if (!root) return [];
    const hit = this.lists.get(root);
    if (hit && Date.now() - hit.at < LIST_TTL) return hit.files;
    const files: string[] = [];
    const visited = new Set<string>();
    const visit = (dir: string, depth: number) => {
      if (this.pathGuard) {
        if (visited.has(dir)) return;
        visited.add(dir);
      }
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of names) {
        if (files.length >= MAX_FILES) return;
        if (SKIP_DIRS.has(name)) continue;
        const p = join(dir, name);
        if (/\.json$/i.test(name)) {
          if (!CONFIG.test(name) && this.checked(p)) files.push(p);
          continue;
        }
        if (name.startsWith('.') || depth >= MAX_DEPTH) continue;
        const child = this.checked(p);
        if (!child) continue;
        try {
          if (statSync(child).isDirectory()) visit(child, depth + 1);
        } catch {
          /* ignore */
        }
      }
    };
    visit(root, 0);
    this.lists.set(root, { at: Date.now(), files });
    return files;
  }

  private read(file: string): string | null {
    let st;
    try {
      st = statSync(file);
    } catch {
      return null;
    }
    if (st.size > MAX_SIZE || (this.pathGuard && !st.isFile())) return null;
    const c = this.contents.get(file);
    if (c && c.mtime === st.mtimeMs && c.size === st.size) return c.source;
    try {
      const source = readFileSync(file, 'utf8');
      this.contents.set(file, { mtime: st.mtimeMs, size: st.size, source });
      return source;
    } catch {
      return null;
    }
  }

  find(root: string, ref: MessageRef, text: string, lang: string | null | ReadonlyArray<string | null>): MessageMatch | { reason: string } {
    const files = [...new Set(this.list(root).map((path) => this.checked(path)))].flatMap((file) => {
      if (!file) return [];
      const source = this.read(file);
      return source === null ? [] : [{ file, source }];
    });
    return matchMessage(files, ref, text, lang);
  }
}
