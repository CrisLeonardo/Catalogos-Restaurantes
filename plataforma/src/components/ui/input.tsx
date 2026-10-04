import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // El campo único del panel (globals.css, auditoría 2026-10-02, T-26):
        // mismo relleno, borde y anillo de foco que los formularios.
        'adm-field',
        className
      )}
      {...props}
    />
  );
}

export { Input };
