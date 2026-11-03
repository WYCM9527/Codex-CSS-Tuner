import { formatNumber, parseCssNumber, t, type ScaleStep, type SelectionView, type UsedVar } from '@css-tuner/protocol';
import { currentValue, isPending } from '../lib/format';
import type { Ctx } from '../lib/scale';
import { ColorField } from './ColorField';
import { Section, TextField } from './controls';
import { NumberField } from './NumberField';
import type { Edit } from './types';

interface Props {
  sel: SelectionView;
  ctx: Ctx;
  snap: boolean;
  colors: ScaleStep[] | null;
  open: boolean;
  onToggle: (id: string) => void;
  edit: (props: string[], e: Edit) => void;
}

/** 元素用到的 CSS 变量：改的是定义处，页面上用到它的地方一起变 */
export function Vars({ sel, ctx, snap, colors, open, onToggle, edit }: Props) {
  const vars = sel.el.vars ?? [];
  if (!vars.length) return null;
  return (
    <Section id="vars" title={t('vars.title')} open={open} onToggle={onToggle} aside={<span className="sec-note">{t('vars.note')}</span>}>
      {vars.map((v) => (
        <div className="row var-row" key={v.name}>
          <span className="row-label" title={t('vars.usedIn', { name: v.name, props: v.props.join(t('common.listSep')) })}>
            {v.name}
          </span>
          <div className="row-fields">
            <VarField v={v} sel={sel} ctx={ctx} snap={snap} colors={colors} edit={(e) => edit([v.name], e)} />
          </div>
        </div>
      ))}
    </Section>
  );
}

function VarField({ v, sel, ctx, snap, colors, edit }: { v: UsedVar; sel: SelectionView; ctx: Ctx; snap: boolean; colors: ScaleStep[] | null; edit: (e: Edit) => void }) {
  const value = currentValue(sel, v.name);
  const pending = isPending(sel, [v.name]);
  const target = sel.targets[v.name];
  if (v.kind === 'color') return <ColorField title={v.name} prop={v.name} value={value} steps={colors} pending={pending} target={target} onEdit={edit} />;
  if (v.kind === 'length' || v.kind === 'number') {
    const unitless = v.kind === 'number';
    const rem = /rem$/.test(v.value.trim());
    const n = parseCssNumber(v.value);
    return (
      <NumberField
        label={<b className="glyph">{unitless ? '#' : '↔'}</b>}
        title={v.name}
        prop={v.name}
        values={[value]}
        steps={null}
        ctx={ctx}
        snap={snap}
        pending={pending}
        target={target}
        unit={unitless ? '' : 'px'}
        stepSize={unitless && n && !Number.isInteger(n.num) ? 0.05 : 1}
        onEdit={(e) => edit(rem ? { ...e, value: pxToRem(e.value, ctx.rootPx) } : e)}
      />
    );
  }
  return <TextField title={v.name} value={value} pending={pending} target={target} onCommit={(s) => edit({ props: [], value: s, token: null, phase: 'commit' })} />;
}

/** 变量原来用 rem 写的，拖出来的 px 换回 rem，保持源码里的单位 */
function pxToRem(value: string, rootPx: number): string {
  const m = /^(-?[\d.]+)px$/.exec(value.trim());
  return m ? `${formatNumber(parseFloat(m[1]) / rootPx, 4)}rem` : value;
}
