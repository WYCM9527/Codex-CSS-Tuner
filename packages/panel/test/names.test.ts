import { describe, expect, it } from 'vitest';
import { setLocale } from '@css-tuner/protocol';
import { nameOf } from '../src/lib/names';

describe('元素给人看的名字', () => {
  it('标签换成通俗的叫法，后面跟文字开头；没有文字时跟 #id 和类名', () => {
    setLocale('zh-CN');
    expect(nameOf('h1.text-2xl.font-bold…', 'css-tuner fixture')).toEqual({ role: '标题', detail: '“css-tuner fixture”', quoted: true });
    expect(nameOf('div#root')).toEqual({ role: '容器', detail: '#root', quoted: false });
    expect(nameOf('header.flex.items-center…')).toEqual({ role: '页头', detail: '.flex.items-center…', quoted: false });
    setLocale('en');
    expect(nameOf('button.btn', 'Save').role).toBe('Button');
  });

  it('不带文字的 span 当容器、<i> 当图标；认不出的标签原样显示', () => {
    setLocale('zh-CN');
    expect(nameOf('span.rounded-full').role).toBe('容器');
    expect(nameOf('i.icon-close').role).toBe('图标');
    expect(nameOf('my-widget.x')).toEqual({ role: 'my-widget', detail: '.x', quoted: false });
  });

  it('.map() 渲染的一组保留个数', () => {
    setLocale('zh-CN');
    expect(nameOf('li.item ×3', 'Home').detail).toBe('“Home” ×3');
  });
});
