import { useMemo } from 'react';
import { MARGIN, PADDING, RADIUS, t, type PanelState, type PanelToExt, type PropValue, type ScaleStep, type SelectionView } from '@css-tuner/protocol';
import { currentValue, declaredVar, isPending } from '../lib/format';
import { ctxOf, scaleKeyOf, type Ctx } from '../lib/scale';
import { ColorField } from './ColorField';
import { Content } from './Content';
import { IconToggle, Row, Section, Segmented, SelectField, SliderField } from './controls';
import { Icon } from './icons';
import { NumberField } from './NumberField';
import { Props as PropsSection } from './Props';
import type { Edit } from './types';
import { Vars } from './Vars';

export interface UiPrefs {
  closed: string[];
  split: string[];
}

interface Props {
  state: PanelState;
  sel: SelectionView;
  prefs: UiPrefs;
  setPrefs: (p: UiPrefs) => void;
  edit: (props: string[], e: Edit) => void;
  editText: (segment: number, value: string, phase: 'live' | 'commit') => void;
  editProp: (name: string, value: PropValue, phase: 'live' | 'commit') => void;
  send: (m: PanelToExt) => void;
}

const [PT, PR, PB, PL] = PADDING;
const [MT, MR, MB, ML] = MARGIN;

export function Inspector({ state, sel, prefs, setPrefs, edit, editText, editProp, send }: Props) {
  const ctx = useMemo<Ctx>(() => ctxOf(sel.el), [sel.el]);
  const scales = state.scales;
  const steps = (prop: string): ScaleStep[] | null => {
    const k = scaleKeyOf(prop);
    return k && scales ? (scales[k] as ScaleStep[]) : null;
  };
  const open = (id: string) => !prefs.closed.includes(id);
  const toggle = (id: string) => setPrefs({ ...prefs, closed: open(id) ? [...prefs.closed, id] : prefs.closed.filter((x) => x !== id) });
  const split = (id: string) => prefs.split.includes(id);
  const toggleSplit = (id: string) => setPrefs({ ...prefs, split: split(id) ? prefs.split.filter((x) => x !== id) : [...prefs.split, id] });

  const num = (props: string[], label: React.ReactNode, title: string, extra: Partial<React.ComponentProps<typeof NumberField>> = {}) => (
    <NumberField
      key={props.join(',')}
      label={label}
      title={title}
      prop={props[0]}
      values={props.map((p) => currentValue(sel, p))}
      steps={steps(props[0])}
      ctx={ctx}
      snap={state.snap}
      pending={isPending(sel, props)}
      target={sel.targets[props[0]]}
      declared={props.length === 1 && !(props[0] in sel.pending) ? declaredVar(sel.el, props[0]) : null}
      onEdit={(e) => edit(props, e)}
      {...extra}
    />
  );

  const kw = (prop: string) => ({
    value: currentValue(sel, prop),
    pending: isPending(sel, [prop]),
    target: sel.targets[prop],
    onPick: (v: string) => edit([prop], { props: [], value: v, token: null, phase: 'commit' }),
  });

  const display = currentValue(sel, 'display');
  const isFlex = /flex/.test(display);
  const isGrid = /grid/.test(display);
  const vertical = isFlex && /column/.test(currentValue(sel, 'flex-direction'));
  const wraps = currentValue(sel, 'flex-wrap').startsWith('wrap');
  const position = currentValue(sel, 'position');

  return (
    <div className="inspector">
      <Content sel={sel} open={open('content')} onToggle={toggle} editText={editText} />
      <PropsSection sel={sel} ctx={ctx} open={open('props')} onToggle={toggle} editProp={editProp} send={send} />

      <Section id="layout" title={t('insp.layout')} open={open('layout')} onToggle={toggle}>
        <Row label={t('insp.display')}>
          <Segmented
            {...kw('display')}
            value={isFlex ? 'flex' : isGrid ? 'grid' : display}
            options={[
              { value: 'block', label: t('insp.display.block'), title: t('insp.display.block.title') },
              { value: 'flex', label: 'Flex', title: t('insp.display.flex.title') },
              { value: 'grid', label: 'Grid', title: t('insp.display.grid.title') },
              { value: 'inline-block', label: t('insp.display.inline'), title: t('insp.display.inline.title') },
              { value: 'none', label: t('insp.display.none'), title: t('insp.display.none.title') },
            ]}
          />
        </Row>
        {isFlex && (
          <Row label={t('insp.direction')}>
            <Segmented
              {...kw('flex-direction')}
              options={[
                { value: 'row', label: <b className="glyph">→</b>, title: t('insp.dir.row') },
                { value: 'column', label: <b className="glyph">↓</b>, title: t('insp.dir.column') },
                { value: 'row-reverse', label: <b className="glyph">←</b>, title: t('insp.dir.rowReverse') },
                { value: 'column-reverse', label: <b className="glyph">↑</b>, title: t('insp.dir.columnReverse') },
              ]}
            />
            <IconToggle on={wraps} title={wraps ? t('insp.wrap.on') : t('insp.wrap.off')} onClick={() => edit(['flex-wrap'], { props: [], value: wraps ? 'nowrap' : 'wrap', token: null, phase: 'commit' })}>
              <Icon.wrap />
            </IconToggle>
          </Row>
        )}
        {isGrid && (
          <Row label={t('insp.columns')}>
            <NumberField
              label={<b className="glyph">#</b>}
              title={t('insp.columns.title')}
              prop="grid-template-columns"
              values={[trackCount(currentValue(sel, 'grid-template-columns'))]}
              steps={null}
              ctx={ctx}
              snap={state.snap}
              pending={isPending(sel, ['grid-template-columns'])}
              target={sel.targets['grid-template-columns']}
              unit=""
              min={1}
              max={24}
              onEdit={(e) => edit(['grid-template-columns'], { ...e, value: /^\d+$/.test(e.value) ? `repeat(${e.value}, minmax(0, 1fr))` : e.value })}
            />
          </Row>
        )}
        {(isFlex || isGrid) && (
          <>
            <Row label={t('insp.justify')}>
              <Segmented
                {...kw('justify-content')}
                value={justifyOf(currentValue(sel, 'justify-content'))}
                className={vertical ? 'rot' : undefined}
                options={[
                  { value: 'flex-start', label: <Icon.jStart />, title: t('insp.at.start') },
                  { value: 'center', label: <Icon.jCenter />, title: t('insp.at.center') },
                  { value: 'flex-end', label: <Icon.jEnd />, title: t('insp.at.end') },
                  { value: 'space-between', label: <Icon.jBetween />, title: t('insp.at.between') },
                  { value: 'space-around', label: <Icon.jAround />, title: t('insp.at.around') },
                  { value: 'space-evenly', label: <Icon.jEvenly />, title: t('insp.at.evenly') },
                ]}
              />
            </Row>
            <Row label={t('insp.align')}>
              <Segmented
                {...kw('align-items')}
                value={alignItemsOf(currentValue(sel, 'align-items'))}
                className={vertical ? 'rot-ccw' : undefined}
                options={[
                  { value: 'flex-start', label: <Icon.aStart />, title: t('insp.at.start') },
                  { value: 'center', label: <Icon.aCenter />, title: t('insp.at.center') },
                  { value: 'flex-end', label: <Icon.aEnd />, title: t('insp.at.end') },
                  { value: 'stretch', label: <Icon.aStretch />, title: t('insp.at.stretch') },
                  { value: 'baseline', label: <Icon.aBaseline />, title: t('insp.at.baseline') },
                ]}
              />
            </Row>
            <Row label={t('insp.gap')}>
              {split('gap') ? (
                <>
                  {num(['row-gap'], <b className="glyph">{t('insp.gap.rowGlyph')}</b>, t('insp.gap.row'))}
                  {num(['column-gap'], <b className="glyph">{t('insp.gap.columnGlyph')}</b>, t('insp.gap.column'))}
                </>
              ) : (
                num(['row-gap', 'column-gap'], <Icon.padX />, t('insp.gap.both'))
              )}
              <IconToggle on={split('gap')} title={t('insp.gap.split')} onClick={() => toggleSplit('gap')}>
                <Icon.sides />
              </IconToggle>
            </Row>
          </>
        )}
      </Section>

      <Section id="spacing" title={t('insp.spacing')} open={open('spacing')} onToggle={toggle}>
        <BoxRow
          label={t('insp.padding')}
          id="padding"
          split={split('padding')}
          onSplit={toggleSplit}
          pair={[num([PL, PR], <Icon.padX />, t('insp.padding.x')), num([PT, PB], <Icon.padY />, t('insp.padding.y'))]}
          sides={[
            num([PT], <Icon.top />, t('insp.padding.top')),
            num([PR], <Icon.right />, t('insp.padding.right')),
            num([PB], <Icon.bottom />, t('insp.padding.bottom')),
            num([PL], <Icon.left />, t('insp.padding.left')),
          ]}
        />
        <BoxRow
          label={t('insp.margin')}
          id="margin"
          split={split('margin')}
          onSplit={toggleSplit}
          pair={[num([ML, MR], <Icon.padX />, t('insp.margin.x')), num([MT, MB], <Icon.padY />, t('insp.margin.y'))]}
          sides={[
            num([MT], <Icon.top />, t('insp.margin.top')),
            num([MR], <Icon.right />, t('insp.margin.right')),
            num([MB], <Icon.bottom />, t('insp.margin.bottom')),
            num([ML], <Icon.left />, t('insp.margin.left')),
          ]}
        />
      </Section>

      <Section id="size" title={t('insp.size')} open={open('size')} onToggle={toggle} aside={<MoreToggle on={split('size-more')} onClick={() => toggleSplit('size-more')} />}>
        <Row label={t('insp.size.wh')}>
          {num(['width'], <Icon.w />, t('insp.width'))}
          {num(['height'], <Icon.h />, t('insp.height'))}
        </Row>
        {split('size-more') && (
          <>
            <Row label={t('insp.size.min')}>
              {num(['min-width'], <Icon.w />, t('insp.minWidth'))}
              {num(['min-height'], <Icon.h />, t('insp.minHeight'))}
            </Row>
            <Row label={t('insp.size.max')}>
              {num(['max-width'], <Icon.w />, t('insp.maxWidth'))}
              {num(['max-height'], <Icon.h />, t('insp.maxHeight'))}
            </Row>
          </>
        )}
      </Section>

      <Section id="position" title={t('insp.position')} open={open('position')} onToggle={toggle}>
        <Row label={t('insp.pos.mode')}>
          <Segmented
            {...kw('position')}
            options={[
              { value: 'static', label: t('insp.pos.static'), title: t('insp.pos.static.title') },
              { value: 'relative', label: t('insp.pos.relative'), title: t('insp.pos.relative.title') },
              { value: 'absolute', label: t('insp.pos.absolute'), title: t('insp.pos.absolute.title') },
              { value: 'fixed', label: t('insp.pos.fixed'), title: t('insp.pos.fixed.title') },
              { value: 'sticky', label: t('insp.pos.sticky'), title: t('insp.pos.sticky.title') },
            ]}
          />
        </Row>
        {position !== 'static' && (
          <Row label={t('insp.offset')}>
            <div className="quad">
              {num(['top'], <Icon.top />, t('insp.offset.top'))}
              {num(['right'], <Icon.right />, t('insp.offset.right'))}
              {num(['bottom'], <Icon.bottom />, t('insp.offset.bottom'))}
              {num(['left'], <Icon.left />, t('insp.offset.left'))}
            </div>
          </Row>
        )}
        <Row label={t('insp.zIndex')}>{num(['z-index'], <Icon.layers />, t('insp.zIndex.title'), { unit: '' })}</Row>
      </Section>

      <Section id="typography" title={t('insp.typography')} open={open('typography')} onToggle={toggle}>
        <Row label={t('insp.sizeWeight')}>
          {num(['font-size'], <b className="glyph">T</b>, t('insp.fontSize'), { min: 0 })}
          <SelectField
            title={t('insp.fontWeight')}
            value={currentValue(sel, 'font-weight')}
            display={weightLabel(currentValue(sel, 'font-weight'), scales?.fontWeight)}
            steps={scales?.fontWeight ?? []}
            pending={isPending(sel, ['font-weight'])}
            target={sel.targets['font-weight']}
            describe={(s) => s.value}
            onEdit={(e) => edit(['font-weight'], e)}
          />
        </Row>
        <Row label={t('insp.lineLetter')}>
          {num(['line-height'], <b className="glyph">↕</b>, t('insp.lineHeight'), { min: 0 })}
          {num(['letter-spacing'], <b className="glyph">↔</b>, t('insp.letterSpacing'), { stepSize: 0.1 })}
        </Row>
        <Row label={t('insp.align')}>
          <Segmented
            value={alignOf(currentValue(sel, 'text-align'))}
            pending={isPending(sel, ['text-align'])}
            options={[
              { value: 'left', label: <Icon.alignLeft />, title: t('insp.ta.left') },
              { value: 'center', label: <Icon.alignCenter />, title: t('insp.ta.center') },
              { value: 'right', label: <Icon.alignRight />, title: t('insp.ta.right') },
              { value: 'justify', label: <Icon.alignJustify />, title: t('insp.ta.justify') },
            ]}
            onPick={(v) => edit(['text-align'], { props: [], value: v, token: null, phase: 'commit' })}
          />
        </Row>
        <Row label={t('insp.color')}>
          <ColorField
            title={t('insp.textColor')}
            prop="color"
            value={currentValue(sel, 'color')}
            steps={scales?.colors ?? null}
            pending={isPending(sel, ['color'])}
            target={sel.targets['color']}
            declared={'color' in sel.pending ? null : declaredVar(sel.el, 'color')}
            onEdit={(e) => edit(['color'], e)}
          />
        </Row>
      </Section>

      <Section id="fill" title={t('insp.fill')} open={open('fill')} onToggle={toggle}>
        <Row label={t('insp.background')}>
          <ColorField
            title={t('insp.bgColor')}
            prop="background-color"
            value={currentValue(sel, 'background-color')}
            steps={scales?.colors ?? null}
            pending={isPending(sel, ['background-color'])}
            target={sel.targets['background-color']}
            declared={'background-color' in sel.pending ? null : declaredVar(sel.el, 'background-color')}
            onEdit={(e) => edit(['background-color'], e)}
          />
        </Row>
      </Section>

      <Section id="radius" title={t('insp.radius')} open={open('radius')} onToggle={toggle}>
        <Row label={t('insp.radius')}>
          {split('radius') ? (
            <div className="quad">
              {RADIUS.map((p, i) =>
                num([p], <b className="glyph">{['↖', '↗', '↘', '↙'][i]}</b>, t((['insp.radius.tl', 'insp.radius.tr', 'insp.radius.br', 'insp.radius.bl'] as const)[i]), { min: 0 }),
              )}
            </div>
          ) : (
            num(RADIUS, <Icon.radius />, t('insp.radius'), { min: 0 })
          )}
          <IconToggle on={split('radius')} title={t('insp.radius.split')} onClick={() => toggleSplit('radius')}>
            <Icon.corners />
          </IconToggle>
        </Row>
      </Section>

      <Section id="effects" title={t('insp.effects')} open={open('effects')} onToggle={toggle}>
        <Row label={t('insp.opacity')}>
          <SliderField
            title={t('insp.opacity')}
            value={Math.round(parseFloat(currentValue(sel, 'opacity') || '1') * 100)}
            min={0}
            max={100}
            step={1}
            pending={isPending(sel, ['opacity'])}
            format={(n) => `${n}%`}
            onEdit={(n, phase) => edit(['opacity'], { props: [], value: String(n / 100), token: opacityToken(n, scales?.opacity), phase })}
          />
        </Row>
        <Row label={t('insp.shadow')}>
          <SelectField
            title={t('insp.shadow')}
            value={currentValue(sel, 'box-shadow')}
            display={shadowLabel(sel, scales?.shadow)}
            steps={scales?.shadow ?? []}
            pending={isPending(sel, ['box-shadow'])}
            target={sel.targets['box-shadow']}
            describe={() => ''}
            onEdit={(e) => edit(['box-shadow'], e)}
          />
        </Row>
      </Section>

      <Vars sel={sel} ctx={ctx} snap={state.snap} colors={scales?.colors ?? null} open={open('vars')} onToggle={toggle} edit={edit} />
    </div>
  );
}

function BoxRow(props: { label: string; id: string; split: boolean; onSplit: (id: string) => void; pair: React.ReactNode[]; sides: React.ReactNode[] }) {
  return (
    <Row label={props.label}>
      {props.split ? <div className="quad">{props.sides}</div> : props.pair}
      <IconToggle on={props.split} title={t('insp.sides.split')} onClick={() => props.onSplit(props.id)}>
        <Icon.sides />
      </IconToggle>
    </Row>
  );
}

function MoreToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className="link-btn" onClick={onClick}>
      {on ? t('insp.size.less') : t('insp.size.more')}
    </button>
  );
}

function alignOf(v: string): string {
  if (v === 'start' || v === '-webkit-left') return 'left';
  if (v === 'end' || v === '-webkit-right') return 'right';
  if (v === '-webkit-center') return 'center';
  return v;
}

function justifyOf(v: string): string {
  if (v === 'start' || v === 'left' || v === 'normal') return 'flex-start';
  if (v === 'end' || v === 'right') return 'flex-end';
  return v;
}

function alignItemsOf(v: string): string {
  if (v === 'start' || v === 'self-start') return 'flex-start';
  if (v === 'end' || v === 'self-end') return 'flex-end';
  if (v === 'normal') return 'stretch';
  return v;
}

/** 网格列数：`repeat(3, …)` 或计算值里的轨道个数（去掉 [线名]） */
function trackCount(v: string): string {
  const m = /^repeat\(\s*(\d+)/.exec(v.trim());
  if (m) return m[1];
  if (!v || v === 'none') return v;
  const tracks = v.replace(/\[[^\]]*\]/g, ' ').trim();
  if (!tracks || /repeat\(|minmax\(|subgrid|masonry/.test(tracks)) return v;
  return String(tracks.split(/\s+/).length);
}

function weightLabel(value: string, steps: ScaleStep[] | undefined): string {
  return steps?.find((x) => x.value === value)?.label ?? value;
}

function opacityToken(n: number, steps: ScaleStep[] | undefined): string | null {
  const s = steps?.find((x) => Math.abs(parseFloat(x.value) * 100 - n) < 0.5);
  return s?.token ?? null;
}

function shadowLabel(sel: SelectionView, steps: ScaleStep[] | undefined): string {
  const pending = sel.pending['box-shadow'];
  if (pending) return steps?.find((s) => s.value === pending)?.label ?? t('insp.custom');
  const w = sel.el.winners['box-shadow'];
  if (w?.rule?.utility) return w.rule.utility.replace(/^.*:/, '');
  const v = declaredVar(sel.el, 'box-shadow');
  if (v) return v;
  const computed = sel.el.computed['box-shadow'];
  if (!computed || computed === 'none') return t('insp.none');
  return steps?.find((s) => s.value === computed)?.label ?? t('insp.custom');
}
