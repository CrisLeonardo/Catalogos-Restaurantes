'use client';

/* Shell del SUPER ADMIN — sidebar + topbar en escritorio; en móvil la barra
   inferior tipo app. Reutiliza el sistema del panel admin rediseñado
   (.admin-shell/.admin-sidebar/.admin-topbar + tokens --adm-*), para que
   /super hable el mismo idioma visual que /admin. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import LogoutButton from '@/components/admin/logout-button';
import AdminThemeToggle from '@/components/admin/theme-toggle';
import { LeoginMark } from '@/components/leogin-logo';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import CapsuleNavigation, { type CapsuleDestination } from '@/components/ui/capsule-navigation';
import { HojaOperativa } from '@/components/ui/hoja-operativa';

/* `corto`: etiqueta de la cápsula móvil. Tres destinos frecuentes quedan
   a la vista; Más conserva el acceso a los cuatro restantes. */
const NAV: { href: string; label: string; icon: string; corto?: string }[] = [
  { href: '/super',               label: 'Inicio',        icon: 'home' },
  { href: '/super/restaurantes',  label: 'Restaurantes',  icon: 'utensils', corto: 'Locales' },
  // El panel entra por el restaurante en todas partes menos aquí. Esta es la
  // misma información por el otro lado —la persona— que es como llega un
  // problema de acceso: un nombre y un correo, sin saber de qué local.
  { href: '/super/cuentas',       label: 'Cuentas',       icon: 'user' },
  { href: '/super/grupos',        label: 'Grupos',        icon: 'users' },
  { href: '/super/metricas',      label: 'Métricas',      icon: 'chart' },
  { href: '/super/finanzas',      label: 'Finanzas',      icon: 'wallet' },
  // «Ajustes» en todas partes, como en el panel: era «Configuración» en
  // escritorio y «Ajustes» en el teléfono (auditoría 2026-10-02, SUP-02).
  { href: '/super/configuracion', label: 'Ajustes',       icon: 'settings' },
];

const TITLES: [string, string][] = [
  ['/super/restaurantes/new', 'Nuevo restaurante'],
  ['/super/restaurantes',     'Restaurantes'],
  ['/super/cuentas',          'Cuentas'],
  ['/super/grupos',           'Grupos'],
  ['/super/metricas',         'Métricas'],
  ['/super/finanzas',         'Finanzas'],
  ['/super/cobros',           'Finanzas'],
  ['/super/configuracion',    'Ajustes'],
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/super') return pathname === '/super';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function SuperShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const title = pathname === '/super'
    ? 'Inicio'
    : TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Super Admin';
  const primary = NAV.slice(0, 3);
  const secondary = NAV.slice(3);
  const current = NAV.find((item) => isActive(pathname, item.href))
    ?? (pathname.startsWith('/super/cobros') ? NAV.find((item) => item.href === '/super/finanzas') : undefined);
  const active = current && primary.includes(current) ? current.href : current ? 'more' : '';
  const mobileItems: CapsuleDestination[] = [
    ...primary.map((item) => ({ key: item.href, label: item.corto ?? item.label, icon: item.icon, href: item.href })),
    { key: 'more', label: 'Más', icon: 'more', onSelect: () => setMoreOpen(true), expanded: moreOpen },
  ];

  return (
    <ToastProvider>
    <div className="admin-shell super-shell">
      <aside className="admin-sidebar">
        <Link
          href="/super"
          className="admin-brand press"
          /* Sin `display` en línea: `.admin-brand` ya es flex, y el teléfono
             la apaga desde la hoja de estilos — un `display: flex` aquí le
             ganaba y la marca salía encima de la barra de título. */
          style={{ textDecoration: 'none', color: 'inherit' }}
          title="Ir al inicio"
        >
          <div
            style={{
              width: 42, height: 42, flexShrink: 0,
              borderRadius: 'calc(12px * var(--admin-panel-radius, 1))',
              background: 'var(--adm-card, color-mix(in srgb, var(--u-text) 6%, transparent))',
              border: '1px solid var(--u-hair)', boxShadow: 'var(--adm-shadow-xs, none)',
              display: 'grid', placeItems: 'center',
            }}
          >
            <LeoginMark size={24} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--u-text)', lineHeight: 1, whiteSpace: 'nowrap' }}>
              Leogin
            </div>
            <div className="t-kicker" style={{ fontSize: 11, marginTop: 3, color: 'var(--brand-accent-ink)' }}>
              Super Admin
            </div>
          </div>
        </Link>

        {/* En escritorio se conservan todos los destinos en la barra lateral. */}
        <nav className="admin-nav super-desktop-nav" aria-label="Navegación de superadmin">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="admin-navlink press"
              data-active={isActive(pathname, n.href) ? '1' : '0'}
              aria-current={current === n ? 'page' : undefined}
            >
              <Icon name={n.icon} size={18} />
              <span className="nav-label">
                <span className={n.corto ? 'nav-largo' : undefined}>{n.label}</span>
                {n.corto && <span className="nav-corto">{n.corto}</span>}
              </span>
            </Link>
          ))}
        </nav>

        <div className="glass-quiet admin-usercard" style={{ borderRadius: 'var(--radius-lg)', padding: 12 }}>
          <div className="admin-usericon" style={{ width: 34, height: 34, borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--brand-accent) 16%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--brand-accent-ink)', flexShrink: 0 }}>
            <Icon name="key" size={16} />
          </div>
          <div className="admin-usermeta" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Super Admin
            </div>
            <div style={{ fontSize: 11, color: 'var(--u-text-3)' }}>Toda la plataforma</div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <h1 className="t-display" style={{ fontSize: 22, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </h1>
          <AdminThemeToggle />
          {/* En el teléfono la tarjeta de usuario (con «Salir») se apaga
              junto con la barra lateral, y aquí no hay menú «⋯» que la
              recoja: sin esto no había forma de cerrar sesión. */}
          <span className="super-mobile-only"><LogoutButton /></span>
        </div>
        <div className="admin-content">
          <div style={{ maxWidth: 1160, margin: '0 auto', width: '100%' }}>{children}</div>
        </div>
      </div>
      <CapsuleNavigation items={mobileItems} active={active} label="Navegación de superadmin" mobileOnly />
      {moreOpen && <HojaOperativa label="Más destinos de superadmin" onClose={() => setMoreOpen(false)}
        footer={<button type="button" className="btn-tinted tap44" onClick={() => setMoreOpen(false)}>Cerrar</button>}>
        <div className="super-mobile-destinations">
          {secondary.map((item) => <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
            aria-current={current === item ? 'page' : undefined}>
            <Icon name={item.icon} size={22} /><span>{item.label}</span>
          </Link>)}
        </div>
      </HojaOperativa>}
    </div>
    <Toaster />
    </ToastProvider>
  );
}
