'use client';

/* Shell del panel admin — sidebar + topbar en escritorio; en móvil el nav
   se convierte en una barra inferior fija tipo app. Envuelve /admin/*.
   El nav se agrupa en secciones (escritorio) y se filtra por permisos. */

import { useEffect } from 'react';
import Link, { useLinkStatus } from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import LogoutButton from '@/components/admin/logout-button';
import AdminNotifications from '@/components/admin/notifications';
import WaiterCallsAlert from '@/components/admin/waiter-calls-alert';
import NewOrdersAlert from '@/components/admin/new-orders-alert';
import OfflineSupport from '@/components/offline-support';
import AdminThemeToggle from '@/components/admin/theme-toggle';
import WelcomeTour from '@/components/admin/welcome-tour';
import GuidedTourHost from '@/components/admin/guided-tour';
import HelpButton from '@/components/admin/help-button';
import LoginWelcomeToast from '@/components/admin/login-welcome-toast';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { isMeseroOnly } from '@/lib/permissions';
import { buildNav, findGroup, type NavGroup } from '@/lib/admin-nav';
import SectionTabs from '@/components/admin/section-tabs';
import CommandSearch from '@/components/admin/command-search';



/**
 * Puntito que aparece en el enlace del menú mientras esa pantalla se está
 * cargando.
 *
 * El esqueleto (loading.tsx) ya rellena el área de contenido, pero eso está
 * al otro lado de la pantalla: quien acaba de tocar "Finanzas" mira el
 * ítem que tocó, no el panel. Este indicador confirma en el sitio exacto
 * del dedo que sí se registró el toque, que es lo que evita el doble clic
 * de quien no está seguro de si funcionó.
 *
 * Ocupa siempre el mismo espacio y solo cambia la opacidad, para que no
 * desplace el texto del menú al aparecer.
 */
function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className="admin-navlink-pending"
      data-pending={pending ? '1' : '0'}
    />
  );
}

interface Props {
  restaurantName: string;
  restaurantId?: string | null;
  ordersEnabled?: boolean;
  analiticaEnabled?: boolean;
  inventarioEnabled?: boolean;
  ingredientesEnabled?: boolean;
  personalEnabled?: boolean;
  finanzasEnabled?: boolean;
  /** Módulos activables en 2 niveles (activos = entitlement + on del restaurante). */
  felActive?: boolean;
  proveedoresActive?: boolean;
  loyaltyActive?: boolean;
  reservacionesActive?: boolean;
  listaEsperaActive?: boolean;
  encuestasActive?: boolean;
  cuponesActive?: boolean;
  /** Módulo "Llamar al mesero" activo → muestra la alerta de llamadas pendientes. */
  llamadaMeseroActive?: boolean;
  logoUrl?: string | null;
  /**
   * Color de fondo del MENÚ del restaurante (`ThemeConfig.colorBg`). El logo
   * se diseñó para verse sobre ese fondo: pintarlo aquí evita que un logo
   * claro (típico de menús oscuros) se "desaparezca" con el panel en modo
   * claro, y viceversa. Sin valor → fondo sutil neutro de siempre.
   */
  logoBg?: string | null;
  zone?: string;
  /** Rol y permisos del usuario (para filtrar el nav). */
  role?: string | null;
  permissions?: string[] | null;
  /** Nombre del usuario (profiles.full_name) — solo para el toast de bienvenida. */
  userName?: string | null;
  /** El dueño/super admin puede ver la sección Personal. */
  canManageStaff?: boolean;
  /** Esta cuenta administra más de un restaurante (migración 113). */
  hasMultipleRestaurants?: boolean;
  /** Plan actual del restaurante — para mostrar badge en la barra lateral. */
  planActual?: string | null;
  /** "Comer en local" activo — da acceso a Mesas aunque el plan no incluya
   * el panel de mesero completo (ver layout.tsx y mesas/page.tsx). */
  dineInEnabled?: boolean;
  /** Modo vista previa (Super Admin): nav sin navegar, sin cerrar sesión. */
  preview?: boolean;
  /** Sesión iniciada por PIN — cambia "Salir" por "Cambiar de usuario". */
  isOperatorSession?: boolean;
  children: React.ReactNode;
}

const PLAN_COLORS: Record<string, string> = {
  BASICO: '#94a3b8', ESTANDAR: 'var(--c-ok)', PREMIUM: 'var(--c-alt)', PRO: '#a855f7',
};
const PLAN_NAMES: Record<string, string> = {
  BASICO: 'Básico', ESTANDAR: 'Estándar', PREMIUM: 'Premium', PRO: 'Pro',
};


export default function AdminShell({
  restaurantName, restaurantId, ordersEnabled = false,
  analiticaEnabled = false, inventarioEnabled = false, ingredientesEnabled = false,
  personalEnabled = false, finanzasEnabled = false,
  felActive = false, proveedoresActive = false, loyaltyActive = false,
  reservacionesActive = false, listaEsperaActive = false, encuestasActive = false, cuponesActive = false,
  llamadaMeseroActive = false,
  logoUrl, logoBg, zone, role, permissions, userName, canManageStaff, hasMultipleRestaurants = false,
  planActual, dineInEnabled = false, preview = false,
  isOperatorSession = false, children,
}: Props) {
  const realPathname = usePathname();

  // En móvil, centra el ítem activo de la barra inferior al navegar (la barra
  // scrollea en horizontal y así el usuario siempre ve dónde está).
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth > 820) return;
    const el = document.querySelector('.admin-nav [data-active="1"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [realPathname]);

  const pathname = preview ? '/admin/menu' : realPathname;

  // En preview (sin rol) se muestra todo como lo ve el dueño.
  const effRole = role ?? 'RESTAURANT_OWNER';
  const showStaff = canManageStaff ?? effRole !== 'RESTAURANT_STAFF';
  const roleLabel = effRole === 'SUPER_ADMIN' ? 'Super Admin'
    : isMeseroOnly(effRole, permissions ?? null) ? 'Mesero'
    : effRole === 'RESTAURANT_STAFF' ? 'Personal'
    : 'Administrador';

  // Los seis destinos, ya filtrados por módulos, plan y permisos.
  // La lógica vive en lib/admin-nav.ts porque de ella cuelgan dos cosas: la
  // barra lateral y las pestañas de cada sección.
  const groups = buildNav({
    role, permissions,
    ordersEnabled, analiticaEnabled, inventarioEnabled, ingredientesEnabled,
    personalEnabled, finanzasEnabled, felActive, proveedoresActive, loyaltyActive,
    reservacionesActive, listaEsperaActive, encuestasActive, cuponesActive,
    dineInEnabled, planActual, showStaff, preview,
  });
  const activeGroup = findGroup(groups, pathname);

  const TITLES: Record<string, string> = {
    '/admin/mesero': 'Tomar pedidos',
    '/admin/mesas': 'Mesas · Comer en local',
    '/admin/pedidos': 'Pedidos en vivo',
    '/admin/categorias': 'Categorías',
    '/admin/inventario': 'Inventario',
    '/admin/ingredientes': 'Ingredientes',
    '/admin/clientes': 'Clientes',
    '/admin/canales': 'Apps de delivery',
    '/admin/metricas': 'Métricas',
    '/admin/analitica': 'Analítica',
    '/admin/finanzas': 'Finanzas',
    '/admin/personalizacion': 'Personalizar sitio',
    '/admin/personal': 'Personal y permisos',
    '/admin/suscripcion': 'Mi suscripción',
    '/admin/menu/productos': 'Producto',
    '/admin/menu': 'Platillos',
    '/admin/perfil': 'Perfil',
    '/admin/ajustes/restaurante': 'Horarios y preferencias',
    '/admin/ajustes': 'Ajustes',
    '/admin/mi-pc': 'La PC del local',
    '/admin/qr': 'Código QR',
    '/admin/ayuda': 'Centro de ayuda',
    '/admin/reservaciones': 'Reservaciones',
    '/admin/lista-espera': 'Lista de espera',
    '/admin/encuestas': 'Encuestas',
    '/admin/cupones': 'Cupones',
    '/admin/lealtad': 'Lealtad',
    '/admin/modulos': 'Funciones',
    '/admin/respaldo': 'Copia de tus datos',
  };
  /* Estando en una pestaña, el título de arriba dice el GRUPO ("Menú") y la
     pestaña activa dice la pantalla ("Platillos"): antes ambos decían lo
     mismo, dos veces, a diez píxeles de distancia. En una pantalla más honda
     —editar un platillo, por ejemplo— no hay pestaña que la nombre, así que
     ahí el título vuelve a ser el de la pantalla. */
  const onTab = !!activeGroup && activeGroup.items.some((it) => pathname === it.href);
  const title = pathname === '/admin'
    ? 'Hoy'
    : onTab && activeGroup && !activeGroup.index
    ? activeGroup.label
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

  // Secciones con portada (Ajustes): sus pantallas hijas no llevan fila de
  // pestañas —serían nueve— sino un "volver" explícito, como cualquier vista
  // de detalle de una lista de ajustes.
  const backToIndex = !!activeGroup?.index && pathname !== activeGroup.href;

  const isLive    = pathname.startsWith('/admin/pedidos');
  const isKitchen = pathname.startsWith('/admin/cocina');
  const isWaiter  = pathname.startsWith('/admin/mesero');
  const initial = restaurantName.trim().charAt(0).toUpperCase() || '·';

  if (isWaiter) {
    return (
      <ToastProvider>
        <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--brand-bg)', zIndex: 0 }}>
          {children}
          {!preview && <LoginWelcomeToast restaurantName={restaurantName} userName={userName} roleLabel={roleLabel} />}
        </div>
        <Toaster />
      </ToastProvider>
    );
  }

  /** Un destino de la barra lateral. Seis en total, sin candados: lo que el
   *  plan no incluye se enseña dentro de su sección, no aquí. */
  function renderGroup(g: NavGroup) {
    const active = activeGroup?.key === g.key;
    if (preview) {
      return (
        <div key={g.key} className="admin-navlink" data-active={active ? '1' : '0'} data-tour-step={g.key} style={{ cursor: 'default' }}>
          <Icon name={g.icon} size={18} />
          <span className="nav-label">{g.label}</span>
        </div>
      );
    }
    return (
      <Link key={g.key} href={g.href} className="admin-navlink press" data-active={active ? '1' : '0'} data-tour-step={g.key}>
        <Icon name={g.icon} size={18} />
        <span className="nav-label">{g.label}</span>
        <NavPending />
      </Link>
    );
  }

  return (
    <ToastProvider>
    <div className="admin-shell">
      <OfflineSupport />
      <aside className="admin-sidebar">
        {(() => {
          const brandInner = (
            <>
              <div style={{ width: 42, height: 42, borderRadius: 'calc(12px * var(--admin-panel-radius, 1))', background: logoUrl && logoBg ? logoBg : 'var(--adm-card, color-mix(in srgb, var(--u-text) 6%, transparent))', display: 'grid', placeItems: 'center', border: '1px solid var(--u-hair)', boxShadow: 'var(--adm-shadow-xs, none)', overflow: 'hidden', flexShrink: 0 }}>
                {logoUrl ? (
                  <Image src={logoUrl} alt={restaurantName} width={42} height={42} style={{ objectFit: 'contain' }} />
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

        {/* Buscar: con seis destinos y treinta pantallas, escribir el nombre es
            más rápido que recordar en qué sección quedó. Se abre también con
            ⌘K / Ctrl+K desde cualquier pantalla (ver command-search.tsx). */}
        {!preview && (
          <button
            type="button"
            className="admin-search press"
            onClick={() => window.dispatchEvent(new Event('admin:search'))}
            title="Buscar en el panel (Ctrl+K)"
          >
            <Icon name="search" size={15} />
            <span className="admin-search-label">Buscar</span>
            <kbd className="admin-search-kbd">Ctrl K</kbd>
          </button>
        )}

        {/* Nav: seis destinos. En escritorio es la barra lateral; en móvil la
            misma lista se convierte en la barra inferior fija (ver globals.css).
            Ya no hay secciones plegables: con seis ítems no hay nada que plegar. */}
        <nav className="admin-nav" data-tour-step="nav">
          {groups.map(renderGroup)}
        </nav>

        {/* Plan badge — link to /admin/suscripcion, hides its label on mobile bottom bar */}
        {planActual && !preview && (
          <Link
            href="/admin/suscripcion"
            className="admin-navlink press"
            data-active="0"
            style={{ gap: 8, marginBottom: 4 }}
          >
            <Badge
              variant="neutral"
              className="nav-label justify-start border-none bg-transparent px-0 py-0 text-[12.5px] font-semibold text-[var(--u-text-2)]"
            >
              <span
                style={{
                  width: 8, height: 8, borderRadius: 99, flexShrink: 0,
                  background: PLAN_COLORS[planActual] ?? '#94a3b8',
                  boxShadow: `0 0 0 3px color-mix(in srgb, ${PLAN_COLORS[planActual] ?? '#94a3b8'} 18%, transparent)`,
                }}
              />
              Plan {PLAN_NAMES[planActual] ?? planActual}
            </Badge>
          </Link>
        )}

        {/* Cambiar de restaurante. Solo aparece con más de uno: al que tiene
            uno solo no se le enseña un selector que nunca va a usar. */}
        {!preview && hasMultipleRestaurants && (
          <a
            href="/mi-cuenta"
            className="press glass-quiet"
            style={{
              display: 'flex', alignItems: 'center', gap: 9, borderRadius: 13,
              padding: '10px 12px', marginBottom: 8, textDecoration: 'none',
            }}
          >
            <Icon name="grid" size={15} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)' }}>
              Cambiar de restaurante
            </span>
            <Icon name="chevronRight" size={14} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          </a>
        )}

        <div className="glass-quiet admin-usercard" style={{ borderRadius: 13, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="admin-usericon" style={{ width: 34, height: 34, borderRadius: 99, background: 'color-mix(in srgb, var(--u-text) 10%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
            <Icon name="user" size={17} />
          </div>
          <div className="admin-usermeta" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {roleLabel}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--u-text-3)' }}>{preview ? 'Vista previa' : 'Sesión activa'}</div>
          </div>
          {!preview && <LogoutButton isOperatorSession={isOperatorSession} />}
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <h1 className="t-display" style={{ fontSize: 22, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          {!preview && helpSection && <HelpButton section={helpSection} />}
          {isLive && (
            <Badge variant="accent" className="admin-live py-1.5">
              <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--adm-accent-500, var(--u-text))', boxShadow: '0 0 8px var(--adm-accent-500, var(--u-text))', animation: 'pulse-ring 2s infinite' }} /> En vivo
            </Badge>
          )}
          {!preview && <AdminThemeToggle />}
          {!preview && restaurantId && ordersEnabled ? (
            <AdminNotifications
              restaurantId={restaurantId}
              kitchenMode={isKitchen}
            />
          ) : (
            <span className="glass-quiet" style={{ width: 42, height: 42, borderRadius: 'calc(12px * var(--admin-panel-radius, 1))', display: 'grid', placeItems: 'center', color: 'var(--u-text)', boxShadow: 'var(--adm-shadow-xs, none)' }}>
              <Icon name="bell" size={19} />
            </span>
          )}
        </div>
        {activeGroup && !preview && backToIndex && (
          <div className="admin-subbar">
            <Link href={activeGroup.href} className="admin-back press">
              <Icon name="chevronLeft" size={15} />
              {activeGroup.label}
            </Link>
          </div>
        )}
        {activeGroup && !backToIndex && (
          <div className="admin-subbar">
            <SectionTabs group={activeGroup} pathname={pathname} preview={preview} />
          </div>
        )}
        <div className="admin-content">{children}</div>
      </div>
      {!preview && restaurantId && ordersEnabled && (
        // Alerta de pedido nuevo, visible en TODO el panel (no solo en
        // /admin/pedidos) y persistente hasta que alguien la atienda. Es
        // además la ÚNICA fuente del sonido de pedido: orders-panel y
        // notifications.tsx ya no suenan por su cuenta, así que no pueden
        // encimarse dos chimes por el mismo pedido. Solo se mutea en cocina,
        // que tiene su propio aviso (kitchen-display.tsx).
        <NewOrdersAlert restaurantId={restaurantId} muteChime={isKitchen} />
      )}
      {!preview && restaurantId && llamadaMeseroActive && (
        // OJO: a diferencia de AdminNotifications, ninguna pantalla (orders-panel,
        // kitchen-display) reproduce sonido de llamada al mesero por su cuenta —
        // WaiterCallsAlert es la ÚNICA fuente del chime (ver su comentario de
        // cabecera). Silenciarlo también en isLive dejaba la alerta muda
        // justamente en /admin/pedidos, la pantalla donde el staff pasa más
        // tiempo. Solo se mutea en modo cocina (por diseño: ver notifications.tsx).
        <WaiterCallsAlert restaurantId={restaurantId} muteChime={isKitchen} />
      )}
      {!preview && <CommandSearch groups={groups} />}
      <WelcomeTour restaurantName={restaurantName} preview={preview} />
      {!preview && <LoginWelcomeToast restaurantName={restaurantName} userName={userName} roleLabel={roleLabel} />}
      {/* Tours guiados del centro de ayuda ("Ver en mi panel") — el host vive
          aquí para sobrevivir a las navegaciones entre páginas del panel. */}
      {!preview && <GuidedTourHost />}
    </div>
    <Toaster />
    </ToastProvider>
  );
}
