import clsx from 'clsx';

interface PlanProps {
  id: string;
  name: string;
  price: string;
  blurb: string;
  features: string[];
  featured?: boolean;
}

export function Plan({ id, name, price, blurb, features, featured = false }: PlanProps) {
  return (
    <article
      className={clsx('rounded-2xl border p-6', featured ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white')}
      data-plan={id}
    >
      <h2 className="text-sm font-medium">{name}</h2>
      <p className="mt-4 text-4xl font-semibold tracking-tight">
        {price}
        <span className="text-sm font-normal opacity-60">/mo</span>
      </p>
      <p className={clsx('mt-2 text-sm', featured ? 'text-stone-300' : 'text-stone-500')}>{blurb}</p>
      <ul className="mt-6 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden className="opacity-50">
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>
      <button
        className={clsx(
          'mt-8 w-full rounded-lg px-4 py-2 text-sm font-medium',
          featured ? 'bg-white text-stone-900' : 'bg-stone-900 text-white',
        )}
      >
        Choose {name}
      </button>
    </article>
  );
}
