import { decodeDataUrl, extractMapUrl, filePathOf, sourcesOf, type SourceMap } from './sourcemap';

export const OWN_ATTR = 'data-css-tuner';

const byEl = new WeakMap<Element, string>();
const byId = new Map<string, WeakRef<Element>>();
let seq = 0;
/** 每次加载页面不同：扩展里存着的旧 uid 在刷新后必须失效，不能碰巧指到别的元素 */
const DOC = Math.random().toString(36).slice(2, 6);

export function uidOf(el: Element): string {
  let u = byEl.get(el);
  if (!u) {
    u = `${DOC}${(++seq).toString(36)}`;
    byEl.set(el, u);
    byId.set(u, new WeakRef(el));
  }
  return u;
}

export function elOf(uid: string): Element | null {
  const el = byId.get(uid)?.deref();
  return el && el.isConnected ? el : null;
}

export function isOwnNode(node: Node | null | undefined): boolean {
  if (!node) return false;
  if (node instanceof Element && node.hasAttribute(OWN_ATTR)) return true;
  const root = node.getRootNode();
  return root instanceof ShadowRoot && root.host.hasAttribute(OWN_ATTR);
}

export function isOwnSheet(sheet: CSSStyleSheet): boolean {
  return isOwnNode(sheet.ownerNode);
}

export function stripQuery(url: string): string {
  const q = url.indexOf('?');
  return q < 0 ? url : url.slice(0, q);
}

/** 外链样式表对应的本地源文件（href 去掉查询串作键），null 表示看过了但对不上单个文件 */
const linkSources = new Map<string, string | null>();

/**
 * 样式表对应的源文件：Vite 注入的 <style data-vite-dev-id>，
 * 或打包器（Turbopack 等）的外链 CSS 的 sourcemap 里唯一的本地 .css 源。
 */
export function sheetDevId(sheet: CSSStyleSheet): string | null {
  const owner = sheet.ownerNode as Element | null;
  const vite = owner && typeof owner.getAttribute === 'function' ? owner.getAttribute('data-vite-dev-id') : null;
  if (vite) return vite;
  return sheet.href ? (linkSources.get(stripQuery(sheet.href)) ?? null) : null;
}

/** 读新出现的同源外链样式表的 sourcemap，记下对应的源文件；有新发现时返回 true */
export async function loadSheetSources(): Promise<boolean> {
  const hrefs = Array.from(document.styleSheets)
    .map((s) => s.href)
    .filter((h): h is string => !!h && h.startsWith(location.origin) && !linkSources.has(stripQuery(h)));
  let learned = false;
  await Promise.all(
    hrefs.map(async (href) => {
      const key = stripQuery(href);
      linkSources.set(key, null);
      try {
        const ref = extractMapUrl(await (await fetch(href)).text());
        if (!ref) return;
        const json = ref.startsWith('data:') ? decodeDataUrl(ref) : await (await fetch(new URL(ref, href))).text();
        const files = [...new Set(sourcesOf(JSON.parse(json) as SourceMap).map(filePathOf))];
        if (files.length === 1 && files[0] && /\.css$/i.test(files[0])) {
          linkSources.set(key, files[0]);
          learned = true;
        }
      } catch {
        /* 读不到 sourcemap 就按 href 找文件 */
      }
    }),
  );
  return learned;
}

const twCache = new WeakMap<CSSStyleSheet, boolean>();

/** Tailwind 生成的样式表：Vite 注入的 <style> 带版权横幅；外链 CSS 看有没有 theme + utilities 两个层 */
export function isTailwindSheet(sheet: CSSStyleSheet): boolean {
  let v = twCache.get(sheet);
  if (v !== undefined) return v;
  const owner = sheet.ownerNode as Element | null;
  const text = owner && owner.textContent ? owner.textContent.slice(0, 300) : '';
  v = text.includes('tailwindcss v');
  if (!v) {
    try {
      const names = new Set<string>();
      const rules = sheet.cssRules;
      for (let i = 0; i < Math.min(rules.length, 12); i++) {
        const r = rules[i];
        if (typeof CSSLayerStatementRule === 'function' && r instanceof CSSLayerStatementRule) r.nameList.forEach((n) => names.add(n));
        else if (typeof CSSLayerBlockRule === 'function' && r instanceof CSSLayerBlockRule) names.add(r.name);
      }
      v = names.has('theme') && names.has('utilities');
    } catch {
      v = false;
    }
  }
  twCache.set(sheet, v);
  return v;
}

export function labelOf(el: Element): string {
  let s = el.tagName.toLowerCase();
  if (el.id) s += `#${el.id}`;
  const cls = Array.from(el.classList).slice(0, 2);
  for (const c of cls) s += `.${c.length > 24 ? c.slice(0, 23) + '…' : c}`;
  if (el.classList.length > 2) s += '…';
  return s;
}

export function unescapeIdent(s: string): string {
  return s.replace(/\\([0-9a-fA-F]{1,6}\s?|[\s\S])/g, (_, esc: string) => {
    if (/^[0-9a-fA-F]/.test(esc) && esc.trim().length > 0 && /^[0-9a-fA-F]+\s?$/.test(esc)) {
      return String.fromCodePoint(parseInt(esc.trim(), 16));
    }
    return esc;
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 等条件成立：DOM 一有变化（className、热更新替换 <style>）就检查。
 * 不能只靠定时器轮询——页面在后台时浏览器把定时器限到每秒一次，校验会被拖到整秒。
 */
export function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  if (cond()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      mo.disconnect();
      clearInterval(iv);
      clearTimeout(to);
      resolve(v);
    };
    const check = () => {
      if (cond()) finish(true);
    };
    const mo = new MutationObserver(check);
    mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const iv = setInterval(check, 40);
    const to = setTimeout(() => finish(cond()), timeoutMs);
  });
}

export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
