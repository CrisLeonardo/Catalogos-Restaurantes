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

  return (
    <nav
      aria-label="Secciones del restaurante"
      style={{
        display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2,
        borderBottom: '1px solid var(--adm-border, var(--u-hair))',
        scrollbarWidth: 'none',
      }}
    >
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const active = t.seg
          ? pathname === href || pathname.startsWith(href + '/')
          : pathname === base;
        return (
          <Link
            key={t.seg}
            href={href}
            className="press"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 14px', borderRadius: '10px 10px 0 0',
              fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? 'var(--brand-accent)' : 'var(--u-text-3)',
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              borderBottom: active ? '2px solid var(--brand-accent)' : '2px solid transparent',
              marginBottom: -3,
              background: active ? 'color-mix(in srgb, var(--brand-accent) 7%, transparent)' : 'transparent',
              transition: 'color 140ms, background 140ms',
            }}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
