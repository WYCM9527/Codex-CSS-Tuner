(async () => {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64MAP = {};
  for (let i = 0; i < 64; i++) B64MAP[B64[i]] = i;

  function decodeMappings(mappings) {
    const lines = [];
    let srcIdx = 0, srcLine = 0, srcCol = 0;
    for (const lineStr of mappings.split(';')) {
      const segs = [];
      let genCol = 0;
      if (lineStr) {
        for (const segStr of lineStr.split(',')) {
          if (!segStr) continue;
          const vals = [];
          let value = 0, shift = 0;
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

  function originalPositionFor(map, decoded, line1, col1) {
    const segs = decoded[line1 - 1];
    if (!segs || !segs.length) return null;
    const col0 = col1 - 1;
    let best = null;
    for (const s of segs) {
      if (s[0] <= col0) { if (s.length >= 4) best = s; }
      else break;
    }
    if (!best) return null;
    return { source: map.sources[best[1]], line: best[2] + 1, column: best[3] + 1 };
  }

  const mapCache = new Map();
  async function loadMap(url) {
    if (mapCache.has(url)) return mapCache.get(url);
    const p = (async () => {
      const text = await (await fetch(url)).text();
      const m = /\/\/[#@] sourceMappingURL=(\S+)\s*$/.exec(text);
      if (!m) return null;
      let json;
      if (m[1].startsWith('data:')) {
        const b64 = m[1].slice(m[1].indexOf(',') + 1);
        json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      } else {
        json = await (await fetch(new URL(m[1], url))).text();
      }
      const map = JSON.parse(json);
      return { map, decoded: decodeMappings(map.mappings) };
    })();
    mapCache.set(url, p);
    return p;
  }

  const FRAME_RE = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
  function isUserUrl(url) {
    return url.startsWith(location.origin) &&
      !url.includes('/node_modules/') && !url.includes('/.vite/') &&
      !url.includes('/@vite/') && !url.includes('/@react-refresh') && !url.includes('/@id/');
  }
  function userFrames(stack) {
    const out = [];
    for (const line of String(stack || '').split('\n')) {
      const m = FRAME_RE.exec(line.trim());
      if (!m) continue;
      const url = m[2];
      if (isUserUrl(url)) out.push({ fn: m[1] || null, url, line: +m[3], col: +m[4] });
    }
    return out;
  }

  function fiberOf(el) {
    for (const k in el) if (k.startsWith('__reactFiber$')) return el[k];
    return null;
  }

  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      let i = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++;
      parts.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    return parts.join('>');
  }

  async function resolveFiber(fiber) {
    let f = fiber, hops = 0;
    while (f && hops < 12) {
      const frames = userFrames(f._debugStack && f._debugStack.stack);
      if (frames.length) {
        const fr = frames[0];
        const m = await loadMap(fr.url);
        const orig = m ? originalPositionFor(m.map, m.decoded, fr.line, fr.col) : null;
        const sourceRoot = m && m.map.sourceRoot ? m.map.sourceRoot : '';
        return { hops, frame: fr, orig, sourceRoot, ownerName: f.type && (f.type.displayName || f.type.name) || (typeof f.type === 'string' ? f.type : null) };
      }
      f = f._debugOwner;
      hops++;
    }
    return { hops, frame: null, orig: null };
  }

  const all = Array.from(document.querySelectorAll('body [class]'));
  const step = Math.max(1, Math.floor(all.length / 40));
  const sample = all.filter((_, i) => i % step === 0).slice(0, 40);
  const results = [];
  let noFiber = 0, noStack = 0;
  for (const el of sample) {
    const fiber = fiberOf(el);
    if (!fiber) { noFiber++; continue; }
    if (!fiber._debugStack) noStack++;
    let r;
    try { r = await resolveFiber(fiber); } catch (e) { r = { error: String(e) }; }
    results.push({
      path: cssPath(el),
      tag: el.tagName.toLowerCase(),
      className: (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '').slice(0, 120),
      ...r,
    });
  }

  const sheets = Array.from(document.querySelectorAll('style[data-vite-dev-id], link[rel=stylesheet]')).map((n) => ({
    tag: n.tagName.toLowerCase(),
    devId: n.getAttribute('data-vite-dev-id'),
    href: n.getAttribute('href'),
    rules: n.sheet ? n.sheet.cssRules.length : null,
  }));

  const reactVersion = (() => {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook && hook.renderers) for (const r of hook.renderers.values()) return r.version;
    return null;
  })();

  return { href: location.href, total: all.length, sampled: sample.length, noFiber, noStack, reactVersion, results, sheets };
})()
