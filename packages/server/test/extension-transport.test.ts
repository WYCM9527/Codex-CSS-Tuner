import { once } from 'node:events';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { bindingProof, bindingTokens, ExtensionBindings } from '../src/extension-bindings';
import { EXTENSION_CONNECT_PATH, ExtensionTransport, type ExtensionTransportOptions } from '../src/extension-transport';

const PAGE = 'http://localhost:5173';
const ORIGIN = `chrome-extension://${'a'.repeat(32)}`;
const OTHER_EXTENSION = `chrome-extension://${'b'.repeat(32)}`;
type Pairing = { sessionId: string; bridgeToken: string; panelToken: string };

let transport: ExtensionTransport | undefined;

async function start(pageUrl?: string, options?: Pick<ExtensionTransportOptions, 'root' | 'chat' | 'remember'>) {
  const bridgeFrames: string[] = [];
  const onBridge = vi.fn((ws: WebSocket) => ws.on('message', (data) => bridgeFrames.push(String(data))));
  const onPanel = vi.fn();
  const server = await ExtensionTransport.listen({ pageOrigin: PAGE, pageUrl, onBridge, onPanel, ...options });
  transport = server;
  return { server, bridgeFrames, onBridge, onPanel };
}

function pair(server: ExtensionTransport, origin = ORIGIN, payload: object = {}) {
  return fetch(`http://127.0.0.1:${server.port}/pair`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: server.pairingCode, pageOrigin: PAGE, ...payload }),
  });
}

function channelUrl(server: ExtensionTransport, path: string) {
  return `ws://127.0.0.1:${server.port}${path}`;
}

function rejectedUpgrade(server: ExtensionTransport, path: string, origin: string, host?: string) {
  return new Promise<number | undefined>((resolve, reject) => {
    const ws = new WebSocket(channelUrl(server, path), { origin, headers: host ? { Host: host } : undefined });
    ws.once('error', reject);
    ws.once('open', () => {
      ws.terminate();
      reject(new Error('WebSocket upgrade unexpectedly accepted'));
    });
    ws.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
  });
}

async function openChannel(server: ExtensionTransport, path: string): Promise<WebSocket> {
  const ws = new WebSocket(channelUrl(server, path), { origin: ORIGIN });
  await once(ws, 'open');
  return ws;
}

async function exchange(ws: WebSocket, frame: unknown) {
  const received = once(ws, 'message');
  ws.send(JSON.stringify(frame));
  const [reply] = await received;
  return JSON.parse(String(reply));
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await transport?.close();
  transport = undefined;
});

describe('extension transport', () => {
  it('pairs only the authorized page with a single extension and rejects unpaired sockets', async () => {
    const { server } = await start();
    expect(server.paired).toBe(false);
    expect(await rejectedUpgrade(server, '/ws/bridge', ORIGIN)).toBe(403);
    expect((await pair(server, 'https://example.com')).status).toBe(403);
    expect((await pair(server, ORIGIN, { pageOrigin: 'http://localhost:5174' })).status).toBe(403);
    expect((await pair(server, ORIGIN, { code: '0'.repeat(64) })).status).toBe(403);

    const attempts = await Promise.all([pair(server), pair(server)]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 410]);
    const accepted = attempts.find(({ status }) => status === 200)!;
    expect(accepted.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(accepted.headers.get('Cache-Control')).toBe('no-store');
    const { sessionId, bridgeToken, panelToken } = (await accepted.json()) as Pairing;
    expect(sessionId).toBe(server.sessionId);
    expect(bridgeToken).toMatch(/^[a-f0-9]{64}$/);
    expect(panelToken).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set([bridgeToken, panelToken, server.pairingCode]).size).toBe(3);
    expect(server.paired).toBe(true);
    expect((await pair(server, OTHER_EXTENSION)).status).toBe(403);
    expect(await rejectedUpgrade(server, '/ws/bridge', OTHER_EXTENSION)).toBe(403);
    expect(await rejectedUpgrade(server, '/ws/bridge', ORIGIN, `localhost:${server.port}`)).toBe(403);
    expect(await rejectedUpgrade(server, '/ws/bridge?token=abc', ORIGIN)).toBe(403);
  });

  it('rejects expired codes and caps the pairing body', async () => {
    const { server } = await start();
    expect((await pair(server, ORIGIN, { extra: 'x'.repeat(1024) })).status).toBe(413);
    vi.spyOn(Date, 'now').mockReturnValue(server.pairingExpiresAt);
    expect((await pair(server)).status).toBe(410);
    expect(server.paired).toBe(false);
  });

  it('keeps the browser link private until authenticated and binds the approved preview on consent', async () => {
    const pageUrl = `${PAGE}/preview?fixture=local-only`;
    const { server } = await start(pageUrl);
    const connect = `http://127.0.0.1:${server.port}${EXTENSION_CONNECT_PATH}`;
    const details = (code: string, origin = ORIGIN) => fetch(`${connect}/details`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const page = await fetch(connect);
    const html = await page.text();
    expect(page.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(html).toContain('Agree and open preview');
    expect(html).not.toContain(pageUrl);
    expect(html).not.toContain(server.pairingCode);
    expect((await details('0'.repeat(64))).status).toBe(403);
    expect((await details(server.pairingCode, PAGE)).status).toBe(403);
    expect(await (await details(server.pairingCode)).json()).toEqual({ url: pageUrl });
    expect(server.paired).toBe(false);
    expect((await pair(server, ORIGIN, { pageUrl: `${PAGE}/another` })).status).toBe(403);
    expect((await pair(server, ORIGIN, { pageUrl })).status).toBe(200);
    expect((await details(server.pairingCode)).status).toBe(410);
  });

  it('persists a remembered binding after consent and scopes signed requests to that extension and preview origin', async () => {
    const data = mkdtempSync(join(tmpdir(), 'css-tuner-binding-'));
    try {
      const root = '/approved/project';
      const chat = 'codex://threads/01900000-0000-7000-8000-000000000001';
      const url = `${PAGE}/preview`;
      const bindings = new ExtensionBindings(data);
      const remember = vi.fn((extension: string) => ({ binding: bindings.save(extension, { root, url, chat }), port: 12345 }));
      const { server } = await start(url, { root, chat, remember });
      const details = await fetch(`http://127.0.0.1:${server.port}${EXTENSION_CONNECT_PATH}/details`, {
        method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: server.pairingCode }),
      });
      expect(await details.json()).toEqual({ url, root, chat, canRemember: true });
      expect(remember).not.toHaveBeenCalled();
      expect((await pair(server, ORIGIN, { remember: true, pageOrigin: `${PAGE}0` })).status).toBe(403);
      expect(remember).not.toHaveBeenCalled();

      const response = await (await pair(server, ORIGIN, { remember: true })).json() as Pairing & { binding: unknown };
      const binding = remember.mock.results[0].value!.binding;
      const { id, key } = binding;
      expect(response.binding).toEqual({ id, key, root, port: 12345 });
      const tokens = bindingTokens(binding, server.sessionId);
      expect(response.bridgeToken).toBe(tokens.bridge);
      expect(response.panelToken).toBe(tokens.panel);
      expect(statSync(join(data, `binding-${id}.json`)).mode & 0o777).toBe(0o600);

      const nonce = '0'.repeat(32);
      const proof = bindingProof(key, ['request', id, 'connect', PAGE, nonce]);
      const request = { id, action: 'connect', pageOrigin: PAGE, nonce, proof };
      const restored = new ExtensionBindings(data);
      expect(restored.authorize(ORIGIN, request)?.binding).toEqual(binding);
      expect(restored.authorize(OTHER_EXTENSION, request)).toBeNull();
      expect(restored.authorize(ORIGIN, { ...request, pageOrigin: `${PAGE}0` })).toBeNull();
      expect(restored.authorize(ORIGIN, { ...request, action: 'forget' })).toBeNull();
      restored.remove(binding);
      expect(restored.authorize(ORIGIN, request)).toBeNull();
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });

  it('authenticates each role before delivery and consumes keepalive frames', async () => {
    const { server, bridgeFrames, onBridge, onPanel } = await start();
    const { bridgeToken, panelToken } = (await (await pair(server)).json()) as Pairing;

    const wrongRole = await openChannel(server, '/ws/panel');
    const rejected = once(wrongRole, 'close');
    wrongRole.send(JSON.stringify({ type: 'auth', token: bridgeToken }));
    expect((await rejected)[0]).toBe(1008);
    expect(onPanel).not.toHaveBeenCalled();

    const bridge = await openChannel(server, '/ws/bridge');
    const panel = await openChannel(server, '/ws/panel');
    expect(onBridge).not.toHaveBeenCalled();
    expect(onPanel).not.toHaveBeenCalled();
    expect(await exchange(bridge, { type: 'auth', token: bridgeToken })).toEqual({ type: 'authenticated' });
    expect(await exchange(panel, { type: 'auth', token: panelToken })).toEqual({ type: 'authenticated' });
    expect(onBridge).toHaveBeenCalledOnce();
    expect(onPanel).toHaveBeenCalledOnce();

    bridge.send('{"t":"hello"}');
    expect(await exchange(bridge, { type: 'ping' })).toEqual({ type: 'pong' });
    expect(bridgeFrames).toEqual(['{"t":"hello"}']);

    const firstBridgeClosed = once(bridge, 'close');
    const replacement = await openChannel(server, '/ws/bridge');
    expect(await exchange(replacement, { type: 'auth', token: bridgeToken })).toEqual({ type: 'authenticated' });
    expect((await firstBridgeClosed)[0]).toBe(4409);
    expect(onBridge).toHaveBeenCalledTimes(2);

    const replacementClosed = once(replacement, 'close');
    const panelClosed = once(panel, 'close');
    await server.close();
    expect((await replacementClosed)[0]).toBe(4410);
    expect((await panelClosed)[0]).toBe(4410);
    expect(server.paired).toBe(false);
    await expect(pair(server)).rejects.toThrow();
  });

  it('closes a channel whose first frame misses the authentication deadline', async () => {
    const { server, onBridge } = await start();
    expect((await pair(server)).status).toBe(200);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const bridge = await openChannel(server, '/ws/bridge');
    const closed = once(bridge, 'close');
    await vi.advanceTimersByTimeAsync(5000);
    expect((await closed)[0]).toBe(1008);
    expect(onBridge).not.toHaveBeenCalled();
  });
});
