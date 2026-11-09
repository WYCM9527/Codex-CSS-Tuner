const form = document.querySelector('form');
const input = document.getElementById('pairing');
const status = document.getElementById('status');
const connect = form.querySelector('button');
const disconnect = document.getElementById('disconnect');
const zh = /^zh\b/i.test(navigator.language);
if (zh) {
  document.documentElement.lang = 'zh-CN';
  form.querySelector('label').textContent = '粘贴本机 CLI 输出的配对链接';
  connect.textContent = '连接当前项目标签页';
  disconnect.textContent = '断开浏览器配对';
  status.textContent = '先打开本机开发页面，再连接。';
}

chrome.runtime.sendMessage({ type: 'status' }).then((data) => {
  if (!data?.chat) return;
  form.hidden = true;
  disconnect.hidden = false;
  status.textContent = zh ? `已绑定对话 ${data.chat.slice(-8)}。关闭本机会话后可重新配对。` : `Chat ${data.chat.slice(-8)} is bound. Close the companion session to pair again.`;
}).catch(() => undefined);

function readPairing(value) {
  const link = /^css-tuner:\/\/pair\?port=(\d{1,5})&code=([a-f0-9]{64})$/.exec(value.trim());
  let port = link ? Number(link[1]) : undefined;
  let code = link?.[2];
  if (!link) {
    try {
      const data = JSON.parse(value);
      port = data?.port;
      code = data?.pairingCode;
    } catch {
      // Use the same guidance for malformed links and legacy JSON.
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code)) {
    throw new Error(zh ? '请粘贴 CSS Tuner 本机 CLI 输出的配对链接。' : 'Paste the pairing link from the CSS Tuner companion CLI.');
  }
  return { port, code };
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  connect.disabled = true;
  try {
    const pairing = readPairing(input.value);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.runtime.sendMessage({ type: 'pair', tabId: tab?.id, url: tab?.url, pairing });
    if (!result?.ok) throw new Error(result?.error ?? 'Unable to connect.');
    input.value = '';
    form.hidden = true;
    disconnect.hidden = false;
    status.textContent = zh ? '已连接。项目页面会刷新并打开 CSS Tuner。' : 'Connected. The project tab will reload and open CSS Tuner.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    connect.disabled = false;
  }
});

disconnect.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'disconnect' });
  form.hidden = false;
  disconnect.hidden = true;
  status.textContent = zh ? '已断开。打开新的本机会话以获取配对链接。' : 'Disconnected. Open a new companion session for a new pairing link.';
});
