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

function StatGroup({ className, children, style, ...props }: React.ComponentProps<'div'>) {
  /* Cuántas cifras hay. Se cuenta para poder darle a la rejilla un número
     EXACTO de columnas en escritorio, en vez de `auto-fit`.

     Con `auto-fit` la rejilla decidía sola cuántas columnas caben, y la
     divisoria («borde izquierdo a todo hijo que no sea el primero») no tenía
     forma de saber cuáles de esos hijos habían quedado al PRINCIPIO de un
     renglón nuevo. En un teléfono, tres cifras se repartían en 2 + 1 y la
     tercera —sola, abajo, sin nada a su izquierda— arrastraba igual su borde:
     una rayita suelta flotando. Sabiendo el número de columnas, la regla de
     la divisoria se puede escribir bien para cada tamaño. */
  const n = React.Children.count(children);

  return (
    <div
      data-slot="stat-group"
      className={cn(
        'grid grid-cols-2 overflow-hidden rounded-adm-xl border border-adm-border bg-adm-card shadow-adm-sm',
        // Teléfono — dos columnas: la divisoria vertical va en las cifras
        // pares y la horizontal, de la tercera en adelante. Una cifra impar
        // que quede sola al final ocupa el renglón entero en vez de dejar
        // medio hueco.
        '[&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t',
        '[&>*:last-child:nth-child(odd)]:col-span-2',
        '[&>*]:border-adm-border',
        // Escritorio — una columna por cifra y una sola divisoria vertical.
        'md:[grid-template-columns:repeat(var(--stat-n),minmax(0,1fr))]',
        'md:[&>*]:col-span-1 md:[&>*]:border-t-0 md:[&>*]:border-l-0 md:[&>*+*]:border-l',
        className
      )}
      style={{ ...style, ['--stat-n' as string]: n }}
      {...props}
    >
      {children}
    </div>
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
    <div data-slot="stat" className={cn('min-w-0 px-4 py-3.5 md:px-5.5 md:py-4.5', className)} {...props}>
      <div className="text-[13px] text-adm-text-3 md:text-[13.5px]">{label}</div>
      {/* En el teléfono la cifra baja a 23 px: con dos columnas, un importe
          como "Q7,920.00" a 28 px se sale de su celda. */}
      <div
        className="t-mono mt-1.5 truncate text-[23px] leading-tight font-semibold text-adm-text md:text-[28px]"
        style={tone ? { color: TONE_COLOR[tone] } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

export { Stat, StatGroup };
