<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<span class="badge" data-testid="badge">{label}</span>

<style>
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    background: #1c1c1e;
    color: #fff;
    font-size: 12px;
  }
</style>
