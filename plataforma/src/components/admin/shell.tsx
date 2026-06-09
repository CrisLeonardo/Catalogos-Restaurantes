'use client';

/* Shell del panel admin — sidebar + topbar, estilo del prototipo (AdminApp.jsx).
   Envuelve todas las páginas de /admin. */

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import LogoutButton from '@/components/admin/logout-button';

interface Props {
  restaurantName: string;
  ordersEnabled?: boolean;
  logoUrl?: string | null;
  zone?: string;
  children: React.ReactNode;
}

export default function AdminShell({ restaurantName, ordersEnabled = false, logoUrl, zone, children }: Props) {
  const pathname = usePathname();

  const nav = [
    ...(ordersEnabled ? [{ href: '/admin/pedidos',    label: 'Pedidos',     icon: 'list'  }] : []),
    { href: '/admin/menu',        label: 'Catálogo',    icon: 'bag'   },
    { href: '/admin/categorias',  label: 'Categorías',  icon: 'tag'   },
    { href: '/admin/perfil',      label: 'Perfil',      icon: 'user'  },
    { href: '/admin/qr',          label: 'QR',          icon: 'image' },
  ];

  const title =
    pathname.startsWith('/admin/pedidos')    ? 'Pedidos en vivo'
    : pathname.startsWith('/admin/categorias') ? 'Categorías'
    : pathname.startsWith('/admin/menu/productos') ? 'Producto'
    : pathname.startsWith('/admin/menu')     ? 'Catálogo'
    : pathname.startsWith('/admin/perfil')   ? 'Perfil'
    : pathname.startsWith('/admin/qr')       ? 'Código QR'
    : 'Panel';

  const isLive = pathname.startsWith('/admin/pedidos');
  const initial = restaurantName.trim().charAt(0).toUpperCase() || '·';

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 6px 14px' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', border: '1px solid var(--u-hair)', overflow: 'hidden', flexShrink: 0 }}>
            {logoUrl ? (
              <Image src={logoUrl} alt={restaurantName} width={42} height={42} style={{ objectFit: 'contain' }} unoptimized />
            ) : (
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--u-text)' }}>{initial}</span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14.5, color: 'var(--u-text)', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{restaurantName}</div>
            <div className="t-kicker" style={{ fontSize: 9.5, marginTop: 3 }}>Panel{zone ? ` · ${zone}` : ''}</div>
          </div>
        </div>

        <div className="t-kicker admin-section" style={{ fontSize: 9.5, padding: '4px 10px' }}>Operación</div>

        {nav.map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className="admin-navlink press" data-active={active ? '1' : '0'}>
              <Icon name={n.icon} size={18} />
              <span style={{ flex: 1 }}>{n.label}</span>
            </Link>
          );
        })}

        <div className="admin-spacer" style={{ flex: 1 }} />

        <div className="glass-quiet" style={{ borderRadius: 13, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 99, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
            <Icon name="user" size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Administrador</div>
            <div style={{ fontSize: 10.5, color: 'var(--u-text-3)' }}>Sesión activa</div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main */}
      <div className="admin-main">
        <div className="admin-topbar">
          <h1 className="t-display" style={{ fontSize: 22, flex: 1 }}>{title}</h1>
          {isLive && (
            <span className="glass-quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 99, fontSize: 12, fontWeight: 600, color: 'var(--u-text-2)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--u-text)', boxShadow: '0 0 8px var(--u-text)', animation: 'pulse-ring 2s infinite' }} /> En vivo
            </span>
          )}
          <span className="glass-quiet" style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}>
            <Icon name="bell" size={19} />
          </span>
        </div>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
