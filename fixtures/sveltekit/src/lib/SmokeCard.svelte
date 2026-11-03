<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<article class="card" data-testid="card">
  <h2 class="title" data-testid="card-title">{title}</h2>
  {@render children?.()}
</article>

<style>
  .card {
    padding: 16px;
    border: 1px solid #e5e5e5;
    border-radius: 12px;
  }

  .title {
    font-size: 16px;
  }
</style>
