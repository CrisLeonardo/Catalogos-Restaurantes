import * as React from 'react';

import { cn } from '@/lib/utils';

/* ============================================================
   NÚMEROS — la fila de cifras del panel (Fase 2)
   ------------------------------------------------------------
   Una sola tarjeta dividida en columnas, no una tarjeta por cifra:
   tres números del mismo asunto son un solo objeto.

   El valor va SIEMPRE en la mono del panel con cifras tabulares
   (`.t-mono`). No es un capricho tipográfico: con cifras tabulares
   todos los dígitos ocupan lo mismo, así que las cantidades quedan
   alineadas entre columnas y entre filas sin tocar nada, y un
   número no "baila" al actualizarse en vivo.
   ============================================================ */

function StatGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="stat-group"
      className={cn(
        'grid overflow-hidden rounded-adm-xl border border-adm-border bg-adm-card shadow-adm-sm',
        // La línea entre columnas la pone el contenedor, igual que en List.
        '[&>*+*]:border-l [&>*+*]:border-adm-border',
        className
      )}
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}
      {...props}
    />
  );
}

/** Un número puede pedir atención (existencias bajas, algo agotado). El color
 *  va en el VALOR, no en el fondo: tiñe el dato, no la tarjeta entera. */
type StatTone = 'warn' | 'danger';

const TONE_COLOR: Record<StatTone, string> = {
  warn: 'var(--c-warn)',
  danger: 'var(--c-danger)',
};

function Stat({
  label, value, tone, className, ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: StatTone;
}) {
  return (
    <div data-slot="stat" className={cn('px-5.5 py-4.5', className)} {...props}>
      <div className="text-[13.5px] text-adm-text-3">{label}</div>
      <div
        className="t-mono mt-1.5 text-[28px] leading-tight font-semibold text-adm-text"
        style={tone ? { color: TONE_COLOR[tone] } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

export { Stat, StatGroup };
