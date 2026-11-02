import * as vscode from 'vscode';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

const ROOT_MARKERS = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts', 'vite.config.cjs', 'index.html', 'package.json'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.vite', 'coverage', 'out']);

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * 把页面里看到的路径（开发服务器 URL 路径、Vite 的 /@fs/ 路径、样式表的绝对路径）映射到本地文件，
 * 并记住每个页面源（origin）对应的项目根目录。
 */
export class ProjectResolver {
  private roots = new Map<string, string>();
  private candidates: string[] | null = null;

  /** 静态服务这类已知根目录的来源直接登记 */
  register(origin: string, root: string) {
    this.roots.set(origin, root);
  }

  rootFor(pageUrl: string): string | null {
    try {
      return this.roots.get(new URL(pageUrl).origin) ?? null;
    } catch {
      return null;
    }
  }

  invalidate() {
    this.candidates = null;
  }

  private workspaceDirs(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file').map((f) => f.uri.fsPath);
  }

  /** 工作区里可能是开发服务器根目录的文件夹：工作区根和带 vite 配置 / index.html / package.json 的子目录（深度 ≤ 3） */
  private candidateRoots(): string[] {
    if (this.candidates) return this.candidates;
    const out: string[] = [];
    const visit = (dir: string, depth: number) => {
      if (ROOT_MARKERS.some((m) => existsSync(join(dir, m)))) out.push(dir);
      if (depth >= 3) return;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
        const p = join(dir, name);
        try {
          if (statSync(p).isDirectory()) visit(p, depth + 1);
        } catch {
          /* ignore */
        }
      }
    };
    for (const w of this.workspaceDirs()) {
      if (!out.includes(w)) visit(w, 0);
    }
    // 有 vite 配置的目录优先
    out.sort((a, b) => Number(hasViteConfig(b)) - Number(hasViteConfig(a)) || b.length - a.length);
    this.candidates = out;
    return out;
  }

  inWorkspace(file: string): boolean {
    const f = normalize(file);
    return this.workspaceDirs().some((w) => f === w || f.startsWith(w.endsWith(sep) ? w : w + sep));
  }

  /** 用样式表的 data-vite-dev-id（绝对路径）推断页面对应的项目根：落在哪个候选根下的文件最多就是哪个 */
  learnFromSheets(pageUrl: string, devIds: string[]) {
    let origin: string;
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      return;
    }
    if (this.roots.has(origin)) return;
    const abs = devIds.map((d) => d.split('?')[0]).filter((d) => isAbsolute(d) && isFile(d));
    if (!abs.length) return;
    let best: { root: string; n: number } | null = null;
    for (const root of this.candidateRoots()) {
      const prefix = root.endsWith(sep) ? root : root + sep;
      const n = abs.filter((f) => f.startsWith(prefix)).length;
      if (n && (!best || n > best.n || (n === best.n && root.length > best.root.length))) best = { root, n };
    }
    if (best) this.roots.set(origin, best.root);
  }

  /** JSX 源码的绝对路径以开发路径结尾时，前缀就是开发服务器根目录 */
  private learnFromFile(pageUrl: string, devPath: string, file: string) {
    let origin: string;
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      return;
    }
    if (this.roots.has(origin) || devPath.startsWith('/@fs/') || devPath === file) return;
    const rel = devPath.split('/').filter(Boolean).join(sep);
    if (rel && file.endsWith(sep + rel)) this.roots.set(origin, file.slice(0, file.length - rel.length - 1));
  }

  /** 开发服务器路径 → 本地绝对路径；absHint 是页面直接给出的绝对路径（开发态 JSX 的 fileName）。找不到返回 null */
  fileFor(pageUrl: string, devPath: string, absHint?: string | null): string | null {
    if (absHint && isFile(absHint)) {
      this.learnFromFile(pageUrl, devPath.split('?')[0], absHint);
      return absHint;
    }
    let p = devPath.split('?')[0].split('#')[0];
    try {
      p = decodeURIComponent(p);
    } catch {
      /* 保持原样 */
    }
    if (p.startsWith('/@fs/')) {
      const abs = p.slice(4);
      return isFile(abs) ? abs : null;
    }
    if (/^https?:\/\//.test(p)) {
      try {
        const u = new URL(p);
        return this.fileFor(u.href, u.pathname);
      } catch {
        return null;
      }
    }
    let origin = '';
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      /* ignore */
    }
    const known = this.roots.get(origin);
    if (known) {
      const f = join(known, p);
      if (isFile(f)) return f;
    }
    if (isAbsolute(p) && isFile(p) && this.inWorkspace(p)) return p;
    for (const root of this.candidateRoots()) {
      const f = join(root, p);
      if (isFile(f)) {
        if (origin && !known) this.roots.set(origin, root);
        return f;
      }
    }
    if (isAbsolute(p) && isFile(p)) return p;
    return null;
  }

  /** 样式表 → 本地文件：Vite 注入的 <style data-vite-dev-id> 是绝对路径，<link> 用 href */
  sheetFile(pageUrl: string, sheet: { devId: string | null; href: string | null }): string | null {
    if (sheet.devId) {
      const id = sheet.devId.split('?')[0];
      if (isAbsolute(id) && isFile(id)) return id;
      return this.fileFor(pageUrl, id);
    }
    if (sheet.href) {
      try {
        const u = new URL(sheet.href, pageUrl);
        return this.fileFor(pageUrl, u.pathname);
      } catch {
        return null;
      }
    }
    return null;
  }

  /** 给某个文件找所属项目根（向上找 package.json） */
  packageRoot(file: string): string | null {
    let dir = dirname(file);
    for (let i = 0; i < 12; i++) {
      if (existsSync(join(dir, 'package.json'))) return dir;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
    return null;
  }

  /** 面板上显示的短路径：工作区内用相对路径，工作区外用相对项目根（package.json 所在目录）的路径 */
  label(file: string): string {
    const rel = vscode.workspace.asRelativePath(file, true);
    if (!isAbsolute(rel)) return rel;
    const root = this.packageRoot(file);
    if (root && file.startsWith(root + sep)) return `${root.split(sep).pop()}/${file.slice(root.length + 1)}`;
    return file.split(sep).slice(-3).join('/');
  }
}

function hasViteConfig(dir: string): boolean {
  return ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts', 'vite.config.cjs'].some((m) => existsSync(join(dir, m)));
}
