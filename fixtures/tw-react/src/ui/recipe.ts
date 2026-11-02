type Variants = Record<string, Record<string, string>>;
type Choice<V extends Variants> = { [K in keyof V]?: keyof V[K] };

/** class-variance-authority 的最小替身：基础类 + 选中的变体 + 调用处的 className */
export function cva<V extends Variants>(base: string, config: { variants: V; defaultVariants?: Choice<V> }) {
  return (props: Choice<V> & { className?: string } = {}) => {
    const out = [base];
    for (const key of Object.keys(config.variants) as Array<keyof V>) {
      const choice = props[key] ?? config.defaultVariants?.[key];
      const cls = choice === undefined ? undefined : config.variants[key][choice as string];
      if (cls) out.push(cls);
    }
    if (props.className) out.push(props.className);
    return out.join(' ');
  };
}
