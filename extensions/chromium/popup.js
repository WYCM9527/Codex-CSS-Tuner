const form = document.querySelector('form');
const input = document.getElementById('pairing');
const status = document.getElementById('status');
const review = document.getElementById('review');
const submit = form.querySelector('button');
const project = document.getElementById('project');
const connect = document.getElementById('connect-saved');
const disconnect = document.getElementById('disconnect');
const forget = document.getElementById('forget');
const manual = document.getElementById('manual');
const disclosure = document.getElementById('pairing-disclosure');
const setup = document.getElementById('setup');
const setupButton = document.getElementById('setup-project');
const setupReview = document.getElementById('setup-review');
const zh = /^zh\b/i.test(navigator.language);
const tr = (cn, en) => zh ? cn : en;
const reviewLabel = tr('查看绑定信息', 'Review binding');
const setupLabel = tr('设置此项目', 'Set up this project');
let approved = null;
let setupApproved = null;
let setupTimer;

if (zh) {
  document.documentElement.lang = 'zh-CN';
  form.querySelector('label').textContent = '粘贴本机 CLI 输出的配对链接';
  disclosure.textContent = 'CSS Tuner 使用当前本地标签页的地址、页面内容和编辑操作来预览改动，并与这台电脑上的本机程序交换这些数据。本机程序读取相关项目文件，并在本机保留编辑记录。是否发送草稿由你在 Codex 中决定。';
  manual.querySelector('summary').textContent = '使用配对链接';
  connect.textContent = '连接此项目';
  disconnect.textContent = '断开标签页';
  forget.textContent = '忘记已保存的项目';
}
submit.textContent = reviewLabel;
setupButton.textContent = setupLabel;

async function request(type, args = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const result = await chrome.runtime.sendMessage({ type, tabId: tab?.id, url: tab?.url, ...args });
  if (!result?.ok) throw new Error(result?.error ?? tr('无法操作，请重试。', 'Unable to continue. Try again.'));
  return result;
}

function projectDetails(data) {
  return [
    tr('本地预览 ', 'Preview ') + (data.origin ?? data.url),
    data.root && tr('项目目录 ', 'Project folder ') + data.root,
    data.chat && tr('Codex 对话 ', 'Codex chat ') + data.chat,
  ];
}

async function render() {
  const data = await request('status');
  project.hidden = !data.project;
  if (data.project) {
    const [origin, root, chat] = projectDetails(data.project);
    document.getElementById('project-origin').textContent = origin;
    document.getElementById('project-root').textContent = root;
    document.getElementById('project-chat').textContent = chat;
  }
  const canSetUp = data.local && !data.project && !data.legacyAttached;
  setup.hidden = !canSetUp;
  manual.hidden = !canSetUp || !!data.setupCheck;
  form.hidden = manual.hidden;
  disclosure.hidden = !canSetUp || !manual.open;
  connect.hidden = !data.matches || !!data.connected;
  disconnect.hidden = !data.attached && !data.legacyAttached;
  forget.hidden = !data.project;
  status.textContent = data.attached || data.legacyAttached
    ? (data.connected
      ? tr('已连接此项目。', 'This project is connected.')
      : tr('标签页已绑定，正在等待 Companion。', 'The tab is bound and waiting for the companion.'))
    : data.project
      ? (data.matches
        ? tr('点「连接此项目」打开 CSS Tuner 面板。', 'Select Connect this project to open the CSS Tuner panel.')
        : tr('请打开上方保存的本地地址后连接。', 'Open the saved local address above to connect.'))
      : tr('首次设置请在终端运行 Companion 的 extension setup，然后点击「设置此项目」。', 'For first-time setup, run extension setup in the Companion terminal, then select Set up this project.');
  if (data.setupCheck) waitForApproval(data.setupCheck);
}

function waitForApproval(check) {
  clearTimeout(setupTimer);
  setupButton.disabled = true;
  setupButton.textContent = tr('等待终端确认', 'Waiting for terminal approval');
  manual.hidden = true;
  disclosure.hidden = true;
  setupReview.textContent = tr(`核对终端也显示 ${check}，然后在终端输入 y 并回车。`, `Check that the terminal also shows ${check}, then type y in the terminal and press Enter.`);
  setupReview.hidden = false;
  async function checkApproval() {
    try {
      const result = await request('setupReview');
      if (result.pending) {
        setupTimer = setTimeout(checkApproval, 800);
        return;
      }
      setupApproved = result;
      setupReview.textContent = projectDetails(result).join('\n');
      setupButton.textContent = tr('同意并保存绑定', 'Agree and save binding');
      setupButton.disabled = false;
      disclosure.hidden = false;
      status.textContent = tr('请核对预览地址、项目目录和 Codex 对话。', 'Review the preview address, project folder and Codex chat.');
    } catch (error) {
      setupButton.textContent = setupLabel;
      setupButton.disabled = false;
      setupReview.hidden = true;
      manual.hidden = false;
      form.hidden = false;
      disclosure.hidden = !manual.open;
      status.textContent = error.message;
    }
  }
  void checkApproval();
}

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
    throw new Error(tr('请粘贴 CSS Tuner 本机 CLI 输出的配对链接。', 'Paste the pairing link from the CSS Tuner companion CLI.'));
  }
  return { port, code };
}

function clearReview() {
  approved = null;
  review.hidden = true;
  submit.textContent = reviewLabel;
}

async function action(button, run) {
  button.disabled = true;
  try {
    await run();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

input.addEventListener('input', clearReview);
manual.addEventListener('toggle', () => { disclosure.hidden = manual.hidden || !manual.open; });
setupButton.addEventListener('click', async () => {
  setupButton.disabled = true;
  try {
    if (setupApproved) {
      await request('setupConfirm', { approved: setupApproved });
      setupApproved = null;
      setupReview.hidden = true;
      await render();
      status.textContent = tr('已保存绑定并请求连接。', 'The binding was saved and the project is connecting.');
      return;
    }
    const { check } = await request('setupRequest');
    waitForApproval(check);
  } catch (error) {
    setupApproved = null;
    setupButton.disabled = false;
    setupButton.textContent = setupLabel;
    status.textContent = error.message;
  }
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  void action(submit, async () => {
    const pairing = readPairing(input.value);
    if (!approved) {
      const details = await request('review', { pairing });
      approved = { pairing, remember: details.canRemember === true };
      review.textContent = projectDetails(details).filter(Boolean).join('\n');
      review.hidden = false;
      submit.textContent = approved.remember
        ? tr('同意并保存绑定', 'Agree and save binding')
        : tr('同意并连接此标签页', 'Agree and connect this tab');
      return;
    }
    if (approved.pairing.port !== pairing.port || approved.pairing.code !== pairing.code) {
      clearReview();
      return;
    }
    await request('pair', approved);
    input.value = '';
    clearReview();
    await render();
    status.textContent = tr('已请求连接。项目页面会刷新一次。', 'Connecting. The project tab will reload once.');
  });
});

connect.addEventListener('click', () => void action(connect, async () => {
  await request('connectSaved');
  await render();
  status.textContent = tr('已请求连接。项目页面会刷新一次。', 'Connecting. The project tab will reload once.');
}));

disconnect.addEventListener('click', () => void action(disconnect, async () => {
  await request('disconnect');
  await render();
}));

forget.addEventListener('click', () => void action(forget, async () => {
  const result = await request('forget');
  await render();
  status.textContent = result.localOnly
    ? tr('已从这个浏览器忘记项目。Companion 未确认撤销。', 'Forgot this project in this browser. The companion did not confirm revocation.')
    : tr('已忘记项目。', 'Project binding removed.');
}));

void render().catch((error) => { status.textContent = error.message; });
