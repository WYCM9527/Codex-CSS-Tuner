export type SectionId = 'layout' | 'position' | 'spacing' | 'size' | 'typography' | 'fill' | 'radius' | 'effects';

export type PropKind =
  | 'length'
  | 'color'
  | 'number'
  | 'shadow'
  | 'keyword'
  | 'fontWeight'
  | 'lineHeight'
  | 'tracks';

export interface PropMeta {
  prop: string;
  section: SectionId;
  kind: PropKind;
  inherited?: boolean;
  keywords?: string[];
}

export const PROPS: PropMeta[] = [
  { prop: 'display', section: 'layout', kind: 'keyword', keywords: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none'] },
  { prop: 'flex-direction', section: 'layout', kind: 'keyword', keywords: ['row', 'row-reverse', 'column', 'column-reverse'] },
  { prop: 'flex-wrap', section: 'layout', kind: 'keyword', keywords: ['nowrap', 'wrap', 'wrap-reverse'] },
  { prop: 'justify-content', section: 'layout', kind: 'keyword', keywords: ['normal', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'stretch'] },
  { prop: 'align-items', section: 'layout', kind: 'keyword', keywords: ['normal', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline'] },
  { prop: 'row-gap', section: 'layout', kind: 'length' },
  { prop: 'column-gap', section: 'layout', kind: 'length' },
  { prop: 'grid-template-columns', section: 'layout', kind: 'tracks' },

  { prop: 'position', section: 'position', kind: 'keyword', keywords: ['static', 'relative', 'absolute', 'fixed', 'sticky'] },
  { prop: 'top', section: 'position', kind: 'length' },
  { prop: 'right', section: 'position', kind: 'length' },
  { prop: 'bottom', section: 'position', kind: 'length' },
  { prop: 'left', section: 'position', kind: 'length' },
  { prop: 'z-index', section: 'position', kind: 'number' },

  { prop: 'padding-top', section: 'spacing', kind: 'length' },
  { prop: 'padding-right', section: 'spacing', kind: 'length' },
  { prop: 'padding-bottom', section: 'spacing', kind: 'length' },
  { prop: 'padding-left', section: 'spacing', kind: 'length' },
  { prop: 'margin-top', section: 'spacing', kind: 'length' },
  { prop: 'margin-right', section: 'spacing', kind: 'length' },
  { prop: 'margin-bottom', section: 'spacing', kind: 'length' },
  { prop: 'margin-left', section: 'spacing', kind: 'length' },

  { prop: 'width', section: 'size', kind: 'length' },
  { prop: 'height', section: 'size', kind: 'length' },
  { prop: 'min-width', section: 'size', kind: 'length' },
  { prop: 'max-width', section: 'size', kind: 'length' },
  { prop: 'min-height', section: 'size', kind: 'length' },
  { prop: 'max-height', section: 'size', kind: 'length' },

  { prop: 'font-size', section: 'typography', kind: 'length', inherited: true },
  { prop: 'font-weight', section: 'typography', kind: 'fontWeight', inherited: true },
  { prop: 'line-height', section: 'typography', kind: 'lineHeight', inherited: true },
  { prop: 'letter-spacing', section: 'typography', kind: 'length', inherited: true },
  { prop: 'text-align', section: 'typography', kind: 'keyword', inherited: true, keywords: ['start', 'left', 'center', 'right', 'justify'] },
  { prop: 'color', section: 'typography', kind: 'color', inherited: true },

  { prop: 'background-color', section: 'fill', kind: 'color' },

  { prop: 'border-top-left-radius', section: 'radius', kind: 'length' },
  { prop: 'border-top-right-radius', section: 'radius', kind: 'length' },
  { prop: 'border-bottom-right-radius', section: 'radius', kind: 'length' },
  { prop: 'border-bottom-left-radius', section: 'radius', kind: 'length' },

  { prop: 'box-shadow', section: 'effects', kind: 'shadow' },
  { prop: 'opacity', section: 'effects', kind: 'number' },
];

export const PROP_NAMES: string[] = PROPS.map((p) => p.prop);

const META = new Map(PROPS.map((p) => [p.prop, p]));

export function propMeta(prop: string): PropMeta | undefined {
  return META.get(prop);
}

export const PADDING = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
export const MARGIN = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
export const RADIUS = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
export const GAP = ['row-gap', 'column-gap'];
export const INSET = ['top', 'right', 'bottom', 'left'];

/** 面板上的一组联动控件对应的 longhand 集合，用于引擎合并成简写类或简写声明 */
export const PROP_GROUPS: Record<string, string[]> = {
  padding: PADDING,
  'padding-x': ['padding-right', 'padding-left'],
  'padding-y': ['padding-top', 'padding-bottom'],
  margin: MARGIN,
  'margin-x': ['margin-right', 'margin-left'],
  'margin-y': ['margin-top', 'margin-bottom'],
  'border-radius': RADIUS,
  gap: GAP,
  inset: INSET,
};

export function groupLabel(props: string[]): string {
  const key = [...props].sort().join(',');
  for (const [name, members] of Object.entries(PROP_GROUPS)) {
    if ([...members].sort().join(',') === key) return name;
  }
  return props.length === 1 ? props[0] : props.join(' + ');
}
