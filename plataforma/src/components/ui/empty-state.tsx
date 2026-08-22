import * as React from 'react';
import Link from 'next/link';

import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';

/* ============================================================
   PANTALLA VACÍA (Fase 2)
   ------------------------------------------------------------
   "No hay productos." y ahí terminaba: el usuario nuevo se queda
   mirando una caja vacía sin saber qué se espera de él.

   Una pantalla vacía es la mejor oportunidad de enseñar, así que
   esta pieza obliga a las tres cosas que hacen falta: qué falta,
   por qué vale la pena, y el botón para hacerlo. `action` no es
   opcional a propósito.
   ============================================================ */

/** La acción puede navegar (`href`) o abrir un editor en la misma pantalla
 *  (`onClick`); lo que NO puede es faltar. */
type Action = { label: string } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

interface Props {
  /** Nombre del icono (ver components/icons). Uno solo, sin color. */
  icon?: string;
  title: string;
  desc: string;
  action: Action;
  className?: string;
}

function EmptyState({ icon, title, desc, action, className }: Props) {
  const actionClass =
    'btn-accent press mt-2 inline-flex min-h-11 items-center gap-2 rounded-adm-md border-0 px-4 text-[13.5px] font-semibold no-underline';
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center gap-2.5 rounded-adm-xl border border-adm-border bg-adm-card px-6 py-9 text-center shadow-adm-sm',
        className
      )}
    >
      {icon && (
        <span className="mb-1 grid size-11 place-items-center rounded-adm-lg bg-adm-bg-2 text-adm-text-3">
          <Icon name={icon} size={20} />
        </span>
      )}
      <div className="text-[15px] font-semibold text-adm-text">{title}</div>
      <p className="max-w-[46ch] text-[13.5px] leading-snug text-adm-text-3">{desc}</p>
      {action.href ? (
        <Link href={action.href} className={actionClass}>
          <Icon name="plus" size={15} />
          {action.label}
        </Link>
      ) : (
        <button type="button" onClick={action.onClick} className={actionClass}>
          <Icon name="plus" size={15} />
          {action.label}
        </button>
      )}
    </div>
  );
}

export { EmptyState };
