'use client';

/* Pestañas de la ficha de restaurante del Super Admin.
   Cada pestaña es una sub-ruta real (/super/restaurantes/[id]/...):
   la página carga solo lo suyo y el URL se puede compartir/enlazar
   directo (p. ej. desde una alerta de cobro → pestaña Cobro). */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';

const TABS: { seg: string; label: string; icon: string }[] = [
  { seg: '',            label: 'Resumen',        icon: 'dashboard' },
  { seg: 'informacion', label: 'Información',    icon: 'list' },
  { seg: 'plan',        label: 'Plan y módulos', icon: 'sparkle' },
  { seg: 'cobro',       label: 'Cobro',          icon: 'wallet' },
  { seg: 'apariencia',  label: 'Apariencia',     icon: 'image' },
  { seg: 'accesos',     label: 'Accesos',        icon: 'users' },
  { seg: 'avanzado',    label: 'Avanzado',       icon: 'settings' },
];

export default function FichaTabs({ restaurantId }: { restaurantId: string }) {
  const pathname = usePathname();
  const base = `/super/restaurantes/${restaurantId}`;

  /* El control segmentado del panel (`.admin-tabs` + `.adm-tabs-page`),
     como en Pedidos y en las pantallas con pestañas (T-07 / D-8): era una
     fila subrayada en acento, otro estilo de pestaña más. */
  return (
    <nav aria-label="Secciones del restaurante" className="admin-tabs adm-tabs-page">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const active = t.seg
          ? pathname === href || pathname.startsWith(href + '/')
          : pathname === base;
        return (
          <Link
            key={t.seg}
            href={href}
            className="admin-tab press"
            data-active={active ? '1' : '0'}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
