/* ============================================================
   LEER TODO, POR BLOQUES (auditoría «La carta que vende», CV-09)
   ------------------------------------------------------------
   PostgREST corta cada respuesta en 1,000 filas sin avisar: una carta
   de 1,200 platillos enseñaba 1,000 y el resto desaparecía en silencio.
   Esto pide de 1,000 en 1,000 (`range`) hasta que un bloque llega
   incompleto. Quien llama debe ordenar por algo ESTABLE (con un
   desempate único, p. ej. `id`) para que los bloques no se pisen.
   Un error en cualquier bloque se devuelve tal cual: una lectura a
   medias NO se hace pasar por completa.
   ============================================================ */

export const BLOQUE = 1000;
/** Tope de seguridad: 20 bloques = 20,000 filas. */
const MAX_BLOQUES = 20;

type Respuesta<T> = { data: T[] | null; error: { code?: string; message?: string } | null };

export async function porBloques<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<Respuesta<T>>,
): Promise<Respuesta<T>> {
  const todas: T[] = [];
  for (let i = 0; i < MAX_BLOQUES; i++) {
    const desde = i * BLOQUE;
    const { data, error } = await pedir(desde, desde + BLOQUE - 1);
    if (error) return { data: null, error };
    const filas = data ?? [];
    todas.push(...filas);
    if (filas.length < BLOQUE) break;
  }
  return { data: todas, error: null };
}
