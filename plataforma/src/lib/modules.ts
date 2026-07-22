/* ============================================================
   MÓDULOS — modelo habilitado-por-Leogin + toggleable por restaurante
   ------------------------------------------------------------
   Leogin decide qué módulos están DISPONIBLES para cada restaurante.
   El restaurante solo puede prender/apagar los que Leogin habilitó.

   restaurants.modules[key] === true  →  Leogin habilitó este módulo.
     · El restaurante lo VE en su panel de módulos.
     · Empieza ACTIVO (ON) salvo que el restaurante lo haya apagado.
     · El restaurante puede prenderlo o apagarlo a su gusto.

   restaurants.modules[key] falso/ausente  →  módulo NO disponible.
     · El restaurante NO lo ve en su panel ni puede usarlo.

   El estado que controla el restaurante vive en:
     restaurants.module_settings[key].enabled (boolean | undefined)
     · undefined / ausente = ON por defecto (se asume activo al habilitar)
     · true  = el restaurante lo prendió
     · false = el restaurante lo apagó

   Módulo ACTIVO  =  habilitado-por-Leogin (modules[k])
                     Y  restaurante NO lo apagó (module_settings[k].enabled !== false)

   Los módulos requiresSetup (p.ej. FEL) siempre quedan ON al habilitarlos
   (el restaurante no puede apagarlos; los gestiona Leogin).

   Para agregar un módulo nuevo: añade su meta a ACTIVATABLE_MODULES.
   No requiere cambio de esquema (modules y module_settings son jsonb).
   ============================================================ */

export type ActivatableModuleKey =
  | 'reservaciones'
  | 'lista_espera'
  | 'llamada_mesero'
  | 'encuestas'
  | 'cupones'
  | 'loyalty'
  | 'proveedores'
  | 'recetas'
  | 'fel';

/** Grupos visuales del panel de módulos (para ordenar las tarjetas). */
export type ModuleGroup = 'atencion' | 'crecimiento' | 'operacion' | 'facturacion';

export const MODULE_GROUPS: { id: ModuleGroup; label: string; description: string }[] = [
  { id: 'atencion',    label: 'Atención en sala',  description: 'Mejora la experiencia del comensal mientras está en tu local.' },
  { id: 'crecimiento', label: 'Crecimiento y fidelidad', description: 'Herramientas para vender más y que vuelvan.' },
  { id: 'operacion',   label: 'Operación avanzada', description: 'Control fino de tu cocina e inventario.' },
  { id: 'facturacion', label: 'Facturación', description: 'Documentos fiscales para tus ventas.' },
];

export interface ModuleMeta {
  key: ActivatableModuleKey;
  /** Nombre para la tarjeta de la página de módulos. */
  label: string;
  /** Descripción corta de qué hace. */
  description: string;
  /** Ícono (nombre de Icon). */
  icon: string;
  /** Ruta principal del módulo (null si no tiene página propia). */
  href: string | null;
  /** Etiqueta corta para el nav del panel (null si no aparece en el nav). */
  navLabel: string | null;
  /** Sección del nav donde aparece. */
  navSection: 'Operación' | 'Negocio';
  /** Grupo del panel de módulos. */
  group: ModuleGroup;
  /** Chip visual en la tarjeta. */
  badge?: 'POPULAR' | 'NUEVO';
  /** Visibilidad inicial cuando el restaurante aún no lo ha tocado. */
  defaultOn?: boolean;
  /** Necesita configuración de Leogin: solo se activa gestionado (no self-service). */
  requiresSetup?: boolean;
  /** Sugerencia contextual (p.ej. "funciona mejor con Comer en local"). */
  hint?: string;
}

export const ACTIVATABLE_MODULES: ModuleMeta[] = [
  /* ── Atención en sala ─────────────────────────────────── */
  {
    key: 'reservaciones',
    label: 'Reservaciones',
    description: 'Gestiona reservas de mesa: cliente, fecha, hora y personas. Confirma, sienta y completa cada reserva desde tu panel.',
    icon: 'calendar',
    href: '/admin/reservaciones',
    navLabel: 'Reservaciones',
    navSection: 'Operación',
    group: 'atencion',
    badge: 'NUEVO',
  },
  {
    key: 'lista_espera',
    label: 'Lista de espera',
    description: 'Anota a los grupos que llegan sin reservar, avísales cuando hay mesa y controla el orden de la cola.',
    icon: 'users',
    href: '/admin/lista-espera',
    navLabel: 'Lista de espera',
    navSection: 'Operación',
    group: 'atencion',
    badge: 'NUEVO',
  },
  {
    key: 'llamada_mesero',
    label: 'Llamar al mesero',
    description: 'Un botón "Llamar al mesero" en tu menú QR. El cliente lo presiona y aparece una alerta en tiempo real en tu panel.',
    icon: 'bell',
    href: '/admin/mesas',
    navLabel: null,
    navSection: 'Operación',
    group: 'atencion',
    hint: 'Funciona mejor con el modo "Comer en local" activo.',
  },
  {
    key: 'encuestas',
    label: 'Encuestas de satisfacción',
    description: 'Recibe calificaciones de 1-5 estrellas y comentarios después de cada pedido. Visualiza tu promedio y reseñas recientes.',
    icon: 'thumbsUp',
    href: '/admin/encuestas',
    navLabel: 'Encuestas',
    navSection: 'Negocio',
    group: 'atencion',
    badge: 'NUEVO',
  },

  /* ── Crecimiento y fidelidad ──────────────────────────── */
  {
    key: 'cupones',
    label: 'Cupones y descuentos',
    description: 'Crea códigos de descuento (% o monto fijo) con límite de usos y expiración. Tus clientes los aplican en el checkout.',
    icon: 'ticket',
    href: '/admin/cupones',
    navLabel: 'Cupones',
    navSection: 'Negocio',
    group: 'crecimiento',
    badge: 'NUEVO',
  },
  {
    key: 'loyalty',
    label: 'Lealtad / Puntos',
    description: 'Programa de puntos: tus clientes acumulan por cada compra y canjean por descuentos en el checkout.',
    icon: 'star',
    href: '/admin/lealtad',
    navLabel: 'Lealtad',
    navSection: 'Negocio',
    group: 'crecimiento',
    badge: 'POPULAR',
  },

  /* ── Operación avanzada ───────────────────────────────── */
  {
    key: 'recetas',
    label: 'Recetas e ingredientes',
    description: 'Define los ingredientes de cada platillo y descuenta tu stock por receta. Para cocinas que controlan costos a fondo.',
    icon: 'flask',
    href: '/admin/ingredientes',
    navLabel: 'Ingredientes',
    navSection: 'Operación',
    group: 'operacion',
    // Estuvo siempre visible: lo dejamos encendido por defecto para no
    // quitárselo a quien ya lo usaba, pero ahora se puede ocultar.
    defaultOn: true,
  },
  {
    key: 'proveedores',
    label: 'Proveedores y compras',
    description: 'Registra proveedores y genera órdenes de compra para reabastecer tu inventario sin perder el control del gasto.',
    icon: 'truck',
    href: '/admin/proveedores',
    navLabel: 'Proveedores',
    navSection: 'Operación',
    group: 'operacion',
  },

  /* ── Facturación (requiere configuración de Leogin) ───── */
  {
    key: 'fel',
    label: 'Factura Electrónica (FEL)',
    description: 'Emite facturas electrónicas certificadas (SAT Guatemala) desde tus pedidos. Requiere conectar tu certificador.',
    icon: 'receipt',
    href: '/admin/facturacion',
    navLabel: 'Facturación',
    navSection: 'Negocio',
    group: 'facturacion',
    requiresSetup: true,
  },
];

export function moduleMeta(key: ActivatableModuleKey): ModuleMeta {
  const m = ACTIVATABLE_MODULES.find((x) => x.key === key);
  if (!m) throw new Error(`Módulo desconocido: ${key}`);
  return m;
}

/** Estado controlado por el restaurante (restaurants.module_settings). */
export type ModuleSettings = Partial<Record<ActivatableModuleKey, { enabled?: boolean }>>;

/** Mapa de "gestionado por Leogin" (restaurants.modules) — jsonb libre. */
export type ModulesMap = Record<string, boolean> | null | undefined;

/**
 * ¿Leogin gestiona este módulo? (modules[key] === true)
 * Cuando es true, el módulo queda forzado ON y se oculta del panel del
 * restaurante (lo administra Leogin directamente).
 */
export function isManaged(modules: ModulesMap, key: ActivatableModuleKey): boolean {
  return modules?.[key] === true;
}

/**
 * ¿El restaurante encendió este módulo él mismo? (module_settings[key].enabled)
 * Si nunca lo ha tocado, usa el valor por defecto del módulo (defaultOn).
 */
export function isSelfEnabled(
  settings: ModuleSettings | null | undefined,
  key: ActivatableModuleKey,
): boolean {
  const v = settings?.[key]?.enabled;
  if (v === undefined || v === null) {
    return ACTIVATABLE_MODULES.find((m) => m.key === key)?.defaultOn === true;
  }
  return v === true;
}

/**
 * ¿El módulo está ACTIVO?
 * Requiere que Leogin lo haya habilitado (modules[key] === true) Y que el
 * restaurante no lo haya apagado (module_settings[key].enabled !== false).
 * Los módulos requiresSetup siempre están ON cuando Leogin los habilita.
 */
export function isModuleActive(
  modules: ModulesMap,
  settings: ModuleSettings | null | undefined,
  key: ActivatableModuleKey,
): boolean {
  if (!isManaged(modules, key)) return false;
  const meta = ACTIVATABLE_MODULES.find((m) => m.key === key);
  if (meta?.requiresSetup) return true;
  return settings?.[key]?.enabled !== false; // undefined/true = ON por defecto
}

/**
 * ¿El módulo debe mostrarse en el panel del restaurante?
 * Solo si Leogin lo habilitó (modules[key] === true).
 * Si no está habilitado, el restaurante no lo ve ni puede activarlo.
 */
export function showsInPanel(
  modules: ModulesMap,
  key: ActivatableModuleKey,
): boolean {
  return isManaged(modules, key);
}
