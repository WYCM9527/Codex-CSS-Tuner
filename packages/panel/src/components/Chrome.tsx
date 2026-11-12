import { useEffect, useState } from 'react';
import { changeName, t, type ChangeView, type Locale, type PanelState, type PanelToExt, type Scope, type SelectionView } from '@css-tuner/protocol';
import type { Shell } from '../host';
import { displayValue, fontValue, shortFile } from '../lib/format';
import { boundary, nameOf } from '../lib/names';
import { IconToggle } from './controls';
import { Icon } from './icons';

type Send = (m: PanelToExt) => void;
/** 交给 Codex：应用（不给 ids 是全部未应用的）或还原 */
export type Handoff = (mode: 'apply' | 'revert', ids?: string[]) => void;

export function Toolbar({ state, send, shell }: { state: PanelState; send: Send; shell: Shell | null }) {
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
        {shell && (
          <ShellButtons
            shell={shell}
            beforeCollapse={() => {
              if (state.pickOn) send({ t: 'pick', on: false });
              if (state.measureOn) send({ t: 'measure', on: false });
            }}
          />
        )}
      </form>
      {connected && (
        <div className="tool-row">
          <button className={`btn pick${state.pickOn ? ' on' : ''}`} onClick={() => send({ t: 'pick', on: !state.pickOn })} aria-pressed={state.pickOn}>
            <Icon.crosshair />
            {state.pickOn ? t('panel.picking') : t('panel.pick')}
          </button>
          <span className="spacer" />
          <IconToggle on={state.measureOn} title={state.measureOn ? t('panel.measure.on') : t('panel.measure.off')} onClick={() => send({ t: 'measure', on: !state.measureOn })}>
            <Icon.ruler />
          </IconToggle>
          {state.pageWidth !== null && (
            <span className="page-width" title={t('panel.pageWidth', { width: state.pageWidth })}>
              {state.pageWidth}px
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 页内面板：停靠在旁边还是浮在页面上（换的时候页面会重新加载）、换到页面另一边、收起成角落里的小按钮。
 * 收起前先关掉自由选择和标尺：收起后看不见按钮，页面上的点击却还被拦着
 */
function ShellButtons({ shell, beforeCollapse }: { shell: Shell; beforeCollapse: () => void }) {
  const [side, setSide] = useState(shell.side);
  const [floating, setFloating] = useState(shell.floating);
  const other = side === 'right' ? 'left' : 'right';
  const dockTitle = t(other === 'left' ? 'panel.shell.dockLeft' : 'panel.shell.dockRight');
  const floatTitle = t(floating ? 'panel.shell.dockBeside' : 'panel.shell.float');
  return (
    <>
      <button
        type="button"
        className="icon-btn"
        title={floatTitle}
        aria-label={floatTitle}
        onClick={() => {
          shell.setFloating(!floating);
          setFloating(!floating);
        }}
      >
        {floating ? <Icon.sidebar side={side} /> : <Icon.float side={side} />}
      </button>
      <button
        type="button"
        className="icon-btn"
        title={dockTitle}
        aria-label={dockTitle}
        onClick={() => {
          shell.dock(other);
          setSide(other);
        }}
      >
        <Icon.dock side={other} />
      </button>
      <button
        type="button"
        className="icon-btn"
        title={t('panel.shell.collapse')}
        aria-label={t('panel.shell.collapse')}
        onClick={() => {
          beforeCollapse();
          shell.collapse();
        }}
      >
        <Icon.collapse />
      </button>
    </>
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

/** 选中的元素叫什么、写在哪个文件；改样式会波及别的元素时说清楚，「只改这个 / 全部」有区别时才给选 */
export function ElementHeader({ state, sel, send }: { state: PanelState; sel: SelectionView; send: Send }) {
  const { el } = sel;
  const chain = el.breadcrumb;
  const self = chain[chain.length - 1];
  const name = nameOf(el.label, self?.text);
  const comp = self ? boundary(self, chain[chain.length - 2]) : null;
  const all = sel.scopeAll;
  const scopeBtn = (scope: Scope, label: string, title: string) => (
    <button role="radio" aria-checked={state.scope === scope} className={state.scope === scope ? 'on' : ''} title={title} onClick={() => send({ t: 'setScope', scope })}>
      {label}
    </button>
  );
  return (
    <div className="el-head">
      <div className="el-title" title={el.label}>
        <span className="el-role">{name.role}</span>
        {name.quoted && <span className="el-text">{name.detail}</span>}
        {comp && <span className="tree-comp">&lt;{comp}&gt;</span>}
      </div>
      <div className="el-source">
        {el.source && sel.file ? (
          <button className="link-btn" onClick={() => send({ t: 'openSource', file: sel.file!, line: el.source!.line, column: el.source!.column })} title={t('panel.src.open', { file: sel.file })}>
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
        <span className="el-code">{el.label}</span>
      </div>
      {all ? (
        <div className="row el-scope">
          <span className="row-label">{t('panel.scope')}</span>
          <div className="row-fields">
            <div className="scope seg" role="radiogroup" aria-label={t('panel.scope')}>
              {scopeBtn('instance', t('panel.scope.instance'), t('panel.scope.instance.title'))}
              {all > 1
                ? scopeBtn('source', t('panel.scope.source', { n: all }), t('panel.scope.source.title', { n: all }))
                : scopeBtn('source', t('panel.scope.component'), t('panel.scope.component.title'))}
            </div>
          </div>
        </div>
      ) : (
        el.sameSource > 1 && <p className="el-note">{t('panel.sameSource', { n: el.sameSource })}</p>
      )}
    </div>
  );
}

/** 改动清单、上一步 / 下一步和提交按钮，固定在工具栏下面；撤掉了最后一条也留着，好撤销回来 */
export function ChangeList({ state, send, handoff, open, onToggle }: { state: PanelState; send: Send; handoff: Handoff; open: boolean; onToggle: () => void }) {
  const changes = state.changes;
  if (!changes.length && !state.history.undo && !state.history.redo) return null;
  const pending = changes.filter((c) => c.status === 'pending');
  const done = changes.filter((c) => c.status === 'applied' || c.status === 'reverted');
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
        <HistoryButtons state={state} send={send} />
        {pending.length > 0 && (
          <button className="btn primary" disabled={state.busy} onClick={() => handoff('apply')} title={t('panel.applyAll.title')}>
            <Icon.agent />
            {t('panel.applyAll')}
          </button>
        )}
      </header>
      {open && changes.length > 0 && (
        <ul className="change-items">
          {changes.map((c) => (
            <ChangeItem key={c.id} c={c} busy={state.busy} send={send} handoff={handoff} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** 改动前后的值：文字加引号，换序显示位置，样式按颜色、变量缩写，字体栈只显示首选的字体 */
function changeValues(c: ChangeView): [string, string] {
  if (c.kind === 'text') return [`“${c.from}”`, `“${c.to}”`];
  if (c.kind === 'reorder') return [t('panel.change.position', { n: c.from }), t('panel.change.position', { n: c.to })];
  if (c.kind === 'prop') return [c.from, c.to];
  const show = c.props.includes('font-family') ? fontValue : displayValue;
  if (c.remove) return [show(c.from), t('panel.change.removed')];
  return [show(c.from), show(c.to)];
}

function ChangeItem({ c, busy, send, handoff }: { c: ChangeView; busy: boolean; send: Send; handoff: Handoff }) {
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
      {c.note && <div className="change-note">{c.note}</div>}
      <div className="change-actions">
        {c.status === 'pending' && (
          <button className="mini" disabled={busy} onClick={() => handoff('apply', [c.id])} title={t('panel.apply.title')}>
            <Icon.check /> {t('panel.apply')}
          </button>
        )}
        {c.status === 'handoff' && (
          <button className="mini" disabled={busy} onClick={() => handoff('apply', [c.id])} title={t('panel.resend.title')}>
            <Icon.agent /> {t('panel.resend')}
          </button>
        )}
        {c.status === 'applied' && (
          <button className="mini" disabled={busy} onClick={() => handoff('revert', [c.id])} title={t('panel.revert.title')}>
            <Icon.undo /> {t('panel.revert')}
          </button>
        )}
        {c.status === 'reverting' && (
          <button className="mini" disabled={busy} onClick={() => handoff('revert', [c.id])} title={t('panel.resend.revert.title')}>
            <Icon.agent /> {t('panel.resend')}
          </button>
        )}
        {file && c.target.line && (
          <button className="mini" onClick={() => send({ t: 'openSource', file, line: c.target.line!, column: c.target.column ?? 1 })} title={file}>
            <Icon.file /> {t('panel.openSource')}
          </button>
        )}
        {(c.status === 'pending' || c.status === 'handoff') && (
          <button className="mini" onClick={() => send({ t: 'discard', id: c.id })} title={t(c.status === 'handoff' ? 'panel.discard.handoff.title' : 'panel.discard.title')}>
            <Icon.x /> {t('panel.discard')}
          </button>
        )}
        {c.status === 'reverting' && (
          <button className="mini" onClick={() => send({ t: 'discard', id: c.id })} title={t('panel.cancelRevert.title')}>
            <Icon.x /> {t('panel.cancelRevert')}
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
