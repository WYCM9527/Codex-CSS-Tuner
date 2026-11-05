import { useEffect, useState } from 'react';
import { fileNameOf, formatNumber, t, type AssetView, type PanelToExt, type SelectionView } from '@css-tuner/protocol';
import { Section } from './controls';
import { Icon } from './icons';

interface Props {
  sel: SelectionView;
  open: boolean;
  onToggle: (id: string) => void;
  send: (m: PanelToExt) => void;
}

/** 选中元素和里面看得见的图片、背景图、SVG、视频：展开时才取完整清单 */
export function Assets({ sel, open, onToggle, send }: Props) {
  useEffect(() => {
    send({ t: 'assetsOpen', open });
  }, [open, send]);
  const view = sel.assets;
  if (!view?.count) return null;
  const items = view.items;
  const ready = items?.filter((a) => !a.streaming).length ?? 0;
  return (
    <Section
      id="assets"
      title={t('assets.title')}
      open={open}
      onToggle={onToggle}
      aside={
        open && ready > 1 ? (
          <button className="link-btn" title={t('assets.saveAllTitle', { n: ready })} onClick={() => send({ t: 'saveAllAssets' })}>
            <Icon.download />
            {t('assets.saveAll')}
          </button>
        ) : (
          <span className="sec-note">{view.more ? `${view.count}+` : view.count}</span>
        )
      }
    >
      {items ? (
        <ul className="assets" onPointerLeave={() => send({ t: 'hover', uid: null })}>
          {items.map((a) => (
            <AssetRow key={a.id} a={a} send={send} />
          ))}
        </ul>
      ) : (
        <div className="sec-note">{t('assets.loading')}</div>
      )}
      {items && view.more && <div className="sec-note">{t('assets.more', { n: items.length })}</div>}
    </Section>
  );
}

function AssetRow({ a, send }: { a: AssetView; send: (m: PanelToExt) => void }) {
  const [broken, setBroken] = useState(false);
  const smaller = a.kind === 'image' && a.shown && a.url && a.shown !== a.url;
  const meta = [t(`assets.kind.${a.kind}`), a.width && a.height ? `${a.width} × ${a.height}` : null, a.bytes != null ? fileSize(a.bytes) : null].filter(Boolean).join(' · ');
  return (
    <li className="asset" onPointerEnter={() => send({ t: 'hover', uid: a.uid })}>
      <span className="asset-thumb">{a.thumb && !broken ? <img src={a.thumb} alt="" onError={() => setBroken(true)} /> : a.kind === 'video' ? <Icon.video /> : <Icon.image />}</span>
      <span className="asset-main">
        <span className="asset-name" title={a.url && !a.url.startsWith('data:') ? a.url : a.name}>
          <span>{a.name}</span>
          {a.count > 1 && <small title={t('assets.times', { n: a.count })}>×{a.count}</small>}
        </span>
        {a.streaming ? (
          <span className="asset-meta" title={t('assets.streamingTitle')}>
            {t('assets.streaming')}
          </span>
        ) : (
          <span className="asset-meta">
            {meta}
            {smaller && (
              <span className="asset-tag" title={t('assets.originalTitle', { shown: fileNameOf(a.shown!) || a.shown! })}>
                {t('assets.original')}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="asset-actions">
        {a.file && (
          <button className="icon-btn" title={t('assets.reveal', { file: a.file })} aria-label={t('assets.reveal', { file: a.name })} onClick={() => send({ t: 'revealAsset', id: a.id })}>
            <Icon.file />
          </button>
        )}
        {a.kind === 'svg' && (
          <button className="icon-btn" title={t('assets.copySvg')} aria-label={t('assets.copySvg')} onClick={() => send({ t: 'copySvg', id: a.id })}>
            <Icon.code />
          </button>
        )}
        {!a.streaming && (
          <button className="icon-btn" title={t('assets.save')} aria-label={t('assets.save')} onClick={() => send({ t: 'saveAsset', id: a.id })}>
            <Icon.download />
          </button>
        )}
      </span>
    </li>
  );
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, bytes < 10240 ? 1 : 0)} KB`;
  return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
}
