import { randomInt } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { extensionRpc } from '../client';
import { EXTENSION_ORIGIN } from '../extension-bindings';
import type { ExtensionOpenResult, RpcMethods } from '../rpc';
import { systemLocale } from '../system';

// The extension discovers this listener only while the user runs `extension setup`.
const HOST = '127.0.0.1';
const PORT = 43681;
const PATH = '/_css_tuner/setup';
const TIMEOUT = 5 * 60 * 1000;

async function readRequest(req: IncomingMessage) {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    body += chunk;
    if (body.length > 1024) return null;
  }
  try { return JSON.parse(body) as { action?: unknown; pageOrigin?: unknown; key?: unknown } | null; }
  catch { return null; }
}

export async function setupProject(project: RpcMethods['extensionOpen']['p']) {
  const page = new URL(project.url);
  if (page.protocol !== 'http:' || !['localhost', HOST].includes(page.hostname) || page.username || page.password) {
    throw new Error('Use an HTTP development page on localhost or 127.0.0.1.');
  }

  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  const zh = /^zh\b/i.test(systemLocale());
  const stop = new AbortController();
  let done = false;
  let claimant: { origin: string; key: string; check: string } | undefined;
  let opening: Promise<void> | undefined;
  let session: ExtensionOpenResult | undefined;
  let failure: string | undefined;
  const deadline = setTimeout(() => stop.abort(), TIMEOUT);
  terminal.on('SIGINT', () => stop.abort());
  terminal.on('close', () => stop.abort());

  async function approve(check: string) {
    const prompt = zh ? `请核对扩展也显示 ${check}，然后确认设置 [y/N]：` : `Confirm that the extension shows ${check}, then approve setup [y/N]: `;
    const answer = await terminal.question(prompt, { signal: stop.signal });
    if (!/^y(es)?$/i.test(answer.trim())) throw new Error('Setup declined.');
    session = await extensionRpc('extensionOpen', { ...project, direct: true });
  }

  const server = createServer({ requestTimeout: 5000, headersTimeout: 5000, connectionsCheckingInterval: 1000 }, async (req, res) => {
    const reply = (status: number, payload: object) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(payload));
    };
    const origin = req.headers.origin;
    if (req.headers.host !== `${HOST}:${PORT}` || req.url !== PATH || !origin || !EXTENSION_ORIGIN.test(origin)) return reply(403, { error: 'Setup is available only to the browser extension.' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }).end();
      return;
    }
    if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') return reply(405, { error: 'Use a JSON POST.' });
    const body = await readRequest(req).catch(() => null);
    if (stop.signal.aborted || !body || body.pageOrigin !== page.origin || typeof body.key !== 'string' || !/^[a-f0-9]{64}$/.test(body.key)) {
      return reply(403, { error: 'Open the exact preview address shown in the Companion terminal.' });
    }
    if (!claimant && body.action === 'request') {
      claimant = { origin, key: body.key, check: String(randomInt(1_000_000)).padStart(6, '0') };
      opening = approve(claimant.check).catch((error: unknown) => {
        failure = error instanceof Error ? error.message : String(error);
        if (!stop.signal.aborted) {
          process.stderr.write(`${failure}\n`);
          setTimeout(() => stop.abort(), 1000).unref();
        }
      });
    }
    if (!claimant || origin !== claimant.origin || body.key !== claimant.key) {
      return reply(409, { error: 'This setup belongs to another browser request. Restart setup in the Companion terminal.' });
    }
    if (failure) {
      reply(410, { error: failure });
      stop.abort();
      return;
    }
    if (body.action === 'request') return reply(200, { check: claimant.check });
    if (body.action === 'review') {
      return reply(200, session ? { port: session.port, code: session.pairingCode } : { pending: true });
    }
    if (body.action === 'done' && session) {
      const state = await extensionRpc('extensionStatus', { session: session.session }).catch(() => null);
      if (!state?.paired) return reply(409, { error: 'The browser is still connecting.' });
      done = true;
      reply(200, { ok: true });
      stop.abort();
      return;
    }
    reply(400, { error: 'Unknown setup action.' });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, HOST, resolve);
    });
    console.log(zh ? `在浏览器打开 ${page.origin}，然后选择 CSS Tuner → 设置此项目。` : `Open ${page.origin} in your browser, then choose CSS Tuner → Set up this project.`);
    await new Promise<void>((resolve) => {
      if (stop.signal.aborted) resolve();
      else stop.signal.addEventListener('abort', () => resolve(), { once: true });
    });
    await opening;
    if (done && session) console.log(zh ? `项目已连接。会话：${session.session}` : `Project connected. Session: ${session.session}`);
    else throw new Error('Setup ended before confirmation. Run extension setup to try again.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new Error(`Port ${PORT} is in use. Close any other CSS Tuner setup and try again.`);
    }
    throw error;
  } finally {
    clearTimeout(deadline);
    terminal.close();
    server.close();
    server.closeIdleConnections();
    if (!done && session) {
      const state = await extensionRpc('extensionStatus', { session: session.session }).catch(() => null);
      if (state && !state.paired) await extensionRpc('extensionClose', { session: session.session }).catch(() => null);
    }
  }
}
