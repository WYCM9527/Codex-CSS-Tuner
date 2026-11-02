import { parseColor, parseCssNumber, type CssVar, type PageInfo, type SheetInfo } from '@css-tuner/protocol';
import { collectRules } from './cascade';
import { hasReact } from './source';
import { isOwnSheet, isTailwindSheet, sheetDevId } from './util';

export function sheetsInfo(): SheetInfo[] {
  return Array.from(document.styleSheets)
    .map((s, index) => {
      if (isOwnSheet(s)) return null;
      const devId = sheetDevId(s);
      let ruleCount = 0;
      try {
        ruleCount = s.cssRules.length;
      } catch {
        ruleCount = -1;
      }
      return { index, devId, href: s.href, inline: !s.href && !devId, tailwind: isTailwindSheet(s), ruleCount };
    })
    .filter((s): s is SheetInfo => !!s);
}

export function kindOf(value: string): CssVar['kind'] {
  const v = value.trim();
  const n = parseCssNumber(v);
  if (n) return n.unit === '' ? 'number' : 'length';
  if (parseColor(v)) return 'color';
  return 'other';
}

export function rootVars(limit = 600): CssVar[] {
  const idx = collectRules(isOwnSheet);
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const seen = new Set<string>();
  const out: CssVar[] = [];
  for (const fr of idx.rules) {
    if (!fr.active) continue;
    let matches = false;
    try {
      matches = root.matches(fr.fullSelector);
    } catch {
      matches = false;
    }
    if (!matches) continue;
    for (let i = 0; i < fr.style.length; i++) {
      const name = fr.style[i];
      if (!name.startsWith('--') || seen.has(name)) continue;
      seen.add(name);
      const value = cs.getPropertyValue(name).trim();
      if (!value) continue;
      out.push({ name, value, kind: kindOf(value) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function pageInfo(): PageInfo {
  return {
    url: location.href,
    title: document.title,
    react: hasReact(),
    vite: !!document.querySelector('script[src*="/@vite/client"]') || !!document.querySelector('style[data-vite-dev-id]'),
    sheets: sheetsInfo(),
    rootVars: rootVars(),
  };
}
