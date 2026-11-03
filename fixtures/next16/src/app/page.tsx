import { Counter } from '@/components/Counter';
import { IntlNote } from '@/components/IntlNote';
import { Panel } from '@/components/Panel';

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8" data-testid="main">
      <header className="flex items-center justify-between rounded-card bg-brand px-6 py-4 text-white" data-testid="header">
        <h1 className="text-2xl font-bold" data-testid="title">
          Next.js 16 服务端组件
        </h1>
        <span className="text-sm opacity-80">RSC</span>
      </header>
      <p className="prose-note" data-testid="note">
        这一段写在服务端组件里，样式来自 globals.css。
      </p>
      <Panel title="CSS Modules 面板" />
      <Counter />
      <IntlNote />
    </main>
  );
}
