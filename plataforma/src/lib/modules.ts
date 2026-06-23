/* ============================================================
   ACTIVACIÓN DE MÓDULOS EN 2 NIVELES (migración 038)
   ------------------------------------------------------------
   Nivel 1 — ENTITLEMENT (lo concede Leogin/super admin):
     restaurants.modules[key] === true
   Nivel 2 — ACTIVACIÓN del restaurante:
     restaurants.module_settings[key].enabled === true

   Un módulo está ACTIVO solo si AMBOS niveles son verdaderos.
   Si Leogin retira el entitlement, el restaurante no puede activarlo
   (la UI lo muestra bloqueado y la acción lo rechaza en el servidor).

   Para agregar un módulo nuevo activable: añade su meta a
   ACTIVATABLE_MODULES y la llave a `restaurants.modules` (super admin).
   ============================================================ */

export type ActivatableModuleKey = 'fel' | 'proveedores' | 'loyalty';

export interface ModuleMeta {
  key: ActivatableModuleKey;
  /** Nombre para la tarjeta de la página de módulos. */
  label: string;
  /** Descripción corta de qué hace. */
  description: string;
  /** Ícono (nombre de Icon). */
  icon: string;
  /** Ruta principal del módulo. */
  href: string;
  /** Etiqueta corta para el nav del panel. */
  navLabel: string;
  /** Sección del nav donde aparece. */
  navSection: 'Operación' | 'Negocio';
}

export const ACTIVATABLE_MODULES: ModuleMeta[] = [
  {
    key: 'fel',
    label: 'Factura Electrónica (FEL)',
    description: 'Emite facturas electrónicas certificadas (SAT Guatemala) desde tus pedidos.',
    icon: 'receipt',
    href: '/admin/facturacion',
    navLabel: 'Facturación',
    navSection: 'Negocio',
  },
  {
    key: 'proveedores',
    label: 'Proveedores y compras',
    description: 'Registra proveedores y genera órdenes de compra para reabastecer tu inventario.',
    icon: 'truck',
    href: '/admin/proveedores',
    navLabel: 'Proveedores',
    navSection: 'Operación',
  },
  {
    key: 'loyalty',
    label: 'Lealtad / Puntos',
    description: 'Programa de puntos: tus clientes acumulan por compra y canjean en el checkout.',
    icon: 'star',
    href: '/admin/lealtad',
    navLabel: 'Lealtad',
    navSection: 'Negocio',
  },
];

export function moduleMeta(key: ActivatableModuleKey): ModuleMeta {
  const m = ACTIVATABLE_MODULES.find((x) => x.key === key);
  if (!m) throw new Error(`Módulo desconocido: ${key}`);
  return m;
}

/** Estado controlado por el restaurante (restaurants.module_settings). */
export type ModuleSettings = Partial<Record<ActivatableModuleKey, { enabled?: boolean }>>;

/** Mapa de entitlements (restaurants.modules) — jsonb libre. */
export type ModulesMap = Record<string, boolean> | null | undefined;

/** ¿Leogin habilitó este módulo para el restaurante? (Nivel 1) */
export function isEntitled(modules: ModulesMap, key: ActivatableModuleKey): boolean {
  return modules?.[key] === true;
}

/** ¿El restaurante activó este módulo? (Nivel 2, sin verificar entitlement) */
export function isTurnedOn(settings: ModuleSettings | null | undefined, key: ActivatableModuleKey): boolean {
  return settings?.[key]?.enabled === true;
}

/** ¿El módulo está realmente ACTIVO? Requiere ambos niveles. */
export function isModuleActive(
  modules: ModulesMap,
  settings: ModuleSettings | null | undefined,
  key: ActivatableModuleKey,
): boolean {
  return isEntitled(modules, key) && isTurnedOn(settings, key);
}
