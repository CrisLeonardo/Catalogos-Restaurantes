'use server';

/* ============================================================
   SENTAR Y REPARTIR MESAS (migración 128 · hallazgos M-02 y M-05)
   ------------------------------------------------------------
   El verbo que le faltaba al salón. Hasta aquí una mesa solo existía si
   tenía un pedido, así que «sentar» no se podía ni decir: la hostess
   anotaba en la cabeza, dos meseros iban a la misma mesa recién sentada,
   y las personas contadas antes del primer plato vivían en la memoria de
   un teléfono.

   Estas acciones NO tocan pedidos. Ese es justo el punto: sentar es una
   decisión del puesto de mando —quién llegó, cuántos son, a quién le
   toca— y tomar el pedido es trabajo de servicio. Son dos pantallas
   porque son dos trabajos; hasta ahora se parecían porque el primero no
   existía.
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { assertTableAccess } from '@/lib/auth/table-access';
import { hayTurnosDeMesa } from '@/lib/db/table-sessions';
import { hayColumnaMesa } from '@/lib/db/mesa-columna';
import { logActivity } from '@/lib/activity';
import { revalidarSalon } from '@/lib/salon-cache';

/** `needsMigration` distingue «no se pudo» de «esto todavía no existe aquí»:
    quien pulsó «Sentar» merece leer por qué, pero quien solo estaba contando
    personas en una comanda no debería ver un error rojo por una migración
    pendiente — se queda con el borrador de siempre y ya está. */
export type SeatResult = { error?: string; ok?: boolean; needsMigration?: boolean };

/** Lo que se puede anotar de una mesa sentada. */
export interface SeatInput {
  /** Comensales. `null` = no se preguntó; se guarda vacío, no cero. */
  partySize?: number | null;
  /** Mesero al que le toca. `null` = sin repartir todavía. */
  waiterId?: string | null;
  note?: string | null;
  source?: 'walk_in' | 'reservation' | 'waitlist';
  originId?: string | null;
}

const SIN_TABLA = 'Esta función necesita la migración 128 (sentar la mesa). '
  + 'Pídele a soporte que la corra y vuelve a intentar.';

function numeroValido(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 999;
}

/** `party_size` limpio: entero de 1 a 100, o vacío. Nunca cero — «cero
    personas sentadas» sería una mesa libre con una fila encima. */
function paxLimpio(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, 100);
}

/* ── Sentar ────────────────────────────────────────────────── */

/**
 * Abre el turno de una mesa: llegó gente.
 *
 * El choque de dos aparatos sentando la misma mesa lo resuelve el índice
 * único parcial de la base, no este código: ganarle por consulta previa
 * sería una carrera perdida de antemano. Aquí solo se traduce el 23505 a
 * una frase que un mesero pueda leer.
 */
export async function seatTable(
  restaurantId: string,
  tableNumber: number,
  input: SeatInput = {},
): Promise<SeatResult> {
  if (!restaurantId || !numeroValido(tableNumber)) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId, ['mesero', 'mesas']);
  if ('error' in acceso) return acceso;
  if (!(await hayTurnosDeMesa())) return { error: SIN_TABLA, needsMigration: true };

  const db = createServiceClient();
  const { error } = await db.from('table_sessions').insert({
    restaurant_id: restaurantId,
    table_number: tableNumber,
    party_size: paxLimpio(input.partySize),
    waiter_id: input.waiterId || null,
    seated_by: acceso.actor.userId,
    source: input.source ?? 'walk_in',
    origin_id: input.originId || null,
    note: input.note?.trim() || null,
  });

  if (error) {
    // 23505 = el índice único parcial: ya había un turno abierto en esa mesa.
    if (error.code === '23505') return { error: `La mesa ${tableNumber} ya está sentada.` };
    return { error: error.message };
  }

  await logActivity({
    restaurantId,
    actorId: acceso.actor.userId,
    action: 'mesa',
    entity: String(tableNumber),
    meta: { sentar: true, pax: paxLimpio(input.partySize), source: input.source ?? 'walk_in' },
  });

  revalidarSalon();
  return { ok: true };
}

/* ── Corregir lo anotado ───────────────────────────────────── */

/**
 * Cambia comensales o mesero de una mesa ya sentada.
 *
 * Si la mesa tiene pedidos pero nadie la sentó —el caso de siempre: entró
 * por el QR, o el mesero apuntó directo— se ABRE el turno en ese momento
 * con `source: 'order'`. Así asignarle mesero a una mesa funciona igual
 * venga de donde venga, que es lo que M-05 pide: repartir el salón no
 * puede depender de que alguien recuerde haber pulsado «Sentar».
 */
export async function updateSeating(
  restaurantId: string,
  tableNumber: number,
  input: { partySize?: number | null; waiterId?: string | null },
): Promise<SeatResult> {
  if (!restaurantId || !numeroValido(tableNumber)) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId, ['mesero', 'mesas']);
  if ('error' in acceso) return acceso;
  if (!(await hayTurnosDeMesa())) return { error: SIN_TABLA, needsMigration: true };

  const db = createServiceClient();
  const cambios: Record<string, unknown> = {};
  if ('partySize' in input) cambios.party_size = paxLimpio(input.partySize);
  if ('waiterId' in input) cambios.waiter_id = input.waiterId || null;
  if (Object.keys(cambios).length === 0) return { ok: true };

  const { data, error } = await db
    .from('table_sessions')
    .update(cambios)
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .is('closed_at', null)
    .select('id');

  if (error) return { error: error.message };

  if ((data ?? []).length === 0) {
    // No había turno: se abre ahora con lo que se acaba de anotar.
    const abierto = await db.from('table_sessions').insert({
      restaurant_id: restaurantId,
      table_number: tableNumber,
      party_size: paxLimpio(input.partySize),
      waiter_id: input.waiterId || null,
      seated_by: acceso.actor.userId,
      source: 'order',
    });
    if (abierto.error) {
      if (abierto.error.code === '23505') return { error: 'Alguien acaba de tocar esta mesa. Vuelve a intentar.' };
      return { error: abierto.error.message };
    }
  }

  revalidarSalon();
  return { ok: true };
}

/* ── Soltar ────────────────────────────────────────────────── */

/**
 * Cierra el turno sin cobrar: se levantaron sin consumir, o se sentó la
 * mesa equivocada.
 *
 * **Se niega si la mesa tiene pedidos vivos.** Soltarla ahí dejaría una
 * cuenta abierta sin mesa que la reclame —dinero que desaparece de la
 * vista del dueño, que es exactamente el fallo M-03 que esta misma fase
 * viene a cerrar—. Para eso está Cobrar.
 */
export async function unseatTable(
  restaurantId: string,
  tableNumber: number,
): Promise<SeatResult> {
  if (!restaurantId || !numeroValido(tableNumber)) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId, ['mesero', 'mesas']);
  if ('error' in acceso) return acceso;
  if (!(await hayTurnosDeMesa())) return { error: SIN_TABLA, needsMigration: true };

  const db = createServiceClient();
  const porNumero = await hayColumnaMesa();
  const consulta = db
    .from('orders')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('order_type', 'DINE_IN')
    .not('status', 'in', '("DELIVERED","CANCEL")')
    .limit(1);
  const { data: vivos } = porNumero
    ? await consulta.eq('table_number', tableNumber)
    : await consulta.eq('address', `Mesa ${tableNumber}`);

  if ((vivos ?? []).length > 0) {
    return { error: `La mesa ${tableNumber} tiene consumo sin cobrar. Ciérrala desde Cobrar.` };
  }

  const { error } = await db
    .from('table_sessions')
    .update({ closed_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .is('closed_at', null);

  if (error) return { error: error.message };

  await logActivity({
    restaurantId,
    actorId: acceso.actor.userId,
    action: 'mesa',
    entity: String(tableNumber),
    meta: { soltar: true },
  });

  revalidarSalon();
  return { ok: true };
}
