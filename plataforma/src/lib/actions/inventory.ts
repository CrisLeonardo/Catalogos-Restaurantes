'use server';

/* ============================================================
   INVENTARIO — control de stock (Fase C)
   · saveInventory: activa/desactiva control, fija stock y umbral.
   · adjustStock:   suma/resta rápido (+/−) con bitácora.
   · getLowStock:   conteo de stock bajo / agotado (badge del nav).
   Todo valida el rol del usuario; el Super Admin opera por slug.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';
import { logActivity } from '@/lib/activity';
import { getProductMovements as fetchProductMovements, type StockMovement } from '@/lib/db/kardex';

type Ctx = { db: ReturnType<typeof createServiceClient>; restaurantId: string; userId: string };

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

  // Un staff sin permiso "inventario" no puede ajustar stock (candado server-side).
  if (!can(profile.role, profile.permissions as string[] | null, 'inventario')) return null;

  const restaurantId = profile.role === 'SUPER_ADMIN'
    ? (restaurantIdFromForm ?? '')
    : profile.role === 'GROUP_OWNER'
      ? ((await resolveGroupBranchId()) ?? '')
      : (profile.restaurant_id ?? '');
  if (!restaurantId) return null;

  return { db: createServiceClient(), restaurantId, userId: user.id };
}

export type InventoryState = { error: string } | { ok: true } | null;

const toInt = (v: FormDataEntryValue | null, def = 0) => {
  const n = parseInt(String(v ?? ''), 10);
  return isNaN(n) ? def : n;
};

/** Activa/desactiva el control de stock y fija stock + umbral de un producto. */
export async function saveInventory(
  prevState: InventoryState,
  formData: FormData,
): Promise<InventoryState> {
  const ctx = await resolveContext(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const id = (formData.get('id') as string)?.trim();
  if (!id) return { error: 'Producto inválido.' };

  const track = formData.get('track_stock') === 'true';
  const stock = Math.max(0, toInt(formData.get('stock')));
  const threshold = Math.max(0, toInt(formData.get('low_stock_threshold')));

  // Lee el stock previo para registrar el movimiento 'set' si cambió.
  const { data: prev } = await ctx.db
    .from('products')
    .select('stock, track_stock')
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId)
    .single();

  const { error } = await ctx.db
    .from('products')
    .update({
      track_stock: track,
      stock: track ? stock : null,
      low_stock_threshold: threshold,
      // Si activa control con stock > 0, asegúrate de que sea vendible.
      ...(track && stock > 0 ? { is_available: true, unavailable_at: null } : {}),
      ...(track && stock === 0 ? { is_available: false, unavailable_at: new Date().toISOString() } : {}),
    })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  if (error) return { error: error.message };

  if (track && prev && Number(prev.stock ?? 0) !== stock) {
    await ctx.db.from('stock_movements').insert({
      restaurant_id: ctx.restaurantId,
      product_id: id,
      delta: stock - Number(prev.stock ?? 0),
      reason: 'set',
      balance_after: stock,
      created_by: ctx.userId,
    });
  }

  revalidatePath('/admin/inventario');
  revalidatePath('/admin/menu');
  return { ok: true };
}

/** Suma/resta rápido al stock (+/−). delta puede ser negativo. */
export async function adjustStock(formData: FormData) {
  const ctx = await resolveContext(formData.get('restaurantId') as string | null);
  if (!ctx) return;

  const id = (formData.get('id') as string)?.trim();
  const delta = toInt(formData.get('delta'));
  if (!id || delta === 0) return;

  const { data: prod } = await ctx.db
    .from('products')
    .select('stock, track_stock')
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId)
    .single();
  if (!prod || !prod.track_stock) return;

  const current = Number(prod.stock ?? 0);
  const next = Math.max(0, current + delta);
  if (next === current) return;

  await ctx.db
    .from('products')
    .update({
      stock: next,
      is_available: next > 0,
      unavailable_at: next > 0 ? null : new Date().toISOString(),
    })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  await ctx.db.from('stock_movements').insert({
    restaurant_id: ctx.restaurantId,
    product_id: id,
    delta: next - current,
    reason: 'adjust',
    balance_after: next,
    created_by: ctx.userId,
  });

  logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'stock', entity: id, meta: { delta: next - current, balance: next } });

  revalidatePath('/admin/inventario');
  revalidatePath('/admin/menu');
}

export type LowStock = { low: number; out: number };

/** Conteo de productos con stock bajo (>0 y <= umbral) y agotados (=0). */
export async function getLowStock(restaurantId: string): Promise<LowStock> {
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) return { low: 0, out: 0 };
  const db = createServiceClient();
  const { data } = await db
    .from('products')
    .select('stock, low_stock_threshold, track_stock')
    .eq('restaurant_id', restaurantId)
    .eq('track_stock', true);

  let low = 0, out = 0;
  for (const p of data ?? []) {
    const s = Number(p.stock ?? 0);
    if (s <= 0) out += 1;
    else if (s <= Number(p.low_stock_threshold ?? 0)) low += 1;
  }
  return { low, out };
}

/** Historial de movimientos (Kardex) de un producto — entradas, ventas, ajustes. */
export async function getProductMovements(restaurantId: string, productId: string): Promise<StockMovement[]> {
  const ctx = await resolveContext(restaurantId);
  if (!ctx) return [];
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return [];
  return fetchProductMovements(ctx.restaurantId, productId);
}
