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
import { mesaAbiertaDelOrigen, sentarDesdeOrigen } from '@/lib/mesa/sentar-desde-origen';
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

  const elegida = tableNumber != null && Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 999
    ? tableNumber
    : null;
  // Sin mesa elegida: si un intento anterior ya ocupó una para este grupo, es esa.
  const mesa = elegida ?? await mesaAbiertaDelOrigen(restaurantId, id);

  const db = createServiceClient();

  // El grupo: quién es, cuántos y si sigue esperando.
  const { data: grupo, error: errGrupo } = await db
    .from('waitlist_entries')
    .select('customer_name, party_size, status')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (errGrupo) return { error: 'No se pudo leer la lista de espera. Intenta de nuevo.' };
  if (!grupo) return { error: 'Ese grupo ya no está en la lista.' };
  const fila = grupo as { customer_name: string; party_size: number | null; status: string };
  // Repetir «Sentar» sobre un grupo ya sentado no hace nada más.
  if (fila.status === 'SEATED') return { ok: true };
  if (fila.status === 'CANCELLED') return { error: 'Ese grupo se canceló.' };

  /* PRIMERO la mesa, después el grupo (auditoría 2026-11-03, X14). Antes
     se marcaba «sentados» y luego se intentaba ocupar la mesa: si estaba
     ocupada por otros, la lista decía «sentados en la 9» y la 9 seguía
     siendo de otro grupo. Ahora, si la mesa no se puede ocupar, el grupo
     sigue en la cola con la causa. */
  let sinTurnos = false;
  if (mesa != null) {
    const res = await sentarDesdeOrigen(restaurantId, mesa, {
      source: 'waitlist', originId: id, partySize: fila.party_size, quien: fila.customer_name,
    });
    if ('error' in res) return { error: res.error };
    sinTurnos = 'sinTurnos' in res;
  }

  const cambios: Record<string, unknown> = { status: 'SEATED', seated_at: new Date().toISOString() };
  if (mesa != null && !sinTurnos) cambios.table_number = mesa;
  const marcar = (cols: Record<string, unknown>) => db
    .from('waitlist_entries')
    .update(cols)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .in('status', ['WAITING', 'NOTIFIED']);

  let { error } = await marcar(cambios);
  /* Sin la 128 no existe la columna de la mesa: se marca sin ella. Perder
     el número es malo; no poder sentar, peor. */
  if (faltaLaColumna(error) && 'table_number' in cambios) {
    ({ error } = await marcar({ status: 'SEATED', seated_at: cambios.seated_at }));
  }
  if (error) {
    /* La mesa ya quedó ocupada por este grupo. Volver a tocar «Sentar» lo
       termina: la mesa reconoce que es de este grupo y no abre otra. */
    return { error: 'La mesa quedó ocupada, pero no se pudo marcar al grupo como sentado. Vuelve a tocar «Sentar»: retoma esa mesa.' };
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
