import { defineComponent, h } from 'vue';

/** 用渲染函数写的组件：插槽内容直接放进自己的树里，不经过模板编译出的 renderSlot */
export default defineComponent({
  name: 'Box',
  props: { title: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('div', { class: 'rounded border border-dashed p-3', 'data-testid': 'box' }, [h('h4', { class: 'text-xs uppercase text-gray-500', 'data-testid': 'box-title' }, props.title), slots.default?.(), slots.footer?.()]);
  },
});
