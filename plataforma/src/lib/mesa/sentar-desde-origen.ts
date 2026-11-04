import 'server-only';

/* ============================================================
   SENTAR UN GRUPO QUE VIENE DE LA LISTA DE ESPERA O DE UNA RESERVA
   ------------------------------------------------------------
   Auditoría 2026-11-03, ficha 0.9 (X14, N22, E14). Antes las dos acciones
   marcaban al grupo «sentado» y DESPUÉS intentaban ocupar la mesa. Si la
   mesa ya tenía otro grupo, la lista o la reserva quedaban diciendo
   «sentados en la 9» mientras la 9 seguía siendo de otros (reproducido en
   la base local).

   Ahora el orden es: primero la MESA, después el GRUPO. Si la mesa no se
   puede ocupar, el grupo sigue en la lista con la causa y nada cambia.

   Repetir la acción es seguro: si la mesa ya tiene un turno abierto que
   nació de ESTE grupo (`origin_id`), se da por sentada y no se abre otro.
   Así un intento que ocupó la mesa pero no alcanzó a marcar al grupo se
   completa con solo volver a tocar «Sentar».
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { seatTable } from '@/lib/actions/table-sessions';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';

export type SentarResultado =
  | { ok: true }
  /** La tabla de turnos de mesa no existe aquí (migración 128 pendiente). */
  | { ok: true; sinTurnos: true }
  | { error: string };

export async function sentarDesdeOrigen(
  restaurantId: string,
  mesa: number,
  origen: { source: 'waitlist' | 'reservation'; originId: string; partySize: number | null; quien: string },
): Promise<SentarResultado> {
  const db = createServiceClient();

  // ¿La mesa ya tiene un turno abierto? ¿Es de este mismo grupo?
  const { data: abierta, error } = await db
    .from('table_sessions')
    .select('origin_id')
    .eq('restaurant_id', restaurantId)
    .eq('table_number', mesa)
    .is('closed_at', null)
    .maybeSingle();
  if (error && !faltaLaTabla(error)) return { error: 'No se pudo revisar la mesa. Intenta de nuevo.' };
  if (abierta) {
    if ((abierta as { origin_id: string | null }).origin_id === origen.originId) return { ok: true };
    return { error: mesaOcupada(mesa, origen.quien) };
  }

  const res = await seatTable(restaurantId, mesa, {
    partySize: origen.partySize,
    source: origen.source,
    originId: origen.originId,
  });
  if (res.needsMigration) return { ok: true, sinTurnos: true };
  // Otro aparato la ocupó entre la revisión y ahora (índice único).
  if (res.error) return { error: /ya está sentada/.test(res.error) ? mesaOcupada(mesa, origen.quien) : res.error };
  return { ok: true };
}

/**
 * La mesa que ya tiene abierta este grupo, si un intento anterior la ocupó
 * pero no alcanzó a marcarlo. El selector de mesas ya no la ofrece como
 * libre, así que «Sentar» sin mesa la retoma en vez de dejarla huérfana.
 */
export async function mesaAbiertaDelOrigen(restaurantId: string, originId: string): Promise<number | null> {
  const { data, error } = await createServiceClient()
    .from('table_sessions')
    .select('table_number')
    .eq('restaurant_id', restaurantId)
    .eq('origin_id', originId)
    .is('closed_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { table_number: number }).table_number;
}

function mesaOcupada(mesa: number, quien: string): string {
  return `La mesa ${mesa} ya está ocupada por otro grupo. ${quien} sigue pendiente: elige otra mesa o libera la ${mesa}.`;
}
