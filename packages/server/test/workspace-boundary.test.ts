import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MessageFiles } from '../src/messages';
import { ProjectResolver } from '../src/project';
import { ClassSiteReader, CssRuleLocator } from '../src/sites';

const temp = realpathSync(mkdtempSync(join(tmpdir(), 'css-tuner-boundary-')));
const root = join(temp, 'workspace');
const outside = join(temp, 'workspace-other');
const page = 'http://127.0.0.1:5200/';
const put = (base: string, rel: string, text: string) => {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
};

afterAll(() => rmSync(temp, { recursive: true, force: true }));

describe('opt-in workspace boundary', () => {
  it('resolves in-root paths and excludes out-of-root paths and symlinks from page-derived resolution', () => {
    const css = put(root, 'inside.css', '.inside { color: blue }');
    put(root, 'package.json', '{}');
    const external = put(outside, 'outside.css', '.outside { color: red }');
    put(outside, 'index.html', '<!doctype html>');
    const linkedFile = join(root, 'linked.css');
    symlinkSync(external, linkedFile, 'file');
    symlinkSync(outside, join(root, 'linked-dir'), 'dir');
    const alias = join(root, 'inside-alias.css');
    symlinkSync(css, alias, 'file');

    const project = new ProjectResolver(root, { restrictToWorkspace: true });
    project.register(new URL(page).origin, outside);
    project.learnFromSheets(page, [external, linkedFile]);
    expect(project.rootFor(page)).toBeNull();
    project.register(new URL(page).origin, root);

    expect(project.fileFor(page, '/inside.css')).toBe(css);
    expect(project.fileFor(page, '/inside-alias.css')).toBe(css);
    expect(project.pathGuard?.(alias)).toBe(css);
    expect(project.pathGuard?.(external)).toBeNull();
    expect(project.fileFor(page, '/missing', external)).toBeNull();
    expect(project.fileFor(page, '/missing', linkedFile)).toBeNull();
    expect(project.fileFor(page, external)).toBeNull();
    expect(project.fileFor(page, `/@fs${external}`)).toBeNull();
    expect(project.fileFor(page, '/linked.css')).toBeNull();
    expect(project.fileFor(page, '/%2e%2e/workspace-other/outside.css')).toBeNull();
    expect(project.htmlFileFor(`${page}linked-dir/`)).toBeNull();
    expect(project.sheetFile(page, { devId: `${linkedFile}?v=1`, href: null })).toBeNull();
    expect(project.sheetFile(page, { devId: null, href: '/linked.css' })).toBeNull();
    expect(project.packageRoot(external)).toBeNull();
    expect(project.packageRoot(css)).toBe(root);

    expect(new ProjectResolver(root).fileFor(page, '/missing', external)).toBe(external);
  });

  it('guards direct TSX reads and array order imports', () => {
    const markup = 'const Card = () => <div className="p-6" />;';
    const external = put(outside, 'outside.tsx', markup);
    const cssSite = put(root, 'inside.tsx', markup);
    const alias = join(root, 'outside-alias.tsx');
    symlinkSync(external, alias, 'file');
    const list = 'const Cards = () => <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul>;';
    const data = put(outside, 'list-data.ts', 'export const items = [1, 2];');
    const imported = put(root, 'imported.tsx', `import { items } from '../workspace-other/list-data';\n${list}`);
    const read = new ClassSiteReader(new ProjectResolver(root, { restrictToWorkspace: true }).pathGuard);

    expect(read.site(cssSite, 1, markup.indexOf('<div') + 1)?.tokens).toEqual(['p-6']);
    expect(read.site(external, 1, markup.indexOf('<div') + 1)).toBeNull();
    expect(read.site(alias, 1, markup.indexOf('<div') + 1)).toBeNull();
    expect(read.arraySite(imported, 2, list.indexOf('<li') + 1, 2)).toHaveProperty('error');
    expect(new ClassSiteReader().arraySite(imported, 2, list.indexOf('<li') + 1, 2)).toHaveProperty('file', data);
  });

  it('blocks CSS imports outside the workspace and invalidates cached rules when a symlink escapes', () => {
    const local = put(root, 'theme/local.css', '.theme { color: blue }');
    const external = put(outside, 'theme.css', '.theme { color: red }');
    const alias = join(root, 'theme', 'current.css');
    symlinkSync(local, alias, 'file');
    const entry = put(root, 'theme-entry.css', '@import "./theme/current.css";');
    const spec = { selector: '.theme', fullSelector: '.theme', conditions: [], ordinal: 0 };
    const locator = new CssRuleLocator(new ProjectResolver(root, { restrictToWorkspace: true }).pathGuard);

    expect(locator.sourceOf(entry, spec)).toEqual({ file: local, selector: '.theme' });
    unlinkSync(alias);
    symlinkSync(external, alias, 'file');
    expect(locator.sourceOf(entry, spec)).toBeNull();
    expect(locator.sourceOf(external, spec)).toBeNull();
    expect(new CssRuleLocator().sourceOf(entry, spec)).toEqual({ file: alias, selector: '.theme' });
  });

  it('does not walk outside JSON directories or reuse cached symlinks that now escape', () => {
    const external = put(outside, 'messages/en.json', '{"home":{"lead":"External file"}}');
    put(outside, 'messages/fr.json', '{"home":{"lead":"External directory"}}');
    const local = put(root, 'messages/intro.json', '{"home":{"lead":"Local"}}');
    const alias = join(root, 'messages', 'cached.json');
    symlinkSync(local, alias, 'file');
    symlinkSync(dirname(external), join(root, 'linked-messages'), 'dir');
    const ref = { key: 'home.lead', ns: null, prefix: null, lib: 'i18next' } as const;
    const messages = new MessageFiles(new ProjectResolver(root, { restrictToWorkspace: true }).pathGuard);

    expect(messages.find(root, ref, 'Local', null)).toEqual({ file: local, keyPath: ['home', 'lead'] });
    unlinkSync(alias);
    symlinkSync(external, alias, 'file');
    expect(messages.find(root, ref, 'External file', null)).toHaveProperty('reason');
    expect(messages.find(root, ref, 'External directory', null)).toHaveProperty('reason');
    expect(messages.find(outside, ref, 'External file', null)).toHaveProperty('reason');
    expect(new MessageFiles().find(outside, ref, 'External file', null)).toHaveProperty('file', external);
  });
});
