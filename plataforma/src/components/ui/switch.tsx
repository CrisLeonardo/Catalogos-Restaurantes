'use client';

import * as React from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

/**
 * Toggle accesible (Base UI) — reemplaza los <button> que simulaban un
 * checkbox a mano (dos <span> sin <input> real, sin soporte de teclado/lector
 * de pantalla) repetidos en varios paneles del admin.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof BaseSwitch.Root>) {
  return (
    <BaseSwitch.Root
      data-slot="switch"
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-adm-full border transition-colors outline-none',
        'border-[var(--adm-switch-off-border)] bg-[var(--adm-switch-off-bg)]',
        'data-[checked]:bg-adm-accent-500 data-[checked]:border-adm-accent-500',
        'focus-visible:ring-2 focus-visible:ring-adm-accent-500/35',
        'disabled:pointer-events-none disabled:opacity-50',
        /* Dibuja 40 × 24 pero se toca en 60 × 44: el área invisible de
           alrededor recibe el dedo. Con solo el dibujo, los interruptores
           de Ajustes, Menú o Categorías se fallaban en el teléfono. */
        "after:absolute after:-inset-x-2.5 after:-inset-y-2.5 after:content-['']",
        className
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          'block size-4.5 translate-x-0.5 rounded-full bg-white shadow-adm-xs transition-transform',
          'data-[checked]:translate-x-[18px]'
        )}
      />
    </BaseSwitch.Root>
  );
}

export { Switch };
