import { getLocale, t } from '@css-tuner/protocol';
import { BRIDGE_TAG } from './inject';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 面板页：面板的脚本和样式在同一目录；启动参数（WebSocket 路径和令牌）直接写在页面里 */
export function panelHtml(boot: { ws: string; token: string }): string {
  return `<!doctype html>
<html lang="${getLocale()}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CSS Tuner</title>
<link rel="stylesheet" href="./index.css">
<script>window.__CSS_TUNER_PANEL__=${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>
</head>
<body>
<div id="root"></div>
<script type="module" src="./index.js"></script>
</body>
</html>`;
}

/**
 * 设备框：页面放进固定宽度的 iframe 里（媒体查询按这个宽度算），放不下时整体缩小显示；
 * 面板停靠在旁边，不挡页面。iframe 里的页面同源，桥接脚本在里面照常连回来
 */
export function frameHtml(): string {
  return `<!doctype html>
<html lang="${getLocale()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CSS Tuner</title>
<style>
html, body { margin: 0; height: 100%; overflow: hidden; background: #1b1b1b; }
#stage { position: fixed; top: 0; bottom: 0; left: var(--css-tuner-left, 0px); right: var(--css-tuner-right, 0px); display: flex; flex-direction: column; }
#bar { flex: none; height: 30px; display: flex; align-items: center; justify-content: center; gap: 10px; font: 12px/1 system-ui, -apple-system, sans-serif; color: #a8a8a8; font-variant-numeric: tabular-nums; }
#bar button { font: inherit; color: #d8d8d8; background: #2b2b2b; border: 1px solid #3a3a3a; border-radius: 5px; padding: 4px 9px; cursor: pointer; }
#bar button:hover { background: #343434; }
#box { position: relative; flex: 1; overflow: hidden; }
#dev { position: absolute; top: 0; left: 50%; border: 0; background: #fff; transform-origin: top center; box-shadow: 0 0 0 1px #333, 0 10px 32px rgba(0, 0, 0, 0.45); }
</style>
${BRIDGE_TAG}
</head>
<body>
<div id="stage">
  <div id="bar"><span id="size"></span><button id="exit" type="button">${esc(t('frame.exit'))}</button></div>
  <div id="box"><iframe id="dev" title="${esc(t('frame.title'))}"></iframe></div>
</div>
<script>
(() => {
  const q = new URLSearchParams(location.search);
  let width = Math.max(240, Math.min(3840, Number(q.get('w')) || 390));
  const u = q.get('u') || '/';
  const start = u.startsWith('/') && !u.startsWith('//') ? u : '/';
  const dev = document.getElementById('dev');
  const box = document.getElementById('box');
  const size = document.getElementById('size');
  const stage = document.getElementById('stage');
  const current = () => {
    try {
      const l = dev.contentWindow.location;
      return l.origin === location.origin ? l.pathname + l.search + l.hash : start;
    } catch {
      return start;
    }
  };
  let last = '';
  const remember = () => {
    const p = new URLSearchParams({ w: String(width), u: current() }).toString();
    if (p === last) return;
    last = p;
    history.replaceState(null, '', location.pathname + '?' + p);
  };
  const layout = () => {
    const avail = Math.max(120, box.clientWidth - 24);
    const scale = Math.min(1, avail / width);
    const h = Math.max(200, box.clientHeight - 12) / scale;
    dev.style.width = width + 'px';
    dev.style.height = Math.round(h) + 'px';
    dev.style.transform = 'translateX(-50%) scale(' + scale + ')';
    size.textContent = width + ' × ' + Math.round(h) + (scale < 1 ? ' · ' + Math.round(scale * 100) + '%' : '');
  };
  const dock = (d) => {
    if (!d) return;
    const w = d.collapsed ? '0px' : d.width + 'px';
    stage.style.setProperty('--css-tuner-left', d.side === 'left' ? w : '0px');
    stage.style.setProperty('--css-tuner-right', d.side === 'right' ? w : '0px');
    layout();
  };
  window.__CSS_TUNER_FRAME__ = {
    get width() { return width; },
    setWidth(w) { width = Math.max(240, Math.min(3840, Math.round(w))); layout(); remember(); },
    exit() { location.assign(current()); },
    element: dev,
  };
  addEventListener('css-tuner-panel', (e) => dock(e.detail));
  dock(window.__CSS_TUNER_PANEL_HOST__ && window.__CSS_TUNER_PANEL_HOST__.state());
  addEventListener('resize', layout);
  dev.addEventListener('load', remember);
  setInterval(remember, 1000);
  document.getElementById('exit').addEventListener('click', () => window.__CSS_TUNER_FRAME__.exit());
  dev.src = start;
  layout();
})();
</script>
</body>
</html>`;
}

/** 开发服务器连不上：说明一下，每隔几秒自己再试 */
export function unreachableHtml(target: string, error: string): string {
  return `<!doctype html>
<html lang="${getLocale()}">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="3">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CSS Tuner</title>
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f6f6; color: #222; font: 14px/1.6 system-ui, -apple-system, sans-serif; }
main { max-width: 520px; padding: 24px; }
h1 { font-size: 16px; margin: 0 0 8px; }
code { font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; background: #e9e9e9; padding: 1px 5px; border-radius: 4px; }
p { margin: 6px 0; color: #555; }
@media (prefers-color-scheme: dark) { body { background: #1b1b1b; color: #eee; } p { color: #aaa; } code { background: #2c2c2c; } }
</style>
</head>
<body><main>
<h1>${esc(t('proxy.unreachable.title'))}</h1>
<p>${t('proxy.unreachable.body', { target: `<code>${esc(target)}</code>` })}</p>
<p><code>${esc(error)}</code></p>
</main></body>
</html>`;
}
