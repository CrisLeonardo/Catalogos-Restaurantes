'use client';

/* Shell del panel admin — sidebar + topbar en escritorio; en móvil el nav
   se convierte en una barra inferior fija tipo app. Envuelve /admin/*.
   El nav se agrupa en secciones (escritorio) y se filtra por permisos. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import LogoutButton from '@/components/admin/logout-button';
import AdminNotifications from '@/components/admin/notifications';
import { can } from '@/lib/permissions';

const BG_KEY = 'admin-bg-visible';
const NAV_KEY = 'admin-nav-collapsed';

interface NavItem { href: string; label: string; icon: string; key: string }

interface Props {
  restaurantName: string;
  restaurantId?: string | null;
  ordersEnabled?: boolean;
  analiticaEnabled?: boolean;
  inventarioEnabled?: boolean;
  promocionesEnabled?: boolean;
  personalEnabled?: boolean;
  finanzasEnabled?: boolean;
  logoUrl?: string | null;
  zone?: string;
  /** Rol y permisos del usuario (para filtrar el nav). */
  role?: string | null;
  permissions?: string[] | null;
  /** El dueño/super admin puede ver la sección Personal. */
  canManageStaff?: boolean;
  /** Modo vista previa (Super Admin): nav sin navegar, sin cerrar sesión. */
  preview?: boolean;
  children: React.ReactNode;
}

export default function AdminShell({
  restaurantName, restaurantId, ordersEnabled = false,
  analiticaEnabled = false, inventarioEnabled = false,
  promocionesEnabled = false, personalEnabled = false, finanzasEnabled = false,
  logoUrl, zone, role, permissions, canManageStaff, preview = false, children,
}: Props) {
  const realPathname = usePathname();
  const [bgVisible, setBgVisible] = useState(true);
  // Secciones del nav plegadas (solo escritorio). 'Cuenta' arranca plegada
  // para reducir el ruido visual; la elección se recuerda por sección.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ Cuenta: true });

  useEffect(() => {
    const stored = localStorage.getItem(BG_KEY);
    const visible = stored !== 'false';
    setBgVisible(visible);
    document.documentElement.setAttribute('data-admin-bg', visible ? 'on' : 'off');

    try {
      const navStored = localStorage.getItem(NAV_KEY);
      if (navStored) setCollapsed(JSON.parse(navStored));
    } catch {}
  }, []);

  function toggleSection(title: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try { localStorage.setItem(NAV_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function toggleBg() {
    const next = !bgVisible;
    setBgVisible(next);
    localStorage.setItem(BG_KEY, String(next));
    document.documentElement.setAttribute('data-admin-bg', next ? 'on' : 'off');
  }

  const pathname = preview ? '/admin/menu' : realPathname;

  // En preview (sin rol) se muestra todo como lo ve el dueño.
  const effRole = role ?? 'RESTAURANT_OWNER';
  const showStaff = canManageStaff ?? effRole !== 'RESTAURANT_STAFF';
  const allow = (key: string) => can(effRole, permissions ?? null, key);

  const on = (flag: boolean) => preview || flag;

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: 'Operación',
      items: [
        ...(on(ordersEnabled)    ? [{ href: '/admin/mesero',    label: 'Tomar pedidos', icon: 'userPlus', key: 'mesero' }] : []),
        ...(on(ordersEnabled)    ? [{ href: '/admin/pedidos',   label: 'Pedidos',     icon: 'list',  key: 'pedidos'   }] : []),
        ...(on(ordersEnabled)    ? [{ href: '/admin/mesas',     label: 'Mesas',       icon: 'grid',  key: 'mesas'     }] : []),
        { href: '/admin/menu',        label: 'Catálogo',    icon: 'bag',   key: 'catalogo'   },
        { href: '/admin/categorias',  label: 'Categorías',  icon: 'tag',   key: 'categorias' },
        ...(on(inventarioEnabled) ? [{ href: '/admin/inventario', label: 'Inventario',  icon: 'box',   key: 'inventario' }] : []),
      ],
    },
    {
      title: 'Negocio',
      items: [
        { href: '/admin/metricas', label: 'Métricas', icon: 'chart', key: 'metricas' },
        ...(on(analiticaEnabled)   ? [{ href: '/admin/analitica',   label: 'Analítica', icon: 'dashboard', key: 'analitica'   }] : []),
        ...(on(finanzasEnabled)    ? [{ href: '/admin/finanzas',    label: 'Finanzas',  icon: 'wallet',    key: 'finanzas'    }] : []),
        ...(on(ordersEnabled)      ? [{ href: '/admin/clientes',    label: 'Clientes',  icon: 'users',     key: 'clientes'    }] : []),
        ...(on(promocionesEnabled) ? [{ href: '/admin/promociones', label: 'Promos',    icon: 'percent',   key: 'promociones' }] : []),
      ],
    },
    {
      title: 'Cuenta',
      items: [
        { href: '/admin/suscripcion',   label: 'Mi suscripción', icon: 'wallet',    key: 'suscripcion' },
        { href: '/admin/personalizacion', label: 'Personalizar', icon: 'sparkle',   key: 'personalizar' },
        { href: '/admin/perfil',        label: 'Perfil',         icon: 'user',      key: 'perfil'      },
        ...(showStaff && on(personalEnabled) ? [{ href: '/admin/personal', label: 'Personal', icon: 'userPlus', key: 'personal' }] : []),
        { href: '/admin/qr',            label: 'QR',             icon: 'image',     key: 'qr'          },
        { href: '/admin/soporte',       label: 'Soporte',        icon: 'helpCircle', key: 'soporte'     },
      ],
    },
  ]
    .map((s) => ({ ...s, items: s.items.filter((it) => allow(it.key)) }))
    .filter((s) => s.items.length > 0);

  const TITLES: Record<string, string> = {
    '/admin/mesero': 'Tomar pedidos',
    '/admin/mesas': 'Mesas · Comer en local',
    '/admin/pedidos': 'Pedidos en vivo',
    '/admin/categorias': 'Categorías',
    '/admin/inventario': 'Inventario',
    '/admin/clientes': 'Clientes',
    '/admin/metricas': 'Métricas',
    '/admin/analitica': 'Analítica',
    '/admin/finanzas': 'Finanzas',
    '/admin/promociones': 'Promociones',
    '/admin/personalizacion': 'Personalizar sitio',
    '/admin/personal': 'Personal',
    '/admin/suscripcion': 'Mi suscripción',
    '/admin/menu/productos': 'Producto',
    '/admin/menu': 'Catálogo',
    '/admin/perfil': 'Perfil',
    '/admin/qr': 'Código QR',
    '/admin/soporte': 'Soporte',
  };
  const title = Object.entries(TITLES).find(([p]) => pathname.startsWith(p))?.[1] ?? 'Panel';

  const isLive = pathname.startsWith('/admin/pedidos');
  const isWaiter = pathname.startsWith('/admin/mesero');
  const initial = restaurantName.trim().charAt(0).toUpperCase() || '·';

  if (isWaiter) {
    return (
      <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--brand-bg)', zIndex: 0 }}>
        {children}
      </div>
    );
  }

  function renderLink(n: NavItem) {
    const active = pathname.startsWith(n.href);
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
  }

  return (
    <div className="admin-shell">
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

        {/* Nav: secciones colapsables en escritorio; barra inferior scrollable en móvil.
            data-collapsed oculta los links (solo ≥821px vía CSS) sin afectar la tab bar. */}
        <nav className="admin-nav">
          {sections.map((s) => {
            const isCollapsed = !!collapsed[s.title];
            const hasActive = s.items.some((it) => pathname.startsWith(it.href));
            return (
              <div key={s.title} className="admin-navgroup" data-collapsed={isCollapsed ? '1' : '0'}>
                <button
                  type="button"
                  onClick={() => toggleSection(s.title)}
                  className="admin-navgroup-toggle"
                  aria-expanded={!isCollapsed}
                >
                  <span className="t-kicker admin-navgroup-title" style={{ fontSize: 9.5 }}>{s.title}</span>
                  {hasActive && isCollapsed && <span className="admin-navgroup-dot" aria-hidden />}
                  <Icon name="chevronDown" size={13} className="admin-navgroup-chevron" />
                </button>
                {s.items.map(renderLink)}
              </div>
            );
          })}
        </nav>

        <div className="glass-quiet admin-usercard" style={{ borderRadius: 13, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="admin-usericon" style={{ width: 34, height: 34, borderRadius: 99, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
            <Icon name="user" size={17} />
          </div>
          <div className="admin-usermeta" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {effRole === 'RESTAURANT_STAFF' ? 'Personal' : effRole === 'RESTAURANT_WAITER' ? 'Mesero' : 'Administrador'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--u-text-3)' }}>{preview ? 'Vista previa' : 'Sesión activa'}</div>
          </div>
          {!preview && <LogoutButton />}
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <h1 className="t-display" style={{ fontSize: 22, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          {isLive && (
            <span className="glass-quiet admin-live" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 99, fontSize: 12, fontWeight: 600, color: 'var(--u-text-2)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--u-text)', boxShadow: '0 0 8px var(--u-text)', animation: 'pulse-ring 2s infinite' }} /> En vivo
            </span>
          )}
          {!preview && (
            <button
              onClick={toggleBg}
              title={bgVisible ? 'Ocultar fondo' : 'Mostrar fondo'}
              className="press glass-quiet"
              style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', color: bgVisible ? 'var(--u-text)' : 'var(--u-text-3)', border: 'none', cursor: 'pointer', background: 'none', flexShrink: 0 }}
            >
              <Icon name={bgVisible ? 'eye' : 'eyeOff'} size={18} />
            </button>
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
