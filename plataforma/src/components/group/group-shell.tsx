'use client';

/* GroupShell — shell del panel de grupo (/central). Reutiliza las clases
   .admin-* para heredar el layout responsive (sidebar + tab bar móvil). */

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import AdminThemeToggle from '@/components/admin/theme-toggle';
import OfflineSupport from '@/components/offline-support';
import { logoutGroup } from '@/lib/actions/auth';
import { ToastProvider, Toaster } from '@/components/ui/toast';

interface Props {
  orgName: string;
  logoUrl?: string | null;
  branchCount: number;
  children: React.ReactNode;
}

const NAV = [
  { href: '/central', label: 'Resumen', icon: 'dashboard' },
  { href: '/central/sucursales', label: 'Sucursales', icon: 'box' },
  { href: '/central/comparativa', label: 'Comparativa', icon: 'chart' },
  { href: '/central/finanzas', label: 'Finanzas', icon: 'wallet' },
];

const TITLES: Record<string, string> = {
  '/central/sucursales': 'Sucursales',
  '/central/comparativa': 'Comparativa',
  '/central/finanzas': 'Finanzas del grupo',
  '/central': 'Resumen del grupo',
};

export default function GroupShell({ orgName, logoUrl, branchCount, children }: Props) {
  const pathname = usePathname();
  const title = Object.entries(TITLES).find(([p]) => pathname === p || pathname.startsWith(p + '/'))?.[1]
    ?? (pathname === '/central' ? 'Resumen del grupo' : 'Grupo');
  const initial = orgName.trim().charAt(0).toUpperCase() || 'G';

  return (
    <ToastProvider>
    <div className="admin-shell">
      <OfflineSupport />
      <aside className="admin-sidebar">
        <div className="admin-brand" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', display: 'grid', placeItems: 'center', border: '1px solid var(--u-hair)', overflow: 'hidden', flexShrink: 0 }}>
            {logoUrl ? (
              <Image src={logoUrl} alt={orgName} width={42} height={42} style={{ objectFit: 'contain' }} />
            ) : (
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--u-text)' }}>{initial}</span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14.5, color: 'var(--u-text)', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{orgName}</div>
            <div className="t-kicker" style={{ fontSize: 9.5, marginTop: 3 }}>Grupo · {branchCount} sucursal{branchCount === 1 ? '' : 'es'}</div>
          </div>
        </div>

        <nav className="admin-nav">
          <div className="admin-navgroup">
            <div className="t-kicker admin-navgroup-title" style={{ fontSize: 9.5, padding: '4px 10px' }}>Panel del grupo</div>
            {NAV.map((n) => {
              const active = n.href === '/central' ? pathname === '/central' : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className="admin-navlink press" data-active={active ? '1' : '0'}>
                  <Icon name={n.icon} size={18} />
                  <span className="nav-label">{n.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="admin-spacer" style={{ flex: 1 }} />

        {/* Puente hacia Mi cuenta (migración 113). El dueño de una cadena
            tenía dos hogares sin relación: este panel y la lista de sus
            restaurantes. Desde aquí se llega al otro — y desde el otro, a
            este. El rol GROUP_OWNER se retiró después, en la migración 116:
            quien administra la cadena se reconoce por su organización. */}
        <a
          href="/mi-cuenta"
          className="press glass-quiet"
          style={{
            display: 'flex', alignItems: 'center', gap: 9, borderRadius: 13,
            padding: '10px 12px', marginBottom: 8, textDecoration: 'none',
          }}
        >
          <Icon name="bag" size={15} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)' }}>
            Mis restaurantes
          </span>
          <Icon name="chevronRight" size={14} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
        </a>

        <div className="glass-quiet admin-usercard" style={{ borderRadius: 13, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="admin-usericon" style={{ width: 34, height: 34, borderRadius: 99, background: 'color-mix(in srgb, var(--u-text) 10%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
            <Icon name="user" size={17} />
          </div>
          <div className="admin-usermeta" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--u-text)' }}>Dueño de grupo</div>
            <div style={{ fontSize: 10.5, color: 'var(--u-text-3)' }}>Sesión activa</div>
          </div>
          <form action={logoutGroup}>
            <button type="submit" className="press glass-quiet" title="Cerrar sesión" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', cursor: 'pointer' }}>
              <Icon name="logOut" size={16} />
            </button>
          </form>
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <h1 className="t-display" style={{ fontSize: 22, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          <AdminThemeToggle />
        </div>
        <div className="admin-content">{children}</div>
      </div>
    </div>
    <Toaster />
    </ToastProvider>
  );
}
