<script lang="ts">
  import Badge from './lib/Badge.svelte';
  import Card from './lib/Card.svelte';
  import Stats from './lib/Stats.svelte';
  import TodoList from './lib/TodoList.svelte';

  const tabs = ['a', 'b', 'c'] as const;
  let tab = $state<(typeof tabs)[number]>('a');
  let wide = $state(true);
</script>

<main class="mx-auto max-w-3xl p-8 text-ink" data-testid="app">
  <!-- 页头 -->
  <header class="mb-6 flex items-center justify-between" data-testid="header">
    <h1 class="title text-2xl font-bold" data-testid="title">Svelte 5 fixture</h1>
    <Badge label="beta" />
  </header>

  <section class={['grid gap-4', wide ? 'grid-cols-2' : 'grid-cols-1']} data-testid="grid">
    <Card title="第一张">
      <p class="text-sm text-gray-600" data-testid="card-1-body">卡片正文 {tab}</p>
    </Card>
    <Card title="第二张" highlight={wide}>
      {#snippet header()}
        <span class="font-semibold text-brand" data-testid="card-2-header">自定义标题</span>
      {/snippet}
      <ul class="list-disc pl-5" data-testid="card-2-list">
        {#each [1, 2, 3] as n (n)}
          <li class="py-1" data-testid="card-2-item">第 {n} 项</li>
        {/each}
      </ul>
    </Card>
  </section>

  <nav class="mt-6 flex gap-2" data-testid="tabs">
    {#each tabs as t (t)}
      <button
        type="button"
        class="rounded px-3 py-1"
        class:bg-brand={tab === t}
        class:text-white={tab === t}
        class:bg-gray-100={tab !== t}
        data-testid="tab"
        onclick={() => (tab = t)}
      >
        {t}
      </button>
    {/each}
    <button type="button" class="ml-auto rounded border px-3 py-1" data-testid="toggle-wide" onclick={() => (wide = !wide)}>切换列数</button>
  </nav>

  {#if tab === 'a'}
    <div class="mt-4 rounded border p-4" data-testid="pane-a">A 面板</div>
  {:else if tab === 'b'}
    <div class="mt-4 rounded border p-4" data-testid="pane-b">B 面板</div>
  {:else}
    <h2 class="mt-4 text-lg" data-testid="pane-c-title">C 面板</h2>
    <p data-testid="pane-c-body">else 分支里的两个节点</p>
  {/if}

  <TodoList />
  <Stats />

  <footer class="mt-10 border-t pt-4 text-xs text-gray-500" data-testid="footer">
    <p data-testid="footer-line">静态页脚</p>
    <a href="#top" class="underline" data-testid="footer-link">回到顶部</a>
  </footer>
</main>

<style>
  .title {
    letter-spacing: -0.01em;
  }

  main :global(a:hover) {
    color: var(--color-brand);
  }
</style>
