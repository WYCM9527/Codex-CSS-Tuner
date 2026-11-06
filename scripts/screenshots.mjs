// 重新生成 README 和插件目录用的截图（plugins/css-tuner/assets/screenshot*.png）：
// 无头 Chrome 打开演示页，选中 Pro 卡片、改内边距和圆角、展开改动清单，中英文各截一张。
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
    const panel = `document.querySelector('css-tuner-panel').shadowRoot.querySelector('iframe').contentDocument`;
    const click = (pred) => js(`Array.prototype.find.call(${panel}.querySelectorAll('button'), (b) => ${pred}).click()`);
    const pickCard = async () => {
      await click(`/^(选取元素|Pick Element)$/.test(b.textContent.trim())`);
      await sleep(500);
      await js(`document.querySelector('[data-plan=pro]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }))`);
      await sleep(1800);
    };

    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
    await send('Page.enable');
    await send('Page.navigate', { url });
    await sleep(3000);
    await click(`b.title === ${JSON.stringify(lang)}`);
    await sleep(1200);
    await pickCard();
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
    // 重新选中一次，尺寸按改过的样子量
    await pickCard();
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
