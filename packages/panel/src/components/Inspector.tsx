import { useMemo } from 'react';
import { MARGIN, PADDING, RADIUS, type PanelState, type ScaleStep, type SelectionView } from '@css-tuner/protocol';
import { currentValue, declaredVar, isPending } from '../lib/format';
import { ctxOf, scaleKeyOf, type Ctx } from '../lib/scale';
import { ColorField } from './ColorField';
import { IconToggle, Row, Section, Segmented, SelectField, SliderField } from './controls';
import { Icon } from './icons';
import { NumberField } from './NumberField';
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
}

const [PT, PR, PB, PL] = PADDING;
const [MT, MR, MB, ML] = MARGIN;

export function Inspector({ state, sel, prefs, setPrefs, edit }: Props) {
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
      <Section id="layout" title="布局" open={open('layout')} onToggle={toggle}>
        <Row label="排列">
          <Segmented
            {...kw('display')}
            value={isFlex ? 'flex' : isGrid ? 'grid' : display}
            options={[
              { value: 'block', label: '块', title: 'block：独占一行' },
              { value: 'flex', label: 'Flex', title: 'flex：子元素按一条轴排列' },
              { value: 'grid', label: 'Grid', title: 'grid：子元素排成网格' },
              { value: 'inline-block', label: '行内', title: 'inline-block：和文字排在一行' },
              { value: 'none', label: '隐藏', title: 'none：不显示' },
            ]}
          />
        </Row>
        {isFlex && (
          <Row label="方向">
            <Segmented
              {...kw('flex-direction')}
              options={[
                { value: 'row', label: <b className="glyph">→</b>, title: '横向（row）' },
                { value: 'column', label: <b className="glyph">↓</b>, title: '纵向（column）' },
                { value: 'row-reverse', label: <b className="glyph">←</b>, title: '横向反转（row-reverse）' },
                { value: 'column-reverse', label: <b className="glyph">↑</b>, title: '纵向反转（column-reverse）' },
              ]}
            />
            <IconToggle on={wraps} title={wraps ? '换行：开（flex-wrap: wrap）' : '换行：关（nowrap）'} onClick={() => edit(['flex-wrap'], { props: [], value: wraps ? 'nowrap' : 'wrap', token: null, phase: 'commit' })}>
              <Icon.wrap />
            </IconToggle>
          </Row>
        )}
        {isGrid && (
          <Row label="列数">
            <NumberField
              label={<b className="glyph">#</b>}
              title="网格列数（等宽）"
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
            <Row label="分布">
              <Segmented
                {...kw('justify-content')}
                value={justifyOf(currentValue(sel, 'justify-content'))}
                className={vertical ? 'rot' : undefined}
                options={[
                  { value: 'flex-start', label: <Icon.jStart />, title: '靠起点（start）' },
                  { value: 'center', label: <Icon.jCenter />, title: '居中（center）' },
                  { value: 'flex-end', label: <Icon.jEnd />, title: '靠终点（end）' },
                  { value: 'space-between', label: <Icon.jBetween />, title: '两端对齐（space-between）' },
                  { value: 'space-around', label: <Icon.jAround />, title: '环绕（space-around）' },
                  { value: 'space-evenly', label: <Icon.jEvenly />, title: '均分（space-evenly）' },
                ]}
              />
            </Row>
            <Row label="对齐">
              <Segmented
                {...kw('align-items')}
                value={alignItemsOf(currentValue(sel, 'align-items'))}
                className={vertical ? 'rot-ccw' : undefined}
                options={[
                  { value: 'flex-start', label: <Icon.aStart />, title: '靠起点（start）' },
                  { value: 'center', label: <Icon.aCenter />, title: '居中（center）' },
                  { value: 'flex-end', label: <Icon.aEnd />, title: '靠终点（end）' },
                  { value: 'stretch', label: <Icon.aStretch />, title: '拉伸（stretch）' },
                  { value: 'baseline', label: <Icon.aBaseline />, title: '文字基线（baseline）' },
                ]}
              />
            </Row>
            <Row label="间隙">
              {split('gap') ? (
                <>
                  {num(['row-gap'], <b className="glyph">行</b>, '行间隙')}
                  {num(['column-gap'], <b className="glyph">列</b>, '列间隙')}
                </>
              ) : (
                num(['row-gap', 'column-gap'], <Icon.padX />, '子元素间隙')
              )}
              <IconToggle on={split('gap')} title="分别调整行、列间隙" onClick={() => toggleSplit('gap')}>
                <Icon.sides />
              </IconToggle>
            </Row>
          </>
        )}
      </Section>

      <Section id="spacing" title="间距" open={open('spacing')} onToggle={toggle}>
        <BoxRow
          label="内边距"
          id="padding"
          split={split('padding')}
          onSplit={toggleSplit}
          pair={[num([PL, PR], <Icon.padX />, '左右内边距'), num([PT, PB], <Icon.padY />, '上下内边距')]}
          sides={[num([PT], <Icon.top />, '上内边距'), num([PR], <Icon.right />, '右内边距'), num([PB], <Icon.bottom />, '下内边距'), num([PL], <Icon.left />, '左内边距')]}
        />
        <BoxRow
          label="外边距"
          id="margin"
          split={split('margin')}
          onSplit={toggleSplit}
          pair={[num([ML, MR], <Icon.padX />, '左右外边距'), num([MT, MB], <Icon.padY />, '上下外边距')]}
          sides={[num([MT], <Icon.top />, '上外边距'), num([MR], <Icon.right />, '右外边距'), num([MB], <Icon.bottom />, '下外边距'), num([ML], <Icon.left />, '左外边距')]}
        />
      </Section>

      <Section id="size" title="尺寸" open={open('size')} onToggle={toggle} aside={<MoreToggle on={split('size-more')} onClick={() => toggleSplit('size-more')} />}>
        <Row label="宽 / 高">
          {num(['width'], <Icon.w />, '宽度')}
          {num(['height'], <Icon.h />, '高度')}
        </Row>
        {split('size-more') && (
          <>
            <Row label="最小">
              {num(['min-width'], <Icon.w />, '最小宽度')}
              {num(['min-height'], <Icon.h />, '最小高度')}
            </Row>
            <Row label="最大">
              {num(['max-width'], <Icon.w />, '最大宽度')}
              {num(['max-height'], <Icon.h />, '最大高度')}
            </Row>
          </>
        )}
      </Section>

      <Section id="position" title="定位" open={open('position')} onToggle={toggle}>
        <Row label="方式">
          <Segmented
            {...kw('position')}
            options={[
              { value: 'static', label: '默认', title: 'static：跟随文档流' },
              { value: 'relative', label: '相对', title: 'relative：相对自身原位置偏移' },
              { value: 'absolute', label: '绝对', title: 'absolute：相对最近的定位祖先' },
              { value: 'fixed', label: '固定', title: 'fixed：相对视口' },
              { value: 'sticky', label: '粘性', title: 'sticky：滚动到边缘时吸住' },
            ]}
          />
        </Row>
        {position !== 'static' && (
          <Row label="偏移">
            <div className="quad">
              {num(['top'], <Icon.top />, '上偏移（top）')}
              {num(['right'], <Icon.right />, '右偏移（right）')}
              {num(['bottom'], <Icon.bottom />, '下偏移（bottom）')}
              {num(['left'], <Icon.left />, '左偏移（left）')}
            </div>
          </Row>
        )}
        <Row label="层级">{num(['z-index'], <Icon.layers />, '层级（z-index）', { unit: '' })}</Row>
      </Section>

      <Section id="typography" title="文字" open={open('typography')} onToggle={toggle}>
        <Row label="字号 / 字重">
          {num(['font-size'], <b className="glyph">T</b>, '字号', { min: 0 })}
          <SelectField
            title="字重"
            value={currentValue(sel, 'font-weight')}
            display={weightLabel(currentValue(sel, 'font-weight'), scales?.fontWeight)}
            steps={scales?.fontWeight ?? []}
            pending={isPending(sel, ['font-weight'])}
            target={sel.targets['font-weight']}
            describe={(s) => s.value}
            onEdit={(e) => edit(['font-weight'], e)}
          />
        </Row>
        <Row label="行高 / 字距">
          {num(['line-height'], <b className="glyph">↕</b>, '行高', { min: 0 })}
          {num(['letter-spacing'], <b className="glyph">↔</b>, '字距', { stepSize: 0.1 })}
        </Row>
        <Row label="对齐">
          <Segmented
            value={alignOf(currentValue(sel, 'text-align'))}
            pending={isPending(sel, ['text-align'])}
            options={[
              { value: 'left', label: <Icon.alignLeft />, title: '左对齐' },
              { value: 'center', label: <Icon.alignCenter />, title: '居中' },
              { value: 'right', label: <Icon.alignRight />, title: '右对齐' },
              { value: 'justify', label: <Icon.alignJustify />, title: '两端对齐' },
            ]}
            onPick={(v) => edit(['text-align'], { props: [], value: v, token: null, phase: 'commit' })}
          />
        </Row>
        <Row label="颜色">
          <ColorField
            title="文字颜色"
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

      <Section id="fill" title="填充" open={open('fill')} onToggle={toggle}>
        <Row label="背景">
          <ColorField
            title="背景色"
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

      <Section id="radius" title="圆角" open={open('radius')} onToggle={toggle}>
        <Row label="圆角">
          {split('radius') ? (
            <div className="quad">
              {RADIUS.map((p, i) => num([p], <b className="glyph">{['↖', '↗', '↘', '↙'][i]}</b>, ['左上圆角', '右上圆角', '右下圆角', '左下圆角'][i], { min: 0 }))}
            </div>
          ) : (
            num(RADIUS, <Icon.radius />, '圆角', { min: 0 })
          )}
          <IconToggle on={split('radius')} title="分别调整四个角" onClick={() => toggleSplit('radius')}>
            <Icon.corners />
          </IconToggle>
        </Row>
      </Section>

      <Section id="effects" title="效果" open={open('effects')} onToggle={toggle}>
        <Row label="不透明度">
          <SliderField
            title="不透明度"
            value={Math.round(parseFloat(currentValue(sel, 'opacity') || '1') * 100)}
            min={0}
            max={100}
            step={1}
            pending={isPending(sel, ['opacity'])}
            format={(n) => `${n}%`}
            onEdit={(n, phase) => edit(['opacity'], { props: [], value: String(n / 100), token: opacityToken(n, scales?.opacity), phase })}
          />
        </Row>
        <Row label="阴影">
          <SelectField
            title="阴影"
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
      <IconToggle on={props.split} title="分别调整四边" onClick={() => props.onSplit(props.id)}>
        <Icon.sides />
      </IconToggle>
    </Row>
  );
}

function MoreToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className="link-btn" onClick={onClick}>
      {on ? '收起' : '最小 / 最大'}
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
  if (pending) return steps?.find((s) => s.value === pending)?.label ?? '自定义';
  const w = sel.el.winners['box-shadow'];
  if (w?.rule?.utility) return w.rule.utility.replace(/^.*:/, '');
  const v = declaredVar(sel.el, 'box-shadow');
  if (v) return v;
  const computed = sel.el.computed['box-shadow'];
  if (!computed || computed === 'none') return '无';
  return steps?.find((s) => s.value === computed)?.label ?? '自定义';
}
