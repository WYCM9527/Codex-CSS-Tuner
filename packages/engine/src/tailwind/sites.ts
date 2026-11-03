import { scriptSource, sfcKind } from '../sfc';
import * as jsx from './jsx';
import type { ClassSite } from './jsx';
import { locateTemplateSite, templateClassSites } from './template';

type Result<T> = T | { error: string };

/** .vue / .svelte 只留下 <script> 块再按 JS / TS 解析，偏移和行列不变 */
function scriptOf(source: string, file: string): Result<{ code: string; name: string }> {
  try {
    const { code, ts } = scriptSource(source, file);
    return { code, name: `${file}.${ts ? 'ts' : 'js'}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * 找到 (line, column) 处开标签的类名信息：JSX 的 className，Vue / Svelte 模板的 class。
 * line、column 都从 1 开始。
 */
export function locateClassSite(source: string, file: string, line: number, column: number): Result<ClassSite> {
  return sfcKind(file) ? locateTemplateSite(source, file, line, column) : jsx.locateClassSite(source, file, line, column);
}

/** 文件里所有开标签的类名信息（还原时源码行号可能变了，要在附近按类名找） */
export function allClassSites(source: string, file: string): Result<ClassSite[]> {
  return sfcKind(file) ? templateClassSites(source, file) : jsx.allClassSites(source, file);
}

/** 写类名用的字符串字面量（cva / tv / cn 的参数、名字像类名的常量）；Vue / Svelte 只看 <script> 块 */
export function classLiteralSites(source: string, file: string): Result<ClassSite[]> {
  if (!sfcKind(file)) return jsx.classLiteralSites(source, file);
  const s = scriptOf(source, file);
  return 'error' in s ? s : jsx.classLiteralSites(s.code, s.name);
}

export function locateLiteralSite(source: string, file: string, line: number, column: number, token: string | null): Result<ClassSite> {
  if (!sfcKind(file)) return jsx.locateLiteralSite(source, file, line, column, token);
  const s = scriptOf(source, file);
  return 'error' in s ? s : jsx.locateLiteralSite(s.code, s.name, line, column, token);
}
