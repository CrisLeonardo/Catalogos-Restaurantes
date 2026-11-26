/**
 * Todas las filas de una consulta, página por página.
 * ------------------------------------------------------------
 * PostgREST no devuelve más de 1,000 filas de una vez, así que una
 * exportación que pide «todo» con una sola consulta se queda corta sin
 * avisar. Esto pide rangos de 1,000 hasta que una página llega incompleta.
 * La consulta debe venir ordenada de forma estable (con `id` al final),
 * o una fila podría repetirse o saltarse entre páginas.
 *
 * Auditoría de lanzamiento 2026-11-23 (LZ-08 y LZ-10): «Exportar tus datos».
 */
export const PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function todasLasFilas<T>(
  pedir: (desde: number, hasta: number) => Pagina<T>,
  tope: number,
): Promise<{ filas: T[]; truncado: boolean }> {
  const filas: T[] = [];
  for (let desde = 0; desde < tope; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}
