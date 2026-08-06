'use server';

/* ============================================================
   Mapa de canales externos · acciones del panel (Fase 5A)
   ------------------------------------------------------------
   El dueño dice qué producto suyo corresponde a cada identificador de
   PedidosYa / Rappi / UberEats. Sin ese mapa, un pedido externo llega
   con un sku que Leogin no sabe traducir y se rechaza con 422.
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { CHANNELS, type Channel } from '@/lib/channels';

export type ChannelActionResult = { error?: string; ok?: boolean };

interface Ctx {
  db: ReturnType<typeof createServiceClient>;
  restaurantId: string;
}

/**
 * Mismo patrón que el resto del panel: la sesión manda, no el formulario.
 * Un staff sin permiso de ajustes no toca el mapa — cambiarlo equivale a
 * redirigir a qué producto entran los pedidos de una app externa.
 */
async function resolveContext(restaurantIdFromForm?: string | null): Promise<Ctx | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  if (!can(profile.role, profile.permissions as string[] | null, 'ajustes')) return null;

  const restaurantId = profile.role === 'SUPER_ADMIN'
    ? (restaurantIdFromForm ?? '')
    : profile.role === 'GROUP_OWNER'
      ? ((await resolveGroupBranchId()) ?? '')
      : (profile.restaurant_id ?? '');
  if (!restaurantId) return null;

  return { db: createServiceClient(), restaurantId };
}

/** Crea o actualiza el mapeo de un sku externo a un producto de Leogin. */
export async function saveChannelMapping(
  restaurantId: string,
  input: { channel: string; externalSku: string; productId: string },
): Promise<ChannelActionResult> {
  const ctx = await resolveContext(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const channel = input.channel as Channel;
  if (!CHANNELS.includes(channel)) return { error: 'Canal inválido.' };

  const sku = input.externalSku.trim();
  if (!sku) return { error: 'Escribí el identificador que usa la app externa.' };
  if (!input.productId) return { error: 'Elegí a qué producto tuyo corresponde.' };

  // El producto tiene que ser de ESTE restaurante. Sin esta comprobación,
  // un id copiado de otro tenant dejaría entrar pedidos apuntando a un
  // producto ajeno.
  const { data: prod } = await ctx.db
    .from('products')
    .select('id')
    .eq('id', input.productId)
    .eq('restaurant_id', ctx.restaurantId)
    .maybeSingle();
  if (!prod) return { error: 'Ese producto no es de este restaurante.' };

  const { error } = await ctx.db
    .from('channel_product_map')
    .upsert(
      {
        restaurant_id: ctx.restaurantId,
        channel,
        external_sku: sku,
        product_id: input.productId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'restaurant_id,channel,external_sku' },
    );

  if (error) return { error: error.message };
  revalidatePath('/admin/canales');
  return { ok: true };
}

/** Borra un mapeo. Los pedidos ya creados con él no se tocan. */
export async function deleteChannelMapping(
  restaurantId: string,
  id: string,
): Promise<ChannelActionResult> {
  const ctx = await resolveContext(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const { error } = await ctx.db
    .from('channel_product_map')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  if (error) return { error: error.message };
  revalidatePath('/admin/canales');
  return { ok: true };
}
