import * as React from 'react';

import { cn } from '@/lib/utils';
import { Rodillo } from '@/components/ui/rodillo';

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
  // `toArray` y no `count`: `count` también cuenta los `false`/`null` de un
  // `{cond && <Stat …/>}`, y cada uno abría una columna vacía.
  const n = React.Children.toArray(children).length;

  return (
    <div
      data-slot="stat-group"
      className={cn(
        'grid grid-cols-2 overflow-hidden rounded-adm-xl border border-adm-border bg-adm-card shadow-adm-sm',
        // Teléfono — dos columnas: la divisoria vertical va en las cifras
        // pares y la horizontal, de la tercera en adelante. Una cifra impar
        // que quede sola al final ocupa el renglón entero en vez de dejar
        // medio hueco.
        //
        // Van con `max-md:` A PROPÓSITO. Sin él, `[&>*:last-child:nth-child(odd)]`
        // pesa más (tres pseudoclases) que el `md:[&>*]:col-span-1` de abajo y
        // ganaba también en escritorio: con tres cifras, la tercera pedía dos
        // columnas, no cabía en la que quedaba y saltaba de renglón — Hoy a
        // 1440 px enseñaba «Ventas | Pedidos» arriba, «Ticket promedio» abajo y
        // un tercio de la tarjeta vacío (auditoría 2026-10-02, T-06).
        'max-md:[&>*:nth-child(even)]:border-l max-md:[&>*:nth-child(n+3)]:border-t',
        'max-md:[&>*:last-child:nth-child(odd)]:col-span-2',
        '[&>*]:border-adm-border',
        // Escritorio — una columna por cifra y una sola divisoria vertical.
        'md:[grid-template-columns:repeat(var(--stat-n),minmax(0,1fr))]',
        'md:[&>*+*]:border-l',
        className
      )}
      /* Con 5 o más cifras en una fila, cada celda mide ~190 px a 1440 y un
         importe con separador de miles («Q2,794.10») a 28 px se cortaba con
         «…» (Finanzas tiene seis). Ahí la cifra baja a 22 px. */
      style={{ ...style, ['--stat-n' as string]: n, ['--stat-fs' as string]: n >= 5 ? '22px' : '28px' }}
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
  label, value, tone, sub, className, ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: StatTone;
  /** Una línea corta debajo de la cifra: con qué compararla («↑ 12 % vs. un viernes normal»). */
  sub?: React.ReactNode;
}) {
  return (
    <div data-slot="stat" className={cn('min-w-0 px-4 py-3.5 md:px-5.5 md:py-4.5', className)} {...props}>
      <div className="text-[13px] text-adm-text-3 md:text-[13px]">{label}</div>
      {/* En el teléfono la cifra baja a 23 px: con dos columnas, un importe
          como "Q7,920.00" a 28 px se sale de su celda. */}
      <div
        className="t-mono mt-1.5 truncate text-[22px] leading-tight font-semibold text-adm-text md:text-[length:var(--stat-fs,28px)]"
        style={tone ? { color: TONE_COLOR[tone] } : undefined}
      >
        {/* Rueda hasta su valor como una caja registradora (ui/rodillo.tsx). */}
        {typeof value === 'string' ? <Rodillo texto={value} /> : value}
      </div>
      {/* Hasta dos renglones: la comparación de Negocio › Resumen
          («↑ 46 % vs. los 7 días anteriores») no cabía en una cifra de media
          pantalla del teléfono y se cortaba a la mitad de la frase. */}
      {sub && <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-adm-text-3">{sub}</div>}
    </div>
  );
}

/* ============================================================
   FRANJA DE CIFRAS (auditoría 2026-10-02, PED-01)
   ------------------------------------------------------------
   En una pantalla de OPERACIÓN (Pedidos) lo primero son los pedidos.
   Cuatro cifras en rejilla de dos más tres de «Tiempos de hoy» eran
   ~640 px de scroll en el teléfono antes de ver el primero. Aquí van
   las mismas cifras en UNA línea que se desplaza de lado: el número en
   la mono del panel y una palabra al lado.
   ============================================================ */
type StripItem = { value: React.ReactNode; label: string; tone?: StatTone };

function StatStrip({ items, className }: { items: StripItem[]; className?: string }) {
  return (
    <div
      data-slot="stat-strip"
      className={cn(
        'u-noscroll flex items-baseline gap-x-4 overflow-x-auto whitespace-nowrap rounded-adm-xl border border-adm-border bg-adm-card px-4 py-2.5 shadow-adm-sm',
        className
      )}
    >
      {items.map((it, i) => (
        <span key={i} className="inline-flex shrink-0 items-baseline gap-1.5">
          <span
            className="t-mono text-[16px] font-semibold text-adm-text"
            style={it.tone ? { color: TONE_COLOR[it.tone] } : undefined}
          >
            {it.value}
          </span>
          <span className="text-[12px] text-adm-text-3">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

export { Stat, StatGroup, StatStrip };
