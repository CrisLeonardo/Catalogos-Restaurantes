import * as React from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

/* ============================================================
   LISTA AGRUPADA — la pieza base del panel (rediseño, Fase 2)
   ------------------------------------------------------------
   Una tarjeta con filas separadas por un pelo de línea. Sustituye
   al patrón de "una tarjeta suelta por cada cosa": cinco tarjetas
   flotando son cinco bordes, cinco sombras y cinco decisiones de
   espaciado; una lista de cinco filas es un solo objeto que el ojo
   recorre de arriba abajo.

   La divisoria la pone el CONTENEDOR entre hijos consecutivos, no
   cada fila: así ninguna fila necesita saber si es la primera o la
   última, y agregar, quitar o reordenar filas nunca deja una línea
   huérfana arriba o abajo.
   ============================================================ */

function List({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list"
      className={cn(
        'overflow-hidden rounded-adm-xl border border-adm-border bg-adm-card shadow-adm-sm',
        '[&>*+*]:border-t [&>*+*]:border-adm-border',
        className
      )}
      {...props}
    />
  );
}

/** Alto mínimo 44px: es el objetivo táctil mínimo, y el panel se usa en
 *  tablet sobre el mostrador tanto como con ratón. */
const rowClass = 'flex w-full items-center gap-3.5 px-4 py-3.5 text-left min-h-11';

function ListRow({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="list-row" className={cn(rowClass, className)} {...props} />;
}

/** Fila que navega. Es un <Link>, no un div con onClick: se puede abrir en
 *  otra pestaña, se anuncia como enlace y funciona sin JavaScript. */
function ListLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      data-slot="list-link"
      className={cn(
        rowClass,
        'text-inherit no-underline transition-colors hover:bg-adm-card-hover',
        'focus-visible:ring-2 focus-visible:ring-adm-accent-500/40 focus-visible:outline-none',
        className
      )}
      {...props}
    />
  );
}

/** Celda de texto de una fila: título y, si hace falta, una línea de apoyo.
 *  Se encoge antes que los números y el estado, que son de ancho fijo. */
function ListText({
  title, desc, className, ...props
}: React.ComponentProps<'div'> & { title: React.ReactNode; desc?: React.ReactNode }) {
  return (
    <div className={cn('min-w-0 flex-1', className)} {...props}>
      <div className="text-[14.5px] font-medium text-adm-text">{title}</div>
      {desc && <div className="mt-0.5 text-[13px] leading-snug text-adm-text-3">{desc}</div>}
    </div>
  );
}

/** Los cinco tonos que usa el panel. El color es SEMÁNTICO, no decorativo:
 *  ok = hay que actuar ya, warn = está en proceso, accent = acaba de entrar,
 *  danger = algo se rompió, neutral = informativo, no urgente. */
type Tone = 'accent' | 'ok' | 'warn' | 'danger' | 'neutral';

const TONE_COLOR: Record<Tone, string> = {
  accent: 'var(--adm-accent-500)',
  ok: 'var(--c-ok)',
  warn: '#fb923c',
  danger: 'var(--c-danger)',
  neutral: 'var(--u-text-4)',
};

function StatusDot({ tone = 'neutral', size = 7 }: { tone?: Tone; size?: number }) {
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-adm-full"
      style={{ width: size, height: size, background: TONE_COLOR[tone] }}
    />
  );
}

/** Punto + palabra. El punto solo nunca dice el estado: el texto es el que
 *  informa, y quien no distingue los colores lee exactamente lo mismo. */
function StatusPill({ tone = 'neutral', children, className }: {
  tone?: Tone; children: React.ReactNode; className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[13px] text-adm-text-2', className)}>
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

export { List, ListRow, ListLink, ListText, StatusDot, StatusPill, type Tone };
