'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { canActOnRestaurant } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import type { ReservationStatus } from '@/lib/db/reservaciones';
import { seatTable } from '@/lib/actions/table-sessions';

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

  const db = createServiceClient();
  const base: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  const pedir = (cols: Record<string, unknown>) => db
    .from('reservations')
    .update(cols)
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId)
    .select('party_size')
    .maybeSingle();

  let { data, error } = await pedir(mesa != null ? { ...base, table_number: mesa } : base);
  // 42703 = la 128 no ha corrido aquí. Cambiar de estado no puede depender
  // de una columna que todavía no existe.
  if (error && error.code === '42703' && mesa != null) ({ data, error } = await pedir(base));
  if (error) return { error: error.message };

  if (mesa != null) {
    const res = await seatTable(restaurantId, mesa, {
      partySize: (data?.party_size as number | null) ?? null,
      source: 'reservation',
      originId: reservationId,
    });
    if (res.error && !res.needsMigration) {
      revalidatePath('/admin/reservaciones');
      return { error: res.error };
    }
  }

  revalidatePath('/admin/reservaciones');
  if (mesa != null) revalidatePath('/admin/mesas');
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
