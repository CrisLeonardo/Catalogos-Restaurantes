'use client';

/* Shell del panel admin — sidebar + topbar en escritorio; en móvil el nav
   se convierte en una barra inferior fija tipo app. Envuelve /admin/*.
   El nav se agrupa en secciones (escritorio) y se filtra por permisos. */

import { useEffect, useState, useMemo } from 'react';
import Link, { useLinkStatus } from 'next/link';
import AssetImage from '@/components/asset-image';
import { usePathname } from 'next/navigation';
import { panelBaseFrom, internalPanelPath, panelHref } from '@/lib/panel-links';
import { Icon } from '@/components/icons';
import { ServiceModeContext } from '@/components/admin/service-mode';
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
import AdminInstallPrompt from '@/components/admin/install-prompt';
import LoginWelcomeToast from '@/components/admin/login-welcome-toast';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { isMeseroOnly } from '@/lib/permissions';
import { buildNav, findGroup, type NavGroup } from '@/lib/admin-nav';
import SectionTabs from '@/components/admin/section-tabs';
import CommandSearch from '@/components/admin/command-search';
import AdminMoreMenu from '@/components/admin/admin-more-menu';



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
  /** «A domicilio» activo y conexión de WhatsApp lista: ver lib/admin-nav.ts (N-02). */
  deliveryEnabled?: boolean;
  whatsappReady?: boolean;
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
  planActual, dineInEnabled = false, deliveryEnabled = false, whatsappReady = false, preview = false,
  isOperatorSession = false, children,
}: Props) {
  const realPathname = usePathname();

  /* Ya no hace falta centrar el ítem activo al navegar: la barra inferior
     dejó de scrollear en horizontal (los seis destinos se reparten el ancho,
     ver globals.css). Una barra de pestañas que se desplaza esconde destinos
     y ninguna app la tiene así. */

  /* Prefijo del origen único: '/panel/<slug>' si el navegador ya está ahí,
     cadena vacía en el subdominio de hoy. Ver lib/panel-links.ts. */
  const panelBase = panelBaseFrom(realPathname);
  /** Enlace a pintar para una ruta interna del panel. */
  const enlace = (ruta: string) => panelHref(panelBase, ruta);

  /* `pathname` es siempre la ruta INTERNA (`/admin/...`), venga el navegador
     por el subdominio o por `/panel/<slug>`. Así toda la lógica de abajo
     —pestaña activa, títulos, modo servicio— sigue comparando contra las
     mismas rutas de siempre y no se entera del cambio de origen. */
  const pathname = preview ? '/admin/menu' : internalPanelPath(realPathname);

  /* "Modo servicio" (Cocina y Mesero, rediseño 2026-08-22): quita el
     armazón del panel y deja la pantalla entera para el trabajo. Vive aquí
     y no en KitchenDisplay/WaiterPanel porque lo único que cambia es si
     ESTE componente pinta o no su sidebar/topbar alrededor de `children`.

     SE RECUERDA POR PANTALLA Y POR APARATO. Antes era estado suelto que se
     reiniciaba en cada cambio de ruta y se perdía al recargar: la tablet
     que se queda toda la noche sobre el mostrador volvía al chrome del
     panel cada vez que el mesero iba a Cocina y regresaba, o cada vez que
     el navegador se reiniciaba. Encenderlo una vez y que se quede es la
     mitad de lo que lo hace útil. */
  const [kiosk, setKiosk] = useState(false);

  /** La preferencia es de esta pantalla: Cocina y Mesero se usan en
      aparatos distintos y no tienen por qué ir a la par. */
  const kioskKey = pathname.startsWith('/admin/cocina')
    ? 'leogin:modo-servicio:cocina'
    : pathname.startsWith('/admin/mesero')
      ? 'leogin:modo-servicio:mesero'
      : null;

  /* Al entrar en una pantalla con modo servicio se aplica lo que este
     aparato tuviera guardado; al salir a cualquier otra sección se apaga
     —nadie quiere que "pantalla completa" persiga al resto del panel—,
     pero la preferencia se queda para la próxima vez. */
  useEffect(() => {
    if (!kioskKey) { setKiosk(false); return; }
    let guardado = false;
    try { guardado = localStorage.getItem(kioskKey) === '1'; } catch { /* sin almacenamiento */ }
    setKiosk(guardado);
  }, [kioskKey]);

  // El navegador puede salir de pantalla completa por su cuenta (Esc, gesto
  // del sistema): sin este listener el panel se quedaba "atascado" sin
  // sidebar aunque el navegador ya hubiera vuelto a modo ventana.
  useEffect(() => {
    const onFsChange = () => {
      if (document.fullscreenElement) return;
      setKiosk(false);
      /* Salirse por Esc o por gesto del sistema ES apagarlo: si solo se
         apagara la pantalla y no la preferencia, volvería solo la próxima
         vez y parecería que no obedece. */
      if (kioskKey) {
        try { localStorage.setItem(kioskKey, '0'); } catch { /* sin almacenamiento */ }
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [kioskKey]);

  /* Esc sale del modo servicio, que es lo que anuncia su propia barra.
     Cuando el navegador SÍ concedió pantalla completa esto ya pasaba solo
     (Esc la cierra y salta `fullscreenchange`), pero en tablet no se pide
     —Android contesta con un aviso del sistema que parece un error nuestro—
     y ahí la tecla no hacía nada.

     Dos guardas, y las dos hacen falta: si alguien de dentro ya atendió el
     Esc (el buscador lo usa para vaciarse, los diálogos para cerrarse) no se
     toca, y escribiendo en un campo tampoco. Sin esto, borrar la búsqueda
     con Esc te echaba de la pantalla en hora pico. */
  useEffect(() => {
    if (!kiosk) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      toggleKiosk();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiosk]);

  /* En un teléfono/tablet NO se pide la Fullscreen API. Android responde a
     ella con su propio aviso del sistema ("Deslice hacia abajo desde la parte
     superior…"): una caja gris encima de la app, con texto cortado, que el
     mesero lee como un error de Leogin y que la web no puede estilizar ni
     ocultar. El modo inmersivo de esta app no lo necesita: .admin-kiosk ya es
     `fixed; inset: 0` y tapa todo el chrome del panel. En escritorio sí se
     pide, que es donde esconder la barra del navegador vale algo (la tablet
     de Cocina con teclado y ratón incluida) y donde el aviso no existe. */
  function toggleKiosk() {
    const isTouch = typeof window !== 'undefined'
      && window.matchMedia?.('(pointer: coarse)').matches;
    const encender = !kiosk;

    if (encender) {
      if (!isTouch) document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setKiosk(encender);

    /* Se recuerda en el aparato, no en la cuenta: el modo servicio es una
       propiedad de ESTA tablet sobre el mostrador, no del mesero que la
       esté usando esta noche. */
    if (kioskKey) {
      try { localStorage.setItem(kioskKey, encender ? '1' : '0'); } catch { /* sin almacenamiento */ }
    }
  }

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
    dineInEnabled, deliveryEnabled, whatsappReady, planActual, showStaff, preview,
  });
  const activeGroup = findGroup(groups, pathname);

  /* ── EL BOTÓN DE TOMAR PEDIDO ───────────────────────────────────
     Lo primero que hace cualquiera con este sistema es apuntar un
     pedido, y hasta ahora eso estaban tres toques: Pedidos, la pestaña
     "Tomar pedidos", la mesa. La barra decía a dónde ir y nunca qué
     hacer.

     Lleva a `/admin/mesero` a secas, sin hoja de opciones por delante:
     esa pantalla ARRANCA en la vista del salón, que ya es exactamente
     la pregunta —qué mesa, o "Para llevar · sin mesa"— dibujada con el
     plano real del local. Una hoja intermedia habría sido una copia
     peor de algo que ya existe.

     Solo aparece si el restaurante puede tomar pedidos desde el panel.
     En Básico y Estándar no existe esa pantalla, y ahí un candado en el
     sitio más visible del teléfono sería un anuncio, no una herramienta.

     No se pinta en escritorio (ver globals.css): allí el nav es la
     barra lateral y "Tomar pedidos" ya es una pestaña con su nombre
     entero.

     LOS SEIS DESTINOS SE QUEDAN (corregido el 2026-09-07). El botón nació
     echando a Clientes y Negocio al menú "⋯", y eso resultó ser un cambio
     con dos costes que no se vieron al medirlo:

       · Los dos destinos desaparecían sin dejar rastro. Quien los buscaba
         en la barra —donde llevaban meses— no tenía ninguna pista de que
         se habían mudado a un menú de la barra de ARRIBA.
       · Y peor: estando EN Clientes o en Negocio, la barra no marcaba
         nada. Ninguno de los cuatro destinos visibles estaba activo, así
         que la pantalla no decía dónde estabas.

     Medido en pantalla: con el botón puesto, los seis destinos caben a
     47 px cada uno en un teléfono de 375 px, con las seis etiquetas
     enteras y sin recortes (`scrollWidth === clientWidth`). Por debajo de
     360 px la ranura del botón se estrecha para dejarles sitio, ver
     globals.css. */

  const conBoton = !preview && groups
    .some((g) => g.items.some((it) => it.href === '/admin/mesero' && !it.locked));

  /* "Aquí estás", no "aquí no estoy". El botón se APARTABA en
     `/admin/mesero` y `/admin/caja` —`visibility: hidden`— y lo que se veía
     era un hueco de 86 px en mitad de la barra, sin nada que dijera que la
     pantalla abierta era justamente esa. Ahora se queda y se marca como
     cualquier otro destino.

     Lo único que sigue apartándose es el CÍRCULO, y solo cuando la pantalla
     tiene de verdad una barra pegada abajo (el carrito del mesero, el paso
     siguiente de la mesa, la de guardar): sus 28 px de voladizo caen justo
     encima de "Revisar pedido". Se aparta el círculo, no la ranura: la
     etiqueta se queda con su icono en línea, como los demás destinos, así
     que ni se abre un hueco ni se recoloca nada. Ver globals.css. */
  const enTomarPedido = pathname.startsWith('/admin/mesero');

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
    // «Personal y permisos» no cabía en el teléfono («Personal y permi…»).
    '/admin/personal': 'Personal',
    '/admin/suscripcion': 'Mi suscripción',
    // «Platillo», como dicen la pestaña («Platillos») y el resto del panel.
    '/admin/menu/productos/new': 'Nuevo platillo',
    '/admin/menu/productos': 'Platillo',
    '/admin/menu': 'Platillos',
    '/admin/perfil': 'Perfil',
    '/admin/ajustes/restaurante': 'Horarios',
    '/admin/ajustes/entrega': 'Zona de entrega',
    '/admin/ajustes/pedidos': 'Pedidos y cobro',
    /* Estas cuatro caían en el «Panel» de reserva o en el «Ajustes» del
       grupo: la barra no decía en qué pantalla se estaba (auditoría
       2026-10-02, T-10). Van antes de '/admin/ajustes' porque gana el
       primer prefijo que coincide. */
    '/admin/ajustes/salon': 'Salón',
    '/admin/repartidores': 'Repartidores',
    '/admin/whatsapp': 'WhatsApp',
    '/admin/facturacion': 'Facturación',
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
    '/admin/respaldo': 'Copia de datos',
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
  /* La barra de sección solo existe si tiene algo que enseñar. En "Hoy" (que
     no tiene pestañas por diseño) y en la portada de Ajustes se pintaba igual:
     17 px de barra vacía con su línea debajo, que en un teléfono es una banda
     entera de armazón que no dice nada. */
  const showTabs = !!activeGroup && !backToIndex && !activeGroup.index && activeGroup.items.length >= 2;
  const showSubbar = backToIndex || showTabs;

  const isLive    = pathname.startsWith('/admin/pedidos');
  const isKitchen = pathname.startsWith('/admin/cocina');
  const isWaiter  = pathname.startsWith('/admin/mesero');
  /* Las dos pantallas que dibujan el salón entero. Ahí la llamada de una
     mesa ya sale EN la mesa, con su botón «Atender»: la tarjeta flotante
     repetía el hecho y encima tapaba la comanda. */
  const isSalon   = isWaiter || pathname.startsWith('/admin/mesas');
  // Únicas dos pantallas táctiles con modo "pantalla completa" (ver toggleKiosk).
  const kioskEligible = isKitchen || isWaiter;
  /* El cable con la pantalla de dentro: el boton "Modo servicio" del
     panel de mesero enciende ESTE estado. Se memoriza para no re-montar
     todo el arbol de contenido en cada render del armazon. */
  const servicio = useMemo(
    () => ({ active: kiosk && kioskEligible, toggle: toggleKiosk }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kiosk, kioskEligible],
  );
  /* Los dos avisos que no se pueden perder, montados en las DOS ramas.
     Antes solo existían con el chrome del panel puesto: en pantalla completa
     —justo el modo en que la tablet se queda sola sobre el mostrador— el
     mesero dejaba de oír el chime de "llaman de la mesa 6" y no le entraba el
     aviso de pedido nuevo. Se notó al darle al modo servicio un botón propio
     dentro de Tomar pedidos: hacerlo fácil de alcanzar convertía un rincón
     olvidado en el sitio donde más falta hacen. */
  /* Y montados en UN solo sitio de la pantalla. Antes las llamadas de mesa
     salían abajo a la izquierda y los pedidos nuevos abajo a la derecha, de
     dos componentes distintos: en el teléfono los dos juntos cubrían unos
     300 px por encima de la comanda, y decían lo que las fichas de arriba
     ya estaban diciendo.

     `showCards` es lo que los calla donde el hecho ya está en pantalla. No
     se desmontan: cada uno es la ÚNICA fuente de su sonido, así que
     esconderlos quitándolos del árbol dejaría al mesero sin chime — que es
     justo lo contrario de lo que se busca. */
  const avisosFlotantes = (
    <div className="adm-float-alert" data-side="right">
      {!preview && restaurantId && ordersEnabled && (
        /* Alerta de pedido nuevo, visible en TODO el panel (no solo en
           /admin/pedidos) y persistente hasta que alguien la atienda. Es
           además la ÚNICA fuente del sonido de pedido: orders-panel y
           notifications.tsx ya no suenan por su cuenta, así que no pueden
           encimarse dos chimes por el mismo pedido. Solo se mutea en cocina,
           que tiene su propio aviso (kitchen-display.tsx). */
        <NewOrdersAlert restaurantId={restaurantId} muteChime={isKitchen} showCards={!isLive && !isKitchen} />
      )}
      {!preview && restaurantId && llamadaMeseroActive && (
        /* OJO: a diferencia de AdminNotifications, ninguna pantalla
           (orders-panel, kitchen-display) reproduce sonido de llamada al
           mesero por su cuenta — WaiterCallsAlert es la ÚNICA fuente del chime
           (ver su comentario de cabecera). Silenciarlo también en isLive
           dejaba la alerta muda justamente en /admin/pedidos, la pantalla
           donde el staff pasa más tiempo. Solo se mutea en modo cocina (por
           diseño: ver notifications.tsx). */
        <WaiterCallsAlert restaurantId={restaurantId} muteChime={isKitchen} showCards={!isSalon} />
      )}
    </div>
  );

  const initial = restaurantName.trim().charAt(0).toUpperCase() || '·';

  if (kiosk && kioskEligible) {
    return (
      <ToastProvider>
        <div className="admin-kiosk" style={{ position: 'fixed', inset: 0, background: 'var(--brand-bg)', zIndex: 0 }}>
          {/* La barra del modo servicio (lienzo `diseno-pedidos-mesas/PC.dc.html`).
              Antes aquí no había nada y el contenido arrancaba pegado al canto de
              la pantalla, con una «X» flotante como única salida — montada encima
              de los botones de la barra del panel. Cuatro cosas y ninguna más: de
              quién es la pantalla, en qué modo está, qué hora es y cómo se sale. */}
          <div className="wp-servicebar">
            <span style={{
              display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, flexShrink: 0,
              background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-2)',
            }}>
              <Icon name="monitor" size={14} />
            </span>
            <span className="wp-servicebar-name">{restaurantName}</span>
            <span className="wp-servicebar-mode">Modo servicio</span>
            <span style={{ flex: 1 }} />
            <ServiceClock />
            <button
              type="button"
              onClick={toggleKiosk}
              title="Salir del modo servicio"
              className="press"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                height: 32, padding: '0 11px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--adm-border-2)', background: 'none',
                color: 'var(--u-text-2)', fontSize: 13, fontWeight: 500,
              }}
            >
              <Icon name="x" size={14} />
              <span>Salir</span>
              <kbd className="wp-key">Esc</kbd>
            </button>
          </div>
          <div className="admin-kiosk-body">
            <ServiceModeContext.Provider value={servicio}>{children}</ServiceModeContext.Provider>
          </div>
          {!preview && <LoginWelcomeToast restaurantName={restaurantName} userName={userName} roleLabel={roleLabel} />}
          {avisosFlotantes}
        </div>
        <Toaster />
      </ToastProvider>
    );
  }

  /** Un destino de la barra lateral. Seis en total, sin candados: lo que el
   *  plan no incluye se enseña dentro de su sección, no aquí. */
  function renderGroup(g: NavGroup) {
    /* Un solo sitio marcado en la barra. En `/admin/mesero` el grupo activo
       es "Pedidos" (ahí vive esa pantalla), pero quien marca es el botón
       central: dejar los dos en acento decía "estás en dos sitios". */
    const active = activeGroup?.key === g.key && !(conBoton && enTomarPedido && g.key === 'pedidos');
    if (preview) {
      return (
        <div key={g.key} className="admin-navlink" data-active={active ? '1' : '0'} data-tour-step={g.key} style={{ cursor: 'default' }}>
          <Icon name={g.icon} size={18} />
          <span className="nav-label">{g.label}</span>
        </div>
      );
    }
    return (
      <Link key={g.key} href={enlace(g.href)} className="admin-navlink press" data-active={active ? '1' : '0'} data-tour-step={g.key}>
        <Icon name={g.icon} size={18} />
        <span className="nav-label">{g.label}</span>
        <NavPending />
      </Link>
    );
  }

  /** El botón central. Su ranura vive DENTRO de la barra, entre Menú y
   *  Clientes — así queda 3 destinos a cada lado (Hoy/Pedidos/Menú y
   *  Clientes/Negocio/Ajustes) y el botón cae en el centro real de los
   *  siete huecos, no solo entre los dos primeros. */
  function renderTomarPedido() {
    return (
      <Link
        key="tomar-pedido"
        href={enlace('/admin/mesero')}
        className="admin-fab press"
        data-active={enTomarPedido ? '1' : '0'}
        aria-current={enTomarPedido ? 'page' : undefined}
        aria-label="Tomar un pedido"
        title="Tomar un pedido"
      >
        <span className="admin-fab-dot" aria-hidden>
          <Icon name="plus" size={26} strokeWidth={2.4} />
        </span>
        {/* El mismo icono, del tamaño de los demás destinos. Solo se ve
            cuando el círculo se aparta por una barra pegada abajo: sin él
            la ranura se quedaba con la etiqueta suelta y media casilla
            vacía. Ver `.admin-fab-flat` en globals.css. */}
        <span className="admin-fab-flat" aria-hidden>
          <Icon name="plus" size={18} />
        </span>
        {/* "Tomar pedido", no "Pedido": el destino de al lado se llama
            "Pedidos" y a 10 px, uno al lado del otro, la única diferencia
            era una ese. El verbo dice además que esto se toca para HACER
            algo, no para ir a alguna parte. */}
        <span className="nav-label">Tomar pedido</span>
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
                  <AssetImage src={logoUrl} alt={restaurantName} width={42} height={42} loading="eager" style={{ objectFit: 'contain' }} />
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
          // display/align/gap viven en `.admin-brand` (globals.css): en móvil la
          // barra lateral se apaga entera y un display en línea lo impediría.
          const brandStyle = {} as const;
          // Fuera de preview la marca es un enlace al Inicio del panel (logo → home).
          return preview ? (
            <div className="admin-brand" style={brandStyle}>{brandInner}</div>
          ) : (
            <Link href={enlace('/admin')} className="admin-brand press" style={{ ...brandStyle, textDecoration: 'none', color: 'inherit' }} title="Ir al inicio">{brandInner}</Link>
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
          {groups.map((g) => (
            conBoton && g.key === 'menu'
              ? [renderGroup(g), renderTomarPedido()]
              : renderGroup(g)
          ))}
        </nav>

        {/* Plan badge — link to /admin/suscripcion, hides its label on mobile bottom bar */}
        {planActual && !preview && (
          <Link
            href={enlace('/admin/suscripcion')}
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
            className="press glass-quiet admin-switch-restaurant"
            style={{ borderRadius: 13, padding: '10px 12px', marginBottom: 8, textDecoration: 'none' }}
          >
            <Icon name="grid" size={15} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)' }}>
              Cambiar de restaurante
            </span>
            <Icon name="chevronRight" size={14} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          </a>
        )}

        <div className="glass-quiet admin-usercard" style={{ borderRadius: 13, padding: 12 }}>
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
          <h1 className="t-display" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          {/* Ayuda, instalar y tema: en escritorio viven aquí; en el teléfono
              caben tres cosas en la barra de título y no cinco, así que se
              recogen en el menú "⋯" (ver .adm-desk-only en globals.css). */}
          <div className="adm-desk-only">
            {!preview && helpSection && <HelpButton section={helpSection} />}
            {!preview && <AdminInstallPrompt />}
          </div>
          {isLive && (
            <Badge variant="accent" className="admin-live py-1.5">
              <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--adm-accent-500, var(--u-text))', boxShadow: '0 0 8px var(--adm-accent-500, var(--u-text))', animation: 'pulse-ring 2s infinite' }} /> En vivo
            </Badge>
          )}
          {!preview && kioskEligible && (
            <button
              type="button"
              onClick={toggleKiosk}
              title="Pantalla completa"
              aria-label="Pantalla completa"
              className="glass-quiet press"
              style={{ width: 42, height: 42, borderRadius: 'calc(12px * var(--admin-panel-radius, 1))', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', boxShadow: 'var(--adm-shadow-xs, none)' }}
            >
              <Icon name="grid" size={18} />
            </button>
          )}
          {!preview && <span className="adm-desk-only"><AdminThemeToggle /></span>}
          {!preview && restaurantId && ordersEnabled ? (
            <AdminNotifications
              restaurantId={restaurantId}
              kitchenMode={isKitchen}
            />
          ) : (
            <span className="glass-quiet adm-desk-only" style={{ width: 42, height: 42, borderRadius: 'calc(12px * var(--admin-panel-radius, 1))', display: 'grid', placeItems: 'center', color: 'var(--u-text)', boxShadow: 'var(--adm-shadow-xs, none)' }}>
              <Icon name="bell" size={19} />
            </span>
          )}
          {/* Solo móvil: recoge lo que en escritorio está repartido entre la
              barra lateral (buscar, plan, cambiar de restaurante, sesión) y
              esta misma barra (ayuda, tema). */}
          {!preview && (
            <AdminMoreMenu
              restaurantName={restaurantName}
              roleLabel={roleLabel}
              planLabel={planActual ? (PLAN_NAMES[planActual] ?? planActual) : null}
              planColor={planActual ? (PLAN_COLORS[planActual] ?? '#94a3b8') : undefined}
              hasMultipleRestaurants={hasMultipleRestaurants}
              helpSection={helpSection}
              isOperatorSession={isOperatorSession}
            />
          )}
        </div>
        {activeGroup && showSubbar && (
          <div className="admin-subbar">
            {backToIndex ? (
              <Link href={enlace(activeGroup.href)} className="admin-back press">
                <Icon name="chevronLeft" size={15} />
                {activeGroup.label}
              </Link>
            ) : (
              <SectionTabs group={activeGroup} pathname={pathname} preview={preview} />
            )}
          </div>
        )}
        <div className="admin-content">
          <ServiceModeContext.Provider value={servicio}>{children}</ServiceModeContext.Provider>
        </div>
      </div>
      {avisosFlotantes}
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

/* ── El reloj del modo servicio ────────────────────────────────
   Sale en el lienzo y no es adorno: una tablet a pantalla completa tapa el
   reloj del sistema, y la hora es lo primero que mira quien apunta "mesa 6,
   12:41" en la comanda o cierra el turno.

   Empieza vacío y se llena al montar, a propósito: el HTML del servidor no
   puede saber la hora del local sin desajustarse con el del navegador en el
   primer pintado. */
function ServiceClock() {
  const [hora, setHora] = useState('');
  useEffect(() => {
    const pinta = () => setHora(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    pinta();
    // Al filo del minuto y no cada segundo: el reloj enseña hh:mm, así que
    // sesenta repintados por minuto serían cincuenta y nueve de más.
    const id = setInterval(pinta, 15000);
    return () => clearInterval(id);
  }, []);
  return <span className="wp-servicebar-clock" suppressHydrationWarning>{hora}</span>;
}
