<script setup lang="ts">
import { ref } from 'vue';
import Badge from './components/Badge.vue';
import Card from './components/Card.vue';
import Panel from './components/Panel.vue';
import Stats from './components/Stats.vue';
import Stress from './components/Stress.vue';
import TodoList from './components/TodoList.vue';

const tabs = ['a', 'b', 'c'] as const;
const tab = ref<(typeof tabs)[number]>('a');
const wide = ref(true);
</script>

<template>
  <main class="mx-auto max-w-3xl p-8 text-ink" data-testid="app">
    <!-- 页头 -->
    <header class="mb-6 flex items-center justify-between" data-testid="header">
      <h1 class="text-2xl font-bold" data-testid="title">Vue 3 fixture</h1>
      <Badge class="ml-2" label="beta" />
    </header>

    <section :class="['grid gap-4', wide ? 'grid-cols-2' : 'grid-cols-1']" data-testid="grid">
      <Card title="第一张">
        <p class="text-sm text-gray-600" data-testid="card-1-body">卡片正文 {{ tab }}</p>
      </Card>
      <Card title="第二张" :highlight="wide">
        <template #header>
          <span class="font-semibold text-brand" data-testid="card-2-header">自定义标题</span>
        </template>
        <ul class="list-disc pl-5" data-testid="card-2-list">
          <li v-for="n in 3" :key="n" class="py-1" data-testid="card-2-item">第 {{ n }} 项</li>
        </ul>
      </Card>
    </section>

    <nav class="mt-6 flex gap-2" data-testid="tabs">
      <button
        v-for="t in tabs"
        :key="t"
        type="button"
        class="rounded px-3 py-1"
        :class="{ 'bg-brand text-white': tab === t, 'bg-gray-100': tab !== t }"
        data-testid="tab"
        @click="tab = t"
      >
        {{ t }}
      </button>
      <button type="button" class="ml-auto rounded border px-3 py-1" data-testid="toggle-wide" @click="wide = !wide">切换列数</button>
    </nav>

    <div v-if="tab === 'a'" class="mt-4 rounded border p-4" data-testid="pane-a">A 面板</div>
    <div v-else-if="tab === 'b'" class="mt-4 rounded border p-4" data-testid="pane-b">B 面板</div>
    <template v-else>
      <h2 class="mt-4 text-lg" data-testid="pane-c-title">C 面板</h2>
      <p data-testid="pane-c-body">template 包裹的两个节点</p>
    </template>

    <Panel />
    <TodoList />
    <Stats />
    <Stress />

    <footer class="mt-10 border-t pt-4 text-xs text-gray-500" data-testid="footer">
      <p data-testid="footer-line">静态页脚</p>
      <a href="#top" class="underline" data-testid="footer-link">回到顶部</a>
    </footer>
  </main>
</template>

<style scoped>
.text-ink h1 {
  letter-spacing: -0.01em;
}
</style>
