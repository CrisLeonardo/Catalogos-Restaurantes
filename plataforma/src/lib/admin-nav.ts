import { PLANS, type PlanCode } from '@/lib/plans';
import { can } from '@/lib/permissions';

/* ============================================================
   EL MENÚ DEL PANEL — modelo único (rediseño 2026-08-21, Fase 3)
   ------------------------------------------------------------
   Antes el menú se armaba dentro de shell.tsx: 35 destinos en tres
   grupos plegables ("Operación", "Negocio", "Cuenta"), con la barra
   lateral haciendo scroll y candados de venta mezclados con el
   trabajo del día.

   Ahora son SEIS destinos, agrupados por la pregunta que se está
   haciendo el dueño y no por el módulo que creó cada pantalla. Lo
   que antes era una entrada del menú ahora es una PESTAÑA dentro
   de su grupo.

   Clave: NINGUNA ruta se mueve. `/admin/cocina` sigue siendo
   `/admin/cocina`. La agrupación es un asunto de navegación, no de
   rutas, así que los marcadores del navegador, los enlaces de la
   app de escritorio, los tours guiados y los permisos siguen
   valiendo exactamente igual. Este archivo solo decide qué se
   enseña, dónde y en qué orden.

   Los candados: un ítem que el plan no incluye YA NO aparece en la
   barra lateral. Aparece como pestaña bloqueada dentro de su grupo,
   que es donde el dueño está buscando esa función y donde la frase
   "esto es lo que hace" tiene sentido. El menú es para trabajar.
   ============================================================ */

export interface NavItem {
  href: string;
  /** Nombre corto: es una pestaña dentro de un grupo, no un título. */
  label: string;
  /** Llave de permiso (ver ADMIN_SECTIONS en lib/permissions). */
  key: string;
  /** El plan no la incluye: se muestra con candado y lleva a la suscripción. */
  locked?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: string;
  /** A dónde va al tocar el grupo en la barra lateral. */
  href: string;
  /** Pestañas del grupo. Vacío = el grupo es un destino en sí (Hoy). */
  items: NavItem[];
  /**
   * El grupo tiene demasiadas pantallas para una fila de pestañas y usa
   * una portada con listas (Ajustes). Sus hijos muestran "volver" en vez
   * de la fila de pestañas.
   */
  index?: boolean;
}

export interface NavContext {
  role?: string | null;
  permissions?: string[] | null;
  /** Módulos activos del restaurante. */
  ordersEnabled: boolean;
  analiticaEnabled: boolean;
  inventarioEnabled: boolean;
  ingredientesEnabled: boolean;
  personalEnabled: boolean;
  finanzasEnabled: boolean;
  felActive: boolean;
  proveedoresActive: boolean;
  loyaltyActive: boolean;
  reservacionesActive: boolean;
  listaEsperaActive: boolean;
  encuestasActive: boolean;
  cuponesActive: boolean;
  dineInEnabled: boolean;
  planActual?: string | null;
  /** El dueño (o super admin) puede ver Personal. */
  showStaff: boolean;
  /** Vista previa del super admin: se enseña todo, sin navegar. */
  preview: boolean;
}

/**
 * Un ítem que depende de un módulo (`enabled`) y además es exclusivo de un
 * plan superior (`inPlan`).
 *
 * · El plan NO la incluye  → se muestra bloqueada (candado, lleva a la
 *   suscripción). Hay algo que vender y la pantalla explica qué.
 * · El plan sí la incluye pero el módulo aún no está activo → se oculta.
 *   Ahí no hay nada que vender: está pendiente de activación por Leogin y
 *   un candado solo confundiría.
 */
function lockable(ctx: NavContext, enabled: boolean, inPlan: boolean, item: NavItem): NavItem[] {
  if (ctx.preview || enabled) return [item];
  if (!inPlan) return [{ ...item, locked: true }];
  return [];
}

/** Construye los seis grupos ya filtrados por módulos, plan y permisos. */
export function buildNav(ctx: NavContext): NavGroup[] {
  const on = (flag: boolean) => ctx.preview || flag;
  const plan = PLANS[(ctx.planActual ?? 'BASICO') as PlanCode] ?? PLANS.BASICO;

  // BASICO y ESTANDAR no incluyen el panel de mesero (toma de pedidos por staff).
  const hasWaiterPanel = ctx.planActual !== 'BASICO' && ctx.planActual !== 'ESTANDAR';
  // Mesas se habilita también si el restaurante ya tiene "comer en local"
  // activo (ESTANDAR puede elegirlo entre sus dos modos), no solo por plan.
  const mesasAccessible = hasWaiterPanel || ctx.dineInEnabled;

  const groups: NavGroup[] = [
    {
      key: 'hoy',
      label: 'Hoy',
      icon: 'clock',
      href: '/admin',
      items: [],
    },
    {
      key: 'pedidos',
      label: 'Pedidos',
      icon: 'list',
      href: '/admin/pedidos',
      items: on(ctx.ordersEnabled)
        ? [
            { href: '/admin/pedidos', label: 'En vivo', key: 'pedidos' },
            { href: '/admin/cocina', label: 'Cocina', key: 'cocina' },
            ...lockable(ctx, mesasAccessible, mesasAccessible, { href: '/admin/mesas', label: 'Mesas', key: 'mesas' }),
            ...lockable(ctx, hasWaiterPanel, hasWaiterPanel, { href: '/admin/mesero', label: 'Tomar pedidos', key: 'mesero' }),
          ]
        : [],
    },
    {
      key: 'menu',
      label: 'Menú',
      icon: 'bag',
      href: '/admin/menu',
      items: [
        { href: '/admin/menu', label: 'Platillos', key: 'catalogo' },
        { href: '/admin/categorias', label: 'Categorías', key: 'categorias' },
        ...(on(ctx.ingredientesEnabled) ? [{ href: '/admin/ingredientes', label: 'Ingredientes', key: 'ingredientes' }] : []),
        ...lockable(ctx, ctx.inventarioEnabled, plan.hasAnalytics, { href: '/admin/inventario', label: 'Inventario', key: 'inventario' }),
        ...(on(ctx.proveedoresActive) ? [{ href: '/admin/proveedores', label: 'Proveedores', key: 'proveedores' }] : []),
      ],
    },
    {
      key: 'clientes',
      label: 'Clientes',
      icon: 'users',
      href: '/admin/clientes',
      items: [
        ...(on(ctx.ordersEnabled) ? [{ href: '/admin/clientes', label: 'Clientes', key: 'clientes' }] : []),
        ...(on(ctx.loyaltyActive) ? [{ href: '/admin/lealtad', label: 'Lealtad', key: 'lealtad' }] : []),
        ...(on(ctx.cuponesActive) ? [{ href: '/admin/cupones', label: 'Cupones', key: 'cupones' }] : []),
        ...(on(ctx.encuestasActive) ? [{ href: '/admin/encuestas', label: 'Encuestas', key: 'encuestas' }] : []),
        ...(on(ctx.reservacionesActive) ? [{ href: '/admin/reservaciones', label: 'Reservaciones', key: 'reservaciones' }] : []),
        ...(on(ctx.listaEsperaActive) ? [{ href: '/admin/lista-espera', label: 'Lista de espera', key: 'lista_espera' }] : []),
      ],
    },
    {
      key: 'negocio',
      label: 'Negocio',
      icon: 'chart',
      href: '/admin/metricas',
      items: [
        { href: '/admin/metricas', label: 'Resumen', key: 'metricas' },
        ...lockable(ctx, ctx.analiticaEnabled, plan.hasAnalytics, { href: '/admin/analitica', label: 'Analítica', key: 'analitica' }),
        ...lockable(ctx, ctx.finanzasEnabled, plan.hasFinance, { href: '/admin/finanzas', label: 'Finanzas', key: 'finanzas' }),
        /* Caja es pestaña propia desde el rediseño de 2026-09-01. El arqueo
           vivía al final del scroll de Finanzas, y cerrar caja no es un
           apéndice de un reporte: es la última tarea de todas las noches, la
           hace el cajero y no el dueño, y tiene su propio ritmo. Comparte la
           llave 'finanzas' a propósito: quien puede ver el dinero puede
           cuadrarlo, sin tocar el modelo de permisos. */
        ...lockable(ctx, ctx.finanzasEnabled, plan.hasFinance, { href: '/admin/caja', label: 'Caja', key: 'finanzas' }),
        ...(on(ctx.felActive) ? [{ href: '/admin/facturacion', label: 'Facturación', key: 'fel' }] : []),
        // Apps de delivery (Canales, Fase 5A): deshabilitado, sigue en pruebas.
        /* "Copia de datos" ESTABA aquí y también en la portada de Ajustes, y
           esa duplicación se notaba: quien tocaba la fila de Ajustes aterrizaba
           en una pantalla titulada "Negocio", con la fila de pestañas de
           Negocio y sin el "volver a Ajustes" — había perdido su sitio sin
           haber ido a ninguna parte. Vive en Ajustes, que es donde encaja: las
           pestañas de Negocio son todas pantallas de NÚMEROS, y descargar tus
           datos no es un reporte, es algo de tu cuenta. */
      ],
    },
    {
      key: 'ajustes',
      label: 'Ajustes',
      icon: 'settings',
      href: '/admin/ajustes',
      index: true,
      items: [
        { href: '/admin/perfil', label: 'Perfil del negocio', key: 'perfil' },
        { href: '/admin/ajustes/restaurante', label: 'Horarios', key: 'ajustes' },
        /* Cómo está armado el salón: cuántas mesas, sus QR, el plano por
           niveles y la propina. Salió de Pedidos › Mesas en el rediseño de
           2026-08-26, donde ahora vive solo lo que ESTÁ PASANDO. Conserva la
           llave 'mesas' a propósito: quien podía configurar el salón sigue
           pudiendo, sin tocar el modelo de permisos. */
        ...lockable(ctx, mesasAccessible, mesasAccessible, { href: '/admin/ajustes/salon', label: 'Salón', key: 'mesas' }),
        ...(on(ctx.ordersEnabled)
          ? [
              { href: '/admin/ajustes/entrega', label: 'Zona de entrega', key: 'ajustes' },
              { href: '/admin/ajustes/pedidos', label: 'Pedidos y cobro', key: 'ajustes' },
            ]
          : []),
        { href: '/admin/personalizacion', label: 'Personalizar el sitio', key: 'personalizar' },
        { href: '/admin/qr', label: 'Código QR', key: 'qr' },
        ...(on(ctx.ordersEnabled) ? [{ href: '/admin/mi-pc', label: 'La PC del local', key: 'impresion' }] : []),
        ...(ctx.showStaff
          ? lockable(ctx, ctx.personalEnabled, plan.hasAnalytics, { href: '/admin/personal', label: 'Personal y permisos', key: 'personal' })
          : []),
        { href: '/admin/suscripcion', label: 'Mi suscripción', key: 'suscripcion' },
        ...(ctx.showStaff ? [{ href: '/admin/modulos', label: 'Funciones', key: 'modulos' }] : []),
        { href: '/admin/respaldo', label: 'Copia de tus datos', key: 'respaldo' },
        { href: '/admin/ayuda', label: 'Ayuda y tutoriales', key: 'ayuda' },
      ],
    },
  ];

  // 'personal' NO es delegable (no está en ADMIN_SECTIONS a propósito: así un
  // gerente no puede darse permisos a sí mismo repartiéndola), su llave es el
  // ROL y ya se aplicó arriba. 'hoy' es la portada: la ve cualquiera que pueda
  // entrar al panel.
  const allowed = (key: string) =>
    key === 'personal' || key === 'hoy' || can(ctx.role ?? 'RESTAURANT_OWNER', ctx.permissions ?? null, key);

  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => allowed(it.key)) }))
    // Un grupo sin pestañas visibles no se enseña. 'hoy' es la excepción: no
    // tiene pestañas por diseño.
    .filter((g) => g.key === 'hoy' || g.items.length > 0)
    // El grupo lleva a su primera pestaña disponible: si el plan de alguien no
    // incluye "En vivo", tocar "Pedidos" tiene que llevarlo a algo que sí ve.
    .map((g) => (g.items.length > 0 && !g.index ? { ...g, href: g.items[0].href } : g));
}

/**
 * Ruta activa. `/admin` (Hoy) es la raíz del panel: con la regla de prefijo
 * quedaría activa en TODAS las pantallas, así que exige coincidencia exacta.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

/** El grupo al que pertenece la pantalla actual, o null si es ajena al menú. */
export function findGroup(groups: NavGroup[], pathname: string): NavGroup | null {
  // Se busca por la coincidencia MÁS LARGA: '/admin/ajustes/restaurante' tiene
  // que ganarle a '/admin/ajustes', y '/admin' solo gana en exacto.
  let best: { group: NavGroup; len: number } | null = null;
  for (const g of groups) {
    const candidates = g.items.length > 0 ? g.items.map((i) => i.href) : [g.href];
    if (g.index) candidates.push(g.href);
    for (const href of candidates) {
      if (isActivePath(pathname, href) && (!best || href.length > best.len)) {
        best = { group: g, len: href.length };
      }
    }
  }
  return best?.group ?? null;
}
