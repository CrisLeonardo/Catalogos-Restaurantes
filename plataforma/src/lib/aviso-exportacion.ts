/* ============================================================
   ¿EL DUEÑO EXPORTÓ SUS DATOS ANTES DE BORRAR EL LOCAL?
   ------------------------------------------------------------
   Auditoría de lanzamiento 2026-11-23, LZ-10 (decisión del dueño del
   24 de noviembre): no se exige exportar antes de borrar, se AVISA. Si
   el superadmin insiste, borra igual.

   `datos_exportados_at` (migración 195) lo anota «Exportar tus datos».
   Mientras la migración no esté aplicada la columna no viene en la fila
   (`undefined`): entonces no se dice nada, porque no se sabe.
   ============================================================ */

export interface AvisoExportacion {
  /** Exportó (true), no ha exportado (false). */
  exporto: boolean;
  /** Línea bajo «Eliminar restaurante». */
  linea: string;
  /** Aviso en rojo dentro de la confirmación (solo si no exportó). */
  aviso?: string;
  /** Texto del botón que confirma. */
  confirmar: string;
}

export function avisoDeExportacion(
  exportadoAt: string | null | undefined,
  zona = 'America/Guatemala',
  hoy = new Date(),
): AvisoExportacion | null {
  if (exportadoAt === undefined) return null;
  if (exportadoAt === null) {
    return {
      exporto: false,
      linea: 'El dueño todavía no ha exportado sus datos.',
      aviso: 'El dueño no ha exportado sus datos: no podrá recuperarlos.',
      confirmar: 'Eliminar de todos modos',
    };
  }
  const fecha = new Date(exportadoAt);
  const anio = (d: Date) => d.toLocaleDateString('es-GT', { timeZone: zona, year: 'numeric' });
  const texto = fecha.toLocaleDateString('es-GT', {
    timeZone: zona,
    day: 'numeric',
    month: 'long',
    ...(anio(fecha) === anio(hoy) ? {} : { year: 'numeric' }),
  });
  return { exporto: true, linea: `Exportó sus datos el ${texto}.`, confirmar: 'Eliminar' };
}
