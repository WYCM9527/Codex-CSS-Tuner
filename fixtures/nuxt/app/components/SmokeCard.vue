<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <article class="card" data-testid="card">
    <h2 class="title" data-testid="card-title">{{ title }}</h2>
    <slot />
  </article>
</template>

<style scoped>
.card {
  padding: 16px;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
}

.title {
  font-size: 16px;
}
</style>
