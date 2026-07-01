'use client';

/* Shell del panel admin — sidebar + topbar en escritorio; en móvil el nav
   se convierte en una barra inferior fija tipo app. Envuelve /admin/*.
   El nav se agrupa en secciones (escritorio) y se filtra por permisos. */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import LogoutButton from '@/components/admin/logout-button';
import AdminNotifications from '@/components/admin/notifications';
import WaiterCallsAlert from '@/components/admin/waiter-calls-alert';
import WelcomeTour from '@/components/admin/welcome-tour';
import HelpButton from '@/components/admin/help-button';
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
  ingredientesEnabled?: boolean;
  promocionesEnabled?: boolean;
  personalEnabled?: boolean;
  finanzasEnabled?: boolean;
  /** Módulos activables en 2 niveles (activos = entitlement + on del restaurante). */
  felActive?: boolean;
  proveedoresActive?: boolean;
  loyaltyActive?: boolean;
  reservacionesActive?: boolean;
  encuestasActive?: boolean;
  cuponesActive?: boolean;
  /** Módulo "Llamar al mesero" activo → muestra la alerta de llamadas pendientes. */
  llamadaMeseroActive?: boolean;
  logoUrl?: string | null;
  zone?: string;
  /** Rol y permisos del usuario (para filtrar el nav). */
  role?: string | null;
  permissions?: string[] | null;
  /** El dueño/super admin puede ver la sección Personal. */
  canManageStaff?: boolean;
  /** Plan actual del restaurante — para mostrar badge en la barra lateral. */
  planActual?: string | null;
  /** Modo vista previa (Super Admin): nav sin navegar, sin cerrar sesión. */
  preview?: boolean;
  children: React.ReactNode;
}

const PLAN_COLORS: Record<string, string> = {
  BASICO: '#94a3b8', ESTANDAR: '#10b981', PREMIUM: '#6366f1', PREMIUM_PRO: '#a855f7',
  PREMIUM_ULTRA: '#14b8a6', ALTO_VOLUMEN: '#f97316', VARIABLE: '#f59e0b',
};
const PLAN_NAMES: Record<string, string> = {
  BASICO: 'Básico', ESTANDAR: 'Estándar', PREMIUM: 'Premium', PREMIUM_PRO: 'Premium Pro',
  PREMIUM_ULTRA: 'Premium Ultra', ALTO_VOLUMEN: 'Alto Volumen', VARIABLE: 'Variable',
};

const NAV_DEFAULT: Record<string, boolean> = { Cuenta: true };
const readBg = (raw: string | null): boolean => raw !== 'false';
const readNav = (raw: string | null): Record<string, boolean> => {
  if (!raw) return NAV_DEFAULT;
  try { return JSON.parse(raw) as Record<string, boolean>; } catch { return NAV_DEFAULT; }
};

/**
 * Lee un valor de localStorage de forma SSR-safe vía useSyncExternalStore.
 * En el servidor (y primer render) devuelve `serverDefault`; en el cliente
 * sincroniza con localStorage sin llamar setState dentro de un efecto (evita
 * renders en cascada). Las escrituras disparan el evento `ls:<key>` para
 * notificar a los suscriptores. El snapshot se cachea para devolver la MISMA
 * referencia mientras el string crudo no cambie (requisito de useSyncExternalStore).
 */
function usePersisted<T>(key: string, read: (raw: string | null) => T, serverDefault: T): T {
  const cache = useRef<{ raw: string | null; val: T; init: boolean }>({ raw: null, val: serverDefault, init: false });
  const getSnapshot = useCallback((): T => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* no-op */ }
    if (!cache.current.init || raw !== cache.current.raw) {
      cache.current = { raw, val: read(raw), init: true };
    }
    return cache.current.val;
  }, [key, read]);
  const subscribe = useCallback((cb: () => void) => {
    const evt = `ls:${key}`;
    window.addEventListener('storage', cb);
    window.addEventListener(evt, cb);
    return () => { window.removeEventListener('storage', cb); window.removeEventListener(evt, cb); };
  }, [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverDefault);
}

/** Persiste un valor y notifica a los suscriptores de `usePersisted`. */
function writePersisted(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* no-op */ }
  window.dispatchEvent(new Event(`ls:${key}`));
}

export default function AdminShell({
  restaurantName, restaurantId, ordersEnabled = false,
  analiticaEnabled = false, inventarioEnabled = false, ingredientesEnabled = false,
  promocionesEnabled = false, personalEnabled = false, finanzasEnabled = false,
  felActive = false, proveedoresActive = false, loyaltyActive = false,
  reservacionesActive = false, encuestasActive = false, cuponesActive = false,
  llamadaMeseroActive = false,
  logoUrl, zone, role, permissions, canManageStaff, planActual, preview = false, children,
}: Props) {
  const realPathname = usePathname();
  // Fondo del panel y secciones del nav plegadas: se leen de localStorage de
  // forma SSR-safe (sin setState en efecto). 'Cuenta' arranca plegada.
  const bgVisible = usePersisted(BG_KEY, readBg, true);
  const collapsed = usePersisted(NAV_KEY, readNav, NAV_DEFAULT);

  // Sincroniza el atributo del <html> con el estado del fondo (efecto = OK,
  // solo toca el DOM externo, no llama setState).
  useEffect(() => {
    document.documentElement.setAttribute('data-admin-bg', bgVisible ? 'on' : 'off');
  }, [bgVisible]);

  // En móvil, centra el ítem activo de la barra inferior al navegar (la barra
  // scrollea en horizontal y así el usuario siempre ve dónde está).
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth > 820) return;
    const el = document.querySelector('.admin-nav [data-active="1"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [realPathname]);

  function toggleSection(title: string) {
    writePersisted(NAV_KEY, JSON.stringify({ ...collapsed, [title]: !collapsed[title] }));
  }

  function toggleBg() {
    writePersisted(BG_KEY, String(!bgVisible));
  }

  const pathname = preview ? '/admin/menu' : realPathname;

  // En preview (sin rol) se muestra todo como lo ve el dueño.
  const effRole = role ?? 'RESTAURANT_OWNER';
  const showStaff = canManageStaff ?? effRole !== 'RESTAURANT_STAFF';
  const allow = (key: string) => can(effRole, permissions ?? null, key);

  const on = (flag: boolean) => preview || flag;

  // BASICO y ESTANDAR no incluyen panel de mesero ni gestión de mesas
  const hasWaiterPanel = planActual !== 'BASICO' && planActual !== 'ESTANDAR';

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: 'Operación',
      items: [
        ...(on(ordersEnabled) && on(hasWaiterPanel) ? [{ href: '/admin/mesero', label: 'Tomar pedidos', icon: 'userPlus', key: 'mesero' }] : []),
        ...(on(ordersEnabled)    ? [{ href: '/admin/pedidos',   label: 'Pedidos',     icon: 'list',  key: 'pedidos'   }] : []),
        ...(on(ordersEnabled)    ? [{ href: '/admin/cocina',    label: 'Cocina',      icon: 'flame', key: 'cocina'    }] : []),
        ...(on(ordersEnabled) && on(hasWaiterPanel) ? [{ href: '/admin/mesas', label: 'Mesas', icon: 'grid', key: 'mesas' }] : []),
        { href: '/admin/menu',        label: 'Catálogo',    icon: 'bag',   key: 'catalogo'   },
        { href: '/admin/categorias',  label: 'Categorías',  icon: 'tag',   key: 'categorias' },
        ...(on(inventarioEnabled) ? [{ href: '/admin/inventario',   label: 'Inventario',   icon: 'box',   key: 'inventario'   }] : []),
        ...(on(ingredientesEnabled) ? [{ href: '/admin/ingredientes', label: 'Ingredientes', icon: 'flask', key: 'ingredientes' }] : []),
        ...(on(reservacionesActive) ? [{ href: '/admin/reservaciones', label: 'Reservaciones', icon: 'calendar', key: 'reservaciones' }] : []),
        ...(on(proveedoresActive) ? [{ href: '/admin/proveedores', label: 'Proveedores', icon: 'truck', key: 'proveedores' }] : []),
      ],
    },
    {
      title: 'Negocio',
      items: [
        { href: '/admin/metricas', label: 'Métricas', icon: 'chart', key: 'metricas' },
        ...(on(analiticaEnabled)   ? [{ href: '/admin/analitica',   label: 'Analítica', icon: 'dashboard', key: 'analitica'   }] : []),
        ...(on(finanzasEnabled)    ? [{ href: '/admin/finanzas',    label: 'Finanzas',  icon: 'wallet',    key: 'finanzas'    }] : []),
        ...(on(ordersEnabled)      ? [{ href: '/admin/clientes',    label: 'Clientes',  icon: 'users',     key: 'clientes'    }] : []),
        ...(on(felActive)          ? [{ href: '/admin/facturacion', label: 'Facturación', icon: 'receipt',   key: 'fel'         }] : []),
        ...(on(loyaltyActive)      ? [{ href: '/admin/lealtad',     label: 'Lealtad',    icon: 'star',      key: 'lealtad'     }] : []),
        ...(on(encuestasActive)    ? [{ href: '/admin/encuestas',   label: 'Encuestas',  icon: 'thumbsUp',  key: 'encuestas'   }] : []),
        ...(on(cuponesActive)      ? [{ href: '/admin/cupones',     label: 'Cupones',    icon: 'ticket',    key: 'cupones'     }] : []),
      ],
    },
    {
      title: 'Cuenta',
      items: [
        { href: '/admin/suscripcion',   label: 'Mi suscripción', icon: 'wallet',    key: 'suscripcion' },
        ...(showStaff ? [{ href: '/admin/modulos', label: 'Módulos', icon: 'grid', key: 'modulos' }] : []),
        { href: '/admin/personalizacion', label: 'Personalizar', icon: 'sparkle',   key: 'personalizar' },
        { href: '/admin/perfil',        label: 'Perfil',         icon: 'user',      key: 'perfil'      },
        ...(showStaff && on(personalEnabled) ? [{ href: '/admin/personal', label: 'Personal', icon: 'userPlus', key: 'personal' }] : []),
        { href: '/admin/qr',            label: 'QR',             icon: 'image',      key: 'qr'          },
        { href: '/admin/ayuda',         label: 'Ayuda',          icon: 'helpCircle', key: 'ayuda'       },
        { href: '/admin/soporte',       label: 'Soporte',        icon: 'headphones', key: 'soporte'     },
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
    '/admin/ingredientes': 'Ingredientes',
    '/admin/clientes': 'Clientes',
    '/admin/metricas': 'Métricas',
    '/admin/analitica': 'Analítica',
    '/admin/finanzas': 'Finanzas',
    '/admin/personalizacion': 'Personalizar sitio',
    '/admin/personal': 'Personal',
    '/admin/suscripcion': 'Mi suscripción',
    '/admin/menu/productos': 'Producto',
    '/admin/menu': 'Catálogo',
    '/admin/perfil': 'Perfil',
    '/admin/qr': 'Código QR',
    '/admin/ayuda': 'Centro de ayuda',
    '/admin/soporte': 'Soporte',
    '/admin/reservaciones': 'Reservaciones',
    '/admin/encuestas': 'Encuestas',
    '/admin/cupones': 'Cupones',
    '/admin/lealtad': 'Lealtad',
    '/admin/modulos': 'Módulos',
  };
  const title = pathname === '/admin'
    ? 'Inicio'
    : Object.entries(TITLES).find(([p]) => pathname.startsWith(p))?.[1] ?? 'Panel';

  const HELP_SECTIONS: Record<string, string> = {
    '/admin/menu':             'catalogo',
    '/admin/categorias':       'categorias',
    '/admin/pedidos':          'panel-pedidos',
    '/admin/inventario':       'inventario',
    '/admin/analitica':        'analitica',
    '/admin/finanzas':         'finanzas',
    '/admin/clientes':         'clientes',
    '/admin/personal':         'personal',
    '/admin/cocina':           'cocina',
    '/admin/mesero':           'meseros',
    '/admin/personalizacion':  'personalizar',
    '/admin/qr':               'qr',
    '/admin/perfil':           'perfil',
    '/admin/metricas':         'metricas',
    '/admin/lealtad':          'loyalty',
    '/admin/facturacion':      'fel',
    '/admin/proveedores':      'proveedores',
    '/admin/encuestas':        'encuestas',
    '/admin/reservaciones':    'reservaciones',
    '/admin/cupones':          'cupones',
    '/admin/ingredientes':     'recetas',
  };
  const helpSection = Object.entries(HELP_SECTIONS).find(([p]) => pathname.startsWith(p))?.[1] ?? null;

  const isLive    = pathname.startsWith('/admin/pedidos');
  const isKitchen = pathname.startsWith('/admin/cocina');
  const isWaiter  = pathname.startsWith('/admin/mesero');
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
        <div key={n.href} className="admin-navlink" data-active={active ? '1' : '0'} data-tour-step={n.key} style={{ cursor: 'default' }}>
          <Icon name={n.icon} size={18} />
          <span className="nav-label">{n.label}</span>
        </div>
      );
    }
    return (
      <Link key={n.href} href={n.href} className="admin-navlink press" data-active={active ? '1' : '0'} data-tour-step={n.key}>
        <Icon name={n.icon} size={18} />
        <span className="nav-label">{n.label}</span>
      </Link>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        {(() => {
          const brandInner = (
            <>
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
            </>
          );
          const brandStyle = { display: 'flex', alignItems: 'center', gap: 11 } as const;
          // Fuera de preview la marca es un enlace al Inicio del panel (logo → home).
          return preview ? (
            <div className="admin-brand" style={brandStyle}>{brandInner}</div>
          ) : (
            <Link href="/admin" className="admin-brand press" style={{ ...brandStyle, textDecoration: 'none', color: 'inherit' }} title="Ir al inicio">{brandInner}</Link>
          );
        })()}

        {/* Nav: secciones colapsables en escritorio; barra inferior scrollable en móvil.
            data-collapsed oculta los links (solo ≥821px vía CSS) sin afectar la tab bar. */}
        <nav className="admin-nav" data-tour-step="nav">
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

        {/* Plan badge — link to /admin/suscripcion, hides its label on mobile bottom bar */}
        {planActual && !preview && (
          <Link
            href="/admin/suscripcion"
            className="admin-navlink press"
            data-active="0"
            style={{ gap: 8, marginBottom: 4 }}
          >
            <span style={{
              width: 9, height: 9, borderRadius: 99, flexShrink: 0,
              background: PLAN_COLORS[planActual] ?? '#94a3b8',
            }} />
            <span className="nav-label" style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}>
              Plan {PLAN_NAMES[planActual] ?? planActual}
            </span>
          </Link>
        )}

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
          {!preview && helpSection && <HelpButton section={helpSection} />}
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
            <AdminNotifications
              restaurantId={restaurantId}
              muteChime={isLive || isKitchen}
              kitchenMode={isKitchen}
            />
          ) : (
            <span className="glass-quiet" style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}>
              <Icon name="bell" size={19} />
            </span>
          )}
        </div>
        <div className="admin-content">{children}</div>
      </div>
      {!preview && restaurantId && llamadaMeseroActive && (
        <WaiterCallsAlert restaurantId={restaurantId} />
      )}
      <WelcomeTour restaurantName={restaurantName} preview={preview} />
    </div>
  );
}
