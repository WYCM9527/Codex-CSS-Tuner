import { findNodeAtLocation, parseTree, type Node as JsonNode, type ParseError } from 'jsonc-parser';
import { t as msg } from '@css-tuner/protocol';
import { applyEdits, type EditResult } from '../types';
import { commonEnds, short } from './diff';
import type { MessageRef } from './jsx';

/**
 * 消息在 JSON 里可能的路径：next-intl 的命名空间是文件里的顶层键；
 * react-i18next 的命名空间可能是单独的文件（common.json），也可能是顶层键，两种都试
 */
export function messageKeyPaths(ref: MessageRef): string[][] {
  let { key, ns } = ref;
  if (ref.lib === 'i18next') {
    const i = key.indexOf(':');
    if (i > 0) {
      ns = key.slice(0, i);
      key = key.slice(i + 1);
    }
  }
  const parts = [...(ref.prefix ? ref.prefix.split('.') : []), ...key.split('.')];
  if (ref.lib === 'next-intl') return [[...(ns ? ns.split('.') : []), ...parts]];
  return ns ? [[ns, ...parts], parts] : [parts];
}

function tree(source: string): JsonNode | null {
  const errors: ParseError[] = [];
  const root = parseTree(source, errors, { allowTrailingComma: true, disallowComments: false });
  return root && !errors.length ? root : null;
}

/** keyPath 处的字符串值，不是字符串或不存在时为 null */
export function readMessage(source: string, keyPath: string[]): string | null {
  const root = tree(source);
  const node = root && findNodeAtLocation(root, keyPath);
  return node?.type === 'string' ? (node.value as string) : null;
}

export interface MessageMatch {
  file: string;
  keyPath: string[];
}

/** 文件路径里的语言标记和一条语言线索的吻合程度：完全一致 2，主语言一致 1 */
function langScore(file: string, lang: string | null): number {
  if (!lang) return 0;
  const want = lang.toLowerCase().replace('_', '-');
  const primary = want.split('-')[0];
  const parts = file
    .toLowerCase()
    .replace(/\.jsonc?$/, '')
    .split(/[\\/]/)
    .map((p) => p.replace('_', '-'));
  if (parts.some((p) => p === want)) return 2;
  if (parts.some((p) => p === primary || p.split(/[-.]/)[0] === primary)) return 1;
  return 0;
}

const baseName = (file: string) => file.split(/[\\/]/).pop()!.replace(/\.jsonc?$/, '');

/**
 * 在候选 JSON 文件里找这条消息：值要和页面上的文字一致。
 * 不止一个文件对得上时按语言和命名空间文件名挑，仍不唯一就不猜。
 * lang 可以给几条线索（如地址里的语言段、<html lang>），靠前的优先，分不出来再看下一条
 */
export function matchMessage(
  files: Array<{ file: string; source: string }>,
  ref: MessageRef,
  text: string,
  lang: string | null | ReadonlyArray<string | null>,
): MessageMatch | { reason: string } {
  const paths = messageKeyPaths(ref);
  const want = text.trim();
  const hits: MessageMatch[] = [];
  for (const f of files) {
    const root = tree(f.source);
    if (!root) continue;
    for (const p of paths) {
      const node = findNodeAtLocation(root, p);
      if (node?.type === 'string' && (node.value as string).trim() === want) {
        hits.push({ file: f.file, keyPath: p });
        break;
      }
    }
  }
  if (!hits.length) return { reason: msg('engine.message.notFound', { key: ref.key }) };
  if (hits.length === 1) return hits[0];
  const ns = ref.ns ?? (ref.lib === 'i18next' && ref.key.includes(':') ? ref.key.split(':')[0] : null);
  const langs = typeof lang === 'string' || lang === null ? [lang] : lang.length ? lang : [null];
  for (const l of langs) {
    const score = (h: MessageMatch) => langScore(h.file, l) * 2 + (ns && baseName(h.file) === ns ? 1 : 0);
    const best = Math.max(...hits.map(score));
    const top = hits.filter((h) => score(h) === best);
    if (best > 0 && top.length === 1) return top[0];
  }
  return { reason: msg('engine.message.ambiguous', { key: ref.key, n: hits.length }) };
}

export interface MessageEditInput {
  file: string;
  source: string;
  keyPath: string[];
  /** 页面上原来的文字，文件里对不上就不改 */
  from: string;
  value: string;
}

/** 改 JSON 里一条消息的值：保留原值首尾的空白，只替换变化的那几个字符 */
export function editMessage(input: MessageEditInput): EditResult {
  const { file, source, keyPath, from, value } = input;
  const root = tree(source);
  if (!root) return { ok: false, reason: msg('engine.message.parseFailed', { file }) };
  const node = findNodeAtLocation(root, keyPath);
  if (node?.type !== 'string') return { ok: false, reason: msg('engine.message.notFound', { key: keyPath.join('.') }) };
  const old = node.value as string;
  if (old.trim() !== from.trim()) return { ok: false, reason: msg('engine.text.changed', { now: short(old) }) };
  const next = /^\s*/.exec(old)![0] + value + /\s*$/.exec(old)![0];
  const oldToken = source.slice(node.offset, node.offset + node.length);
  const token = JSON.stringify(next);
  const { p, s } = commonEnds(oldToken, token);
  const edit = { start: node.offset + p, end: node.offset + oldToken.length - s, text: token.slice(p, token.length - s) };
  if (readMessage(applyEdits(source, [edit]), keyPath) !== next) return { ok: false, reason: msg('engine.text.verifyFailed') };
  return { ok: true, file, edits: [edit], summary: msg('engine.message.summary', { key: keyPath.join('.'), from: short(from), to: short(value) }) };
}
