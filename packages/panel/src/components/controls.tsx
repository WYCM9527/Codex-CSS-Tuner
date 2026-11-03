import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t, type ScaleStep, type Target } from '@css-tuner/protocol';
import type { Edit } from './types';

export function Section(props: { id: string; title: string; open: boolean; onToggle: (id: string) => void; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={`sec${props.open ? '' : ' is-closed'}`}>
      <header className="sec-head">
        <button className="sec-toggle" onClick={() => props.onToggle(props.id)} aria-expanded={props.open}>
          <Chevron open={props.open} />
          <span>{props.title}</span>
        </button>
        {props.aside && <div className="sec-aside">{props.aside}</div>}
      </header>
      {props.open && <div className="sec-body">{props.children}</div>}
    </section>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`chev${open ? ' open' : ''}`} viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

export function Row(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="row" title={props.hint}>
      <span className="row-label">{props.label}</span>
      <div className="row-fields">{props.children}</div>
    </div>
  );
}

export interface SegOption {
  value: string;
  label: ReactNode;
  title: string;
}

export function Segmented(props: { value: string; options: SegOption[]; pending?: boolean; target?: Target; className?: string; onPick: (v: string) => void }) {
  const agent = props.target?.kind === 'agent';
  return (
    <div className={`seg${props.pending ? ' is-pending' : ''}${props.className ? ` ${props.className}` : ''}`} role="radiogroup" title={targetHint(props.target)}>
      {props.options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === props.value} className={o.value === props.value ? 'on' : ''} title={o.title} onClick={() => props.onPick(o.value)}>
          {o.label}
        </button>
      ))}
      {agent && <span className="nf-agent" title={props.target?.reason ?? t('field.agent')} />}
    </div>
  );
}

function targetHint(target: Target | undefined): string | undefined {
  if (!target) return undefined;
  const to = t('field.writeTo', { label: target.label });
  return target.affects > 1 ? `${to}\n${t('field.affects', { n: target.affects })}` : to;
}

/** 下拉选择：悬停选项即预览，点选提交，Esc 或点外面恢复打开前的值 */
export function SelectField(props: {
  title: string;
  value: string;
  display: string;
  steps: ScaleStep[];
  pending: boolean;
  target?: Target;
  describe?: (s: ScaleStep) => string;
  onEdit: (e: Edit) => void;
}) {
  const [open, setOpen] = useState(false);
  const base = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const close = (revert: boolean) => {
    if (revert && base.current !== null) props.onEdit({ props: [], value: base.current, token: null, phase: 'live' });
    base.current = null;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  });

  const agent = props.target?.kind === 'agent';
  return (
    <div className={`sel${props.pending ? ' is-pending' : ''}`} ref={box}>
      <button className="sel-btn" onClick={() => (open ? close(true) : setOpen(true))} title={props.title} aria-expanded={open}>
        <span className="sel-value">{props.display}</span>
        {agent && <span className="nf-agent" title={props.target?.reason ?? t('field.agent')} />}
        <Chevron open={open} />
      </button>
      {open && (
        <div className="sel-menu" role="listbox">
          {props.steps.map((s) => (
            <button
              key={s.label}
              role="option"
              aria-selected={s.value === props.value}
              className={s.value === props.value ? 'on' : ''}
              onPointerEnter={() => {
                if (base.current === null) base.current = props.value;
                props.onEdit({ props: [], value: s.value, token: null, phase: 'live' });
              }}
              onClick={() => {
                base.current = null;
                setOpen(false);
                props.onEdit({ props: [], value: s.value, token: s.token ?? null, phase: 'commit' });
              }}
            >
              <span>{s.label}</span>
              <small>{props.describe ? props.describe(s) : s.value}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SliderField(props: { title: string; value: number; min: number; max: number; step: number; pending: boolean; format: (n: number) => string; onEdit: (n: number, phase: 'live' | 'commit') => void }) {
  const [local, setLocal] = useState<number | null>(null);
  const raf = useRef(0);
  const shown = local ?? props.value;
  return (
    <div className={`slider${props.pending ? ' is-pending' : ''}`} title={props.title}>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={shown}
        style={{ ['--p' as string]: `${((shown - props.min) / (props.max - props.min)) * 100}%` }}
        onChange={(e) => {
          const n = +e.target.value;
          setLocal(n);
          cancelAnimationFrame(raf.current);
          raf.current = requestAnimationFrame(() => props.onEdit(n, 'live'));
        }}
        onPointerUp={() => {
          if (local !== null) props.onEdit(local, 'commit');
          setLocal(null);
        }}
        onKeyUp={() => {
          if (local !== null) props.onEdit(local, 'commit');
          setLocal(null);
        }}
        aria-label={props.title}
      />
      <span className="slider-value">{props.format(shown)}</span>
    </div>
  );
}

/** 没法拖的值（字体栈、阴影）：回车或失焦提交，Esc 放弃 */
export function TextField(props: { title: string; value: string; pending: boolean; target?: Target; onCommit: (v: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const cancelled = useRef(false);
  const agent = props.target?.kind === 'agent';
  const commit = () => {
    const v = text?.trim();
    if (!cancelled.current && v && v !== props.value) props.onCommit(v);
    cancelled.current = false;
    setText(null);
  };
  return (
    <div className={`nf tf${props.pending ? ' is-pending' : ''}`} title={[props.title, targetHint(props.target)].filter(Boolean).join('\n')}>
      <input
        className="nf-input"
        value={text ?? props.value}
        spellCheck={false}
        aria-label={props.title}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      {agent && <span className="nf-agent" title={props.target?.reason ?? t('field.agent')} />}
    </div>
  );
}

export function IconToggle(props: { on: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`icon-btn${props.on ? ' on' : ''}`} title={props.title} aria-pressed={props.on} onClick={props.onClick}>
      {props.children}
    </button>
  );
}
