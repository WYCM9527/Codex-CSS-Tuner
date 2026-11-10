import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BINDING_PATH = '/_css_tuner/binding';
export const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

type Project = { root: string; url: string; chat: string };
export type Binding = { id: string; key: string; extension: string } & Project;

export function bindingProof(key: string, payload: unknown[]): string {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(JSON.stringify(payload)).digest('hex');
}

export function bindingTokens(binding: Binding, session: string) {
  return { bridge: bindingProof(binding.key, ['bridge', session]), panel: bindingProof(binding.key, ['panel', session]) };
}

export class ExtensionBindings {
  constructor(private readonly data: string) {}

  save(extension: string, project: Project): Binding {
    const binding = { id: randomBytes(16).toString('hex'), key: randomBytes(32).toString('hex'), extension, ...project };
    writeFileSync(this.file(binding.id), JSON.stringify(binding), { mode: 0o600, flag: 'wx' });
    return binding;
  }

  authorize(extension: string, input: unknown) {
    if (!input || typeof input !== 'object') return null;
    const { id, action, pageOrigin, nonce, proof } = input as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || (action !== 'connect' && action !== 'forget') ||
      typeof pageOrigin !== 'string' || typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce) ||
      typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof)) return null;
    try {
      const binding = JSON.parse(readFileSync(this.file(id), 'utf8')) as Binding;
      if (binding.extension !== extension || new URL(binding.url).origin !== pageOrigin) return null;
      const expected = bindingProof(binding.key, ['request', id, action, pageOrigin, nonce]);
      if (!timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(expected, 'hex'))) return null;
      return { binding, action, nonce };
    } catch {
      return null;
    }
  }

  remove(binding: Binding) {
    rmSync(this.file(binding.id), { force: true });
  }

  has(binding: Binding) {
    return existsSync(this.file(binding.id));
  }

  get saved(): boolean {
    return readdirSync(this.data).some((name) => /^binding-[a-f0-9]{32}\.json$/.test(name));
  }

  private file(id: string) {
    return join(this.data, `binding-${id}.json`);
  }
}
