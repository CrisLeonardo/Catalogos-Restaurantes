import * as React from 'react';
/* `Link` es aquí `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la página (`/admin/qr` → `/panel/<slug>/qr`). Con `next/link`
   a secas, el botón de CADA pantalla vacía del panel —"Comparte tu código
   QR", "Agregá tu primer platillo"— sacaba del panel a quien entró por el
   origen único. Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';

import { Icon } from '@/components/icons';
import { Leo } from '@/components/leo';
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

   Leo la acompaña señalando el botón (estrategia §6.2, fase D): una caja
   vacía con alguien que te dice «empieza aquí» se siente como el primer
   paso, no como un error. Leo es de Leogin y esto solo se usa en el panel;
   en el menú de un restaurante no aparece nunca.
   ============================================================ */

/** La acción puede navegar (`href`) o abrir un editor en la misma pantalla
 *  (`onClick`); lo que NO puede es faltar. */
type Action = {
  label: string;
  /** Icono del botón. Por defecto «+» (casi siempre la acción es crear algo);
   *  `null` para una acción que solo lleva a otro sitio. */
  icon?: string | null;
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

interface Props {
  /** Nombre del icono (ver components/icons). Uno solo, sin color. */
  icon?: string;
  title: string;
  desc: string;
  action: Action;
  className?: string;
}

/** Id estable para los degradados del SVG de Leo, sacado del título: dos
 *  pantallas vacías en la misma página no comparten título. */
function leoId(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  return `leo-vacio-${(h >>> 0).toString(36)}`;
}

function EmptyState({ icon, title, desc, action, className }: Props) {
  const actionClass =
    'btn-accent press mt-2 inline-flex min-h-11 items-center gap-2 rounded-adm-md border-0 px-4 text-[13px] font-semibold no-underline';
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center gap-2.5 rounded-adm-xl border border-adm-border bg-adm-card px-6 py-9 text-center shadow-adm-sm',
        className
      )}
    >
      <span className="relative mb-1 block size-[72px]">
        <Leo id={leoId(title)} expresion="senala" className="block size-full" />
        {icon && (
          <span className="absolute -right-3 bottom-1 grid size-7 place-items-center rounded-full border border-adm-border bg-adm-card text-adm-text-3 shadow-adm-sm">
            <Icon name={icon} size={14} />
          </span>
        )}
      </span>
      <div className="text-[15px] font-semibold text-adm-text">{title}</div>
      <p className="max-w-[46ch] text-[13px] leading-snug text-adm-text-3">{desc}</p>
      {action.href ? (
        <Link href={action.href} className={actionClass}>
          {action.icon !== null && <Icon name={action.icon ?? 'plus'} size={15} />}
          {action.label}
        </Link>
      ) : (
        <button type="button" onClick={action.onClick} className={actionClass}>
          {action.icon !== null && <Icon name={action.icon ?? 'plus'} size={15} />}
          {action.label}
        </button>
      )}
    </div>
  );
}

export { EmptyState };
