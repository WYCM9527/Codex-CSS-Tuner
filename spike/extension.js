const vscode = require('vscode');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function activate(context) {
  const cfgPath = path.join(context.extensionPath, 'spike-config.json');
  if (!fs.existsSync(cfgPath)) return;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const results = { startedAt: new Date().toISOString(), cursorVersion: vscode.version, appName: vscode.env.appName, steps: [] };
  const write = () => fs.writeFileSync(cfg.out, JSON.stringify(results, null, 2));
  const log = (name, ok, detail) => { results.steps.push({ name, ok, detail }); write(); };
  const exec = async (cmd, ...args) => {
    try { return { ok: true, value: await vscode.commands.executeCommand(cmd, ...args) }; }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  };
  const js = (script, id) => exec('cursor.browserView.executeJavaScript', script, id);
  const cdp = (method, params, id) => exec('cursor.browserView.sendCDPCommand', method, params, id);

  async function waitReady(id, timeoutMs = 30000) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeoutMs) {
      last = await js('document.readyState + "|" + location.href', id);
      if (last.ok && typeof last.value === 'string' && last.value.startsWith('complete|http')) return { ready: true, ms: Date.now() - t0, value: last.value };
      await sleep(400);
    }
    return { ready: false, last };
  }

  if (cfg.mode === 'inject') {
    try {
      for (const target of cfg.targets) {
        const browserId = crypto.randomBytes(3).toString('hex');
        await exec('workbench.action.openBrowserEditor', { url: target.url, browserId });
        const ready = await waitReady(browserId);
        if (!ready.ready) { log(`${target.name}:open`, false, ready); continue; }
        const enable = await cdp('Page.enable', {}, browserId);
        const add = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__CSS_TUNER_SPIKE__ = (window.__CSS_TUNER_SPIKE__ || 0) + 1; window.__CSS_TUNER_T__ = performance.now();' }, browserId);
        const check = async (label) => {
          await sleep(600);
          const r = await waitReady(browserId);
          const v = await js('JSON.stringify({ n: window.__CSS_TUNER_SPIKE__, t: window.__CSS_TUNER_T__, href: location.href })', browserId);
          return { label, ready: r.ready, value: v.ok ? v.value : v.error };
        };
        const steps = [];
        steps.push(await check('noReloadYet'));
        await js('setTimeout(() => location.reload(), 50); true', browserId);
        steps.push(await check('afterLocationReload'));
        const rl = await exec('cursor.browserView.reload', browserId);
        steps.push({ ...(await check('afterBrowserViewReload')), rl });
        await js(`setTimeout(() => { location.href = ${JSON.stringify(target.url)} + '?css-tuner=1'; }, 50); true`, browserId);
        steps.push(await check('afterLocationHref'));
        const nav = await exec('cursor.browserView.navigate', target.url, browserId);
        steps.push({ ...(await check('afterBrowserViewNavigate')), nav });
        log(`${target.name}:injectVariants`, add.ok, { enable, add, steps });
      }
    } catch (e) {
      log('fatal', false, String((e && e.stack) || e));
    }
    results.finishedAt = new Date().toISOString();
    write();
    setTimeout(() => vscode.commands.executeCommand('workbench.action.closeWindow'), 1500);
    return;
  }

  try {
    const all = await vscode.commands.getCommands(true);
    const needed = [
      'workbench.action.openBrowserEditor',
      'cursor.browserView.executeJavaScript',
      'cursor.browserView.executeJavaScriptInIsolatedWorld',
      'cursor.browserView.sendCDPCommand',
      'cursor.browserView.listTabs',
      'cursor.browserView.navigate',
      'cursor.browserView.selectTab',
      'workbench.action.chat.open',
    ];
    const presence = Object.fromEntries(needed.map((c) => [c, all.includes(c)]));
    log('commands', needed.every((c) => presence[c]), { presence, browserCommands: all.filter((c) => c.startsWith('cursor.browserView.')) });

    const token = crypto.randomBytes(12).toString('hex');
    const server = http.createServer();
    const wss = new WebSocketServer({ server });
    const messages = [];
    wss.on('connection', (ws, req) => {
      const authed = (req.url || '').includes(token);
      messages.push({ event: 'connect', authed, origin: req.headers.origin || null });
      ws.on('message', (m) => {
        const data = m.toString();
        if (data.startsWith('ping:')) { ws.send('pong:' + data.slice(5)); return; }
        messages.push({ event: 'message', authed, data });
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const opened = [];
    for (const target of cfg.targets) {
      const browserId = crypto.randomBytes(3).toString('hex');
      opened.push({ name: target.name, browserId });
      const openRes = await exec('workbench.action.openBrowserEditor', { url: target.url, browserId });
      const ready = await waitReady(browserId);
      log(`${target.name}:open`, openRes.ok && ready.ready, { browserId, openRes, ready });
      if (!ready.ready) continue;

      const tabs = await exec('cursor.browserView.listTabs');
      const tabList = tabs.ok && tabs.value && tabs.value.tabs ? tabs.value.tabs : [];
      log(`${target.name}:listTabs`, tabs.ok && JSON.stringify(tabList).includes(browserId), tabs);

      const iso = await exec('cursor.browserView.executeJavaScriptInIsolatedWorld', 'typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ + "|" + document.title', browserId);
      const main = await js('typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ + "|" + document.title', browserId);
      log(`${target.name}:worlds`, main.ok, { main, iso });

      const add = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__CSS_TUNER_SPIKE__ = (window.__CSS_TUNER_SPIKE__ || 0) + 1;', runImmediately: true }, browserId);
      const before = await js('window.__CSS_TUNER_SPIKE__', browserId);
      await js('setTimeout(() => location.reload(), 50); true', browserId);
      await sleep(800);
      const reReady = await waitReady(browserId);
      const after = await js('window.__CSS_TUNER_SPIKE__', browserId);
      log(`${target.name}:injectPersist`, add.ok && after.ok && after.value === 1, { add, before, reReady, after });

      const rt = await cdp('Runtime.evaluate', { expression: '1 + 1', returnByValue: true }, browserId);
      log(`${target.name}:cdpRuntime`, rt.ok, rt);

      let cssCdp;
      try {
        const doc = await cdp('DOM.getDocument', { depth: 1 }, browserId);
        const rootId = doc.ok && doc.value && doc.value.root ? doc.value.root.nodeId : null;
        const q = rootId != null ? await cdp('DOM.querySelector', { nodeId: rootId, selector: target.cssProbeSelector || 'body *' }, browserId) : null;
        const en = await cdp('CSS.enable', {}, browserId);
        const nodeId = q && q.ok ? q.value.nodeId : null;
        const matched = nodeId ? await cdp('CSS.getMatchedStylesForNode', { nodeId }, browserId) : null;
        cssCdp = {
          doc: doc.ok, q: q && q.ok, en,
          matchedOk: matched && matched.ok,
          matchedError: matched && matched.error,
          ruleCount: matched && matched.ok && matched.value.matchedCSSRules ? matched.value.matchedCSSRules.length : null,
          firstRules: matched && matched.ok && matched.value.matchedCSSRules ? matched.value.matchedCSSRules.slice(-3).map((r) => ({ selector: r.rule.selectorList.text, origin: r.rule.origin, styleSheetId: r.rule.style.styleSheetId, range: r.rule.style.range })) : null,
        };
      } catch (e) { cssCdp = { error: String(e) }; }
      log(`${target.name}:cdpCss`, !!(cssCdp && cssCdp.matchedOk), cssCdp);

      const wsScript = `new Promise((res) => {
        try {
          const ws = new WebSocket('ws://127.0.0.1:${port}/?token=${token}');
          const rtts = [];
          let t0 = 0;
          const ping = () => { t0 = performance.now(); ws.send('ping:' + rtts.length); };
          ws.onmessage = (ev) => {
            rtts.push(performance.now() - t0);
            if (rtts.length < 50) ping();
            else {
              rtts.sort((a, b) => a - b);
              res({ state: 'open', rttMedianMs: rtts[25], rttP95Ms: rtts[47] });
              ws.close();
            }
          };
          ws.onopen = () => { ws.send('hello-from-${target.name}'); ping(); };
          ws.onerror = () => res({ state: 'error' });
          setTimeout(() => res({ state: 'timeout', n: rtts.length }), 8000);
        } catch (e) { res({ state: 'throw:' + e }); }
      })`;
      const wsRes = await js(wsScript, browserId);
      await sleep(300);
      const got = messages.some((m) => m.event === 'message' && m.authed && m.data === `hello-from-${target.name}`);
      log(`${target.name}:websocket`, wsRes.ok && wsRes.value && wsRes.value.state === 'open' && got, { wsRes, messages: messages.slice(-3) });

      const lat = [];
      for (let i = 0; i < 20; i++) {
        const t0 = Date.now();
        await js('1', browserId);
        lat.push(Date.now() - t0);
      }
      lat.sort((a, b) => a - b);
      log(`${target.name}:execLatency`, true, { medianMs: lat[10], maxMs: lat[19] });

      const probe = fs.readFileSync(path.join(context.extensionPath, 'probe.js'), 'utf8');
      const probeRes = await js(probe, browserId);
      log(`${target.name}:sourceProbe`, probeRes.ok, probeRes);
    }

    if (opened.length > 1) {
      const first = opened[0];
      const bg = await js('document.visibilityState + "|" + location.href', first.browserId);
      const tabsNow = await exec('cursor.browserView.listTabs');
      log('backgroundTabExec', bg.ok && typeof bg.value === 'string', { tab: first, bg, activeTab: tabsNow.ok && tabsNow.value ? tabsNow.value.activeTab : null });
    }

    const ids0 = await exec('composer.getOrderedSelectedComposerIds');
    const chat = await exec('workbench.action.chat.open', { query: 'css-tuner spike：预填测试，请勿发送。\n- src/App.tsx:12 `p-4` → `p-5`' });
    await sleep(1500);
    const ids1 = await exec('composer.getOrderedSelectedComposerIds');
    const before0 = ids0.ok && Array.isArray(ids0.value) ? ids0.value : [];
    const after1 = ids1.ok && Array.isArray(ids1.value) ? ids1.value : [];
    const newIds = after1.filter((id) => !before0.includes(id));
    log('chatPrefill', chat.ok && newIds.length === 1, { chat, ids0, ids1, newIds });
    await sleep(4000);

    wss.close();
    server.close();
  } catch (e) {
    log('fatal', false, String((e && e.stack) || e));
  }
  results.finishedAt = new Date().toISOString();
  write();

  const flag = path.join(context.extensionPath, 'close.flag');
  if (cfg.closeWindow) {
    setTimeout(() => vscode.commands.executeCommand('workbench.action.closeWindow'), 1500);
  } else {
    const timer = setInterval(() => {
      if (fs.existsSync(flag)) {
        clearInterval(timer);
        fs.unlinkSync(flag);
        vscode.commands.executeCommand('workbench.action.closeWindow');
      }
    }, 1000);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
