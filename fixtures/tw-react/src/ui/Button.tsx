import type { ButtonHTMLAttributes } from 'react';
import { cva } from './recipe';
import { cn } from './utils';

const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium', {
  variants: {
    variant: {
      default: 'bg-brand text-white hover:bg-brand/90',
      outline: 'border border-ink/20 bg-white text-ink',
    },
    size: {
      default: 'h-9 px-4 py-2',
      sm: 'h-8 px-3',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline'; size?: 'default' | 'sm' };

export function Button({ className, variant, size, ...props }: Props) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
