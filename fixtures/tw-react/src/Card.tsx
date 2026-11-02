import type { ReactNode } from 'react';

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-md md:p-8" data-testid="card">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 text-sm leading-6 text-ink/70">{children}</div>
    </div>
  );
}
