<script setup lang="ts">
defineProps<{ title: string; highlight?: boolean }>();
</script>

<template>
  <article class="card" :class="{ 'card--on': highlight }" data-testid="card">
    <div class="card-head" data-testid="card-head">
      <slot name="header">
        <h3 class="title" data-testid="card-title">{{ title }}</h3>
      </slot>
    </div>
    <div class="card-body" data-testid="card-body">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.card {
  padding: 16px;
  border: 1px solid #e5e5e5;
  border-radius: var(--radius-card);
  background: #fff;
}

.card--on {
  border-color: #1c1c1e;
}

.card .title {
  font-size: 16px;
  font-weight: 600;
}

.card-body :deep(p) {
  margin-top: 4px;
}

@media (min-width: 640px) {
  .card-head {
    margin-bottom: 8px;
  }
}
</style>
