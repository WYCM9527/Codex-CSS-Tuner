import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  dataUrlMime,
  t,
  uniqueFileName,
  withExtension,
  type AssetItem,
  type AssetsView,
  type AssetView,
  type ElementSnapshot,
  type Notice,
  type PageInfo,
} from '@css-tuner/protocol';
import type { ProjectResolver } from './project';
import type { PageSession } from './session';
import type { Settings } from './settings';
import { copyText, reveal } from './system';

export interface AssetHost {
  readonly project: ProjectResolver;
  readonly session: PageSession | null;
  readonly page: PageInfo | null;
  log(msg: string): void;
  notify(level: Notice['level'], text: string): void;
  /** 剪贴板写不进去时让面板显示出来，自己复制 */
  showText(text: string): void;
}

/** 取到的文件内容；mime 是能拿到时的 Content-Type */
export interface Got {
  data: Buffer;
  mime: string | null;
}

/** %XX 是一个字节，其余字符按 UTF-8：没 base64 的 data: 地址多是 SVG 文本，也可能夹着二进制 */
function percentBytes(s: string): Buffer {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '%' && /^[0-9a-f]{2}$/i.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(...Buffer.from(s[i], 'utf8'));
  }
  return Buffer.from(out);
}

export function decodeDataUrl(url: string): Got {
  const comma = url.indexOf(',');
  const head = url.slice(5, comma < 0 ? url.length : comma);
  const body = comma < 0 ? '' : url.slice(comma + 1);
  return { data: /;base64$/i.test(head) ? Buffer.from(body, 'base64') : percentBytes(body), mime: dataUrlMime(url) };
}

class AssetError extends Error {}

/** 选中元素的「图片和视频」：清单、保存、全部存到文件夹、复制 SVG 代码、在项目里找到 */
export class AssetService {
  /** 「图片和视频」分区展开着：选中元素变了就重新取清单 */
  open = false;
  private list: { uid: string; items: AssetView[]; more: boolean } | null = null;
  private ua: string | null = null;

  constructor(
    private readonly host: AssetHost,
    private readonly settings: Settings,
  ) {}

  /** 面板上的分区：数量来自快照，清单是这个元素上次取到的 */
  view(el: ElementSnapshot): AssetsView | undefined {
    if (!el.assets) return undefined;
    const list = this.list?.uid === el.uid ? this.list : null;
    return list ? { count: list.items.length, more: list.more, items: list.items } : { ...el.assets, items: null };
  }

  forget() {
    this.list = null;
  }

  /** 取选中元素的完整清单；中途选中换了（uid 对不上）就不记 */
  async load(uid: string): Promise<AssetView[] | null> {
    const session = this.host.session;
    if (!session) return null;
    const r = await session.call('assets', {}, 15000);
    const pageUrl = this.host.page?.url ?? '';
    const items = r.items.map((a) => ({ ...a, file: this.projectFile(pageUrl, a.url) }));
    this.list = { uid, items, more: r.more };
    return items;
  }

  /** 和页面同源的地址才在项目里找文件：别处的同名文件不算 */
  private projectFile(pageUrl: string, url: string | null): string | null {
    if (!url || !pageUrl) return null;
    try {
      const u = new URL(url);
      if (u.origin !== new URL(pageUrl).origin) return null;
      return this.host.project.fileFor(pageUrl, u.pathname, null, true);
    } catch {
      return null;
    }
  }

  get(id: string): AssetView | null {
    return this.list?.items.find((a) => a.id === id) ?? null;
  }

  all(): AssetView[] {
    return this.list?.items ?? [];
  }

  /* ---------- 取文件内容 ---------- */

  private reason(error: string | undefined): string {
    if (error === 'streaming') return t('ext.assets.reason.streaming');
    if (error === 'gone') return t('ext.assets.reason.gone');
    if (error === 'too-large') return t('ext.assets.reason.tooLarge');
    return t('ext.assets.reason.unknown');
  }

  /**
   * 按顺序试：data: 直接解码；SVG 和 blob: 由页面脚本给；其余带上页面的 User-Agent 和地址（作 Referer）去下载
   */
  async bytes(item: AssetItem): Promise<Got> {
    const session = this.host.session;
    if (item.streaming) throw new AssetError(t('ext.assets.reason.streaming'));
    if (item.kind === 'svg') {
      if (!session) throw new AssetError(t('ext.assets.noPage'));
      const r = await session.call('assetData', { id: item.id, as: 'file' }, 10000);
      if (r.text === undefined) throw new AssetError(this.reason(r.error));
      return { data: Buffer.from(r.text, 'utf8'), mime: 'image/svg+xml' };
    }
    const url = item.url;
    if (!url) throw new AssetError(t('ext.assets.reason.unknown'));
    if (url.startsWith('data:')) return decodeDataUrl(url);
    if (url.startsWith('blob:')) {
      if (!session) throw new AssetError(t('ext.assets.noPage'));
      const r = await session.call('assetData', { id: item.id, as: 'file' }, 60000);
      if (r.base64 === undefined) throw new AssetError(this.reason(r.error));
      return { data: Buffer.from(r.base64, 'base64'), mime: r.mime ?? null };
    }
    return this.download(url);
  }

  private async userAgent(): Promise<string | null> {
    const session = this.host.session;
    if (!this.ua && session?.connected) this.ua = await session.call('env', {}).then((e) => e.ua, () => null);
    return this.ua;
  }

  private async download(url: string): Promise<Got> {
    const headers: Record<string, string> = { Accept: '*/*' };
    const ua = await this.userAgent();
    if (ua) headers['User-Agent'] = ua;
    if (this.host.page?.url) headers.Referer = this.host.page.url;
    let res: Response;
    try {
      res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(120000) });
    } catch (e) {
      throw new AssetError(t('ext.assets.reason.network', { error: (e as Error).message }));
    }
    if (!res.ok) throw new AssetError(t('ext.assets.reason.http', { status: res.status }));
    return { data: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') };
  }

  /* ---------- 存文件 ---------- */

  /** 存到设置里的文件夹（cli 的 css-tuner config assetsDir 改），默认「下载」 */
  folder(): string {
    const dir = this.settings.get('assetsDir');
    if (dir && existsSync(dir)) return dir;
    const downloads = join(homedir(), 'Downloads');
    return existsSync(downloads) ? downloads : homedir();
  }

  /** 页面上已经知道类型时（data: 地址、SVG）先补上扩展名 */
  private guessName(item: AssetItem): string {
    return withExtension(item.name, item.kind === 'svg' ? 'image/svg+xml' : item.url?.startsWith('data:') ? dataUrlMime(item.url) : null);
  }

  /** 写到 path；用户给的名字没有认识的扩展名时按取到的类型补上。返回实际写的路径 */
  async saveTo(item: AssetItem, path: string, got?: Got): Promise<string> {
    const g = got ?? (await this.bytes(item));
    const name = withExtension(basename(path), g.mime);
    const out = join(dirname(path), name);
    await writeFile(out, g.data);
    return out;
  }

  /** 存一个：直接存进文件夹（重名加序号），存好后告诉你存在哪 */
  async save(id: string): Promise<string | null> {
    const item = this.get(id);
    if (!item) throw new AssetError(t('ext.assets.stale'));
    if (item.streaming) {
      this.host.notify('warn', t('ext.assets.reason.streaming'));
      return null;
    }
    const folder = this.folder();
    try {
      const got = await this.bytes(item);
      const taken = new Set(readdirSync(folder).map((f) => f.toLowerCase()));
      const name = uniqueFileName(withExtension(this.guessName(item), got.mime), taken);
      const out = await this.saveTo(item, join(folder, name), got);
      this.host.notify('info', t('ext.assets.savedTo', { name: basename(out), folder: out.slice(0, out.length - basename(out).length) }));
      return out;
    } catch (e) {
      this.host.notify('error', t('ext.assets.failed', { name: item.name, reason: (e as Error).message }));
      return null;
    }
  }

  /** 逐个存进 folder：重名加序号，可以取消；返回存了几个、哪些没存成 */
  async saveAllTo(folder: string, token?: { isCancellationRequested: boolean }, report?: (i: number, n: number, name: string) => void) {
    const items = this.all();
    const taken = new Set<string>();
    try {
      for (const f of readdirSync(folder)) taken.add(f.toLowerCase());
    } catch {
      /* 文件夹读不了，写的时候会报错 */
    }
    const saved: string[] = [];
    const failed: Array<{ name: string; reason: string }> = [];
    let cancelled = false;
    for (const [i, item] of items.entries()) {
      if (token?.isCancellationRequested) {
        cancelled = true;
        break;
      }
      report?.(i, items.length, item.name);
      try {
        const got = await this.bytes(item);
        const name = uniqueFileName(withExtension(this.guessName(item), got.mime), taken);
        await writeFile(join(folder, name), got.data, { flag: 'wx' });
        saved.push(name);
      } catch (e) {
        failed.push({ name: item.name, reason: (e as Error).message });
      }
    }
    return { saved, failed, cancelled };
  }

  /** 全部下载：存进文件夹里新建的一个子文件夹（按页面和时间起名），存完在访达 / 资源管理器里打开它 */
  async saveAll(): Promise<string | null> {
    const items = this.all();
    if (!items.length) return null;
    const host = (() => {
      try {
        return new URL(this.host.page?.url ?? '').host.replace(/[^\w.-]+/g, '_');
      } catch {
        return 'page';
      }
    })();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const folder = join(this.folder(), `css-tuner-${host}-${stamp}`);
    mkdirSync(folder, { recursive: true });
    this.host.notify('info', t('ext.assets.savingAll'));
    const r = await this.saveAllTo(folder);
    const where = basename(folder);
    const list = r.failed.map((f) => f.name + t('common.paren', { text: f.reason })).join(t('common.listSep'));
    const text = r.failed.length
      ? t('ext.assets.someFailed', { n: r.saved.length, m: r.failed.length, list })
      : t('ext.assets.allSaved', { n: r.saved.length, folder: where });
    this.host.notify(r.failed.length ? 'warn' : 'info', text);
    if (r.saved.length) await reveal(folder);
    return folder;
  }

  /** 复制 SVG 代码：保留 currentColor，引用到的 symbol 和渐变一起带上 */
  async copySvg(id: string): Promise<string | null> {
    const item = this.get(id);
    const session = this.host.session;
    if (!item || item.kind !== 'svg') throw new AssetError(t('ext.assets.stale'));
    if (!session) throw new AssetError(t('ext.assets.noPage'));
    const r = await session.call('assetData', { id, as: 'copy' }, 10000);
    if (r.text === undefined) throw new AssetError(this.reason(r.error));
    if (await copyText(r.text)) this.host.notify('info', t('ext.assets.copied'));
    else this.host.showText(r.text);
    return r.text;
  }

  /** 在项目里找到：资源文件就在项目里（public/ 里的图片等）时在访达 / 资源管理器里定位 */
  async reveal(id: string): Promise<void> {
    const file = this.get(id)?.file;
    if (!file) throw new AssetError(t('ext.assets.stale'));
    await reveal(file);
  }
}
