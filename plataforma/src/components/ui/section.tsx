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
  /**
   * El mismo sitio que `action`, para cuando lo de la derecha NO es un enlace
   * sino un control — el botón "Nuevo" de Personal, por ejemplo. Sigue siendo
   * UNA sola cosa: si una sección necesita dos, es que son dos secciones.
   */
  aside?: React.ReactNode;
}

function Section({ title, action, aside, className, children, ...props }: Props) {
  return (
    <section className={cn('min-w-0', className)} {...props}>
      <div className="mb-2 flex items-center gap-3 px-1">
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
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * La letra pequeña que va DEBAJO de un grupo, no dentro.
 *
 * En una lista de ajustes la explicación no es una fila: si lo fuera habría
 * que decidir si se toca, si tiene su propia divisoria y qué pasa cuando son
 * tres renglones. Va fuera, alineada con el texto de las filas, en el tono
 * secundario. Es como se explica un interruptor sin ensuciar la lista.
 */
function SectionNote({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn('mt-2 px-4 text-[12.5px] leading-snug text-adm-text-3', className)}
      {...props}
    />
  );
}

export { Section, SectionNote };
