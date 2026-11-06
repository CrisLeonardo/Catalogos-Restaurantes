'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { canActOnRestaurant } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { puedeEnSeccion, SIN_SECCION } from '@/lib/auth/seccion';
import type { ReservationStatus } from '@/lib/db/reservaciones';
import { sentarDesdeRecepcion } from '@/lib/actions/table-sessions';
import { getMesasConfiguradas } from '@/lib/db/table-sessions';
import { revalidarSalon } from '@/lib/salon-cache';

export type ReservationResult = { error?: string; ok?: boolean };

async function getAuthorizedRestaurantId(restaurantId: string): Promise<{ ok: true; restaurantId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false, error: 'Perfil no encontrado.' };

  const isSuper = profile.role === 'SUPER_ADMIN';
  // Administrar el grupo de esta sucursal basta (migración 116).
  if (await canActOnGroupBranch(restaurantId)) return { ok: true, restaurantId };
  const allowed = ['RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER'];
  if (!isSuper && !allowed.includes(profile.role)) return { ok: false, error: 'Sin permisos.' };
  if (!isSuper && !(await canActOnRestaurant(profile.restaurant_id, restaurantId))) return { ok: false, error: 'No autorizado.' };
  // SEC-06: la sección Reservaciones — o el salón, que es quien sienta a la
  // gente que llega con reserva (Mesas, Tomar pedidos).
  if (!isSuper && !(await puedeEnSeccion(restaurantId, 'reservaciones', 'mesas', 'mesero'))) {
    return { ok: false, error: SIN_SECCION };
  }

  return { ok: true, restaurantId };
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
  },
): Promise<ReservationResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
  if (!auth.ok) return { error: auth.error };

  if (!data.customer_name?.trim()) return { error: 'El nombre es requerido.' };
  if (!data.date) return { error: 'La fecha es requerida.' };
  if (!data.time) return { error: 'La hora es requerida.' };
  if (data.party_size < 1) return { error: 'El número de personas debe ser al menos 1.' };

  const db = createServiceClient();
  const { error } = await db.from('reservations').insert({
    restaurant_id: restaurantId,
    customer_name: data.customer_name.trim(),
    customer_phone: data.customer_phone?.trim() || null,
    party_size: data.party_size,
    date: data.date,
    time: data.time,
    notes: data.notes?.trim() || null,
    status: 'PENDING',
  });
  if (error) return { error: error.message };

  revalidatePath('/admin/reservaciones');
  return { ok: true };
}

/**
 * Mueve la reserva de estado y, al pasarla a «En mesa», dice en cuál.
 *
 * `SEATED` existía desde la migración 043 y no guardaba número de mesa: una
 * reserva «En mesa» no decía en cuál, y el salón no se enteraba de que esa
 * gente ya estaba dentro (hallazgo M-04). Ahora el mismo toque abre el turno
 * de la mesa con las personas que dice la reserva.
 *
 * `tableNumber` es opcional: se puede seguir marcando «En mesa» sin anotarla.
 */
export async function updateReservationStatus(
  restaurantId: string,
  reservationId: string,
  status: ReservationStatus,
  tableNumber?: number | null,
): Promise<ReservationResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const mesa = status === 'SEATED'
    && tableNumber != null && Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 999
    ? tableNumber
    : null;

  if (mesa != null) return sentarDesdeRecepcion(restaurantId, mesa, reservationId, 'reservation');

  const { error } = await createServiceClient().from('reservations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/reservaciones');
  return { ok: true };
}

export async function preverMesaDeReserva(
  restaurantId: string, reservationId: string, mesa: number | null,
): Promise<ReservationResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
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

export async function deleteReservation(
  restaurantId: string,
  reservationId: string,
): Promise<ReservationResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const db = createServiceClient();
  const { error } = await db
    .from('reservations')
    .delete()
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/reservaciones');
  return { ok: true };
}
