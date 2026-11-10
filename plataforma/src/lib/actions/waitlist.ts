'use server';

/* ============================================================
   LISTA DE ESPERA (Fase 3 de lanzamiento; recepción honesta en la 1.8)
   ------------------------------------------------------------
   Cola en vivo para quien llega sin reservar: se anota el grupo, se le
   avisa cuando hay mesa y se le sienta.

   Aviso honesto (R18.2, PA-T20): abrir WhatsApp sólo deja constancia de que
   se abrió el chat (`aviso_abierto_at`). «Avisado» lo decide el host al
   confirmarlo, por WhatsApp o en persona (`notified_via`). Nada de esto
   prueba que el mensaje llegara, y la pantalla no lo dice.
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { actorEn, tiene } from '@/lib/auth/capacidades';
import { SIN_SECCION } from '@/lib/auth/seccion';
import { sentarDesdeRecepcion } from '@/lib/actions/table-sessions';
import { logActivity } from '@/lib/activity';

export type WaitlistResult = { error?: string; ok?: boolean };

/** La misma regla del panel (1.7), con el rol efectivo de ESTA sucursal. */
async function autorizar(restaurantId: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const actor = await actorEn(restaurantId);
  if (!actor) return { ok: false, error: 'No autorizado.' };
  if (!tiene(actor, 'lista_espera', 'mesas')) return { ok: false, error: SIN_SECCION };
  return { ok: true, userId: actor.userId };
}

const EN_COLA = ['WAITING', 'NOTIFIED'];

function refrescar() {
  revalidatePath('/admin/lista-espera');
}

/** Cambia una fila que siga en la cola; si ya no estaba, lo dice. */
async function cambiar(
  restaurantId: string, id: string, cols: Record<string, unknown>, desde = EN_COLA,
): Promise<WaitlistResult & { nombre?: string }> {
  const { data, error } = await createServiceClient().from('waitlist_entries')
    .update(cols).eq('id', id).eq('restaurant_id', restaurantId).in('status', desde).select('id, customer_name');
  if (error) return { error: 'No se pudo actualizar la lista. Intenta de nuevo.' };
  if (!data?.length) return { error: 'Ese grupo ya no está en la cola. Actualiza la página.' };
  refrescar();
  return { ok: true, nombre: data[0].customer_name as string };
}

export async function addToWaitlist(
  restaurantId: string,
  data: { customer_name: string; party_size: number; phone?: string; notes?: string },
): Promise<WaitlistResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };

  if (!data.customer_name?.trim()) return { error: 'Escribe el nombre del grupo.' };
  const pax = Number(data.party_size);
  if (!Number.isInteger(pax) || pax < 1 || pax > 100) return { error: 'Personas: entre 1 y 100.' };

  const { error } = await createServiceClient().from('waitlist_entries').insert({
    restaurant_id: restaurantId,
    customer_name: data.customer_name.trim().slice(0, 120),
    party_size: pax,
    phone: data.phone?.trim() || null,
    notes: data.notes?.trim() || null,
    status: 'WAITING',
  });
  if (error) return { error: 'No se pudo agregar a la lista. Intenta de nuevo.' };
  refrescar();
  return { ok: true };
}

/** Se abrió WhatsApp para avisar. No cambia el estado: no prueba nada (PA-T20). */
export async function markWaitlistAvisoAbierto(restaurantId: string, id: string): Promise<WaitlistResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };
  return cambiar(restaurantId, id, { aviso_abierto_at: new Date().toISOString() }, ['WAITING']);
}

/** El host confirma que avisó: por WhatsApp o en persona. */
export async function markWaitlistNotified(
  restaurantId: string, id: string, via: 'whatsapp' | 'en_persona' = 'en_persona',
): Promise<WaitlistResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };
  if (via !== 'whatsapp' && via !== 'en_persona') return { error: 'Forma de aviso inválida.' };
  return cambiar(restaurantId, id, { status: 'NOTIFIED', notified_at: new Date().toISOString(), notified_via: via }, ['WAITING']);
}

/** «No se envió»: se deshace la marca de WhatsApp abierto. */
export async function retirarAvisoAbierto(restaurantId: string, id: string): Promise<WaitlistResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };
  return cambiar(restaurantId, id, { aviso_abierto_at: null }, ['WAITING']);
}

/**
 * Los sienta; con mesa, en una sola transacción con el salón
 * (`leogin_sentar_desde_recepcion`, migración 173).
 */
export async function markWaitlistSeated(
  restaurantId: string,
  id: string,
  tableNumber?: number | null,
): Promise<WaitlistResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };

  const mesa = tableNumber != null && Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 999
    ? tableNumber
    : null;
  if (mesa != null) return sentarDesdeRecepcion(restaurantId, mesa, id, 'waitlist');

  const res = await cambiar(restaurantId, id, { status: 'SEATED', seated_at: new Date().toISOString() });
  revalidatePath('/admin/mesas');
  return res;
}

/** «No llegó»: queda en el historial, no se borra (R18.5). */
export async function markWaitlistNoShow(restaurantId: string, id: string): Promise<WaitlistResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };
  const res = await cambiar(restaurantId, id, { status: 'NO_SHOW', cancelled_at: new Date().toISOString() });
  if (res.ok) await logActivity({ restaurantId, actorId: auth.userId, action: 'espera_no_llego', entity: res.nombre ?? null });
  return { ok: res.ok, error: res.error };
}

export async function cancelWaitlistEntry(restaurantId: string, id: string): Promise<WaitlistResult> {
  const auth = await autorizar(restaurantId);
  if (!auth.ok) return { error: auth.error };
  return cambiar(restaurantId, id, { status: 'CANCELLED', cancelled_at: new Date().toISOString() });
}
