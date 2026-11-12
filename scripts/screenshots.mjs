// 重新生成 README 和插件目录用的截图（plugins/css-tuner/assets/screenshot*.png）：
// 无头 Chrome 打开演示页（面板停靠在旁边），打开选取、点 Pro 卡片、改内边距和圆角，指针移开再移回卡片
// （画出实线框、代码位置和同源元素），展开改动清单，中英文各截一张。
// 先起演示页和 CSS Tuner（用临时数据目录，免得动到自己的设置和改动记录）：
//   pnpm --filter fixture-demo dev --port 5174
//   CSS_TUNER_DATA=/tmp/css-tuner-shots node plugins/css-tuner/server/cli.mjs open http://localhost:5174/ --root fixtures/demo
// 再用输出的地址：node scripts/screenshots.mjs http://localhost:15174/（CHROME 换 Chrome 的路径）
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = createRequire(join(repo, 'packages/server/package.json'))('ws');
const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/screenshots.mjs <CSS Tuner page URL>');
  process.exit(64);
}
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1600;
const H = 960;
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LANGS = {
  en: { out: 'screenshot.png', lang: 'English', fields: ['Left and right padding', 'Top and bottom padding', 'Radius'] },
  zh: { out: 'screenshot.zh-CN.png', lang: '简体中文', fields: ['左右内边距', '上下内边距', '圆角'] },
};

/** 每种语言用新的浏览器配置：面板的折叠状态存在 localStorage 里，换了配置就是默认的 */
async function shoot({ out, lang, fields }) {
  const profile = mkdtempSync(join(tmpdir(), 'css-tuner-chrome-'));
  const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      target = await fetch(`http://127.0.0.1:${PORT}/json/list`)
        .then((r) => r.json())
        .then((list) => list.find((t) => t.type === 'page'))
        .catch(() => undefined);
    }
    if (!target) throw new Error('Chrome did not start');
    const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
    await new Promise((r, j) => ws.once('open', r).once('error', j));
    const waiting = new Map();
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      waiting.get(m.id)?.(m);
      waiting.delete(m.id);
    });
    let seq = 0;
    const send = (method, params = {}) =>
      new Promise((r) => {
        const id = ++seq;
        waiting.set(id, r);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const js = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
      return r.result?.result?.value;
    };
    const until = async (expression, what) => {
      for (let i = 0; i < 75; i++) {
        if (await js(expression).catch(() => false)) return;
        await sleep(200);
      }
      throw new Error(`timed out waiting for ${what}`);
    };
    const panel = `document.querySelector('css-tuner-panel').shadowRoot.querySelector('iframe').contentDocument`;
    // 停靠时页面在设备框页面的 iframe 里，浮动时就在这一层
    const page = `(window.__CSS_TUNER_FRAME__?.element.contentDocument ?? document)`;
    const click = (pred) => js(`Array.prototype.find.call(${panel}.querySelectorAll('button'), (b) => ${pred}).click()`);
    /** 元素在窗口里的一点：离左边 dx（不给时取中间），停靠时加上 iframe 的偏移 */
    const pointOf = (selector, dx) =>
      js(`(() => {
        const frame = window.__CSS_TUNER_FRAME__?.element;
        const f = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
        const r = ${page}.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return { x: f.left + r.left + (${dx ?? 'r.width / 2'}), y: f.top + r.top + r.height / 2 };
      })()`);
    const mouse = (type, { x, y }) => send('Input.dispatchMouseEvent', { type, x, y, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
    // 卡片左边的内边距：点中的是卡片自己，不是里面的文字
    const card = (plan) => pointOf(`[data-plan=${plan}]`, 12);
    const pickCard = async (plan) => {
      const at = await card(plan);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await mouse(type, at);
      await sleep(1800);
    };

    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
    await send('Page.enable');
    await send('Page.navigate', { url });
    // 面板停靠时页面先换成设备框页面，再在里面的 iframe 里加载
    await until(`!!${page}.querySelector('[data-plan=pro]') && !!${panel}.querySelector('button.pick')`, 'the page and the panel');
    await sleep(1000);
    await click(`b.title === ${JSON.stringify(lang)}`);
    await sleep(1200);
    // 选取元素点一次一直开着；上一种语言截图时开着的话，页面连上时已经接着开了
    await js(`(() => { const b = ${panel}.querySelector('button.pick'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); })()`);
    await sleep(500);
    await pickCard('pro');
    for (const [i, value] of ['32', '32', '24'].entries()) {
      await js(`(() => {
        const doc = ${panel}; const w = doc.defaultView;
        const input = Array.prototype.find.call(doc.querySelectorAll('input'), (x) => x.getAttribute('aria-label') === ${JSON.stringify(fields[i])});
        input.focus();
        Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new w.Event('input', { bubbles: true }));
        input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        input.blur();
      })()`);
      await sleep(900);
    }
    // 重新选中一次，尺寸按改过的样子量：点已经选中的元素不算重新选，先换到别的卡片再点回来
    await pickCard('starter');
    await pickCard('pro');
    // 刚点选的元素不画框：指针移开再移回，才画出实线框、代码位置和同源元素
    await mouse('mouseMoved', await pointOf('h1'));
    await sleep(400);
    await mouse('mouseMoved', await card('pro'));
    await click(`/^(改动|Changes)/.test(b.textContent.trim())`);
    await sleep(1500);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = join(repo, 'plugins/css-tuner/assets', out);
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log('saved', file);
    ws.close();
  } finally {
    chrome.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
  }
}

for (const spec of Object.values(LANGS)) await shoot(spec);
