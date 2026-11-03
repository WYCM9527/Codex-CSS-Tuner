<script setup lang="ts">
import { ref } from 'vue';
import Badge from './Badge.vue';
import Box from './Box';
import ItemList from './ItemList.vue';

const n = ref(2);
const flag = ref(true);
const view = ref<'one' | 'two'>('one');
const raw = '<b>v-html 里的内容</b>';
const rows = [
  { id: 'r1', cells: ['a', 'b'] },
  { id: 'r2', cells: ['c', 'd', 'e'] },
];
</script>

<template>
  <!-- 根上有注释：开发态单根也包在片段里 -->
  <section class="mt-6 space-y-3" data-testid="stress">
    <p v-if="n > 5" data-testid="s-if1-a">大于 5</p>
    <p v-else data-testid="s-if1-b">不大于 5（{{ n < 3 ? '小' : '中' }}）</p>
    <span data-testid="s-between">两条 v-if 链中间</span>
    <div v-if="!flag" key="off" data-testid="s-if2-off">关</div>
    <div v-else-if="n === 2" key="two" :title="n > 1 ? 'a>b' : 'b'" data-testid="s-if2-two">n 是 2</div>
    <div v-else key="else" data-testid="s-if2-else">其他</div>
    <template v-if="flag">
      <em data-testid="s-tpl-single">template v-if 里只有一个子元素</em>
    </template>

    <table class="text-sm" data-testid="s-table">
      <tbody data-testid="s-tbody">
        <tr v-for="row in rows" :key="row.id" data-testid="s-tr">
          <td v-for="c in row.cells" :key="c" class="px-2" data-testid="s-td">{{ c }}</td>
        </tr>
      </tbody>
    </table>

    <ItemList :items="['甲', '乙', '丙']">
      <template #item="{ item, index }">
        <b data-testid="s-slot-index">{{ index }}</b>
        <i v-if="index !== 1" data-testid="s-slot-item">{{ item }}</i>
      </template>
    </ItemList>
    <ItemList :items="['只用后备内容']" />

    <Box title="渲染函数组件">
      <p class="text-sm" data-testid="s-box-body">默认插槽</p>
      <template #footer>
        <small data-testid="s-box-footer">footer 插槽</small>
      </template>
    </Box>

    <KeepAlive>
      <component :is="view === 'one' ? Badge : 'mark'" label="keep-alive 里的组件" />
    </KeepAlive>

    <TransitionGroup tag="ol" class="list-decimal pl-5" data-testid="s-tg">
      <li v-for="k in n" :key="k" data-testid="s-tg-item">第 {{ k }} 个</li>
    </TransitionGroup>

    <div v-html="raw" class="text-xs" data-testid="s-html"></div>

    <svg width="40" height="12" viewBox="0 0 40 12" data-testid="s-svg">
      <defs data-testid="s-defs">
        <linearGradient id="s-grad" data-testid="s-grad">
          <stop offset="0" stop-color="#000" data-testid="s-stop" />
        </linearGradient>
      </defs>
      <rect width="40" height="12" fill="url(#s-grad)" data-testid="s-rect" />
    </svg>

    <textarea data-testid="s-textarea">不是 <b>标签</b></textarea>
    <button type="button" class="rounded border px-2" data-testid="s-inc" @click="n++">n + 1</button>
  </section>
</template>
