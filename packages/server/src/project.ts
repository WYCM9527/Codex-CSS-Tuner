import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

const ROOT_MARKERS = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts', 'vite.config.cjs', 'index.html', 'package.json'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.vite', 'coverage', 'out']);
/** 开发服务器把这些目录里的文件挂在根路径下：Vite、Next.js、Nuxt、Astro 的 public/，SvelteKit 的 static/ */
const PUBLIC_DIRS = ['public', 'static'];

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 已授权工作区里的真实路径；拒绝相对路径、缺失路径和指向工作区外的链接。 */
export type PathGuard = (path: string) => string | null;

function realPath(path: string): string | null {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
}

function within(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * 把页面里看到的路径（开发服务器 URL 路径、Vite 的 /@fs/ 路径、样式表的绝对路径）映射到本地文件，
 * 并记住每个页面源（origin）对应的项目根目录。workspace 是 Codex 打开的项目目录（相当于编辑器的工作区）
 */
export class ProjectResolver {
  private roots = new Map<string, string>();
  private candidates: string[] | null = null;
  readonly workspace: string;
  readonly pathGuard?: PathGuard;

  constructor(workspace: string, { restrictToWorkspace = false }: { restrictToWorkspace?: boolean } = {}) {
    const requested = resolve(workspace);
    const root = restrictToWorkspace ? realPath(requested) : requested;
    this.workspace = root ?? requested;
    if (restrictToWorkspace) {
      this.pathGuard = (path) => {
        const checked = root && typeof path === 'string' && isAbsolute(path) ? realPath(path) : null;
        return root && checked && within(root, checked) ? checked : null;
      };
    }
  }

  private checked(path: string): string | null {
    return this.pathGuard ? this.pathGuard(path) : path;
  }

  private file(path: string): string | null {
    const checked = this.checked(path);
    return checked && isFile(checked) ? checked : null;
  }

  private marker(dir: string, name: string): boolean {
    const path = join(dir, name);
    return this.pathGuard ? this.pathGuard(path) !== null : existsSync(path);
  }

  /** 静态服务这类已知根目录的来源直接登记 */
  register(origin: string, root: string) {
    const checked = this.checked(root);
    if (checked) this.roots.set(origin, checked);
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
    return [this.workspace];
  }

  /** 工作区里可能是开发服务器根目录的文件夹：工作区根和带 vite 配置 / index.html / package.json 的子目录（深度 ≤ 3） */
  private candidateRoots(): string[] {
    if (this.candidates) return this.candidates;
    const out: string[] = [];
    const visited = new Set<string>();
    const visit = (dir: string, depth: number) => {
      if (this.pathGuard) {
        if (visited.has(dir)) return;
        visited.add(dir);
      }
      if (ROOT_MARKERS.some((m) => this.marker(dir, m))) out.push(dir);
      if (depth >= 3) return;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
        const p = this.checked(join(dir, name));
        if (!p) continue;
        try {
          if (statSync(p).isDirectory()) visit(p, depth + 1);
        } catch {
          /* ignore */
        }
      }
    };
    for (const w of this.workspaceDirs()) {
      const checked = this.checked(w);
      if (checked && !out.includes(checked)) visit(checked, 0);
    }
    // 有 vite 配置的目录优先
    const hasViteConfig = (dir: string) => ROOT_MARKERS.some((name) => name.startsWith('vite.config.') && this.marker(dir, name));
    out.sort((a, b) => Number(hasViteConfig(b)) - Number(hasViteConfig(a)) || b.length - a.length);
    this.candidates = out;
    return out;
  }

  inWorkspace(file: string): boolean {
    if (this.pathGuard) return this.pathGuard(file) !== null;
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
    const abs = devIds.flatMap((d) => {
      const path = d.split('?')[0];
      const file = isAbsolute(path) ? this.file(path) : null;
      return file ? [file] : [];
    });
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
    if (rel && file.endsWith(sep + rel)) this.register(origin, file.slice(0, file.length - rel.length - 1));
  }

  /**
   * 开发服务器路径 → 本地绝对路径；absHint 是页面直接给出的绝对路径（开发态 JSX 的 fileName）。找不到返回 null。
   * strict 时不知道页面源对应哪个根、又有好几个候选根都有这个文件，就当找不到
   */
  fileFor(pageUrl: string, devPath: string, absHint?: string | null, strict = false): string | null {
    const hinted = absHint ? this.file(absHint) : null;
    if (hinted) {
      this.learnFromFile(pageUrl, devPath.split('?')[0], hinted);
      return hinted;
    }
    let p = devPath.split('?')[0].split('#')[0];
    try {
      p = decodeURIComponent(p);
    } catch {
      /* 保持原样 */
    }
    if (p.startsWith('/@fs/')) return this.file(p.slice(4));
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
    const inRoot = (root: string) => {
      for (const candidate of [join(root, p), ...PUBLIC_DIRS.map((d) => join(root, d, p))]) {
        const file = this.file(candidate);
        if (file) return file;
      }
      return null;
    };
    const known = this.roots.get(origin);
    if (known) {
      const f = inRoot(known);
      if (f) return f;
    }
    const absolute = isAbsolute(p) ? this.file(p) : null;
    if (absolute && this.inWorkspace(absolute)) return absolute;
    const hits = this.candidateRoots().flatMap((root) => {
      const f = inRoot(root);
      return f ? [{ root, f }] : [];
    });
    // 好几个项目都有的路径（index.html、src/main.tsx）说明不了页面是哪个项目的，只在唯一时记下来
    if (hits.length === 1 && origin && !known) this.roots.set(origin, hits[0].root);
    if (hits.length && !(strict && hits.length > 1)) return hits[0].f;
    return absolute;
  }

  /** 页面对应的 HTML 文件：地址以 / 结尾时是目录下的 index.html */
  htmlFileFor(pageUrl: string): string | null {
    try {
      const path = new URL(pageUrl).pathname;
      const f = this.fileFor(pageUrl, path.endsWith('/') ? `${path}index.html` : path, null, true);
      return f && /\.html?$/i.test(f) ? f : null;
    } catch {
      return null;
    }
  }

  /** 样式表 → 本地文件：Vite 注入的 <style data-vite-dev-id> 是绝对路径，<link> 用 href */
  sheetFile(pageUrl: string, sheet: { devId: string | null; href: string | null }): string | null {
    if (sheet.devId) {
      const id = sheet.devId.split('?')[0];
      return (isAbsolute(id) ? this.file(id) : null) ?? this.fileFor(pageUrl, id);
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
    const checked = this.checked(file);
    if (!checked) return null;
    let dir = dirname(checked);
    for (let i = 0; i < 12 && this.checked(dir); i++) {
      if (this.marker(dir, 'package.json')) return dir;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
    return null;
  }

  /** 面板上显示的短路径：项目目录内用相对路径，项目目录外用相对项目根（package.json 所在目录）的路径 */
  label(file: string): string {
    const checked = this.checked(file);
    if (checked && this.inWorkspace(checked)) return relative(this.workspace, checked).split(sep).join('/') || checked.split(sep).pop()!;
    const root = this.packageRoot(file);
    if (root && file.startsWith(root + sep)) return `${root.split(sep).pop()}/${file.slice(root.length + 1)}`;
    return file.split(sep).slice(-3).join('/');
  }
}
