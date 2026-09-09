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
import { canActOnRestaurant } from '@/lib/db/membership';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { seatTable } from '@/lib/actions/table-sessions';
import { faltaLaColumna } from '@/lib/db/migracion-ausente';

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

  // Administrar el grupo de esta sucursal basta (migración 116).
  if (await canActOnGroupBranch(restaurantId)) return { ok: true, restaurantId };
  if (profile.role !== 'SUPER_ADMIN' && !(await canActOnRestaurant(profile.restaurant_id, restaurantId))) {
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

/**
 * Los sienta, y desde la migración 128 dice EN QUÉ MESA.
 *
 * Antes esto solo cambiaba el estado a 'SEATED': la cola marcaba «sentados»
 * y el salón no se enteraba de nada, así que la mesa seguía saliendo libre y
 * el mensaje de WhatsApp prometía «ya tenemos mesa lista» sin saber cuál
 * (hallazgo M-04). Ahora el mismo toque abre el turno de esa mesa, con la
 * gente que decía la ficha de la cola.
 *
 * `tableNumber` sigue siendo opcional: sentar sin anotar mesa era lo único
 * que se podía hacer hasta hoy y hay locales que trabajan así.
 */
export async function markWaitlistSeated(
  restaurantId: string,
  id: string,
  tableNumber?: number | null,
): Promise<WaitlistResult> {
  const auth = await getAuthorizedRestaurantId(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const mesa = tableNumber != null && Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 999
    ? tableNumber
    : null;

  const db = createServiceClient();
  const cambios: Record<string, unknown> = { status: 'SEATED', seated_at: new Date().toISOString() };
  if (mesa != null) cambios.table_number = mesa;

  const pedir = (cols: Record<string, unknown>) => db
    .from('waitlist_entries')
    .update(cols)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select('party_size')
    .maybeSingle();

  let { data, error } = await pedir(cambios);
  /* Si falta la columna, la 128 todavía no corrió aquí. Sentar tiene que
     seguir funcionando: se reintenta sin la mesa, igual que `party_size` en
     el salón. Perder el número es malo; no poder sentar, peor. */
  if (faltaLaColumna(error) && mesa != null) {
    ({ data, error } = await pedir({ status: 'SEATED', seated_at: new Date().toISOString() }));
  }
  if (error) return { error: error.message };

  if (mesa != null) {
    const res = await seatTable(restaurantId, mesa, {
      partySize: (data?.party_size as number | null) ?? null,
      source: 'waitlist',
      originId: id,
    });
    /* Si la mesa ya estaba sentada no se deshace nada: la gente YA está
       marcada como sentada, que es lo que el host acaba de hacer. Se le
       dice, y él decide si era otra mesa. */
    if (res.error && !res.needsMigration) {
      revalidatePath('/admin/lista-espera');
      return { error: res.error };
    }
  }

  revalidatePath('/admin/lista-espera');
  revalidatePath('/admin/mesas');
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
