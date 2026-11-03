import { useCallback, useEffect, useState } from 'react';
import { getLocale, setLocale, t, type PanelState, type PanelToExt } from '@css-tuner/protocol';
import type { Host } from './host';
import { ChangeList, ElementHeader, NoticeBar, Toolbar } from './components/Chrome';
import { Inspector, type UiPrefs } from './components/Inspector';
import { Structure } from './components/Structure';
import type { Edit } from './components/types';

export function App({ host }: { host: Host }) {
  const [state, setState] = useState<PanelState | null>(null);
  const [prefs, setPrefsState] = useState<UiPrefs>(() => host.load<UiPrefs>('prefs', { closed: ['position'], split: [] }));

  useEffect(() => {
    const off = host.subscribe((s) => {
      if (s.locale && s.locale !== getLocale()) setLocale(s.locale);
      setState(s);
    });
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
  const editText = useCallback((segment: number, value: string, phase: 'live' | 'commit') => host.send({ t: 'editText', segment, value, phase }), [host]);

  if (!state) return <div className="boot">{t('panel.boot')}</div>;
  const sel = state.selection;
  const connected = state.connection === 'connected';

  return (
    <div className="app">
      <Toolbar state={state} send={send} />
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
              onToggle={(id) => setPrefs({ ...prefs, closed: prefs.closed.includes(id) ? prefs.closed.filter((x) => x !== id) : [...prefs.closed, id] })}
              onlyComponents={prefs.split.includes('tree-components')}
              setOnlyComponents={(on) => setPrefs({ ...prefs, split: on ? [...prefs.split, 'tree-components'] : prefs.split.filter((x) => x !== 'tree-components') })}
            />
            <Inspector state={state} sel={sel} prefs={prefs} setPrefs={setPrefs} edit={edit} editText={editText} />
          </>
        )}
      </main>
      <ChangeList state={state} send={send} />
    </div>
  );
}
