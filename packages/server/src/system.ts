import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';

/** 跑一个命令，把 input 写进它的标准输入；退出码 0 才算成功 */
function run(cmd: string, args: string[], input?: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore'], windowsHide: true });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

/** 不等它结束（打开编辑器、文件夹这类会一直开着的程序） */
function launch(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/** PATH 里有没有这个命令（Codex 启动的进程 PATH 可能很短，补上常见的位置） */
export function which(name: string): string | null {
  const dirs = [...(process.env.PATH ?? '').split(delimiter), ...(MAC ? ['/opt/homebrew/bin', '/usr/local/bin'] : [])];
  const exts = WIN ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join(dir, name + ext);
      try {
        accessSync(p, constants.X_OK);
        if (statSync(p).isFile()) return p;
      } catch {
        /* 下一个 */
      }
    }
  }
  return null;
}

/** 写进系统剪贴板 */
export async function copyText(text: string): Promise<boolean> {
  if (MAC) return run('pbcopy', [], text);
  if (WIN) return run('powershell.exe', ['-NoProfile', '-Command', '$input | Set-Clipboard'], text);
  for (const [cmd, args] of [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
  ] as const) {
    if (which(cmd) && (await run(cmd, [...args], text))) return true;
  }
  return false;
}

/** 在访达 / 资源管理器里显示这个文件（文件夹就打开它） */
export async function reveal(path: string): Promise<boolean> {
  const dir = (() => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  })();
  if (MAC) return run('open', dir ? [path] : ['-R', path]);
  if (WIN) return launch('explorer.exe', dir ? [path] : [`/select,${path}`]);
  return launch('xdg-open', [dir ? path : dirname(path)]);
}

function openUrl(url: string): Promise<boolean> {
  if (MAC) return run('open', [url]);
  if (WIN) return launch('cmd.exe', ['/c', 'start', '', url]);
  return launch('xdg-open', [url]);
}

const MAC_APPS: Array<{ app: string; scheme: string }> = [
  { app: '/Applications/Cursor.app', scheme: 'cursor' },
  { app: '/Applications/Visual Studio Code.app', scheme: 'vscode' },
  { app: '/Applications/Windsurf.app', scheme: 'windsurf' },
];

/**
 * 在编辑器里打开文件并跳到那一行。editor 是 auto 时依次试 cursor、code 命令，再试装好的编辑器的 URL scheme，最后用系统默认程序打开；
 * 写了别的命令时 {file} {line} {column} 换成位置（没有占位符就当作 VS Code 那样支持 -g 的命令）
 */
export async function openInEditor(file: string, line: number, column: number, editor = 'auto'): Promise<boolean> {
  const at = `${file}:${line}:${column}`;
  if (editor !== 'auto') {
    const parts = editor.match(/"[^"]*"|\S+/g)?.map((s) => s.replace(/^"|"$/g, '')) ?? [];
    const [cmd, ...rest] = parts;
    if (!cmd) return false;
    const fill = (s: string) => s.replaceAll('{file}', file).replaceAll('{line}', String(line)).replaceAll('{column}', String(column));
    const args = rest.some((a) => a.includes('{file}')) ? rest.map(fill) : [...rest, '-g', at];
    return launch(which(cmd) ?? cmd, args);
  }
  for (const cmd of ['cursor', 'code']) {
    const p = which(cmd);
    if (p && (await launch(p, ['-g', at]))) return true;
  }
  if (MAC) {
    for (const { app, scheme } of MAC_APPS) {
      if (existsSync(app) && (await openUrl(`${scheme}://file${encodeURI(file)}:${line}:${column}`))) return true;
    }
  }
  return openUrl(pathToFileURL(file).href);
}

let cachedLocale: string | null = null;

/** 系统界面语言（如 zh-CN、en-US）：先看 LANG 这些环境变量，macOS 上再问系统偏好 */
export function systemLocale(): string {
  if (cachedLocale) return cachedLocale;
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG;
  let lang = env && env !== 'C' && env !== 'POSIX' ? env.split('.')[0] : '';
  if (!lang && MAC) {
    try {
      const out = execFileSync('defaults', ['read', '-g', 'AppleLanguages'], { timeout: 1500, encoding: 'utf8' });
      lang = out.match(/[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*/)?.[0] ?? '';
    } catch {
      /* 问不到就用 Intl */
    }
  }
  if (!lang) lang = Intl.DateTimeFormat().resolvedOptions().locale;
  cachedLocale = lang.replace(/_/g, '-');
  return cachedLocale;
}
