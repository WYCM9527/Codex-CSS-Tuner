<script setup lang="ts">
defineProps<{ items: string[] }>();
</script>

<template>
  <ul class="space-y-1" data-testid="item-list">
    <li v-for="(item, i) in items" :key="item" class="flex gap-2" data-testid="item-list-row">
      <slot name="item" :item="item" :index="i">
        <span data-testid="item-list-fallback">{{ item }}</span>
      </slot>
    </li>
  </ul>
</template>
