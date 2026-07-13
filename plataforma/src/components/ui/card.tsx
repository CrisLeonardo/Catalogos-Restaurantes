import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const cardVariants = cva('rounded-adm-xl transition-colors', {
  variants: {
    variant: {
      /** Tarjeta elevada estándar — evolución tipada de `.glass-quiet`. */
      default: 'bg-adm-card border border-adm-border shadow-adm-sm',
      /** Sin sombra ni fondo propio — para agrupar contenido sin "flotar". */
      flat: 'bg-transparent border border-adm-border',
      /** Interactiva: hover + cursor pointer (tarjetas que navegan). */
      interactive:
        'bg-adm-card border border-adm-border shadow-adm-sm hover:bg-adm-card-hover hover:border-adm-border-2 hover:shadow-adm-md cursor-pointer active:translate-y-px',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface CardProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof cardVariants> {}

function Card({ className, variant, ...props }: CardProps) {
  return (
    <div data-slot="card" className={cn(cardVariants({ variant, className }))} {...props} />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 p-5', className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="card-title"
      className={cn('text-[15px] font-semibold text-adm-text leading-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-[13px] text-adm-text-3 leading-snug', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('px-5 pb-5', className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 px-5 pb-5 pt-1', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants };
