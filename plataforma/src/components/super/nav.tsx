'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from '@/components/admin/logout-button';
import AdminThemeToggle from '@/components/admin/theme-toggle';
import { LeoginMark } from '@/components/leogin-logo';

export default function SuperNav() {
  const pathname = usePathname();

  const links = [
    { href: '/super/restaurantes', label: 'Restaurantes' },
    { href: '/super/grupos', label: 'Grupos' },
    { href: '/super/metricas', label: 'Métricas' },
    { href: '/super/cobros', label: 'Cobros' },
    { href: '/super/configuracion', label: 'Configuración' },
  ];

  return (
    <header
      className="glass-solid"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        borderRadius: 0,
        borderLeft: 'none',
        borderRight: 'none',
        borderTop: 'none',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 52,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        <LeoginMark size={22} />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '-0.01em',
            color: 'var(--brand-accent)',
          }}
        >
          Super Admin
        </span>
      </span>

      <nav
        className="super-nav-scroll"
        style={{
          display: 'flex', gap: 4, flex: 1,
          overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {links.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="press"
              style={{
                padding: '6px 13px',
                borderRadius: 'var(--radius-full)',
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flex: '0 0 auto',
                background: active ? 'color-mix(in srgb, var(--u-text) 10%, transparent)' : 'transparent',
                color: active ? 'var(--u-text)' : 'var(--u-text-3)',
                border: active ? '1px solid var(--u-hair-2)' : '1px solid transparent',
                transition: 'all 150ms',
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* El super admin comparte la cookie `admin-theme` con el panel de los
          restaurantes (dominio ancho): sin este botón, si dejabas el panel en
          claro, /super quedaba claro sin forma de volver a oscuro desde aquí. */}
      <AdminThemeToggle />
      <LogoutButton />
    </header>
  );
}
