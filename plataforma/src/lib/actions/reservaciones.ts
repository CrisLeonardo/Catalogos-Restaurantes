'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import type { ReservationStatus } from '@/lib/db/reservaciones';

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
  if (profile.role === 'GROUP_OWNER') {
    if ((await resolveGroupBranchId()) !== restaurantId) return { ok: false, error: 'No autorizado.' };
    return { ok: true, restaurantId };
  }
  const allowed = ['RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER'];
  if (!isSuper && !allowed.includes(profile.role)) return { ok: false, error: 'Sin permisos.' };
  if (!isSuper && profile.restaurant_id !== restaurantId) return { ok: false, error: 'No autorizado.' };

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

export async function updateReservationStatus(
  restaurantId: string,
  reservationId: string,
  status: ReservationStatus,
): Promise<ReservationResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const db = createServiceClient();
  const { error } = await db
    .from('reservations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/reservaciones');
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
