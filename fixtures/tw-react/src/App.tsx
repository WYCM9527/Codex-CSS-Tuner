import { useState } from 'react';
import clsx from 'clsx';
import { Card } from './Card';

const items = ['草图', '调参', '应用', '还原'];
const buttonStyles = 'rounded-md bg-brand px-4 py-2 text-white';

export default function App() {
  const [active, setActive] = useState(false);
  const tone = active ? 'bg-brand/10' : 'bg-white';

  return (
    <main className="mx-auto max-w-3xl p-gutter">
      <header className="flex items-center justify-between bg-brand px-6 py-4 text-white" data-testid="header">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="title">css-tuner fixture</h1>
        <span className="opacity-90 hover:bg-white/20">tw-react</span>
      </header>

      <p className={clsx('mt-2 text-sm text-ink/70', active && 'underline')} data-testid="lead">
        点选元素、拖动数值、应用到源码。
      </p>

      <div className={`rounded-card mt-4 p-4 ${tone}`} data-testid="tone-box">
        模板字符串里的类名
      </div>

      <section data-testid="bare">没有 className 的元素</section>

      <ul className="mt-6 divide-y divide-ink/10" data-testid="list">
        {items.map((item) => (
          <li key={item} className="py-2" data-testid="list-item">
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="第一张卡片">卡片内容 A</Card>
        <Card title="第二张卡片">卡片内容 B</Card>
      </div>

      <button className={buttonStyles} onClick={() => setActive(!active)} data-testid="toggle">
        切换
      </button>
    </main>
  );
}
