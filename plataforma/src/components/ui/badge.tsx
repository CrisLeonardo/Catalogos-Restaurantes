import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-adm-full px-2.5 py-1 text-[11.5px] font-semibold leading-none whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-adm-card text-adm-text-2 border border-adm-border',
        accent: 'bg-adm-accent-500/15 text-adm-accent-500',
        ok: 'bg-adm-ok/15 text-adm-ok',
        danger: 'bg-adm-danger/15 text-adm-danger',
        warn: 'bg-adm-warn/15 text-adm-warn',
        info: 'bg-adm-info/15 text-adm-info',
        solid: 'bg-adm-accent-500 text-white',
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
