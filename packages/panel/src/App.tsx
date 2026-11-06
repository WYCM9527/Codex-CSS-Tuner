import { useCallback, useEffect, useRef, useState } from 'react';
import { getLocale, setLocale, t, type HandoffVia, type PanelState, type PanelToExt, type PropValue } from '@css-tuner/protocol';
import type { Host, PromptRequest } from './host';
import { ChangeList, ElementHeader, NoticeBar, Toolbar, type Handoff } from './components/Chrome';
import { Icon } from './components/icons';
import { Inspector, type UiPrefs } from './components/Inspector';
import { Structure } from './components/Structure';
import type { Edit } from './components/types';

function loadPrefs(host: Host): UiPrefs {
  const p = host.load<UiPrefs>('prefs', { closed: ['position', 'changes', 'assets'], split: [], v: 2 });
  const v = p.v ?? 0;
  if (v >= 2) return p;
  const add = [...(v < 1 ? ['changes'] : []), 'assets'];
  return { ...p, closed: [...new Set([...p.closed, ...add])], v: 2 };
}

/** 批次号：注释里写着它，Codex 拿它取这一批改动的完整说明 */
function newBatch(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 剪贴板写不进去时把提示词摆出来让用户自己复制 */
function PromptDialog({ prompt, onClose }: { prompt: PromptRequest; onClose: () => void }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const copy = () => {
    box.current?.select();
    navigator.clipboard.writeText(prompt.text).then(
      () => setCopied(true),
      () => setCopied(document.execCommand('copy')),
    );
  };
  const title = prompt.mode === 'text' ? t('panel.prompt.copy') : t('panel.prompt.title');
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-box">
        <header className="modal-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose} title={t('panel.prompt.close')} aria-label={t('panel.prompt.close')}>
            <Icon.x />
          </button>
        </header>
        <p className="muted">{prompt.mode === 'text' ? t('panel.prompt.text') : t('panel.prompt.body')}</p>
        <textarea ref={box} className="modal-text" readOnly value={prompt.text} spellCheck={false} />
        <footer className="modal-foot">
          <button className="btn primary" onClick={copy}>
            {copied ? t('panel.prompt.copied') : t('panel.prompt.copy')}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function App({ host }: { host: Host }) {
  const [state, setState] = useState<PanelState | null>(null);
  const [prefs, setPrefsState] = useState<UiPrefs>(() => loadPrefs(host));
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  useEffect(() => host.onPrompt(setPrompt), [host]);
  const closePrompt = useCallback(() => setPrompt(null), []);

  useEffect(() => {
    const off = host.subscribe((s) => {
      if (s.locale) {
        if (s.locale !== getLocale()) setLocale(s.locale);
        document.documentElement.lang = s.locale;
      }
      setState(s);
    });
    host.send({ t: 'ready' });
    return off;
  }, [host]);

  const send = useCallback((m: PanelToExt) => host.send(m), [host]);

  /**
   * 交给 Codex：先在点击当中把注释放进 Codex 的输入框（注释只带批次号和一句话），再让本地服务记下这一批；
   * 注释接口不在（不是 Codex 的内置浏览器）或者没接收时，本地服务把完整提示词复制到剪贴板
   */
  const handoff = useCallback<Handoff>(
    (mode, ids) => {
      const all = state?.changes ?? [];
      const items = ids ? all.filter((c) => ids.includes(c.id)) : all.filter((c) => c.status === 'pending');
      if (!items.length) return;
      const batch = newBatch();
      const n = items.length;
      const comment = mode === 'apply' ? t('handoff.annotate.apply', { n, batch }) : t('handoff.annotate.revert', { batch });
      const ok = host.shell?.annotate({ comment, uids: items.map((c) => c.uid), metadata: { 'CSS Tuner batch': batch, Changes: n, Action: mode } }) ?? false;
      const via: HandoffVia = ok ? 'annotation' : 'clipboard';
      if (mode === 'apply') host.send({ t: 'apply', ids, batch, via });
      else host.send({ t: 'revert', id: items[0].id, batch, via });
    },
    [host, state],
  );
  const setPrefs = useCallback(
    (p: UiPrefs) => {
      setPrefsState(p);
      host.save('prefs', p);
    },
    [host],
  );
  const edit = useCallback((props: string[], e: Edit) => host.send({ t: 'edit', edit: { ...e, props } }), [host]);
  const editText = useCallback((segment: number, value: string, phase: 'live' | 'commit') => host.send({ t: 'editText', segment, value, phase }), [host]);
  const editProp = useCallback((name: string, value: PropValue, phase: 'live' | 'commit') => host.send({ t: 'editProp', name, value, phase }), [host]);

  // ⌘Z / ⇧⌘Z（Windows、Linux 上 Ctrl+Z / Ctrl+Shift+Z、Ctrl+Y）：输入框里留给输入框自己撤销
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing) return;
      const k = e.key.toLowerCase();
      const redo = (k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.shiftKey);
      if (!redo && !(k === 'z' && !e.shiftKey)) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      host.send({ t: redo ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [host]);

  if (!state) return <div className="boot">{t('panel.boot')}</div>;
  const sel = state.selection;
  const connected = state.connection === 'connected';
  const toggleClosed = (id: string) => setPrefs({ ...prefs, closed: prefs.closed.includes(id) ? prefs.closed.filter((x) => x !== id) : [...prefs.closed, id] });

  return (
    <div className="app">
      <Toolbar state={state} send={send} shell={host.shell} />
      <ChangeList state={state} send={send} handoff={handoff} open={!prefs.closed.includes('changes')} onToggle={() => toggleClosed('changes')} />
      <NoticeBar state={state} send={send} />
      <main className="main">
        {!connected && state.connection !== 'opening' && (
          <div className="empty">
            <p>{t('panel.empty.open')}</p>
            <p className="muted">{t('panel.empty.support')}</p>
          </div>
        )}
        {state.connection === 'opening' && <div className="empty muted">{t('panel.opening')}</div>}
        {connected && !sel && (
          <div className="empty">
            <p>{t('panel.empty.pick')}</p>
            <p className="muted">{t('panel.empty.esc')}</p>
          </div>
        )}
        {connected && sel && (
          <>
            <ElementHeader state={state} sel={sel} send={send} />
            <Structure
              sel={sel}
              send={send}
              open={!prefs.closed.includes('tree')}
              onToggle={toggleClosed}
              onlyComponents={prefs.split.includes('tree-components')}
              setOnlyComponents={(on) => setPrefs({ ...prefs, split: on ? [...prefs.split, 'tree-components'] : prefs.split.filter((x) => x !== 'tree-components') })}
            />
            <Inspector state={state} sel={sel} prefs={prefs} setPrefs={setPrefs} edit={edit} editText={editText} editProp={editProp} send={send} />
          </>
        )}
      </main>
      {prompt && <PromptDialog prompt={prompt} onClose={closePrompt} />}
    </div>
  );
}
