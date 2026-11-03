<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, highlight = false, header, children }: { title: string; highlight?: boolean; header?: Snippet; children?: Snippet } = $props();
</script>

<article class="card" class:card--on={highlight} data-testid="card">
  <div class="card-head" data-testid="card-head">
    {#if header}
      {@render header()}
    {:else}
      <h3 class="title" data-testid="card-title">{title}</h3>
    {/if}
  </div>
  <div class="card-body" data-testid="card-body">
    {@render children?.()}
  </div>
</article>

<style>
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

  .card-body :global(p) {
    margin-top: 4px;
  }

  @media (min-width: 640px) {
    .card-head {
      margin-bottom: 8px;
    }
  }
</style>
