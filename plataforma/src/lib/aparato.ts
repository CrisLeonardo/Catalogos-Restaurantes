/* ============================================================
   PARA QUÉ ES ESTE APARATO (ficha 2.6 de la auditoría, A06)
   ------------------------------------------------------------
   La tablet de cocina despertaba en «Hoy», como la del dueño, y cada
   mañana alguien iba a Pedidos › Cocina › pantalla completa. Ahora el
   aparato recuerda su uso (`restaurant_devices.uso`, migración 184) y
   quien entra ahí abre directo en esa pantalla, a pantalla completa.

   Recordar la pantalla NUNCA amplía permisos: solo se lleva a quien ya
   tiene esa sección en su menú (`destinoDelAparato`). El servidor la
   vuelve a comprobar al abrirla, como siempre.
   ============================================================ */

export type UsoAparato = 'cocina' | 'caja' | 'mesero';

export interface DefUso {
  label: string;
  desc: string;
  /** Ruta interna del panel. */
  ruta: string;
  /** La preferencia de pantalla completa de esa pantalla (AdminShell). */
  kioskKey: string;
}

export const USOS: Record<UsoAparato, DefUso> = {
  cocina: { label: 'Cocina', desc: 'Las comandas, a pantalla completa', ruta: '/admin/cocina', kioskKey: 'leogin:modo-servicio:cocina' },
  caja: { label: 'Caja', desc: 'Cobrar y cerrar el turno', ruta: '/admin/caja', kioskKey: 'leogin:modo-servicio:caja' },
  mesero: { label: 'Tomar pedidos', desc: 'El salón y las mesas', ruta: '/admin/mesero', kioskKey: 'leogin:modo-servicio:mesero' },
};

export const ORDEN_USOS: UsoAparato[] = ['cocina', 'caja', 'mesero'];

/** Lo que venga de la base o de un formulario, ya validado. */
export function leerUso(v: unknown): UsoAparato | null {
  return v === 'cocina' || v === 'caja' || v === 'mesero' ? v : null;
}

/**
 * A dónde abre este aparato para esta persona, o null si a su pantalla de
 * siempre. `rutasPermitidas` son las del menú de ESA persona (ya filtradas
 * por plan, módulos y permisos), así que nunca se le abre algo que no tiene.
 */
export function destinoDelAparato(uso: UsoAparato | null, rutasPermitidas: ReadonlySet<string>): string | null {
  if (!uso) return null;
  const { ruta } = USOS[uso];
  return rutasPermitidas.has(ruta) ? ruta : null;
}

/** Marca de pestaña: el inicio directo pasa una vez por apertura de la app. */
export const MARCA_INICIO = 'leogin:aparato-inicio';
