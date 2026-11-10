import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { extensionRpc, startExtensionDaemon, stopExtensionDaemon } from '../client';
import { openUrl } from '../system';
import { setupProject } from './extension-setup';

const help = `CSS Tuner extension companion

Usage:
  node cli.mjs extension start
  node cli.mjs extension stop
  node cli.mjs extension setup <url> --root <dir> --chat <link>
  node cli.mjs extension open <url> --root <dir> --chat <link> [--browser | --link]
  node cli.mjs extension status --session <id>
  node cli.mjs extension handoff --session <id> --batch <id> [--json]
  node cli.mjs extension verify --session <id> --batch <id> [--wait-ms <ms>]
  node cli.mjs extension close --session <id>
`;

const flagOptions = {
  root: { type: 'string' },
  chat: { type: 'string' },
  session: { type: 'string' },
  batch: { type: 'string' },
  'wait-ms': { type: 'string' },
  json: { type: 'boolean' },
  link: { type: 'boolean' },
  browser: { type: 'boolean' },
} as const;

const commandFlags = {
  start: [],
  stop: [],
  setup: ['root', 'chat'],
  open: ['root', 'chat', 'link', 'browser'],
  status: ['session'],
  handoff: ['session', 'batch', 'json'],
  verify: ['session', 'batch', 'wait-ms'],
  close: ['session'],
} as const satisfies Record<string, ReadonlyArray<keyof typeof flagOptions>>;

function isCommand(value: string | undefined): value is keyof typeof commandFlags {
  return value !== undefined && Object.hasOwn(commandFlags, value);
}

const printJson = (value: unknown) => console.log(JSON.stringify(value, null, 2));

async function main([mode, command, ...args]: string[]) {
  if (!mode || mode === '--help' || mode === '-h' || (mode === 'extension' && (!command || command === '--help' || command === '-h'))) {
    process.stdout.write(help);
    return;
  }
  if (mode !== 'extension' || !isCommand(command)) throw new Error('Unknown command. Run node cli.mjs extension --help.');

  const options = Object.fromEntries(commandFlags[command].map((name) => [name, flagOptions[name]]));
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true });
  const required = (name: keyof typeof flagOptions): string => {
    const value = values[name];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`--${name} is required`);
    return value;
  };

  if (command === 'open' || command === 'setup') {
    if (positionals.length !== 1) throw new Error(`extension ${command} requires one page URL`);
    if (values.browser && values.link) throw new Error('Use either --browser or --link');
    const project = {
      root: resolve(required('root')),
      url: positionals[0],
      chat: required('chat'),
      cliPath: fileURLToPath(import.meta.url),
    };
    if (command === 'setup') return setupProject(project);
    const session = await extensionRpc('extensionOpen', project);
    const pairingLink = `css-tuner://pair?port=${session.port}&code=${session.pairingCode}`;
    if (values.browser && session.browserLink) {
      if (await openUrl(session.browserLink)) console.error(`Session: ${session.session}`);
      else {
        console.error('Open this link in the browser where CSS Tuner is installed:');
        console.log(session.browserLink);
      }
    } else if (values.link) {
      console.error(`Session: ${session.session}`);
      console.log(pairingLink);
    } else printJson({ ...session, pairingLink });
    return;
  }
  if (positionals.length) throw new Error(`Unexpected argument: ${positionals[0]}`);
  if (command === 'start') {
    await startExtensionDaemon();
    console.log('CSS Tuner extension companion is running.');
    return;
  }
  if (command === 'stop') {
    printJson({ stopped: await stopExtensionDaemon() });
    return;
  }

  const session = required('session');
  switch (command) {
    case 'status':
      printJson(await extensionRpc('extensionStatus', { session }));
      return;
    case 'close':
      printJson(await extensionRpc('extensionClose', { session }));
      return;
    case 'handoff': {
      const batch = required('batch');
      const result = await extensionRpc('extensionHandoff', { session, batch });
      if (values.json) printJson(result);
      else {
        if (!result.prompt) throw new Error(`No handoff prompt for batch ${batch}`);
        process.stdout.write(result.prompt + '\n');
      }
      return;
    }
    case 'verify': {
      const batch = required('batch');
      const raw = values['wait-ms'];
      const waitMs = typeof raw === 'string' ? Number(raw) : undefined;
      if (typeof raw === 'string' && (!/^\d+$/.test(raw) || !Number.isSafeInteger(waitMs))) {
        throw new Error('--wait-ms must be a nonnegative integer');
      }
      printJson(await extensionRpc('extensionVerify', { session, batch, waitMs }));
    }
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
