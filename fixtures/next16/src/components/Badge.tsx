'use client';

type Tone = 'neutral' | 'brand' | 'warn';

const tones: Record<Tone, string> = {
  neutral: 'bg-ink/10 text-ink',
  brand: 'bg-brand text-white',
  warn: 'bg-amber-200 text-ink',
};

/** 客户端组件的 props 样例：字符串、数字、布尔和字面量联合类型 */
export function Badge({ label, tone = 'neutral', count = 0, pill = false }: { label: string; tone?: Tone; count?: number; pill?: boolean }) {
  return (
    <span className={`mt-6 inline-flex items-center gap-2 px-3 py-1 text-sm ${pill ? 'rounded-full' : 'rounded-md'} ${tones[tone]}`} data-testid="badge">
      <span data-testid="badge-label">{label}</span>
      <span className="tabular-nums" data-testid="badge-count">
        {count}
      </span>
    </span>
  );
}
