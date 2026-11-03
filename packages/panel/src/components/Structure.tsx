import { useState } from 'react';
import { t, type Crumb, type PanelToExt, type SelectionView } from '@css-tuner/protocol';
import { IconToggle, Section } from './controls';

type Send = (m: PanelToExt) => void;

const MAX_UP = 4;
const MAX_KIDS = 12;

interface Row {
  c: Crumb;
  depth: number;
  /** 组件边界：渲染它的组件和上一层不同 */
  comp: string | null;
  on: boolean;
}

/** 祖先链 + 选中元素 + 子元素；组件边界处标出组件名，点选切换、悬停在页面上描边 */
export function Structure(props: { sel: SelectionView; send: Send; open: boolean; onToggle: (id: string) => void; onlyComponents: boolean; setOnlyComponents: (on: boolean) => void }) {
  const { sel, send, onlyComponents } = props;
  const [allUp, setAllUp] = useState(false);
  const [allKids, setAllKids] = useState(false);
  const chain = sel.el.breadcrumb;
  const self = chain[chain.length - 1];

  let rows: Row[] = chain.map((c, i) => ({ c, depth: i, comp: boundary(c, chain[i - 1]), on: i === chain.length - 1 }));
  if (onlyComponents) rows = rows.filter((r) => r.on || r.comp);
  const hiddenUp = allUp ? 0 : Math.max(0, rows.length - 1 - MAX_UP);
  rows = rows.slice(hiddenUp);
  const base = rows[0]?.depth ?? 0;

  let kids = sel.el.children.map((c) => ({ c, comp: boundary(c, self) }));
  if (onlyComponents) kids = kids.filter((k) => k.comp);
  const hiddenKids = allKids ? 0 : Math.max(0, kids.length - MAX_KIDS);
  const shownKids = hiddenKids ? kids.slice(0, MAX_KIDS) : kids;
  const selfDepth = (rows[rows.length - 1]?.depth ?? 0) - base;

  const row = (c: Crumb, depth: number, comp: string | null, on: boolean) => (
    <li key={c.uid}>
      <button
        className={`tree-row${on ? ' on' : ''}`}
        style={{ paddingLeft: 6 + depth * 11 }}
        title={comp ? t('tree.component', { label: c.label, name: comp }) : c.label}
        onClick={() => !on && send({ t: 'select', uid: c.uid })}
        onPointerEnter={() => send({ t: 'hover', uid: c.uid })}
        onPointerLeave={() => send({ t: 'hover', uid: null })}
      >
        <span className="tree-twisty">{on ? '▾' : c.kids ? '▸' : ''}</span>
        <span className="tree-label">{c.label}</span>
        {comp && <span className="tree-comp">&lt;{comp}&gt;</span>}
        {!on && !!c.kids && <small className="tree-kids">{c.kids}</small>}
      </button>
    </li>
  );

  return (
    <Section
      id="tree"
      title={t('tree.title')}
      open={props.open}
      onToggle={props.onToggle}
      aside={
        <IconToggle on={onlyComponents} title={onlyComponents ? t('tree.onlyComponents.on') : t('tree.onlyComponents.off')} onClick={() => props.setOnlyComponents(!onlyComponents)}>
          <b className="glyph">&lt;/&gt;</b>
        </IconToggle>
      }
    >
      <ul className="tree" onPointerLeave={() => send({ t: 'hover', uid: null })}>
        {hiddenUp > 0 && (
          <li>
            <button className="tree-more" onClick={() => setAllUp(true)}>
              {t('tree.moreUp', { n: hiddenUp })}
            </button>
          </li>
        )}
        {rows.map((r) => row(r.c, r.depth - base, r.comp, r.on))}
        {shownKids.map((k) => row(k.c, selfDepth + 1, k.comp, false))}
        {hiddenKids > 0 && (
          <li>
            <button className="tree-more" style={{ paddingLeft: 6 + (selfDepth + 1) * 11 }} onClick={() => setAllKids(true)}>
              {t('tree.moreKids', { n: hiddenKids })}
            </button>
          </li>
        )}
        {!shownKids.length && !sel.el.children.length && <li className="tree-empty muted">{t('tree.noKids')}</li>}
      </ul>
    </Section>
  );
}

function boundary(c: Crumb, parent: Crumb | undefined): string | null {
  if (!c.component) return null;
  return !parent || parent.component !== c.component ? c.component : null;
}
