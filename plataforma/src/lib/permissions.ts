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
  { key: 'pedidos',      label: 'Pedidos' },
  { key: 'catalogo',     label: 'Catálogo' },
  { key: 'categorias',   label: 'Categorías' },
  { key: 'inventario',   label: 'Inventario' },
  { key: 'clientes',     label: 'Clientes' },
  { key: 'metricas',     label: 'Métricas' },
  { key: 'analitica',    label: 'Analítica' },
  { key: 'finanzas',     label: 'Finanzas' },
  { key: 'promociones',  label: 'Promociones' },
  { key: 'suscripcion',  label: 'Mi suscripción' },
  { key: 'personalizar', label: 'Personalizar' },
  { key: 'perfil',       label: 'Perfil' },
  { key: 'mesas',        label: 'Mesas' },
  { key: 'qr',           label: 'QR' },
  { key: 'soporte',      label: 'Soporte' },
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
  if (role === 'SUPER_ADMIN' || role === 'RESTAURANT_OWNER') return true;
  if (role === 'RESTAURANT_STAFF') {
    if (permissions == null) return true; // aún sin restringir
    return permissions.includes(section);
  }
  // RESTAURANT_WAITER no tiene acceso al panel admin (solo a /admin/mesero)
  return false;
}
