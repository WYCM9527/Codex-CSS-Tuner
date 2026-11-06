import { resolve } from 'node:path';
import { rpc, stopDaemon } from '../client';
import { DEFAULT_SETTINGS, type SettingsData } from '../settings';
import { VERSION } from '../version';

const HELP = `CSS Tuner ${VERSION}

Usage:
  css-tuner open [url] [--root <dir>]   Open a page (dev server URL or local HTML), print the URL to open
  css-tuner status [--root <dir>]       Page connection and change counts
  css-tuner changes [--root <dir>]      List changes
  css-tuner config [key] [value]        Show or change settings (${Object.keys(DEFAULT_SETTINGS).join(', ')})
  css-tuner stop                        Stop the background service
  css-tuner daemon                      Run the background service in the foreground
`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function parseValue(key: keyof SettingsData, raw: string): SettingsData[keyof SettingsData] {
  const kind = typeof DEFAULT_SETTINGS[key];
  if (kind === 'number') return Number(raw);
  if (kind === 'boolean') return raw === 'true' || raw === 'on' || raw === '1';
  if (key === 'assetsDir') return raw === 'null' || raw === '' ? null : resolve(raw);
  return raw;
}

async function main(argv: string[]) {
  const args = [...argv];
  const root = resolve(flag(args, '--root') ?? process.cwd());
  const [cmd, ...rest] = args;
  switch (cmd) {
    case 'open': {
      const r = await rpc('open', { root, url: rest[0] });
      console.log(r.url);
      if (r.reachable === false) console.error(`warning: ${r.target} is not responding`);
      return;
    }
    case 'status':
      console.log(JSON.stringify(await rpc('status', { root }), null, 2));
      return;
    case 'changes':
      console.log(JSON.stringify(await rpc('changes', { root }), null, 2));
      return;
    case 'config': {
      const [key, value] = rest as [keyof SettingsData | undefined, string | undefined];
      if (key && !(key in DEFAULT_SETTINGS)) throw new Error(`unknown setting ${key}`);
      const set = key && value !== undefined ? { [key]: parseValue(key, value) } : undefined;
      const all = await rpc('settings', { set });
      console.log(key ? JSON.stringify(all[key]) : JSON.stringify(all, null, 2));
      return;
    }
    case 'stop':
      console.log((await stopDaemon()) ? 'stopped' : 'not running');
      return;
    case 'daemon': {
      const { Daemon } = await import('../daemon');
      if (!(await new Daemon().start())) process.exit(1);
      return;
    }
    default:
      console.log(HELP);
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
