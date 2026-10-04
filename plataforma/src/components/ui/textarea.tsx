import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // El campo único del panel (globals.css, T-26).
        'adm-field',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
