<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
  <span class="badge" data-testid="badge">{{ label }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: #1c1c1e;
  color: #fff;
  font-size: 12px;
}
</style>
