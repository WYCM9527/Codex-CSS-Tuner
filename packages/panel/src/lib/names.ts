import { t, type Crumb } from '@css-tuner/protocol';

type Role =
  | 'box'
  | 'main'
  | 'header'
  | 'footer'
  | 'nav'
  | 'aside'
  | 'section'
  | 'article'
  | 'form'
  | 'heading'
  | 'paragraph'
  | 'text'
  | 'link'
  | 'button'
  | 'image'
  | 'icon'
  | 'video'
  | 'audio'
  | 'canvas'
  | 'input'
  | 'select'
  | 'list'
  | 'item'
  | 'table'
  | 'row'
  | 'cell'
  | 'quote'
  | 'code'
  | 'divider'
  | 'figure'
  | 'dialog'
  | 'frame';

const TAGS: Array<[Role, string]> = [
  ['box', 'div'],
  ['main', 'main'],
  ['header', 'header'],
  ['footer', 'footer'],
  ['nav', 'nav'],
  ['aside', 'aside'],
  ['section', 'section'],
  ['article', 'article'],
  ['form', 'form fieldset'],
  ['heading', 'h1 h2 h3 h4 h5 h6'],
  ['paragraph', 'p'],
  ['text', 'span strong em b i small label mark sub sup time abbr cite s u del ins figcaption legend summary caption'],
  ['link', 'a'],
  ['button', 'button'],
  ['image', 'img picture'],
  ['icon', 'svg'],
  ['video', 'video'],
  ['audio', 'audio'],
  ['canvas', 'canvas'],
  ['input', 'input textarea'],
  ['select', 'select'],
  ['list', 'ul ol dl menu'],
  ['item', 'li dt dd'],
  ['table', 'table thead tbody tfoot'],
  ['row', 'tr'],
  ['cell', 'td th'],
  ['quote', 'blockquote q'],
  ['code', 'pre code'],
  ['divider', 'hr'],
  ['figure', 'figure'],
  ['dialog', 'dialog'],
  ['frame', 'iframe'],
];
const ROLE = new Map(TAGS.flatMap(([role, tags]) => tags.split(' ').map((tag) => [tag, role] as const)));

export interface ElementName {
  /** 通俗的叫法（标题、按钮、容器…），认不出的标签原样显示 */
  role: string;
  /** 文字开头（带引号）；没有文字时是 #id 和类名 */
  detail: string;
  quoted: boolean;
}

/** 元素给人看的名字：标签换成通俗的叫法，后面跟文字开头，没有文字时跟 #id 和类名。label 是 "h1.text-2xl…" 这样的写法 */
export function nameOf(label: string, text?: string): ElementName {
  const tag = /^[\w-]+/.exec(label)?.[0] ?? '';
  let role = ROLE.get(tag);
  // 不带文字的 span 多半只是包了一层；不带文字的 <i> 多半是图标
  if (role === 'text' && !text) role = tag === 'i' ? 'icon' : 'box';
  const shown = role ? t(`el.role.${role}`) : tag || label;
  if (!text) return { role: shown, detail: label.slice(tag.length), quoted: false };
  const many = / ×\d+$/.exec(label)?.[0] ?? '';
  return { role: shown, detail: `“${text}”${many}`, quoted: true };
}

/** 组件边界：渲染它的组件和上一层不同时返回组件名 */
export function boundary(c: Pick<Crumb, 'component'>, parent: Pick<Crumb, 'component'> | undefined): string | null {
  if (!c.component) return null;
  return !parent || parent.component !== c.component ? c.component : null;
}
