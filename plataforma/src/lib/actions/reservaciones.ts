'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { actorEn, tiene } from '@/lib/auth/capacidades';
import { SIN_SECCION } from '@/lib/auth/seccion';
import type { ReservationStatus } from '@/lib/db/reservaciones';
import { sentarDesdeRecepcion } from '@/lib/actions/table-sessions';
import { getMesasConfiguradas } from '@/lib/db/table-sessions';
import { revalidarSalon } from '@/lib/salon-cache';
import { aforoDeMesas } from '@/lib/recepcion/agenda';
import { logActivity } from '@/lib/activity';

/* ============================================================
   RESERVAS (auditoría 1.8: R17)
   ------------------------------------------------------------
   Crear y reprogramar pasan por `leogin_guardar_reserva` (migración 178),
   que comprueba bajo bloqueo cuántas personas habría a la vez en la franja.
   Si se pasa del aforo devuelve los números y no escribe; «Reservar de
   todas formas» (decisión del dueño, 2026-11-09) lo fuerza y queda en la
   bitácora. Los estados sólo avanzan por transiciones conocidas.
   ============================================================ */

export type Sobrecupo = { aforo: number; ocupadas: number; libres: number; duracion: number };
export type ReservationResult = { error?: string; ok?: boolean; sobrecupo?: Sobrecupo };

/** Quién puede llevar la recepción: «Lista de espera y reservaciones» o el salón. */
async function autorizar(restaurantId: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const actor = await actorEn(restaurantId);
  if (!actor) return { ok: false, error: 'No autorizado.' };
  if (!tiene(actor, 'lista_espera', 'mesas')) return { ok: false, error: SIN_SECCION };
  return { ok: true, userId: actor.userId };
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}(:\d{2})?$/;

async function aforoDelLocal(restaurantId: string): Promise<number | null> {
  try {
    return aforoDeMesas(await getMesasConfiguradas(restaurantId)).total;
  } catch {
    // Sin poder leer el salón no se inventa un aforo: se guarda sin comprobarlo.
    return null;
  }
}

async function guardar(
  restaurantId: string, userId: string,
  d: { id?: string | null; nombre?: string; telefono?: string; personas: number; fecha: string; hora: string; notas?: string; forzar?: boolean },
): Promise<ReservationResult> {
  if (!FECHA_RE.test(d.fecha)) return { error: 'La fecha no es válida.' };
  if (!HORA_RE.test(d.hora)) return { error: 'La hora no es válida.' };
  if (!Number.isInteger(d.personas) || d.personas < 1 || d.personas > 100) return { error: 'Personas: entre 1 y 100.' };
  const { data, error } = await createServiceClient().rpc('leogin_guardar_reserva', {
    p_restaurant: restaurantId, p_reserva: d.id ?? null, p_nombre: d.nombre ?? '', p_telefono: d.telefono ?? '',
    p_personas: d.personas, p_fecha: d.fecha, p_hora: d.hora, p_notas: d.notas ?? '',
    p_aforo: await aforoDelLocal(restaurantId), p_forzar: d.forzar === true, p_actor: userId,
  });
  if (error) {
    if (/LGD01|22023/.test(error.code ?? '')) return { error: error.message };
    return { error: 'No se pudo guardar la reserva. Intenta de nuevo.' };
  }
  const res = data as { ok: boolean; sobrecupo?: boolean; aforo?: number; ocupadas?: number; libres?: number; duracion?: number };
  if (!res.ok && res.sobrecupo) {
    return { sobrecupo: { aforo: res.aforo ?? 0, ocupadas: res.ocupadas ?? 0, libres: res.libres ?? 0, duracion: res.duracion ?? 90 } };
  }
  revalidatePath('/admin/reservaciones');
  return { ok: true };
}

export async function createReservation(
  restaurantId: string,
  data: {
    customer_name: string;
    customer_phone?: string;
    party_size: number;
    date: string;
    time: string;
    notes?: string;
    /** «Reservar de todas formas» aunque supere el aforo. */
    forzar?: boolean;
  },
): Promise<ReservationResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };
  if (!data.customer_name?.trim()) return { error: 'Escribe el nombre de la reserva.' };
  return guardar(restaurantId, auth.userId, {
    nombre: data.customer_name, telefono: data.customer_phone, personas: Number(data.party_size),
    fecha: data.date, hora: data.time, notas: data.notes, forzar: data.forzar,
  });
}

/** Cambiar fecha u hora con la misma comprobación de capacidad (R17.5). */
export async function reprogramarReserva(
  restaurantId: string, reservationId: string, fecha: string, hora: string, personas: number, forzar = false,
): Promise<ReservationResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };
  return guardar(restaurantId, auth.userId, { id: reservationId, personas, fecha, hora, forzar });
}

/**
 * De qué estados se puede llegar a cada uno. «Llegó» en una reserva de un
 * día anterior la da por COMPLETED: ya pasó, no abre mesa hoy.
 */
const DESDE: Partial<Record<ReservationStatus, ReservationStatus[]>> = {
  CONFIRMED: ['PENDING'],
  COMPLETED: ['PENDING', 'CONFIRMED', 'SEATED'],
  CANCELLED: ['PENDING', 'CONFIRMED'],
  NO_SHOW: ['PENDING', 'CONFIRMED'],
  SEATED: ['PENDING', 'CONFIRMED'],
};

/**
 * Mueve la reserva de estado y, al pasarla a «En mesa» con mesa, la sienta
 * en una sola transacción (`leogin_sentar_desde_recepcion`, migración 173).
 */
export async function updateReservationStatus(
  restaurantId: string,
  reservationId: string,
  status: ReservationStatus,
  tableNumber?: number | null,
): Promise<ReservationResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };
  const desde = DESDE[status];
  if (!desde) return { error: 'Ese cambio de estado no existe.' };

  const mesa = status === 'SEATED'
    && tableNumber != null && Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 999
    ? tableNumber
    : null;
  if (mesa != null) return sentarDesdeRecepcion(restaurantId, mesa, reservationId, 'reservation');

  const { data, error } = await createServiceClient().from('reservations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId)
    .in('status', desde)
    .select('id, customer_name');
  if (error) return { error: 'No se pudo cambiar la reserva. Intenta de nuevo.' };
  if (!data?.length) return { error: 'La reserva cambió mientras tanto. Actualiza la página.' };
  if (status === 'NO_SHOW') {
    await logActivity({ restaurantId, actorId: auth.userId, action: 'reserva_no_asistio', entity: data[0].customer_name as string });
  }

  revalidatePath('/admin/reservaciones');
  if (status === 'CANCELLED' || status === 'NO_SHOW') revalidarSalon();
  return { ok: true };
}

export async function preverMesaDeReserva(
  restaurantId: string, reservationId: string, mesa: number | null,
): Promise<ReservationResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };
  let capacidad: number | null = null;
  if (mesa != null) {
    try {
      const elegida = (await getMesasConfiguradas(restaurantId)).find((m) => m.n === mesa);
      if (!elegida) return { error: 'La mesa ya no está en el salón.' };
      capacidad = elegida.capacidad;
    } catch {
      return { error: 'No se pudo leer la capacidad del salón.' };
    }
  }
  const { error } = await createServiceClient().rpc('leogin_prever_mesa_de_reserva', {
    p_restaurant: restaurantId, p_reserva: reservationId, p_mesa: mesa, p_capacidad: capacidad,
  });
  if (error) return { error: error.message };
  revalidarSalon();
  return { ok: true };
}

/** Duración de una reserva en este local (90 min por defecto, migración 178). */
export async function setDuracionReserva(restaurantId: string, minutos: number): Promise<ReservationResult> {
  const actor = await actorEn(restaurantId);
  if (!actor || !tiene(actor, 'ajustes', 'lista_espera')) return { error: 'No autorizado.' };
  if (![60, 90, 120, 150, 180].includes(minutos)) return { error: 'Elige una duración de la lista.' };
  const { error } = await createServiceClient().from('restaurants')
    .update({ duracion_reserva_min: minutos }).eq('id', restaurantId);
  if (error) return { error: 'No se pudo guardar la duración.' };
  await logActivity({ restaurantId, actorId: actor.userId, action: 'ajuste', entity: 'Duración de reserva', meta: { duracion_reserva_min: minutos } });
  revalidatePath('/admin/reservaciones');
  return { ok: true };
}

export async function deleteReservation(
  restaurantId: string,
  reservationId: string,
): Promise<ReservationResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const { error } = await createServiceClient()
    .from('reservations')
    .delete()
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId)
    .in('status', ['CANCELLED', 'COMPLETED']);
  if (error) return { error: 'No se pudo eliminar la reserva.' };

  revalidatePath('/admin/reservaciones');
  return { ok: true };
}
