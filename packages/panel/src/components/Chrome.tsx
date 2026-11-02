import { useEffect, useRef, useState } from 'react';
import type { ChangeStatus, ChangeView, PanelState, PanelToExt, SelectionView } from '@css-tuner/protocol';
import { displayValue, shortFile } from '../lib/format';
import { IconToggle } from './controls';
import { Icon } from './icons';

type Send = (m: PanelToExt) => void;

const CONN_LABEL: Record<PanelState['connection'], string> = {
  idle: '未连接',
  opening: '连接中…',
  connected: '已连接',
  lost: '连接断开',
};

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
        <span className={`dot is-${state.connection}`} title={CONN_LABEL[state.connection]} />
        <input className="url" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} placeholder="http://localhost:5173/" aria-label="页面地址" />
        <button className="btn" type="submit" disabled={state.connection === 'opening'}>
          {connected ? '刷新' : '打开'}
        </button>
      </form>
      {connected && (
        <div className="tool-row">
          <button className={`btn pick${state.pickOn ? ' on' : ''}`} onClick={() => send({ t: 'pick', on: !state.pickOn })} aria-pressed={state.pickOn}>
            <Icon.crosshair />
            {state.pickOn ? '在页面上点选…' : '选取元素'}
          </button>
          <span className="spacer" />
          <IconToggle on={state.snap} title={state.snap ? '吸附到刻度：开（拖动时按住 Alt 调精确值）' : '吸附到刻度：关'} onClick={() => send({ t: 'setSnap', on: !state.snap })}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 12h12M4 12V9M7 12V6M10 12V9M13 12V4" />
            </svg>
          </IconToggle>
        </div>
      )}
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
      <nav className="crumbs" aria-label="元素层级" ref={nav}>
        {crumbs.map((c, i) => (
          <button key={c.uid} className={i === crumbs.length - 1 ? 'crumb on' : 'crumb'} onClick={() => send({ t: 'select', uid: c.uid })} title={c.label}>
            {c.label}
          </button>
        ))}
      </nav>
      <div className="el-title">
        <span className="el-label">{el.label}</span>
        {el.sameSource > 1 && (
          <span className="badge" title="同一处 JSX 渲染出的元素数，改 className 会一起变">
            同源 {el.sameSource} 处
          </span>
        )}
        {state.scales?.mode === 'tailwind' && el.source && (
          <div className="scope seg" role="radiogroup" aria-label="改动范围">
            <button
              role="radio"
              aria-checked={state.scope === 'instance'}
              className={state.scope === 'instance' ? 'on' : ''}
              title="此处：尽量只改这一个实例（组件用 cn / twMerge 合并类名时，在调用处加覆盖类）"
              onClick={() => send({ t: 'setScope', scope: 'instance' })}
            >
              此处
            </button>
            <button
              role="radio"
              aria-checked={state.scope === 'source'}
              className={state.scope === 'source' ? 'on' : ''}
              title="源头：改组件定义和变体（cva、类名常量），所有用到的地方一起变"
              onClick={() => send({ t: 'setScope', scope: 'source' })}
            >
              源头
            </button>
          </div>
        )}
      </div>
      <div className="el-source">
        {el.source && sel.file ? (
          <button className="link-btn" onClick={() => send({ t: 'openSource', file: sel.file!, line: el.source!.line, column: el.source!.column })} title={sel.file}>
            <Icon.file />
            {shortFile(sel.file)}:{el.source.line}
            {el.source.viaOwner && el.source.component ? <small>（经由 {el.source.component}）</small> : null}
          </button>
        ) : el.source ? (
          <span className="muted" title="开发服务器上的路径在当前工作区里找不到">
            {el.source.path}:{el.source.line}
          </span>
        ) : (
          <span className="muted">没有找到 JSX 源码位置</span>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<ChangeStatus, string> = {
  pending: '未应用',
  applied: '已应用',
  unverified: '已写入，待确认',
  failed: '失败',
  reverted: '已还原',
  conflict: '冲突',
  handoff: '已交给 Agent',
};

export function ChangeList({ state, send }: { state: PanelState; send: Send }) {
  const [open, setOpen] = useState(true);
  const changes = state.changes;
  if (!changes.length) return null;
  const pending = changes.filter((c) => c.status === 'pending');
  const agentable = changes.filter((c) => (c.status === 'pending' && c.target.kind === 'agent') || c.status === 'failed' || c.status === 'conflict');
  const done = changes.filter((c) => c.status === 'reverted' || c.status === 'handoff' || c.status === 'applied');
  return (
    <div className={`changes${open ? '' : ' is-closed'}`}>
      <header className="changes-head">
        <button className="sec-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <svg className={`chev${open ? ' open' : ''}`} viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 4l4 4-4 4" />
          </svg>
          <span>改动</span>
          {pending.length > 0 && <span className="count">{pending.length}</span>}
        </button>
        <span className="spacer" />
        {done.length > 0 && (
          <button className="link-btn" onClick={() => send({ t: 'clearDone' })} title="从列表移除已应用、已还原、已交给 Agent 的条目（不影响源码）">
            清理
          </button>
        )}
        {agentable.length > 0 && (
          <button className="btn ghost" onClick={() => send({ t: 'handoff', ids: agentable.map((c) => c.id) })} title="生成提示词，预填进新的 Agent 对话（需要你按回车发送）">
            <Icon.agent />
            交给 Agent
          </button>
        )}
        {pending.some((c) => c.target.kind !== 'agent') && (
          <button className="btn primary" disabled={state.busy} onClick={() => send({ t: 'apply' })}>
            全部应用
          </button>
        )}
      </header>
      {open && (
        <ul className="change-items">
          {changes.map((c) => (
            <ChangeItem key={c.id} c={c} busy={state.busy} send={send} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChangeItem({ c, busy, send }: { c: ChangeView; busy: boolean; send: Send }) {
  const file = c.target.file;
  return (
    <li className={`change is-${c.status}`}>
      <div className="change-main">
        <span className={`status s-${c.status}`} title={STATUS_LABEL[c.status]} />
        <span className="change-prop">{c.propLabel}</span>
        <span className="change-vals">
          <s>{displayValue(c.from)}</s>
          <span className="arrow">→</span>
          <b>{displayValue(c.to)}</b>
        </span>
      </div>
      <div className="change-sub">
        <span className="muted" title={c.target.label}>
          {c.element} · {c.target.kind === 'agent' ? '交给 Agent' : c.target.label}
          {c.target.affects > 1 ? ` · 影响 ${c.target.affects} 处` : ''}
        </span>
      </div>
      {c.note && <div className={`change-note${c.status === 'failed' || c.status === 'conflict' ? ' is-error' : ''}`}>{c.note}</div>}
      <div className="change-actions">
        {c.status === 'pending' && c.target.kind !== 'agent' && (
          <button className="mini" disabled={busy} onClick={() => send({ t: 'apply', ids: [c.id] })} title="写回源码">
            <Icon.check /> 应用
          </button>
        )}
        {(c.status === 'applied' || c.status === 'unverified') && (
          <button className="mini" disabled={busy} onClick={() => send({ t: 'revert', id: c.id })} title="把源码恢复到应用前">
            <Icon.undo /> 还原
          </button>
        )}
        {c.status === 'pending' && c.target.kind !== 'agent' && (
          <button className="mini" onClick={() => send({ t: 'diff', id: c.id })} title="预览应用后源码会变成什么样">
            <Icon.diff /> 对比
          </button>
        )}
        {(c.status === 'applied' || c.status === 'unverified' || c.status === 'conflict' || c.status === 'reverted') && (
          <button className="mini" onClick={() => send({ t: 'diff', id: c.id })} title="对比写回前和现在的源码">
            <Icon.diff /> 对比
          </button>
        )}
        {file && c.target.line && (
          <button className="mini" onClick={() => send({ t: 'openSource', file, line: c.target.line!, column: c.target.column ?? 1 })} title={file}>
            <Icon.file /> 源码
          </button>
        )}
        {(c.status === 'pending' || c.status === 'failed' || c.status === 'conflict') && (
          <button className="mini" onClick={() => send({ t: 'discard', id: c.id })} title="撤掉预览，不写回">
            <Icon.x /> 放弃
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
      <button className="icon-btn" onClick={() => send({ t: 'dismissNotice' })} title="关闭">
        <Icon.x />
      </button>
    </div>
  );
}
