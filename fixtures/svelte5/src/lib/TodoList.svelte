<script lang="ts">
  let todos = $state([
    { id: 1, text: '写 fixture', done: true },
    { id: 2, text: '量准确率', done: false },
    { id: 3, text: '决定要不要做', done: false },
  ]);
</script>

<section class="mt-6" data-testid="todos">
  <h2 class="mb-2 text-lg font-semibold" data-testid="todos-title">待办</h2>
  {#each todos as todo (todo.id)}
    <div class="todo flex items-center gap-2 py-1" data-testid="todo-row">
      <input bind:checked={todo.done} type="checkbox" data-testid="todo-check" />
      <span class={todo.done ? 'line-through text-gray-400' : ''} data-testid="todo-text">{todo.text}</span>
      {#if todo.done}
        <small class="text-xs text-green-700" data-testid="todo-done">已完成</small>
      {/if}
    </div>
    <hr class="border-gray-200" data-testid="todo-sep" />
  {:else}
    <p data-testid="todos-empty">没有待办</p>
  {/each}
</section>

<style>
  .todo span {
    font-size: 14px;
  }
</style>
