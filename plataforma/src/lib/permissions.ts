/* ============================================================
   PERMISOS del panel admin (Fase D)
   El dueño puede dar a su staff acceso solo a ciertas secciones.
   Reglas:
   · SUPER_ADMIN y RESTAURANT_OWNER → todo.
   · RESTAURANT_STAFF con permissions = null → todo (sin restringir aún).
   · RESTAURANT_STAFF con permissions = [..] → solo esas secciones.
   · "personal" (gestión de staff) es exclusivo del dueño (ver layout).
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

/** Secciones que un staff puede tener asignadas (las que el dueño puede delegar). */
export const STAFF_ASSIGNABLE: SectionKey[] = ADMIN_SECTIONS.map((s) => s.key);

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
    if (permissions == null) return true; // aún sin restringir
    return permissions.includes(section);
  }
  // RESTAURANT_WAITER (deprecado): solo conserva acceso a la sección "mesero".
  if (role === 'RESTAURANT_WAITER') return section === 'mesero';
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
