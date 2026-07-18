'use client';

/* Pestañas genéricas de sección (server-safe no puede: usa usePathname).
   Mismo lenguaje visual que las pestañas de la ficha de restaurante. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';

export interface SectionTab {
  /** Segmento de la sub-ruta ('' = índice). */
  seg: string;
  label: string;
  icon: string;
}

export default function SectionTabs({ base, tabs }: { base: string; tabs: SectionTab[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones"
      style={{
        display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2,
        borderBottom: '1px solid var(--adm-border, var(--u-hair))',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map((t) => {
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
