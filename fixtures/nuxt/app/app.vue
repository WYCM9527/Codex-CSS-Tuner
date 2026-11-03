<script setup lang="ts">
const on = ref(true);
</script>

<template>
  <main class="mx-auto max-w-2xl p-8" data-testid="app">
    <header class="mb-6 flex items-center justify-between" data-testid="header">
      <h1 class="text-2xl font-bold" data-testid="title">Nuxt fixture</h1>
      <button type="button" class="rounded px-3 py-1" :class="{ 'bg-brand text-white': on }" data-testid="toggle" @click="on = !on">切换</button>
    </header>
    <SmokeCard title="卡片">
      <p class="text-sm text-gray-600" data-testid="card-body">服务端渲染后在客户端激活</p>
    </SmokeCard>
  </main>
</template>
