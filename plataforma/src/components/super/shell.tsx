'use client';

/* Shell del SUPER ADMIN — sidebar + topbar en escritorio; en móvil la barra
   inferior tipo app. Reutiliza el sistema del panel admin rediseñado
   (.admin-shell/.admin-sidebar/.admin-topbar + tokens --adm-*), para que
   /super hable el mismo idioma visual que /admin. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import LogoutButton from '@/components/admin/logout-button';
import AdminThemeToggle from '@/components/admin/theme-toggle';
import { LeoginMark } from '@/components/leogin-logo';
import { ToastProvider, Toaster } from '@/components/ui/toast';

/* `corto`: la etiqueta en la barra inferior del teléfono, donde siete
   destinos se reparten 375 px (≈53 cada uno) y «Restaurantes» o
   «Configuración» salían cortados a «Restaur…». */
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
  { href: '/super/configuracion', label: 'Configuración', icon: 'settings', corto: 'Ajustes' },
];

const TITLES: [string, string][] = [
  ['/super/restaurantes/new', 'Nuevo restaurante'],
  ['/super/restaurantes',     'Restaurantes'],
  ['/super/cuentas',          'Cuentas'],
  ['/super/grupos',           'Grupos'],
  ['/super/metricas',         'Métricas'],
  ['/super/finanzas',         'Finanzas'],
  ['/super/cobros',           'Finanzas'],
  ['/super/configuracion',    'Configuración'],
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/super') return pathname === '/super';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function SuperShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = pathname === '/super'
    ? 'Inicio'
    : TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Super Admin';

  return (
    <ToastProvider>
    <div className="admin-shell">
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
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14.5, color: 'var(--u-text)', lineHeight: 1, whiteSpace: 'nowrap' }}>
              Leogin
            </div>
            <div className="t-kicker" style={{ fontSize: 11, marginTop: 3, color: 'var(--brand-accent-ink)' }}>
              Super Admin
            </div>
          </div>
        </Link>

        {/* Los enlaces van DIRECTOS en el nav, como en el panel del
            restaurante: la barra inferior del teléfono los reparte en una
            fila, y metidos en un `div` se apilaban en columna — siete
            destinos, 314 px de barra, un tercio de la pantalla tapado. */}
        <nav className="admin-nav">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="admin-navlink press"
              data-active={isActive(pathname, n.href) ? '1' : '0'}
            >
              <Icon name={n.icon} size={18} />
              <span className="nav-label">
                <span className={n.corto ? 'nav-largo' : undefined}>{n.label}</span>
                {n.corto && <span className="nav-corto">{n.corto}</span>}
              </span>
            </Link>
          ))}
        </nav>

        <div className="glass-quiet admin-usercard" style={{ borderRadius: 13, padding: 12 }}>
          <div className="admin-usericon" style={{ width: 34, height: 34, borderRadius: 99, background: 'color-mix(in srgb, var(--brand-accent) 16%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--brand-accent-ink)', flexShrink: 0 }}>
            <Icon name="key" size={16} />
          </div>
          <div className="admin-usermeta" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Super Admin
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--u-text-3)' }}>Toda la plataforma</div>
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
    </div>
    <Toaster />
    </ToastProvider>
  );
}
