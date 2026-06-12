'use client';

/* Shell del panel admin — sidebar + topbar en escritorio; en móvil el nav
   se convierte en una barra inferior fija tipo app. Envuelve /admin/*. */

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import LogoutButton from '@/components/admin/logout-button';
import AdminNotifications from '@/components/admin/notifications';

interface Props {
  restaurantName: string;
  restaurantId?: string | null;
  ordersEnabled?: boolean;
  logoUrl?: string | null;
  zone?: string;
  /** Modo vista previa (Super Admin): nav sin navegar, sin cerrar sesión. */
  preview?: boolean;
  children: React.ReactNode;
}

export default function AdminShell({ restaurantName, restaurantId, ordersEnabled = false, logoUrl, zone, preview = false, children }: Props) {
  const realPathname = usePathname();
  // En vista previa la URL es /preview/admin/[id]; fijamos el Catálogo como
  // sección activa para que el panel se vea como lo ve el dueño al entrar.
  const pathname = preview ? '/admin/menu' : realPathname;

  const nav = [
    ...(ordersEnabled ? [{ href: '/admin/pedidos',    label: 'Pedidos',     icon: 'list'  }] : []),
    { href: '/admin/menu',        label: 'Catálogo',    icon: 'bag'   },
    { href: '/admin/categorias',  label: 'Categorías',  icon: 'tag'   },
    ...(ordersEnabled ? [{ href: '/admin/clientes',   label: 'Clientes',    icon: 'users' }] : []),
    { href: '/admin/metricas',        label: 'Métricas',     icon: 'chart'    },
    { href: '/admin/personalizacion', label: 'Personalizar', icon: 'sparkle'  },
    { href: '/admin/perfil',          label: 'Perfil',       icon: 'user'     },
    { href: '/admin/qr',              label: 'QR',           icon: 'image'    },
  ];

  const title =
    pathname.startsWith('/admin/pedidos')    ? 'Pedidos en vivo'
    : pathname.startsWith('/admin/categorias') ? 'Categorías'
    : pathname.startsWith('/admin/clientes') ? 'Clientes'
    : pathname.startsWith('/admin/metricas') ? 'Métricas'
    : pathname.startsWith('/admin/menu/productos') ? 'Producto'
    : pathname.startsWith('/admin/menu')           ? 'Catálogo'
    : pathname.startsWith('/admin/personalizacion') ? 'Personalizar sitio'
    : pathname.startsWith('/admin/perfil')          ? 'Perfil'
    : pathname.startsWith('/admin/qr')              ? 'Código QR'
    : 'Panel';

  const isLive = pathname.startsWith('/admin/pedidos');
  const initial = restaurantName.trim().charAt(0).toUpperCase() || '·';

  return (
    <div className="admin-shell">
      {/* Sidebar (escritorio) / cabecera compacta (móvil) */}
      <aside className="admin-sidebar">
        <div className="admin-brand" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
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

        {/* Nav: columna en escritorio, barra inferior fija en móvil */}
        <nav className="admin-nav">
          {nav.map((n) => {
            const active = pathname.startsWith(n.href);
            // En vista previa los enlaces no navegan (la ruta /admin/* no existe
            // en el origen de la vista previa): se renderizan como estáticos.
            if (preview) {
              return (
                <div key={n.href} className="admin-navlink" data-active={active ? '1' : '0'} style={{ cursor: 'default' }}>
                  <Icon name={n.icon} size={18} />
                  <span className="nav-label">{n.label}</span>
                </div>
              );
            }
            return (
              <Link key={n.href} href={n.href} className="admin-navlink press" data-active={active ? '1' : '0'}>
                <Icon name={n.icon} size={18} />
                <span className="nav-label">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="admin-spacer" style={{ flex: 1 }} />

        <div className="glass-quiet admin-usercard" style={{ borderRadius: 13, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="admin-usericon" style={{ width: 34, height: 34, borderRadius: 99, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
            <Icon name="user" size={17} />
          </div>
          <div className="admin-usermeta" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Administrador</div>
            <div style={{ fontSize: 10.5, color: 'var(--u-text-3)' }}>{preview ? 'Vista previa' : 'Sesión activa'}</div>
          </div>
          {!preview && <LogoutButton />}
        </div>
      </aside>

      {/* Main */}
      <div className="admin-main">
        <div className="admin-topbar">
          <h1 className="t-display" style={{ fontSize: 22, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          {isLive && (
            <span className="glass-quiet admin-live" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 99, fontSize: 12, fontWeight: 600, color: 'var(--u-text-2)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--u-text)', boxShadow: '0 0 8px var(--u-text)', animation: 'pulse-ring 2s infinite' }} /> En vivo
            </span>
          )}
          {!preview && restaurantId && ordersEnabled ? (
            <AdminNotifications restaurantId={restaurantId} muteChime={isLive} />
          ) : (
            <span className="glass-quiet" style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}>
              <Icon name="bell" size={19} />
            </span>
          )}
        </div>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
