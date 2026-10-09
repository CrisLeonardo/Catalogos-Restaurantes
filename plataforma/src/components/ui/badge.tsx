import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-adm-full border px-2.5 py-1 text-[11px] font-semibold leading-none whitespace-nowrap',
  {
    variants: {
      /* Todas llevan canto (2026-10-09). Sin borde, un relleno al 15 % se
         deshacía contra la tarjeta y la etiqueta parecía una mancha pálida.
         El neutro va sobre el fondo de página (no sobre el de la tarjeta,
         que es el mismo color en el que vive casi siempre). */
      variant: {
        neutral: 'bg-adm-bg text-adm-text-2 border-adm-border-2',
        accent: 'bg-adm-accent-500/15 text-adm-accent-ink border-adm-accent-500/40',
        ok: 'bg-adm-ok/15 text-adm-ok border-adm-ok/35',
        danger: 'bg-adm-danger/15 text-adm-danger border-adm-danger/35',
        warn: 'bg-adm-warn/15 text-adm-warn border-adm-warn/40',
        info: 'bg-adm-info/15 text-adm-info border-adm-info/35',
        solid: 'bg-adm-accent-fill text-white border-transparent',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
);

export interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
