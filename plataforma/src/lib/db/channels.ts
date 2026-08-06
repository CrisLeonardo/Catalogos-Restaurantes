import { createServiceClient } from '@/lib/supabase/service';
import { CHANNELS, type Channel } from '@/lib/channels';

/* ============================================================
   Lectura del mapa de canales externos (Fase 5A)
   ============================================================ */

export interface ChannelMapRow {
  id: string;
  channel: Channel;
  external_sku: string;
  product_id: string;
  /** Nombre del producto en Leogin, para no mostrar uuids en la tabla. */
  product_name: string;
  product_available: boolean;
}

/** Todos los mapeos del restaurante, con el nombre del producto resuelto. */
export async function getChannelMap(restaurantId: string): Promise<ChannelMapRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('channel_product_map')
    .select('id, channel, external_sku, product_id, products(name, is_available)')
    .eq('restaurant_id', restaurantId)
    .order('channel', { ascending: true })
    .order('external_sku', { ascending: true });

  return (data ?? []).map((r) => {
    // El join viene como objeto o como array de uno según la versión del
    // cliente; se normaliza para que la UI no tenga que saberlo.
    const p = r.products as unknown;
    const prod = (Array.isArray(p) ? p[0] : p) as { name?: string; is_available?: boolean } | null;
    return {
      id: r.id as string,
      channel: r.channel as Channel,
      external_sku: r.external_sku as string,
      product_id: r.product_id as string,
      product_name: prod?.name ?? '(producto borrado)',
      product_available: prod?.is_available === true,
    };
  });
}

export interface ChannelProductOption {
  id: string;
  name: string;
  is_available: boolean;
}

/** Productos del restaurante, para el selector de la pantalla. */
export async function getMappableProducts(restaurantId: string): Promise<ChannelProductOption[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('products')
    .select('id, name, is_available')
    .eq('restaurant_id', restaurantId)
    .order('name', { ascending: true });

  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    is_available: p.is_available === true,
  }));
}

/**
 * Resumen por canal: cuántos productos hay mapeados y cuántos pedidos
 * entraron. Es lo que le dice al dueño si un canal está realmente
 * funcionando o solo configurado.
 */
export interface ChannelSummary {
  channel: Channel;
  mapeados: number;
  pedidos: number;
}

export async function getChannelSummary(restaurantId: string): Promise<ChannelSummary[]> {
  const db = createServiceClient();

  const [{ data: mapa }, { data: pedidos }] = await Promise.all([
    db.from('channel_product_map').select('channel').eq('restaurant_id', restaurantId),
    db.from('orders').select('source').eq('restaurant_id', restaurantId).in('source', [...CHANNELS]),
  ]);

  return CHANNELS.map((c) => ({
    channel: c,
    mapeados: (mapa ?? []).filter((m) => m.channel === c).length,
    pedidos: (pedidos ?? []).filter((o) => o.source === c).length,
  }));
}
