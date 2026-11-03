const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64MAP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64MAP[B64[i]] = i;

/** 每行一个段数组；段为 [生成列, 源索引, 源行, 源列]，都是 0 起 */
export type Decoded = number[][][];

export function decodeMappings(mappings: string): Decoded {
  const lines: Decoded = [];
  let srcIdx = 0;
  let srcLine = 0;
  let srcCol = 0;
  for (const lineStr of mappings.split(';')) {
    const segs: number[][] = [];
    let genCol = 0;
    if (lineStr) {
      for (const segStr of lineStr.split(',')) {
        if (!segStr) continue;
        const vals: number[] = [];
        let value = 0;
        let shift = 0;
        for (let i = 0; i < segStr.length; i++) {
          const digit = B64MAP[segStr[i]];
          value += (digit & 31) << shift;
          if (digit & 32) shift += 5;
          else {
            const neg = value & 1;
            value >>>= 1;
            vals.push(neg ? -value : value);
            value = 0;
            shift = 0;
          }
        }
        genCol += vals[0];
        if (vals.length >= 4) {
          srcIdx += vals[1];
          srcLine += vals[2];
          srcCol += vals[3];
          segs.push([genCol, srcIdx, srcLine, srcCol]);
        } else segs.push([genCol]);
      }
    }
    lines.push(segs);
  }
  return lines;
}

export interface RawMap {
  sources: string[];
  sourceRoot?: string;
  mappings: string;
  ignoreList?: number[];
  x_google_ignoreList?: number[];
}

/** 分段的索引 sourcemap（Turbopack 每个模块一段） */
export interface IndexMap {
  sections: Array<{ offset: { line: number; column: number }; map: SourceMap }>;
}

export type SourceMap = RawMap | IndexMap;

const isIndexMap = (m: SourceMap): m is IndexMap => Array.isArray((m as IndexMap).sections);

const decodedOf = new WeakMap<RawMap, Decoded>();

/** 和 originalPositionFor 一样，另外支持分段 sourcemap，并给出这个源是否在 ignoreList 里（第三方 / 框架代码） */
export function originalPosition(map: SourceMap, line: number, col: number): { source: string; line: number; column: number; ignored: boolean } | null {
  if (isIndexMap(map)) {
    const l0 = line - 1;
    const c0 = col - 1;
    let hit: IndexMap['sections'][number] | null = null;
    for (const s of map.sections) {
      if (s.offset.line < l0 || (s.offset.line === l0 && s.offset.column <= c0)) hit = s;
      else break;
    }
    if (!hit) return null;
    const dl = l0 - hit.offset.line;
    return originalPosition(hit.map, dl + 1, (dl === 0 ? c0 - hit.offset.column : c0) + 1);
  }
  let decoded = decodedOf.get(map);
  if (!decoded) {
    decoded = decodeMappings(map.mappings);
    decodedOf.set(map, decoded);
  }
  const seg = segmentAt(decoded, line, col);
  if (!seg) return null;
  const ignore = map.ignoreList ?? map.x_google_ignoreList ?? [];
  return { source: (map.sourceRoot ?? '') + map.sources[seg[1]], line: seg[2] + 1, column: seg[3] + 1, ignored: ignore.includes(seg[1]) };
}

/** sourcemap 里出现的所有源（含分段） */
export function sourcesOf(map: SourceMap): string[] {
  if (isIndexMap(map)) return map.sections.flatMap((s) => sourcesOf(s.map));
  return map.sources.map((s) => (map.sourceRoot ?? '') + s);
}

function segmentAt(decoded: Decoded, line: number, col: number): number[] | null {
  const segs = decoded[line - 1];
  if (!segs || !segs.length) return null;
  const col0 = col - 1;
  let best: number[] | null = null;
  for (const s of segs) {
    if (s[0] <= col0) {
      if (s.length >= 4) best = s;
    } else break;
  }
  return best;
}

/** line / col 为 1 起（与 Error.stack 一致），返回 1 起的原始位置 */
export function originalPositionFor(map: RawMap, decoded: Decoded, line: number, col: number): { source: string; line: number; column: number } | null {
  const best = segmentAt(decoded, line, col);
  if (!best) return null;
  return { source: (map.sourceRoot ?? '') + map.sources[best[1]], line: best[2] + 1, column: best[3] + 1 };
}

const SOURCE_OBJ = /\{\s*fileName:\s*("(?:[^"\\]|\\.)*"|[\w$]+),\s*lineNumber:\s*(\d+),\s*columnNumber:\s*(\d+)\s*\}/g;

/**
 * 模块里 JSX 开发态位置（jsxDEV 的 source 对象，React 18 的 _debugSource）整体往下偏了几行。
 * @vitejs/plugin-react 4 先在 Babel 输出前面插 react-refresh 的代码、再由 esbuild 转 JSX，esbuild 按插过之后的代码算 lineNumber。
 * 每个位置对象经 sourcemap 映射回原始 JSX，多数对象差同样的行数才算偏了；没偏或判断不了是 0
 */
export function jsxLineShift(code: string, map: SourceMap, fileName: string): number {
  const counts = new Map<number, number>();
  let total = 0;
  let line = 1;
  let lineStart = 0;
  let at = 0;
  for (const m of code.matchAll(SOURCE_OBJ)) {
    for (; at < m.index; at++) {
      if (code.charCodeAt(at) === 10) {
        line++;
        lineStart = at + 1;
      }
    }
    // 写成字符串的文件名要对得上（_jsxFileName 这种变量就不比了）
    if (m[1].startsWith('"') && JSON.parse(m[1]) !== fileName) continue;
    const pos = originalPosition(map, line, m.index - lineStart + 1);
    if (!pos) continue;
    const d = Number(m[2]) - pos.line;
    counts.set(d, (counts.get(d) ?? 0) + 1);
    total++;
  }
  let shift = 0;
  let most = 0;
  for (const [d, c] of counts) {
    if (c > most) {
      shift = d;
      most = c;
    }
  }
  return shift > 0 && most >= total * 0.6 ? shift : 0;
}

const SOURCE_MAPPING_RE = /\/\/[#@] sourceMappingURL=(\S+)\s*$/;
const CSS_SOURCE_MAPPING_RE = /\/\*[#@] sourceMappingURL=(\S+?)\s*\*\/\s*$/;

export function extractMapUrl(code: string): string | null {
  const m = SOURCE_MAPPING_RE.exec(code) ?? CSS_SOURCE_MAPPING_RE.exec(code);
  return m ? m[1] : null;
}

/** file:// 源 → 本地绝对路径；其他写法返回 null */
export function filePathOf(source: string): string | null {
  if (!source.startsWith('file://')) return null;
  try {
    const p = decodeURIComponent(new URL(source).pathname);
    return /^\/[A-Za-z]:\//.test(p) ? p.slice(1) : p;
  } catch {
    return null;
  }
}

export function decodeDataUrl(url: string): string {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
