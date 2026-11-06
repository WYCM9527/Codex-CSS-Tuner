import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { parentPort } from 'node:worker_threads';
import type * as TS from 'typescript';

type Ts = typeof TS;

interface Project {
  ts: Ts;
  ls: TS.LanguageService;
  files: Set<string>;
}

/** 按 tsconfig（没有时按 TypeScript 所在目录）缓存语言服务 */
const projects = new Map<string, Project>();
const typescripts = new Map<string, Ts | null>();

function loadTs(file: string): Ts | null {
  let path: string;
  try {
    path = createRequire(file).resolve('typescript');
  } catch {
    return null;
  }
  if (!typescripts.has(path)) {
    try {
      const ts = createRequire(file)(path) as Ts;
      typescripts.set(path, typeof ts.createLanguageService === 'function' ? ts : null);
    } catch {
      typescripts.set(path, null);
    }
  }
  return typescripts.get(path) ?? null;
}

function mtime(file: string): string {
  try {
    return String(statSync(file).mtimeMs);
  } catch {
    return '0';
  }
}

interface Config {
  key: string;
  dir: string;
  options: TS.CompilerOptions;
  fileNames: string[];
  references: readonly TS.ProjectReference[];
}

function parseConfig(ts: Ts, path: string): Config | null {
  const host: TS.ParseConfigFileHost = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined };
  const cfg = ts.getParsedCommandLineOfConfigFile(path, {}, host);
  if (!cfg) return null;
  return { key: path, dir: dirname(path), options: cfg.options, fileNames: cfg.fileNames, references: cfg.projectReferences ?? [] };
}

/** 找管这个文件的 tsconfig：Vite 模板的根 tsconfig 只有 references，文件在 tsconfig.app.json 里 */
function configFor(ts: Ts, file: string): Config {
  const norm = (p: string) => (ts.sys.useCaseSensitiveFileNames ? resolve(p) : resolve(p).toLowerCase());
  const target = norm(file);
  const has = (c: Config) => c.fileNames.some((f) => norm(f) === target);
  const path = ts.findConfigFile(dirname(file), ts.sys.fileExists, 'tsconfig.json');
  const root = path ? parseConfig(ts, path) : null;
  if (root) {
    if (has(root)) return root;
    for (const ref of root.references) {
      const sub = parseConfig(ts, ts.resolveProjectReferencePath(ref));
      if (sub && has(sub)) return sub;
    }
    return { ...root, key: `${root.key}#${file}`, fileNames: [...root.fileNames, file] };
  }
  const options: TS.CompilerOptions = {
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  };
  return { key: `inferred:${dirname(file)}`, dir: dirname(file), options, fileNames: [file], references: [] };
}

function projectFor(ts: Ts, file: string): Project {
  const cfg = configFor(ts, file);
  let p = projects.get(cfg.key);
  if (p) {
    p.files.add(file);
    return p;
  }
  const files = new Set([...cfg.fileNames, file]);
  const host: TS.LanguageServiceHost = {
    getScriptFileNames: () => [...files],
    getScriptVersion: mtime,
    getScriptSnapshot: (f) => {
      try {
        return ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8'));
      } catch {
        return undefined;
      }
    },
    getCurrentDirectory: () => cfg.dir,
    getCompilationSettings: () => cfg.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  };
  p = { ts, ls: ts.createLanguageService(host, ts.createDocumentRegistry()), files };
  projects.set(cfg.key, p);
  return p;
}

function complete(file: string, line: number, column: number): string[] | null {
  const ts = loadTs(file);
  if (!ts) return null;
  const { ls } = projectFor(ts, file);
  const sf = ls.getProgram()?.getSourceFile(file);
  if (!sf) return null;
  const pos = sf.getPositionOfLineAndCharacter(line - 1, column - 1);
  const info = ls.getCompletionsAtPosition(file, pos, {});
  const out: string[] = [];
  for (const e of info?.entries ?? []) {
    if (e.kind === ts.ScriptElementKind.string && e.name && !out.includes(e.name)) out.push(e.name);
  }
  return out.length >= 2 && out.length <= 50 ? out : null;
}

parentPort?.on('message', (msg: { id: number; file: string; line: number; column: number }) => {
  let options: string[] | null = null;
  try {
    options = complete(msg.file, msg.line, msg.column);
  } catch {
    options = null;
  }
  parentPort?.postMessage({ id: msg.id, options });
});
