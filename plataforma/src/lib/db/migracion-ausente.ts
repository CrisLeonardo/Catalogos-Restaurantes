/**
 * «¿Esto falló porque la migración todavía no corrió aquí?»
 * ------------------------------------------------------------
 * En este proyecto las migraciones se pegan a mano en el editor SQL y
 * llegan tarde, así que entre que el código sale y la migración se aplica
 * hay una ventana en la que la tabla o la columna no existen. Media
 * docena de sitios preguntan por eso para degradar en silencio en vez de
 * enseñarle al mesero un error de Postgres.
 *
 * Todos preguntaban por su cuenta, y los que preguntaban por una TABLA
 * preguntaban MAL: comprobaban `42P01` (undefined_table), que es lo que
 * devuelve Postgres, pero entre nosotros y Postgres está PostgREST, que
 * valida contra su caché de esquema y contesta otra cosa. La comprobación
 * no se disparaba nunca, y el camino de degradación —escrito, comentado y
 * probado— no llegaba a ejecutarse.
 *
 * Medido contra el stack local (8 de septiembre de 2026), los cuatro
 * casos que existen:
 *
 *   | qué falta          | al leer  | al escribir |
 *   |--------------------|----------|-------------|
 *   | la TABLA           | PGRST205 | PGRST205    |
 *   | la COLUMNA         | 42703    | PGRST204    |
 *
 * Se conservan además los códigos de Postgres crudos (`42P01`): una
 * llamada por RPC o una vista que toque la tabla por dentro sí los
 * devuelve, porque ahí el error sube de Postgres sin que PostgREST lo
 * reescriba.
 *
 * La regla vive aquí una sola vez, por el mismo motivo que
 * `revalidarSalon()`: seis copias de la misma comprobación es cómo se
 * llega a que cinco estén bien y una mal, y a nadie se le ocurra volver a
 * mirarlas.
 */

interface ErrorDeSupabase {
  code?: string | null;
  message?: string | null;
}

/** La TABLA no existe todavía en esta base. */
export function faltaLaTabla(error: ErrorDeSupabase | null | undefined): boolean {
  const code = error?.code;
  return code === 'PGRST205' || code === '42P01';
}

/** La COLUMNA no existe todavía en esta base (leer o escribir). */
export function faltaLaColumna(error: ErrorDeSupabase | null | undefined): boolean {
  const code = error?.code;
  return code === '42703' || code === 'PGRST204';
}

/** Cualquiera de las dos: la migración no ha llegado a esta base. */
export function faltaLaMigracion(error: ErrorDeSupabase | null | undefined): boolean {
  return faltaLaTabla(error) || faltaLaColumna(error);
}
