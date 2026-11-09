/* ============================================================
   PERMISOS del panel admin (Fase D; por trabajo desde la 1.7)
   El dueño reparte a su personal SECCIONES (pantallas) y CAPACIDADES
   (tareas finas, como `caja.cerrar`). Ambas viven en la misma lista.
   Reglas:
   · SUPER_ADMIN y RESTAURANT_OWNER → todo.
   · RESTAURANT_STAFF → solo lo que dice su lista. Una lista `null` ya NO
     significa todo: la migración 177 convirtió las antiguas en listas
     explícitas y la base impide guardar otra (`leogin_miembro_sin_null`).
   · RESTAURANT_WAITER (obsoleto) → tomar pedidos y cobrar.
   · La suscripción, la propiedad y los dueños no se delegan.
   ============================================================ */

export const ADMIN_SECTIONS = [
  { key: 'mesero',       label: 'Mesero' },
  { key: 'pedidos',      label: 'Pedidos' },
  { key: 'lista_espera', label: 'Lista de espera' },
  { key: 'cocina',       label: 'Cocina (KDS)' },
  { key: 'catalogo',     label: 'Catálogo' },
  { key: 'categorias',   label: 'Categorías' },
  { key: 'inventario',   label: 'Inventario' },
  { key: 'ingredientes', label: 'Ingredientes' },
  { key: 'clientes',     label: 'Clientes' },
  { key: 'metricas',     label: 'Métricas' },
  { key: 'analitica',    label: 'Analítica' },
  { key: 'finanzas',     label: 'Finanzas' },
  { key: 'respaldo',     label: 'Respaldo de datos' },
  { key: 'fel',          label: 'Facturación (FEL)' },
  { key: 'proveedores',  label: 'Proveedores' },
  { key: 'loyalty',      label: 'Lealtad' },
  { key: 'whatsapp',     label: 'WhatsApp' },
  // Dos llaves distintas a propósito, igual que "mesero" vs. el resto:
  // 'reparto' es la PANTALLA del repartidor (/repartidor, fuera del panel),
  // 'repartidores' es la página donde el dueño los da de alta (/admin/repartidores).
  { key: 'reparto',      label: 'Reparto (pantalla del repartidor)' },
  { key: 'repartidores', label: 'Repartidores' },
  { key: 'modulos',      label: 'Módulos' },
  { key: 'cupones',      label: 'Cupones' },
  { key: 'personal',     label: 'Personal y permisos' },
  { key: 'suscripcion',  label: 'Mi suscripción' },
  { key: 'personalizar', label: 'Personalizar' },
  { key: 'perfil',       label: 'Perfil' },
  { key: 'ajustes',      label: 'Ajustes' },
  { key: 'mesas',        label: 'Mesas' },
  // Una sola llave para la PC del local: "Impresión", "Sin internet" y
  // "Leogin Desktop" se fusionaron en /admin/mi-pc, así que el dueño ya no
  // reparte tres permisos para lo mismo. Los perfiles de staff que aún tengan
  // 'escritorio' guardado simplemente dejan de encontrar sección: sobra, no
  // rompe.
  { key: 'impresion',    label: 'Mi PC del local' },
  { key: 'qr',           label: 'QR' },
  { key: 'ayuda',        label: 'Centro de ayuda' },
] as const;

export type SectionKey = (typeof ADMIN_SECTIONS)[number]['key'];

/**
 * La Caja, separada en tareas (auditoría C05). Antes todo colgaba de
 * `finanzas`, y para que alguien cerrara caja había que enseñarle también
 * las utilidades.
 */
export const CAJA_CAPACIDADES = [
  'caja.cobrar', 'caja.abrir', 'caja.salida', 'caja.cerrar',
  'caja.ver_esperado', 'caja.corregir', 'caja.devolver',
] as const;
export type CajaCapacidad = (typeof CAJA_CAPACIDADES)[number];

/** Lo que nunca se reparte con una casilla: sólo el dueño. */
export const SOLO_DUENO: string[] = ['suscripcion'];

/** Llaves que un staff puede tener asignadas (las que el dueño puede delegar). */
export const STAFF_ASSIGNABLE: string[] = [
  ...ADMIN_SECTIONS.map((s) => s.key as string).filter((k) => !SOLO_DUENO.includes(k)),
  ...CAJA_CAPACIDADES,
];

/**
 * Llaves de PANTALLA que agrupan tareas:
 *  · `caja`     = alguna tarea del cajón (abrir, salidas, cerrar, corregir…):
 *    ver la pestaña Caja. Cobrar SOLO no basta: el mesero cobra en Servicio
 *    y no tiene por qué ver el cajón ni lo esperado;
 *  · `servicio` = tomar pedidos o cobrar (entrar a Servicio: el puesto Caja
 *    entra a cobrar sin tomar pedidos).
 */
function tieneLlave(permissions: string[], section: string): boolean {
  if (section === 'caja') return permissions.some((p) => p.startsWith('caja.') && p !== 'caja.cobrar');
  if (section === 'servicio') return permissions.includes('mesero') || permissions.includes('caja.cobrar');
  return permissions.includes(section);
}

/** ¿Puede el perfil ver/usar esta sección del panel admin? */
export function can(
  role: string | null | undefined,
  permissions: string[] | null | undefined,
  section: string,
): boolean {
  // El dueño de grupo administra cualquier sucursal de su organización
  // igual que un dueño de restaurante (alcance acotado por RLS a su grupo).
  if (role === 'SUPER_ADMIN' || role === 'RESTAURANT_OWNER') return true;
  if (role === 'RESTAURANT_STAFF') {
    // Sin lista no hay acceso: desde la 177 un `null` ya no significa todo.
    if (!Array.isArray(permissions)) return false;
    if (SOLO_DUENO.includes(section)) return false;
    return tieneLlave(permissions, section);
  }
  // RESTAURANT_WAITER (deprecado): toma pedidos y cobra, como el mesero.
  if (role === 'RESTAURANT_WAITER') return ['mesero', 'caja.cobrar', 'servicio'].includes(section);
  return false;
}

/** Secciones del panel admin. Fuera quedan las que son pantalla aparte:
 *  "mesero" (/admin/mesero) y "reparto" (/repartidor). */
const PANEL_SECTIONS: string[] = ADMIN_SECTIONS
  .map((s) => s.key)
  .filter((k) => k !== 'mesero' && k !== 'reparto');

/**
 * ¿Es un "mesero puro"? — solo toma pedidos en mesa y NO debe ver el panel admin.
 * Cierto cuando su único acceso es "mesero" (o es el rol deprecado RESTAURANT_WAITER).
 */
export function isMeseroOnly(
  role: string | null | undefined,
  permissions: string[] | null | undefined,
): boolean {
  if (role === 'RESTAURANT_WAITER') return true;
  if (role !== 'RESTAURANT_STAFF') return false;
  if (!Array.isArray(permissions)) return false;
  return permissions.includes('mesero') && !permissions.some((p) => PANEL_SECTIONS.includes(p));
}

/**
 * ¿Es un "repartidor puro"? — solo entrega pedidos y NO debe ver el panel admin.
 * Mismo criterio que isMeseroOnly: su único acceso es su propia pantalla.
 */
export function isRepartidorOnly(
  role: string | null | undefined,
  permissions: string[] | null | undefined,
): boolean {
  if (role !== 'RESTAURANT_STAFF') return false;
  if (!Array.isArray(permissions)) return false;
  return permissions.includes('reparto') && !permissions.some((p) => PANEL_SECTIONS.includes(p));
}
