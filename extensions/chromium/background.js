const CHANNEL = 'css-tuner-extension';
const STATE = 'pair';
const SETUP_STATE = 'setup-request';
const CONNECT_PATH = '/_css_tuner/connect';
const BINDING_PATH = '/_css_tuner/binding';
const SETUP_PORT = 43681;
const SETUP_PATH = '/_css_tuner/setup';
const popupUrl = chrome.runtime.getURL('popup.html');
const zh = /^zh\b/i.test(navigator.language);
const ports = new Map();
const allowedBridge = new Set(['hello', 'page', 'pick', 'measure', 'select', 'editText', 'reorder', 'resize', 'log', 'res']);
let pairing = null;
let saved = null;
let pairingNow = false;
const initialized = Promise.all([chrome.storage.session.get(STATE), projectBinding('get')]).then(([data, binding]) => {
  pairing = data[STATE] ?? null;
  saved = binding ?? null;
});

// IndexedDB belongs to the extension origin. Content scripts have no access to this database.
async function projectBinding(action, value) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('css-tuner', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('projects');
      const request = action === 'get' ? store.get('saved') : action === 'put' ? store.put(value, 'saved') : store.delete('saved');
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function localOrigin(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname) && !parsed.username && !parsed.password ? parsed.origin : null;
  } catch { return null; }
}

function setupUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port && !url.username && !url.password &&
      url.pathname === CONNECT_PATH && !url.search ? url : null;
  } catch { return null; }
}

function tell(context, message) {
  if (ports.get(context.tabId) === context) context.port.postMessage(message);
}

function closeSockets(context) {
  for (const channel of context.channels.values()) channel.close();
  context.channels.clear();
}

async function disconnectActive() {
  const context = ports.get(pairing?.tabId);
  pairing = null;
  if (context) {
    closeSockets(context);
    tell(context, { type: 'closed' });
  }
  await chrome.storage.session.remove(STATE);
}

function attach(context, role, token, localPort) {
  const connection = pairing;
  let socket;
  let heartbeat;
  let retry;
  let attempts = 0;
  let authenticated = false;
  let stopped = false;
  function open() {
    if (stopped || ports.get(context.tabId) !== context) return;
    const ws = new WebSocket(`ws://127.0.0.1:${localPort}/ws/${role}`);
    socket = ws;
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    ws.addEventListener('message', ({ data }) => {
      if (socket !== ws || stopped) return;
      const frame = JSON.parse(data);
      if (!authenticated && frame.type === 'authenticated') {
        authenticated = true;
        attempts = 0;
        heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
        }, 20000);
        if (role === 'bridge') tell(context, { type: 'bridge', action: 'open' });
        else ws.send('{"t":"ready"}');
        return;
      }
      if (!authenticated || frame.type === 'pong') return;
      if (role === 'bridge' && frame.t === 'req') tell(context, { type: 'bridge', action: 'message', text: data });
      if (role === 'panel' && (frame.t === 'state' || frame.t === 'prompt')) tell(context, { type: 'panel', text: data });
    });
    ws.addEventListener('close', (event) => {
      clearInterval(heartbeat);
      authenticated = false;
      if (stopped || socket !== ws) return;
      if (event.code === 4410 || event.code === 1008) {
        if (pairing === connection) void disconnectActive();
        return;
      }
      tell(context, role === 'bridge' ? { type: 'bridge', action: 'offline' } : { type: 'panelOffline' });
      if (event.code !== 4409 && attempts < 6) retry = setTimeout(open, Math.min(5000, 300 * 2 ** attempts++));
    });
  }
  open();
  return {
    get online() { return authenticated; },
    send(text) { if (authenticated && socket.readyState === WebSocket.OPEN) socket.send(text); },
    close() {
      stopped = true;
      clearInterval(heartbeat);
      clearTimeout(retry);
      socket?.close();
    },
  };
}

function current(context) {
  return pairing?.tabId === context.tabId && pairing.origin === context.origin && ports.get(context.tabId) === context;
}

function bind(context) {
  if (current(context)) tell(context, { type: 'bind', session: pairing.sessionId, chat: pairing.chat });
}

chrome.tabs.onRemoved?.addListener((tabId) => {
  void initialized.then(() => { if (pairing?.tabId === tabId) return disconnectActive(); });
});

chrome.runtime.onConnect.addListener((port) => {
  const sender = port.sender;
  const tabId = sender?.tab?.id;
  const url = sender?.url ?? sender?.tab?.url;
  const origin = localOrigin(url);
  if (port.name !== CHANNEL || (sender?.frameId ?? 0) !== 0 || !Number.isInteger(tabId) || !origin) return;
  const prior = ports.get(tabId);
  if (prior) closeSockets(prior);
  const context = { port, origin, url, tabId, documentId: sender.documentId, channels: new Map() };
  ports.set(tabId, context);
  port.onDisconnect.addListener(() => {
    if (ports.get(tabId) === context) ports.delete(tabId);
    closeSockets(context);
  });
  port.onMessage.addListener((message) => {
    if (!current(context)) return;
    if (message.type === 'ready') {
      if (context.channels.size) return;
      context.channels.set('bridge', attach(context, 'bridge', pairing.bridgeToken, pairing.port));
      context.channels.set('panel', attach(context, 'panel', pairing.panelToken, pairing.port));
      return;
    }
    if (message.type !== 'bridge' && message.type !== 'panel') return;
    if (typeof message.text !== 'string' || message.text.length > 8 * 1024 * 1024) return;
    if (message.type === 'bridge') {
      try { if (!allowedBridge.has(JSON.parse(message.text)?.t)) return; }
      catch { return; }
    }
    context.channels.get(message.type)?.send(message.text);
  });
  void initialized.then(() => bind(context));
});

async function pairingRequest(port, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error ?? 'The companion rejected this pairing.'), { status: response.status });
  return result;
}

function validPairing(data) {
  return typeof data?.code === 'string' && /^[a-f0-9]{64}$/.test(data.code) && Number.isInteger(data.port) && data.port > 0 && data.port <= 65535;
}

function currentTab(message) {
  const context = ports.get(message.tabId);
  const origin = localOrigin(message.url);
  if (!context || !origin || context.origin !== origin || setupUrl(context.url)) {
    throw new Error(zh ? '请打开并刷新本地开发页面，然后重试。' : 'Open and reload the local development page, then try again.');
  }
  return context;
}

async function select(context, selected) {
  if (ports.get(context.tabId) !== context) throw new Error(zh ? '标签页已切换，请重试。' : 'The project tab changed. Try again.');
  if (pairing) await disconnectActive();
  await chrome.storage.session.set({ [STATE]: selected });
  pairing = selected;
  bind(context);
}

async function pair(context, origin, data, pageUrl, remember, expectedChat) {
  await initialized;
  if (pairing || pairingNow) throw new Error('Close the current companion session before pairing again.');
  if (saved) throw new Error(zh ? '请先在扩展里忘记已保存的项目。' : 'Forget the saved project in the extension before pairing again.');
  if (!context || !origin || ports.get(context.tabId) !== context || (!pageUrl && context.origin !== origin)) {
    throw new Error('Open the local project tab and reload it once.');
  }
  if (!validPairing(data)) {
    throw new Error('Paste the pairing link printed by the companion CLI.');
  }
  pairingNow = true;
  try {
    const result = await pairingRequest(data.port, '/pair', { code: data.code, pageOrigin: origin, pageUrl, remember });
    if (!/^codex:\/\/threads\/[a-f0-9-]{36}$/i.test(result.chat) || (expectedChat && result.chat !== expectedChat)) throw new Error('The companion did not return the approved Codex chat.');
    const { binding, ...session } = result;
    if (binding) {
      const record = { ...binding, origin, chat: session.chat };
      await projectBinding('put', record);
      saved = record;
    }
    await select(context, { ...session, tabId: context.tabId, origin, port: data.port });
    return { ok: true };
  } finally {
    pairingNow = false;
  }
}

const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const unhex = (value) => Uint8Array.from(value.match(/../g), (byte) => parseInt(byte, 16));
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));

async function pendingSetup(tabId, origin) {
  const { [SETUP_STATE]: attempt } = await chrome.storage.session.get(SETUP_STATE);
  return attempt?.tabId === tabId && attempt.origin === origin ? attempt : null;
}

function setupRequest(action, { origin, key }) {
  return pairingRequest(SETUP_PORT, SETUP_PATH, { action, pageOrigin: origin, key });
}

async function setupProject(action, context, approved) {
  if (saved || pairing || pairingNow) throw new Error(zh ? '请先断开当前项目或忘记已保存的项目。' : 'Disconnect the current project or forget the saved project first.');
  const attempt = await pendingSetup(context.tabId, context.origin);
  if (action === 'request') {
    const next = attempt ?? { key: hex(crypto.getRandomValues(new Uint8Array(32))), tabId: context.tabId, origin: context.origin };
    const { check } = await setupRequest(action, next).catch((error) => {
      if (error instanceof TypeError || error.name === 'TimeoutError') {
        throw new Error(zh ? '请先在终端运行新版 Companion 的 extension setup。' : 'Run extension setup with the updated companion first.');
      }
      throw error;
    });
    if (!/^\d{6}$/.test(check)) throw new Error('Invalid Companion setup response.');
    await chrome.storage.session.set({ [SETUP_STATE]: { ...next, check } });
    return { ok: true, check };
  }
  if (!attempt) throw new Error(zh ? '请先点击「设置此项目」。' : 'Select Set up this project first.');
  let data;
  try {
    data = await setupRequest('review', attempt);
  } catch (error) {
    await chrome.storage.session.remove(SETUP_STATE);
    if (error.status === 410) throw error;
    throw new Error(zh ? '设置请求已结束。请在终端重新运行 extension setup。' : 'This setup request ended. Run extension setup again.');
  }
  if (data.pending) return { ok: true, pending: true };
  if (!validPairing(data)) throw new Error('Invalid Companion setup response.');
  const { url, root, chat, canRemember } = await pairingRequest(data.port, `${CONNECT_PATH}/details`, { code: data.code });
  if (localOrigin(url) !== context.origin || !root || !chat || !canRemember) throw new Error('The Companion did not authorize this project.');
  if (action === 'review') return { ok: true, url, root, chat };
  if (approved?.url !== url || approved.root !== root || approved.chat !== chat) throw new Error('The project details changed. Review the binding again.');
  await pair(context, context.origin, data, url, true, chat);
  await chrome.storage.session.remove(SETUP_STATE);
  await setupRequest('done', attempt).catch(() => null);
  return { ok: true };
}

async function requestBinding(action, { id, key, port, origin }) {
  const signingKey = await crypto.subtle.importKey('raw', unhex(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const sign = async (value) => hex(new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, encode(value))));
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const proof = await sign(['request', id, action, origin, nonce]);
  let response;
  try {
    response = await pairingRequest(port, BINDING_PATH, { id, action, pageOrigin: origin, nonce, proof });
  } catch (error) {
    if (error instanceof TypeError || error.name === 'TimeoutError') {
      throw new Error(zh ? '本机 Companion 未连接。请运行 node cli.mjs extension start 后重试。' : 'The companion is unavailable. Run node cli.mjs extension start and try again.');
    }
    throw error;
  }
  if (typeof response?.payload !== 'string' || !/^[a-f0-9]{64}$/.test(response.proof) ||
    !await crypto.subtle.verify('HMAC', signingKey, unhex(response.proof), encode(['response', nonce, response.payload]))) {
    throw new Error(zh ? '无法验证本机 Companion。' : 'The companion could not be verified.');
  }
  const result = JSON.parse(response.payload);
  if (!result.ok) throw new Error(result.error);
  return { result, sign };
}

async function useBinding(action, context) {
  await initialized;
  if (!saved || pairingNow) throw new Error(zh ? '当前没有可用的项目绑定。' : 'No saved project is available.');
  if (context && context.origin !== saved.origin) throw new Error(zh ? '请切回已授权的本地开发地址。' : 'Switch to the authorized local development address.');
  pairingNow = true;
  try {
    if (action === 'forget') {
      const revoked = await requestBinding(action, saved).catch(() => null);
      await projectBinding('delete');
      saved = null;
      if (pairing) await disconnectActive();
      return { ok: true, localOnly: !revoked };
    }
    const { origin, chat } = saved;
    const { result, sign } = await requestBinding(action, saved);
    const { sessionId, port } = result;
    if (result.chat !== chat || !/^[a-f0-9]{32}$/.test(sessionId) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('The companion did not return the authorized session.');
    }
    await select(context, {
      sessionId, port, chat, origin, tabId: context.tabId,
      bridgeToken: await sign(['bridge', sessionId]), panelToken: await sign(['panel', sessionId]),
    });
    return { ok: true };
  } finally {
    pairingNow = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'connectDetails' || message?.type === 'connectPreview') {
    const source = setupUrl(sender.url);
    const context = ports.get(sender.tab?.id);
    if (sender.frameId !== 0 || !source || !context || !setupUrl(context.url) || context.origin !== source.origin ||
      context.documentId !== sender.documentId || typeof message.code !== 'string' || !/^[a-f0-9]{64}$/.test(message.code)) return;
    const port = Number(source.port);
    const request = message.type === 'connectDetails'
      ? pairingRequest(port, `${CONNECT_PATH}/details`, { code: message.code }).then((details) => ({ ok: true, ...details }))
      : pair(context, localOrigin(message.url), { port, code: message.code }, message.url, message.remember === true);
    void request.then(reply, (error) => reply({ ok: false, error: error.message }));
    return true;
  }
  if (sender.url !== popupUrl) return;
  void initialized.then(async () => {
    switch (message?.type) {
      case 'status': {
        const origin = localOrigin(message.url);
        const project = saved ? { root: saved.root, origin: saved.origin, chat: saved.chat } : null;
        const attached = !!pairing && pairing.tabId === message.tabId && pairing.origin === origin;
        const channels = ports.get(message.tabId)?.channels;
        const setup = !saved && !pairing && origin ? await pendingSetup(message.tabId, origin) : null;
        return { ok: true, local: !!origin, connected: attached && channels?.get('panel')?.online && channels?.get('bridge')?.online,
          attached, legacyAttached: !!pairing && !saved, chat: pairing?.chat ?? null, project, matches: !!saved && origin === saved.origin,
          setupCheck: setup?.check };
      }
      case 'setupRequest': return setupProject('request', currentTab(message));
      case 'setupReview': return setupProject('review', currentTab(message));
      case 'setupConfirm': return setupProject('confirm', currentTab(message), message.approved);
      case 'review': {
        const context = currentTab(message);
        if (!validPairing(message.pairing)) throw new Error('Invalid pairing link.');
        const { port, code } = message.pairing;
        const details = await pairingRequest(port, `${CONNECT_PATH}/details`, { code }).catch((error) => {
          if (error.status === 404) return { url: context.url };
          throw error;
        });
        if (localOrigin(details.url) !== context.origin) throw new Error(zh ? '请先打开配对链接对应的本地开发地址。' : 'Open the local development address authorized by this pairing link.');
        return { ok: true, ...details };
      }
      case 'pair': {
        const context = currentTab(message);
        return pair(context, context.origin, message.pairing, undefined, message.remember === true);
      }
      case 'connectSaved': return useBinding('connect', currentTab(message));
      case 'forget': return useBinding('forget');
      case 'disconnect':
        if (pairing && !pairingNow) await disconnectActive();
        return { ok: true };
      default: return { ok: false };
    }
  }).then(reply, (error) => reply({ ok: false, error: error.message }));
  return true;
});
