'use server';

/* ============================================================
   LISTA DE ESPERA PARA WALK-INS (Fase 3 auditoría de lanzamiento)
   ------------------------------------------------------------
   Cola en vivo para el comensal que llega SIN reservar: el host/mesero
   anota grupo + tamaño al llegar, avisa cuando hay mesa, y marca sentado.
   A diferencia de `reservations` (fecha/hora futura), aquí solo hay
   "cuándo llegó" — el orden de la cola. Delegable como permiso propio
   ("lista_espera" en ADMIN_SECTIONS) para que el dueño pueda dárselo a un
   host/mesero sin abrirle el resto del panel.
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { can } from '@/lib/permissions';

export type WaitlistResult = { error?: string; ok?: boolean };

async function getAuthorizedRestaurantId(restaurantId: string): Promise<{ ok: true; restaurantId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false, error: 'Perfil no encontrado.' };

  if (profile.role === 'GROUP_OWNER') {
    if ((await resolveGroupBranchId()) !== restaurantId) return { ok: false, error: 'No autorizado.' };
    return { ok: true, restaurantId };
  }
  if (profile.role !== 'SUPER_ADMIN' && profile.restaurant_id !== restaurantId) {
    return { ok: false, error: 'No autorizado.' };
  }
  if (!can(profile.role, profile.permissions as string[] | null, 'lista_espera')) {
    return { ok: false, error: 'No autorizado.' };
  }

  return { ok: true, restaurantId };
}

export async function addToWaitlist(
  restaurantId: string,
  data: { customer_name: string; party_size: number; phone?: string; notes?: string },
): Promise<WaitlistResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
  if (!auth.ok) return { error: auth.error };

  if (!data.customer_name?.trim()) return { error: 'El nombre es requerido.' };
  if (!data.party_size || data.party_size < 1) return { error: 'El número de personas debe ser al menos 1.' };

  const db = createServiceClient();
  const { error } = await db.from('waitlist_entries').insert({
    restaurant_id: restaurantId,
    customer_name: data.customer_name.trim(),
    party_size: data.party_size,
    phone: data.phone?.trim() || null,
    notes: data.notes?.trim() || null,
    status: 'WAITING',
  });
  if (error) return { error: error.message };

  revalidatePath('/admin/lista-espera');
  return { ok: true };
}

/** Avisa al grupo que ya hay mesa (marca notified_at para medir el tiempo de espera real). */
export async function markWaitlistNotified(restaurantId: string, id: string): Promise<WaitlistResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const db = createServiceClient();
  const { error } = await db
    .from('waitlist_entries')
    .update({ status: 'NOTIFIED', notified_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/lista-espera');
  return { ok: true };
}

export async function markWaitlistSeated(restaurantId: string, id: string): Promise<WaitlistResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const db = createServiceClient();
  const { error } = await db
    .from('waitlist_entries')
    .update({ status: 'SEATED', seated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/lista-espera');
  return { ok: true };
}

export async function cancelWaitlistEntry(restaurantId: string, id: string): Promise<WaitlistResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const db = createServiceClient();
  const { error } = await db
    .from('waitlist_entries')
    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/lista-espera');
  return { ok: true };
}
