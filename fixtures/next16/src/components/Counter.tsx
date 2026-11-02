'use client';

import { useState } from 'react';

export function Counter() {
  const [n, setN] = useState(0);
  return (
    <div className="mt-6 flex items-center gap-3" data-testid="counter">
      <button className="rounded-md bg-brand px-4 py-2 text-white" onClick={() => setN(n + 1)} data-testid="inc">
        客户端组件 +1
      </button>
      <span className="text-lg tabular-nums" data-testid="count">
        {n}
      </span>
    </div>
  );
}
