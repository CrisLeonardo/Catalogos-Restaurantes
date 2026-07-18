import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full rounded-adm-lg border border-adm-border bg-adm-card px-3.5 py-2.5 text-[13.5px] text-adm-text placeholder:text-adm-text-4 outline-none transition-colors resize-y',
        'focus-visible:border-adm-accent-500 focus-visible:ring-2 focus-visible:ring-adm-accent-500/25',
        'disabled:pointer-events-none disabled:opacity-50',
        'aria-invalid:border-adm-danger aria-invalid:ring-2 aria-invalid:ring-adm-danger/20',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
