const CHANNEL = 'css-tuner-extension';
const STATE = 'pair';
const popupUrl = chrome.runtime.getURL('popup.html');
const ports = new Map();
const allowedBridge = new Set(['hello', 'page', 'pick', 'measure', 'select', 'editText', 'reorder', 'resize', 'log', 'res']);
const ready = chrome.storage.session.get(STATE);
let pairing = null;
let pairingNow = false;
const initialized = ready.then((data) => { pairing = data[STATE] ?? null; });

function localOrigin(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname) && !parsed.username && !parsed.password ? parsed.origin : null;
  } catch { return null; }
}

function tell(context, message) {
  if (ports.get(context.tabId) === context) context.port.postMessage(message);
}

function closeSockets(context) {
  for (const channel of context.channels.values()) channel.close();
  context.channels.clear();
}

async function forget(context) {
  pairing = null;
  if (context) {
    closeSockets(context);
    tell(context, { type: 'closed' });
  }
  await chrome.storage.session.remove(STATE);
}

function attach(context, role, token, localPort) {
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
        void forget(context);
        return;
      }
      tell(context, role === 'bridge' ? { type: 'bridge', action: 'offline' } : { type: 'panelOffline' });
      if (event.code !== 4409 && attempts < 6) retry = setTimeout(open, Math.min(5000, 300 * 2 ** attempts++));
    });
  }
  open();
  return {
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

chrome.runtime.onConnect.addListener((port) => {
  const sender = port.sender;
  const tabId = sender?.tab?.id;
  const origin = localOrigin(sender?.url ?? sender?.tab?.url);
  if (port.name !== CHANNEL || (sender?.frameId ?? 0) !== 0 || !Number.isInteger(tabId) || !origin) return;
  const prior = ports.get(tabId);
  if (prior) closeSockets(prior);
  const context = { port, origin, tabId, channels: new Map() };
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

async function pair(message) {
  await initialized;
  if (pairing || pairingNow) throw new Error('Close the current companion session before pairing again.');
  const context = ports.get(message.tabId);
  const origin = localOrigin(message.url);
  const data = message.pairing;
  if (!context || !origin || context.origin !== origin) throw new Error('Open the local project tab and reload it once.');
  if (!data || !/^[a-f0-9]{64}$/.test(data.code) || !Number.isInteger(data.port) || data.port < 1 || data.port > 65535) {
    throw new Error('Paste the pairing link printed by the companion CLI.');
  }
  pairingNow = true;
  try {
    const response = await fetch(`http://127.0.0.1:${data.port}/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: data.code, pageOrigin: origin }), signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'The companion rejected this pairing.');
    if (ports.get(message.tabId) !== context) throw new Error('The project tab changed during pairing. Close and reopen the companion session.');
    if (!/^codex:\/\/threads\/[a-f0-9-]{36}$/i.test(result.chat)) throw new Error('This companion did not identify the bound chat. Update the companion CLI.');
    const selected = { ...result, tabId: context.tabId, origin, port: data.port };
    await chrome.storage.session.set({ [STATE]: selected });
    pairing = selected;
    bind(context);
    return { ok: true };
  } finally {
    pairingNow = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.url !== popupUrl) return;
  if (message?.type === 'pair') {
    void pair(message).then(reply, (error) => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'status') {
    void initialized.then(() => reply({ ok: true, chat: pairing?.chat ?? null }));
    return true;
  }
  if (message?.type === 'disconnect') {
    void initialized.then(async () => {
      if (pairing) await forget(ports.get(pairing.tabId));
      reply({ ok: true });
    });
    return true;
  }
});
