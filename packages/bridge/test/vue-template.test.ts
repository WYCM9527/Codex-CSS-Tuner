import { describe, expect, it } from 'vitest';
import { lineColAt, parseVueTemplate, type TNode } from '../src/vue-template';

/** 元素树压成 tag(子元素…) 的字符串，方便比较 */
const shape = (n: TNode): string => (n.children.length ? `${n.tag}(${n.children.map(shape).join(' ')})` : n.tag);

describe('Vue 模板解析', () => {
  it('只解析顶层 <template> 块：跳过 script 里像标签的字符串、style 和自定义块', () => {
    const src = [
      '<script setup lang="ts">',
      "const tpl = '<template><b>假的</b></template>';",
      '</script>',
      '<i18n>{ "a": "<p>" }</i18n>',
      '<template>',
      '  <div class="a"><span>x</span></div>',
      '</template>',
      '<style scoped>.a > b { color: red }</style>',
    ].join('\n');
    const root = parseVueTemplate(src)!;
    expect(shape(root)).toBe('template(div(span))');
    expect(lineColAt(src, root.children[0].start)).toEqual({ line: 6, column: 3 });
  });

  it('嵌套的 <template> 包装、自闭合组件、空元素都按结构收起来', () => {
    const src = '<template><ul><template v-for="x in xs" :key="x"><li>{{ x }}</li><hr></template></ul><Badge label="a" /><img src="a.png"><p>end</p></template>';
    expect(shape(parseVueTemplate(src)!)).toBe('template(ul(template(li hr)) Badge img p)');
  });

  it('插值和属性值里的 < > 不当标签，注释和 textarea 内容跳过', () => {
    const src = [
      '<template>',
      '  <p :title="a > b ? \'x\' : \'y\'">{{ a < b ? "<i>" : "" }}</p>',
      '  <!-- <div>注释里的</div> -->',
      '  <textarea>不是 <b>标签</b></textarea>',
      '  <span v-else>x</span>',
      '</template>',
    ].join('\n');
    const root = parseVueTemplate(src)!;
    expect(shape(root)).toBe('template(p textarea span)');
    expect(root.children[0].attrs.get(':title')).toBe("a > b ? 'x' : 'y'");
    expect(root.children[2].attrs.get('v-else')).toBe(true);
  });

  it('指令、简写和插槽名原样留在属性里', () => {
    const root = parseVueTemplate('<template><Card #header @click.stop="go" v-slot:item="{ i }" :class=\'[a, b]\' disabled/></template>')!;
    expect([...root.children[0].attrs.keys()]).toEqual(['#header', '@click.stop', 'v-slot:item', ':class', 'disabled']);
    expect(root.children[0].attrs.get(':class')).toBe('[a, b]');
  });

  it('用别的模板语言或结构不完整时不解析', () => {
    expect(parseVueTemplate('<template lang="pug">div.a</template>')).toBeNull();
    expect(parseVueTemplate('<template><div><span></div>')).toBeNull();
    expect(parseVueTemplate('<script>export default {}</script>')).toBeNull();
  });

  it('行列从 1 起，CRLF 也按换行算', () => {
    const src = 'ab\r\ncd\nef';
    expect(lineColAt(src, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColAt(src, 4)).toEqual({ line: 2, column: 1 });
    expect(lineColAt(src, 8)).toEqual({ line: 3, column: 2 });
  });
});
