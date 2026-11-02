import { useCallback, useEffect, useState } from 'react';
import type { PanelState, PanelToExt } from '@css-tuner/protocol';
import type { Host } from './host';
import { ChangeList, ElementHeader, NoticeBar, Toolbar } from './components/Chrome';
import { Inspector, type UiPrefs } from './components/Inspector';
import { Structure } from './components/Structure';
import type { Edit } from './components/types';

export function App({ host }: { host: Host }) {
  const [state, setState] = useState<PanelState | null>(null);
  const [prefs, setPrefsState] = useState<UiPrefs>(() => host.load<UiPrefs>('prefs', { closed: ['position'], split: [] }));

  useEffect(() => {
    const off = host.subscribe(setState);
    host.send({ t: 'ready' });
    return off;
  }, [host]);

  const send = useCallback((m: PanelToExt) => host.send(m), [host]);
  const setPrefs = useCallback(
    (p: UiPrefs) => {
      setPrefsState(p);
      host.save('prefs', p);
    },
    [host],
  );
  const edit = useCallback((props: string[], e: Edit) => host.send({ t: 'edit', edit: { ...e, props } }), [host]);

  if (!state) return <div className="boot">正在连接扩展…</div>;
  const sel = state.selection;
  const connected = state.connection === 'connected';

  return (
    <div className="app">
      <Toolbar state={state} send={send} />
      <NoticeBar state={state} send={send} />
      <main className="main">
        {!connected && state.connection !== 'opening' && (
          <div className="empty">
            <p>填入开发服务器地址后点「打开」，页面会在 Cursor 内置浏览器里打开。</p>
            <p className="muted">支持 Vite + React（Tailwind 4 或普通 CSS）；静态 HTML 可在资源管理器里右键 .html 选「用内置静态服务打开 HTML」。</p>
          </div>
        )}
        {state.connection === 'opening' && <div className="empty muted">正在打开页面并注入调参脚本…</div>}
        {connected && !sel && (
          <div className="empty">
            <p>点「选取元素」，再点页面上想调整的元素。</p>
            <p className="muted">按 Esc 退出选取。</p>
          </div>
        )}
        {connected && sel && (
          <>
            <ElementHeader state={state} sel={sel} send={send} />
            <Structure
              sel={sel}
              send={send}
              open={!prefs.closed.includes('tree')}
              onToggle={(id) => setPrefs({ ...prefs, closed: prefs.closed.includes(id) ? prefs.closed.filter((x) => x !== id) : [...prefs.closed, id] })}
              onlyComponents={prefs.split.includes('tree-components')}
              setOnlyComponents={(on) => setPrefs({ ...prefs, split: on ? [...prefs.split, 'tree-components'] : prefs.split.filter((x) => x !== 'tree-components') })}
            />
            <Inspector state={state} sel={sel} prefs={prefs} setPrefs={setPrefs} edit={edit} />
          </>
        )}
      </main>
      <ChangeList state={state} send={send} />
    </div>
  );
}
