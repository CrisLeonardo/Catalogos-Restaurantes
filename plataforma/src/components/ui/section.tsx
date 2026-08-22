import * as React from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

/* ============================================================
   SECCIÓN — encabezado de un bloque de contenido (Fase 2)
   ------------------------------------------------------------
   Antes cada pantalla escribía su propia etiqueta con `.t-kicker`:
   Anton, mayúsculas y 0.14em de espaciado entre letras, a 9,5 px.
   Funciona en una portada; en una pantalla llena de listas es puro
   ruido, y a ese tamaño se lee peor que el texto que etiqueta.

   Aquí la etiqueta va en la tipografía del panel, sin mayúsculas,
   a 12,5 px. Y admite UNA sola acción a la derecha: si una sección
   necesita dos, es que son dos secciones.
   ============================================================ */

interface Props extends Omit<React.ComponentProps<'section'>, 'title'> {
  title: React.ReactNode;
  /** El único enlace del encabezado. Omitirlo es lo normal. */
  action?: { href: string; label: string };
}

function Section({ title, action, className, children, ...props }: Props) {
  return (
    <section className={cn('min-w-0', className)} {...props}>
      <div className="mb-2 flex items-baseline gap-3 px-1">
        <h3 className="adm-label flex-1">{title}</h3>
        {action && (
          <Link
            href={action.href}
            className="text-[12.5px] font-semibold no-underline"
            style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export { Section };
