import { useEffect, useRef, useState } from 'react';
import { changeName, t, type ChangeView, type Locale, type OrderView, type PanelState, type PanelToExt, type SelectionView } from '@css-tuner/protocol';
import { displayValue, shortFile } from '../lib/format';
import { IconToggle, targetHint } from './controls';
import { Icon } from './icons';

type Send = (m: PanelToExt) => void;

export function Toolbar({ state, send }: { state: PanelState; send: Send }) {
  const [url, setUrl] = useState(state.page?.url ?? state.defaultUrl);
  useEffect(() => {
    if (state.page?.url) setUrl(state.page.url);
  }, [state.page?.url]);
  const connected = state.connection === 'connected';
  return (
    <div className="toolbar">
      <form
        className="url-row"
        onSubmit={(e) => {
          e.preventDefault();
          send({ t: 'openPage', url });
        }}
      >
        <span className={`dot is-${state.connection}`} title={t(`panel.conn.${state.connection}`)} />
        <input className="url" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} placeholder="http://localhost:5173/" aria-label={t('panel.url')} />
        <button className="btn" type="submit" disabled={state.connection === 'opening'}>
          {connected ? t('panel.reload') : t('panel.open')}
        </button>
        <LocaleSwitch state={state} send={send} />
      </form>
      {connected && (
        <div className="tool-row">
          <button className={`btn pick${state.pickOn ? ' on' : ''}`} onClick={() => send({ t: 'pick', on: !state.pickOn })} aria-pressed={state.pickOn}>
            <Icon.crosshair />
            {state.pickOn ? t('panel.picking') : t('panel.pick')}
          </button>
          <span className="spacer" />
          <IconToggle on={state.snap} title={state.snap ? t('panel.snap.on') : t('panel.snap.off')} onClick={() => send({ t: 'setSnap', on: !state.snap })}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 12h12M4 12V9M7 12V6M10 12V9M13 12V4" />
            </svg>
          </IconToggle>
        </div>
      )}
    </div>
  );
}

/** 界面语言：语言名各用自己的写法，选了记进设置 */
function LocaleSwitch({ state, send }: { state: PanelState; send: Send }) {
  const opt = (locale: Locale, label: string, title: string) => (
    <button
      type="button"
      role="radio"
      lang={locale}
      aria-checked={state.locale === locale}
      className={state.locale === locale ? 'on' : ''}
      title={title}
      onClick={() => state.locale !== locale && send({ t: 'setLocale', locale })}
    >
      {label}
    </button>
  );
  return (
    <div className="seg lang" role="radiogroup" aria-label={t('panel.lang')}>
      {opt('zh-CN', '中', '简体中文')}
      {opt('en', 'EN', 'English')}
    </div>
  );
}

const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
export const SHORTCUT = { undo: MAC ? '⌘Z' : 'Ctrl+Z', redo: MAC ? '⇧⌘Z' : 'Ctrl+Shift+Z' };

/** 上一步 / 下一步：撤销、重做还没应用的改动，提示里写着这一步改的是什么 */
function HistoryButtons({ state, send }: { state: PanelState; send: Send }) {
  const btn = (kind: 'undo' | 'redo') => {
    const label = state.history[kind];
    const name = t(`panel.${kind}`);
    const title = label ? t(`panel.${kind}.title`, { label, key: SHORTCUT[kind] }) : t(`panel.${kind}.none`, { key: SHORTCUT[kind] });
    const Glyph = kind === 'undo' ? Icon.undo : Icon.redo;
    return (
      <button className="icon-btn" disabled={!label} title={title} aria-label={name} onClick={() => send({ t: kind })}>
        <Glyph />
      </button>
    );
  };
  return (
    <div className="history-btns">
      {btn('undo')}
      {btn('redo')}
    </div>
  );
}

export function ElementHeader({ state, sel, send }: { state: PanelState; sel: SelectionView; send: Send }) {
  const { el } = sel;
  const crumbs = el.breadcrumb;
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    if (nav.current) nav.current.scrollLeft = nav.current.scrollWidth;
  }, [el.uid]);
  return (
    <div className="el-head">
      <nav className="crumbs" aria-label={t('panel.crumbs')} ref={nav}>
        {crumbs.map((c, i) => (
          <button key={c.uid} className={i === crumbs.length - 1 ? 'crumb on' : 'crumb'} onClick={() => send({ t: 'select', uid: c.uid })} title={c.label}>
            {c.label}
          </button>
        ))}
      </nav>
      <div className="el-title">
        <span className="el-label">{el.label}</span>
        {el.sameSource > 1 && (
          <span className="badge" title={t('panel.sameSource.title', { n: el.sameSource })}>
            {t('panel.sameSource', { n: el.sameSource })}
          </span>
        )}
        {sel.order && <OrderButtons uid={el.uid} order={sel.order} send={send} />}
        {state.scales?.mode === 'tailwind' && el.source && (
          <div className="scope seg" role="radiogroup" aria-label={t('panel.scope')}>
            <button
              role="radio"
              aria-checked={state.scope === 'instance'}
              className={state.scope === 'instance' ? 'on' : ''}
              title={t('panel.scope.instance.title')}
              onClick={() => send({ t: 'setScope', scope: 'instance' })}
            >
              {t('panel.scope.instance')}
            </button>
            <button
              role="radio"
              aria-checked={state.scope === 'source'}
              className={state.scope === 'source' ? 'on' : ''}
              title={t('panel.scope.source.title')}
              onClick={() => send({ t: 'setScope', scope: 'source' })}
            >
              {t('panel.scope.source')}
            </button>
          </div>
        )}
      </div>
      <div className="el-source">
        {el.source && sel.file ? (
          <button className="link-btn" onClick={() => send({ t: 'openSource', file: sel.file!, line: el.source!.line, column: el.source!.column })} title={sel.file}>
            <Icon.file />
            {shortFile(sel.file)}:{el.source.line}
            {el.source.viaOwner && el.source.component ? <small>{t('panel.via', { name: el.source.component })}</small> : null}
          </button>
        ) : el.source ? (
          <span className="muted" title={t('panel.src.notInWorkspace')}>
            {el.source.path}:{el.source.line}
          </span>
        ) : (
          <span className="muted">{t('panel.src.none')}</span>
        )}
      </div>
    </div>
  );
}

/** 改动清单、上一步 / 下一步和提交按钮，固定在工具栏下面；撤掉了最后一条也留着，好撤销回来 */
export function ChangeList({ state, send, open, onToggle }: { state: PanelState; send: Send; open: boolean; onToggle: () => void }) {
  const changes = state.changes;
  if (!changes.length && !state.history.undo && !state.history.redo) return null;
  const pending = changes.filter((c) => c.status === 'pending');
  const agentable = changes.filter((c) => (c.status === 'pending' && c.target.kind === 'agent') || c.status === 'failed' || c.status === 'conflict');
  const done = changes.filter((c) => c.status === 'reverted' || c.status === 'handoff' || c.status === 'applied');
  return (
    <div className={`changes${open ? '' : ' is-closed'}${changes.length ? '' : ' is-empty'}`}>
      <header className="changes-head">
        <button className="sec-toggle" onClick={onToggle} aria-expanded={open} disabled={!changes.length}>
          <svg className={`chev${open ? ' open' : ''}`} viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 4l4 4-4 4" />
          </svg>
          <span>{t('panel.changes')}</span>
          {pending.length > 0 && <span className="count">{pending.length}</span>}
        </button>
        <span className="spacer" />
        {done.length > 0 && (
          <button className="link-btn" onClick={() => send({ t: 'clearDone' })} title={t('panel.clear.title')}>
            {t('panel.clear')}
          </button>
        )}
        {agentable.length > 0 && (
          <button className="btn ghost" onClick={() => send({ t: 'handoff', ids: agentable.map((c) => c.id) })} title={t('panel.handoff.title')}>
            <Icon.agent />
            {t('panel.handoff')}
          </button>
        )}
        <HistoryButtons state={state} send={send} />
        {pending.some((c) => c.target.kind !== 'agent') && (
          <button className="btn primary" disabled={state.busy} onClick={() => send({ t: 'apply' })}>
            {t('panel.applyAll')}
          </button>
        )}
      </header>
      {open && changes.length > 0 && (
        <ul className="change-items">
          {changes.map((c) => (
            <ChangeItem key={c.id} c={c} busy={state.busy} send={send} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** 改动前后的值：文字加引号，换序显示位置，样式按颜色、变量缩写 */
/** 在兄弟之间挪一位：竖排是上移 / 下移，横排是左移 / 右移 */
function OrderButtons({ uid, order, send }: { uid: string; order: OrderView; send: Send }) {
  const n = order.items.length;
  const move = (d: -1 | 1) => send({ t: 'reorder', uid, to: order.index + d, phase: 'commit' });
  const hint = targetHint(order.target);
  const btn = (d: -1 | 1) => {
    const action = t(`panel.order.${d < 0 ? 'prev' : 'next'}.${order.axis}`);
    const title = t('panel.order.title', { action, i: order.index + 1, n });
    return (
      <button className="icon-btn" disabled={d < 0 ? order.index <= 0 : order.index >= n - 1} title={hint ? `${title}\n${hint}` : title} aria-label={action} onClick={() => move(d)}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" style={order.axis === 'x' ? { transform: 'rotate(-90deg)' } : undefined}>
          <path d={d < 0 ? 'M8 13V3M4 7l4-4 4 4' : 'M8 3v10M4 9l4 4 4-4'} />
        </svg>
      </button>
    );
  };
  const reset = t('field.reset', { label: t('panel.change.order') });
  return (
    <div className="order-btns">
      {btn(-1)}
      {btn(1)}
      {order.pending && (
        <button className="icon-btn" title={reset} aria-label={reset} onClick={() => send({ t: 'resetOrder' })}>
          <Icon.undo />
        </button>
      )}
      {order.target.kind === 'agent' && <span className="nf-agent" title={order.target.reason ?? t('field.agent')} />}
    </div>
  );
}

function changeValues(c: ChangeView): [string, string] {
  if (c.kind === 'text') return [`“${c.from}”`, `“${c.to}”`];
  if (c.kind === 'reorder') return [t('panel.change.position', { n: c.from }), t('panel.change.position', { n: c.to })];
  if (c.kind === 'prop') return [c.from, c.to];
  if (c.remove) return [displayValue(c.from), t('panel.change.removed')];
  return [displayValue(c.from), displayValue(c.to)];
}

function ChangeItem({ c, busy, send }: { c: ChangeView; busy: boolean; send: Send }) {
  const file = c.target.file;
  const [from, to] = changeValues(c);
  return (
    <li className={`change is-${c.status}`}>
      <div className="change-main">
        <span className={`status s-${c.status}`} title={t(`panel.status.${c.status}`)} />
        <span className="change-prop">{changeName(c)}</span>
        <span className="change-vals">
          <s title={from}>{from}</s>
          <span className="arrow">→</span>
          <b title={to}>{to}</b>
        </span>
      </div>
      <div className="change-sub">
        <span className="muted" title={c.target.label}>
          {c.element} · {c.target.kind === 'agent' ? t('panel.change.toAgent') : c.target.label}
          {c.target.affects > 1 ? ` · ${t('panel.change.affects', { n: c.target.affects })}` : ''}
        </span>
        {c.simulated && (
          <span className="change-tag" title={t('panel.change.simulated.title')}>
            {t('panel.change.simulated')}
          </span>
        )}
      </div>
      {c.note && <div className={`change-note${c.status === 'failed' || c.status === 'conflict' ? ' is-error' : ''}`}>{c.note}</div>}
      <div className="change-actions">
        {c.status === 'pending' && c.target.kind !== 'agent' && (
          <button className="mini" disabled={busy} onClick={() => send({ t: 'apply', ids: [c.id] })} title={t('panel.apply.title')}>
            <Icon.check /> {t('panel.apply')}
          </button>
        )}
        {(c.status === 'applied' || c.status === 'unverified') && (
          <button className="mini" disabled={busy} onClick={() => send({ t: 'revert', id: c.id })} title={t('panel.revert.title')}>
            <Icon.undo /> {t('panel.revert')}
          </button>
        )}
        {c.status === 'pending' && c.target.kind !== 'agent' && (
          <button className="mini" onClick={() => send({ t: 'diff', id: c.id })} title={t('panel.diff.pending.title')}>
            <Icon.diff /> {t('panel.diff')}
          </button>
        )}
        {(c.status === 'applied' || c.status === 'unverified' || c.status === 'conflict' || c.status === 'reverted') && (
          <button className="mini" onClick={() => send({ t: 'diff', id: c.id })} title={t('panel.diff.applied.title')}>
            <Icon.diff /> {t('panel.diff')}
          </button>
        )}
        {file && c.target.line && (
          <button className="mini" onClick={() => send({ t: 'openSource', file, line: c.target.line!, column: c.target.column ?? 1 })} title={file}>
            <Icon.file /> {t('panel.openSource')}
          </button>
        )}
        {(c.status === 'pending' || c.status === 'failed' || c.status === 'conflict') && (
          <button className="mini" onClick={() => send({ t: 'discard', id: c.id })} title={t('panel.discard.title')}>
            <Icon.x /> {t('panel.discard')}
          </button>
        )}
      </div>
    </li>
  );
}

export function NoticeBar({ state, send }: { state: PanelState; send: Send }) {
  if (!state.notice) return null;
  return (
    <div className={`notice is-${state.notice.level}`} role={state.notice.level === 'error' ? 'alert' : 'status'}>
      <span>{state.notice.text}</span>
      <button className="icon-btn" onClick={() => send({ t: 'dismissNotice' })} title={t('panel.close')}>
        <Icon.x />
      </button>
    </div>
  );
}
