'use server';

/* ============================================================
   CONEXIÓN DEL NÚMERO DE WHATSAPP (Fase 1A)
   ------------------------------------------------------------
   El dueño pega aquí los datos que Meta le da para su número. El token se
   cifra ANTES de tocar la base (ver lib/whatsapp/crypto.ts) y nunca vuelve
   a salir hacia el cliente: la UI solo muestra si hay número conectado y
   cuál es, jamás el token.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';
import { logActivity } from '@/lib/activity';
import { encryptToken, isTokenKeyConfigured } from '@/lib/whatsapp/crypto';

export type WhatsAppState = { error: string } | { ok: true } | null;

async function resolveContext(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  if (!can(profile.role, profile.permissions as string[] | null, 'whatsapp')) return null;

  const restaurantId = profile.role === 'SUPER_ADMIN'
    ? (formData.get('restaurantId') as string)
    : profile.role === 'GROUP_OWNER'
      ? await resolveGroupBranchId()
      : profile.restaurant_id;

  if (!restaurantId) return null;
  return { db: createServiceClient(), restaurantId, userId: user.id };
}

/** Conecta (o actualiza) el número del restaurante. */
export async function connectWhatsApp(
  prevState: WhatsAppState,
  formData: FormData,
): Promise<WhatsAppState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  if (!isTokenKeyConfigured()) {
    return {
      error:
        'Falta configurar WHATSAPP_TOKEN_KEY en el servidor. Sin esa clave no se ' +
        'puede guardar el token de forma segura.',
    };
  }

  const phoneNumberId = (formData.get('phone_number_id') as string)?.trim();
  const token = (formData.get('access_token') as string)?.trim();
  const wabaId = (formData.get('waba_id') as string)?.trim() || null;
  const displayPhone = (formData.get('display_phone') as string)?.trim() || null;

  if (!phoneNumberId) return { error: 'El ID del número (phone_number_id) es requerido.' };
  if (!token) return { error: 'El token de acceso es requerido.' };

  // phone_number_id es UNIQUE: si otro restaurante ya lo reclamó, avisar en
  // castellano en vez de dejar salir el error crudo de Postgres.
  const { data: taken } = await ctx.db
    .from('whatsapp_accounts')
    .select('restaurant_id')
    .eq('phone_number_id', phoneNumberId)
    .single();

  if (taken && taken.restaurant_id !== ctx.restaurantId) {
    return { error: 'Ese número ya está conectado en otro restaurante.' };
  }

  const { error } = await ctx.db
    .from('whatsapp_accounts')
    .upsert({
      restaurant_id: ctx.restaurantId,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      display_phone: displayPhone,
      access_token_cipher: encryptToken(token),
      activo: true,
      updated_at: new Date().toISOString(),
    });

  if (error) return { error: error.message };

  logActivity({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: 'whatsapp_connect',
    entity: phoneNumberId,
  });

  revalidatePath('/admin/whatsapp');
  return { ok: true };
}

/** Desconecta el número. Se borra la fila: sin token no hay canal, y dejar
 *  una cuenta inactiva con el token guardado es guardar un secreto que ya
 *  nadie usa. Las conversaciones y la bitácora se conservan. */
export async function disconnectWhatsApp(formData: FormData): Promise<void> {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  await ctx.db.from('whatsapp_accounts').delete().eq('restaurant_id', ctx.restaurantId);

  logActivity({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: 'whatsapp_disconnect',
    entity: ctx.restaurantId,
  });

  revalidatePath('/admin/whatsapp');
}
