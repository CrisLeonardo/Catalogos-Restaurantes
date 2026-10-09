import * as React from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-adm-lg text-[13px] font-semibold transition-all outline-none select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-adm-accent-500/50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-adm-accent-fill text-white shadow-adm-accent hover:bg-adm-accent-fill-hover',
        secondary:
          'bg-adm-card text-adm-text border border-adm-border-2 shadow-adm-xs hover:bg-adm-card-hover',
        outline:
          'bg-transparent text-adm-text border border-adm-border-2 hover:bg-adm-card',
        ghost:
          'bg-transparent text-adm-text-2 hover:bg-adm-card hover:text-adm-text',
        destructive:
          'bg-adm-danger/10 text-adm-danger border border-adm-danger/30 hover:bg-adm-danger/20',
        link:
          'bg-transparent text-adm-accent-ink underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-[12px]',
        md: 'h-10 px-4',
        lg: 'h-11 px-5 text-[14px]',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ComponentProps<typeof BaseButton>,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, render, ...props }: ButtonProps) {
  return (
    <BaseButton
      data-slot="button"
      // render a un elemento no-<button> (p. ej. <a> para CTAs que navegan):
      // sin esto Base UI asume `nativeButton` y tira un warning en consola
      // porque espera un <button> real detrás del render prop.
      nativeButton={render === undefined}
      render={render}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
