<script setup lang="ts">
import { ref } from 'vue';

const open = ref(true);
const toast = ref(true);
const kind = ref<'span' | 'strong'>('strong');
</script>

<template>
  <section class="mt-6 rounded-card bg-white p-gutter shadow-sm" data-testid="panel">
    <div class="flex items-center gap-3" data-testid="panel-bar">
      <button type="button" class="rounded bg-ink px-3 py-1 text-white" data-testid="panel-toggle" @click="open = !open">展开 / 收起</button>
      <component :is="kind" class="text-sm" data-testid="panel-dynamic">动态标签</component>
    </div>
    <Transition name="fade">
      <div v-show="open" class="mt-3 text-sm leading-6" data-testid="panel-body">
        这段用 v-show 和 Transition 控制。
        <em data-testid="panel-em">强调</em>
        后面还有文字。
      </div>
    </Transition>
    <Teleport to="body">
      <div v-if="toast" class="fixed right-4 bottom-4 rounded bg-ink px-4 py-2 text-white" data-testid="toast">传送到 body 的提示</div>
    </Teleport>
  </section>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
