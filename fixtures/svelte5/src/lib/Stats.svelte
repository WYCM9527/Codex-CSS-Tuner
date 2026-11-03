<h2 class="mt-8 text-lg font-semibold" data-testid="stats-title">数据</h2>
<dl class="stats grid grid-cols-3 gap-3" data-testid="stats">
  <div class="stat rounded border p-3" data-testid="stat-1">
    <dt class="text-xs text-gray-500" data-testid="stat-1-label">访问</dt>
    <dd class="text-xl font-bold" data-testid="stat-1-value">1,204</dd>
  </div>
  <div class="stat rounded border p-3" data-testid="stat-2">
    <dt class="text-xs text-gray-500" data-testid="stat-2-label">注册</dt>
    <dd class="text-xl font-bold" data-testid="stat-2-value">86</dd>
  </div>
  <div class="stat rounded border p-3" data-testid="stat-3">
    <dt class="text-xs text-gray-500" data-testid="stat-3-label">留存</dt>
    <dd class="text-xl font-bold" data-testid="stat-3-value">41%</dd>
  </div>
</dl>
<p class="mt-2 text-xs text-gray-500" data-testid="stats-note">多个顶层节点，中间那段是纯静态内容</p>

<style>
  .stats .stat:hover {
    border-color: #1c1c1e;
  }
</style>
