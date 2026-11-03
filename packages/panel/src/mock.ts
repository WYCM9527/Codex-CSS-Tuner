import { getLocale, groupLabel, t, type ChangeView, type ElementSnapshot, type PanelState, type PanelToExt, type Scales, type ScaleStep, type Target } from '@css-tuner/protocol';
import type { Host } from './host';

/** 浏览器里调试面板用的假宿主：行为尽量贴近扩展，便于不开 Cursor 也能看交互 */

const rem = (n: number) => `${+(n / 16).toFixed(4)}rem`;

function spacing(): ScaleStep[] {
  const keys = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96];
  const out: ScaleStep[] = keys.map((k) => ({ label: String(k), value: k === 0 ? '0px' : rem(k * 4), px: k * 4, token: String(k) }));
  out.splice(1, 0, { label: 'px', value: '1px', px: 1, token: 'px' });
  out.push({ label: 'gutter', value: '18px', px: 18, token: 'gutter' });
  return out;
}

const PALETTE: Record<string, string[]> = {
  slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cad5e2', '#90a1b9', '#62748e', '#45556c', '#314158', '#1d293d', '#0f172b', '#020618'],
  blue: ['#eff6ff', '#dbeafe', '#bedbff', '#8ec5ff', '#51a2ff', '#2b7fff', '#155dfc', '#1447e6', '#193cb8', '#1c398e', '#162456'],
  rose: ['#fff1f2', '#ffe4e6', '#ffccd3', '#ffa1ad', '#ff637e', '#ff2056', '#ec003f', '#c70036', '#a50036', '#8b0836', '#4d0218'],
  amber: ['#fffbeb', '#fef3c6', '#fee685', '#ffd230', '#ffb900', '#fe9a00', '#e17100', '#bb4d00', '#973c00', '#7b3306', '#461901'],
};
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export function mockScales(): Scales {
  const sp = spacing();
  return {
    mode: 'tailwind',
    rem: 16,
    spacing: sp,
    size: [...sp, ...['3xs:256', 'xs:320', 'sm:384', 'md:448', 'lg:512', 'xl:576', '2xl:672', '3xl:768'].map((s) => {
      const [k, v] = s.split(':');
      return { label: k, value: rem(+v), px: +v, token: k };
    })],
    radius: [['xs', 2], ['sm', 4], ['md', 6], ['lg', 8], ['xl', 12], ['2xl', 16], ['3xl', 24], ['card', 14], ['full', 9999]].map(([k, v]) => ({ label: String(k), value: `${v}px`, px: +v, token: String(k) })),
    fontSize: [['xs', 12], ['sm', 14], ['base', 16], ['lg', 18], ['xl', 20], ['2xl', 24], ['3xl', 30], ['4xl', 36], ['5xl', 48], ['6xl', 60]].map(([k, v]) => ({ label: String(k), value: rem(+v), px: +v, token: String(k) })),
    fontWeight: [['thin', 100], ['extralight', 200], ['light', 300], ['normal', 400], ['medium', 500], ['semibold', 600], ['bold', 700], ['extrabold', 800], ['black', 900]].map(([k, v]) => ({ label: String(k), value: String(v), token: String(k) })),
    lineHeight: [['none', '1'], ['tight', '1.25'], ['snug', '1.375'], ['normal', '1.5'], ['relaxed', '1.625'], ['loose', '2'], ...[3, 4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), rem(n * 4)])].map(([k, v]) => ({ label: k, value: v, token: k })),
    letterSpacing: [['tighter', '-0.05em'], ['tight', '-0.025em'], ['normal', '0em'], ['wide', '0.025em'], ['wider', '0.05em'], ['widest', '0.1em']].map(([k, v]) => ({ label: k, value: v, token: k })),
    shadow: [
      ['none', 'none'],
      ['2xs', '0 1px rgb(0 0 0 / 0.05)'],
      ['xs', '0 1px 2px 0 rgb(0 0 0 / 0.05)'],
      ['sm', '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'],
      ['md', '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'],
      ['lg', '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'],
      ['xl', '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'],
      ['2xl', '0 25px 50px -12px rgb(0 0 0 / 0.25)'],
    ].map(([k, v]) => ({ label: k, value: v, token: k })),
    colors: [
      { label: 'brand', value: '#3b5bdb', token: 'brand' },
      { label: 'ink', value: '#1f2328', token: 'ink' },
      { label: 'paper', value: '#f6f8fa', token: 'paper' },
      { label: 'white', value: '#ffffff', token: 'white' },
      { label: 'black', value: '#000000', token: 'black' },
      ...Object.entries(PALETTE).flatMap(([fam, list]) => list.map((v, i) => ({ label: `${fam}-${SHADES[i]}`, value: v, token: `${fam}-${SHADES[i]}` }))),
    ],
    opacity: Array.from({ length: 21 }, (_, i) => ({ label: String(i * 5), value: String(i / 20), token: String(i * 5) })),
    zIndex: [0, 10, 20, 30, 40, 50].map((n) => ({ label: String(n), value: String(n), px: n, token: String(n) })),
  };
}

function el(over: Partial<ElementSnapshot>): ElementSnapshot {
  const computed: Record<string, string> = {
    display: 'flex',
    'flex-direction': 'row',
    'flex-wrap': 'nowrap',
    'justify-content': 'space-between',
    'align-items': 'center',
    'grid-template-columns': 'none',
    position: 'relative',
    top: 'auto',
    right: 'auto',
    bottom: 'auto',
    left: 'auto',
    'z-index': 'auto',
    'padding-top': '16px',
    'padding-right': '24px',
    'padding-bottom': '16px',
    'padding-left': '24px',
    'margin-top': '0px',
    'margin-right': '0px',
    'margin-bottom': '0px',
    'margin-left': '0px',
    'row-gap': 'normal',
    'column-gap': 'normal',
    width: '720px',
    height: '64px',
    'min-width': 'auto',
    'max-width': 'none',
    'min-height': 'auto',
    'max-height': 'none',
    'font-size': '16px',
    'font-weight': '400',
    'line-height': '24px',
    'letter-spacing': 'normal',
    'text-align': 'start',
    color: 'rgb(255, 255, 255)',
    'background-color': 'rgb(59, 91, 219)',
    'border-top-left-radius': '0px',
    'border-top-right-radius': '0px',
    'border-bottom-right-radius': '0px',
    'border-bottom-left-radius': '0px',
    'box-shadow': 'none',
    opacity: '1',
    '--spacing': '0.25rem',
    '--color-brand': '#3b5bdb',
    '--color-white': '#fff',
    '--font-sans': 'ui-sans-serif, system-ui, sans-serif',
  };
  const util = (u: string, value: string) => ({
    value,
    important: false,
    origin: 'rule' as const,
    via: null,
    inheritedFrom: null,
    rule: { sheet: { index: 1, devId: '/src/index.css', href: null }, path: [0], selector: `.${u}`, fullSelector: `.${u}`, conditions: ['@layer utilities'], layer: 'utilities', ordinal: 0, matchCount: 1, utility: u },
  });
  return {
    uid: 'e1',
    tag: 'header',
    id: null,
    classes: ['flex', 'items-center', 'justify-between', 'bg-brand', 'px-6', 'py-4', 'text-white'],
    label: 'header.flex.items-center…',
    rect: { x: 24, y: 24, w: 720, h: 64 },
    breadcrumb: [
      { uid: 'e0', label: 'div#root', component: null, kids: 2 },
      { uid: 'e9', label: 'main.mx-auto.max-w-3xl…', component: 'App', kids: 6 },
      { uid: 'e1', label: 'header.flex.items-center…', component: 'App', kids: 2 },
    ],
    children: [
      { uid: 'e2', label: 'h1.text-2xl.font-bold…', component: 'App', kids: 0 },
      { uid: 'e3', label: 'span.rounded-full.bg-white/10…', component: 'Badge', kids: 1 },
    ],
    source: { url: 'http://localhost:5173/src/App.tsx', path: '/src/App.tsx', file: '/proj/src/App.tsx', line: 14, column: 7, component: 'App', viaOwner: false },
    sameSource: 1,
    sourceIndex: 0,
    callers: [],
    classCounts: {},
    computed,
    winners: {
      'padding-left': util('px-6', 'calc(var(--spacing) * 6)'),
      'padding-right': util('px-6', 'calc(var(--spacing) * 6)'),
      'padding-top': util('py-4', 'calc(var(--spacing) * 4)'),
      'padding-bottom': util('py-4', 'calc(var(--spacing) * 4)'),
      'background-color': util('bg-brand', 'var(--color-brand)'),
      color: util('text-white', 'var(--color-white)'),
    },
    vars: [
      { name: '--spacing', value: '0.25rem', kind: 'length', props: ['padding-left', 'padding-right', 'padding-top', 'padding-bottom'] },
      { name: '--color-brand', value: '#3b5bdb', kind: 'color', props: ['background-color'] },
      { name: '--color-white', value: '#fff', kind: 'color', props: ['color'] },
      { name: '--font-sans', value: 'ui-sans-serif, system-ui, sans-serif', kind: 'other', props: ['font-family'] },
    ],
    rules: [],
    inline: {},
    fontSizePx: 16,
    rootFontSizePx: 16,
    ...over,
  };
}

const TITLE = el({
  uid: 'e2',
  tag: 'h1',
  classes: ['text-2xl', 'font-bold', 'tracking-tight'],
  label: 'h1.text-2xl.font-bold…',
  breadcrumb: [
    { uid: 'e0', label: 'div#root' },
    { uid: 'e9', label: 'main.mx-auto.max-w-3xl…' },
    { uid: 'e1', label: 'header.flex.items-center…' },
    { uid: 'e2', label: 'h1.text-2xl.font-bold…' },
  ],
  children: [],
  source: { url: 'http://localhost:5173/src/App.tsx', path: '/src/App.tsx', file: '/proj/src/App.tsx', line: 15, column: 9, component: 'App', viaOwner: false },
  fontSizePx: 24,
});
TITLE.computed = { ...TITLE.computed, display: 'block', 'font-size': '24px', 'font-weight': '700', 'line-height': '32px', 'letter-spacing': '-0.6px', 'background-color': 'rgba(0, 0, 0, 0)', 'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px', width: '220px', height: '32px' };

export function createMockHost(): Host {
  const els: Record<string, ElementSnapshot> = { e1: el({}), e2: TITLE };
  const state: PanelState = {
    connection: 'connected',
    page: { url: 'http://localhost:5173/', title: 'fixture · tw-react' },
    pickOn: false,
    scope: 'instance',
    selection: null,
    scales: mockScales(),
    changes: [],
    notice: null,
    defaultUrl: 'http://localhost:5173/',
    busy: false,
    snap: true,
    locale: getLocale(),
  };
  const pendingByEl: Record<string, Record<string, string>> = {};
  const select = (uid: string) => {
    const e = els[uid] ?? els.e1;
    state.selection = {
      el: e,
      file: '/proj/src/App.tsx',
      targets: Object.fromEntries(
        Object.keys(e.computed).map((p): [string, Target] => {
          const agent = p === 'opacity' && uid === 'e2';
          if (p.startsWith('--')) return [p, { kind: 'css', label: `src/index.css @theme ${p}`, file: '/proj/src/index.css', affects: 0 }];
          return [
            p,
            {
              kind: agent ? 'agent' : 'tailwind',
              label: `src/App.tsx:${e.source?.line} className`,
              file: '/proj/src/App.tsx',
              line: e.source?.line,
              column: e.source?.column,
              affects: e.sameSource,
              reason: agent ? t('mock.agentReason') : undefined,
            },
          ];
        }),
      ),
      pending: (pendingByEl[e.uid] ??= {}),
    };
  };
  select('e1');

  const subs = new Set<(s: PanelState) => void>();
  const emit = () => {
    const snap = structuredClone(state);
    for (const cb of subs) cb(snap);
  };
  let seq = 0;

  const handle = (m: PanelToExt) => {
    console.debug('[mock] →', m);
    switch (m.t) {
      case 'ready':
        break;
      case 'openPage':
        state.connection = 'opening';
        emit();
        setTimeout(() => {
          state.connection = 'connected';
          state.page = { url: m.url, title: 'mock' };
          emit();
        }, 500);
        return;
      case 'pick':
        state.pickOn = m.on;
        if (m.on)
          setTimeout(() => {
            state.pickOn = false;
            select('e2');
            emit();
          }, 900);
        break;
      case 'select':
        select(m.uid);
        break;
      case 'setSnap':
        state.snap = m.on;
        break;
      case 'edit': {
        const sel = state.selection!;
        const e = sel.el;
        for (const p of m.edit.props) sel.pending[p] = m.edit.value;
        if (m.edit.phase === 'commit') {
          const key = `${e.uid}|${m.edit.props.join(',')}`;
          const from = e.computed[m.edit.props[0]];
          const existing = state.changes.find((c) => c.status === 'pending' && c.id.startsWith(key));
          const to = m.edit.token ?? m.edit.value;
          if (existing) existing.to = to;
          else
            state.changes.unshift({
              id: `${key}#${++seq}`,
              kind: 'style',
              status: 'pending',
              element: e.label,
              props: m.edit.props,
              propLabel: groupLabel(m.edit.props),
              from,
              to,
              target: sel.targets[m.edit.props[0]],
              pageUrl: state.page!.url,
              createdAt: Date.now(),
            } satisfies ChangeView);
        }
        break;
      }
      case 'apply': {
        state.busy = true;
        emit();
        setTimeout(() => {
          for (const c of state.changes) {
            if (c.status !== 'pending' || c.target.kind === 'agent') continue;
            if (m.ids && !m.ids.includes(c.id)) continue;
            c.status = 'applied';
            c.note = `${c.propLabel}: ${c.from} → ${c.to}`;
          }
          state.busy = false;
          emit();
        }, 350);
        return;
      }
      case 'revert': {
        const c = state.changes.find((x) => x.id === m.id);
        if (c) c.status = 'reverted';
        break;
      }
      case 'discard': {
        const c = state.changes.find((x) => x.id === m.id);
        state.changes = state.changes.filter((x) => x.id !== m.id);
        if (c && state.selection) for (const p of c.props) delete state.selection.pending[p];
        break;
      }
      case 'clearDone':
        state.changes = state.changes.filter((c) => c.status === 'pending' || c.status === 'failed' || c.status === 'conflict');
        break;
      case 'handoff': {
        let n = 0;
        for (const c of state.changes) {
          if ((m.ids && !m.ids.includes(c.id)) || (c.status !== 'pending' && c.status !== 'failed')) continue;
          c.status = 'handoff';
          n++;
        }
        state.notice = { level: 'info', text: t('ext.handoff.prefilled', { n }) };
        break;
      }
      case 'dismissNotice':
        state.notice = null;
        break;
      default:
        break;
    }
    emit();
  };

  // ?state=real-state.json：加载扩展自测导出的真实状态，用真实页面数据检查面板排版
  const src = new URLSearchParams(location.search).get('state');
  if (src) {
    void fetch(src)
      .then((r) => r.json() as Promise<PanelState>)
      .then((s) => {
        Object.assign(state, s, { locale: getLocale() });
        emit();
      });
  }

  const store: Record<string, unknown> = JSON.parse(localStorage.getItem('css-tuner-mock-ui') ?? '{}');
  return {
    send: (m) => setTimeout(() => handle(m), 0),
    subscribe(cb) {
      subs.add(cb);
      cb(structuredClone(state));
      return () => subs.delete(cb);
    },
    load: <T,>(k: string, fallback: T) => (k in store ? (store[k] as T) : fallback),
    save(k, v) {
      store[k] = v;
      localStorage.setItem('css-tuner-mock-ui', JSON.stringify(store));
    },
  };
}
