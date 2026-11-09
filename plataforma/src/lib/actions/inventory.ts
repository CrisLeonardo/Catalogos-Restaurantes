'use server';

/* ============================================================
   INVENTARIO (auditoría 1.10: E11, N20, R11, O04)
   ------------------------------------------------------------
   · ajustarExistencias: suma, resta o fija en una sola operación bajo
     bloqueo, con motivo (obligatorio al restar o fijar), nota y
     responsable — `leogin_ajustar_existencias` (migración 180). Antes se
     leía y luego se escribía: dos toques simultáneos perdían uno.
   · activarControl: varios platillos a la vez, todo o nada.
   · saveInventory: mínimo y desactivar el control (las existencias ya no
     se fijan aquí: van por ajustarExistencias, con motivo).
   · agotarIngrediente / platillosDeIngrediente: «se acabó el aguacate».
   · getLowStock / getProductMovements: igual que antes, con motivo y nota.
   Todo valida el permiso en la sucursal; el Super Admin opera por slug.
   ============================================================ */

import { createClient, getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { resolveOwnRestaurantId } from '@/lib/db/membership';
import { puedeEnSeccion } from '@/lib/auth/seccion';
import { revalidatePath, updateTag } from 'next/cache';
import { logActivity } from '@/lib/activity';
import { getProductMovements as fetchProductMovements, type StockMovement } from '@/lib/db/kardex';
import { type SectionKey as Seccion } from '@/lib/permissions';

type Ctx = { db: ReturnType<typeof createServiceClient>; restaurantId: string; userId: string };

async function resolveContext(restaurantIdFromForm?: string | null, ...secciones: Seccion[]): Promise<Ctx | null> {
  const supabase = await createClient();
  const { data: { user } } = await getStaffUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  // Quien administra un grupo entra a la sucursal del subdominio, verificada
  // contra su organización; el resto, al suyo (migración 116).
  const restaurantId = profile.role === 'SUPER_ADMIN'
    ? (restaurantIdFromForm ?? '')
    : ((await resolveGroupBranchId())
       ?? (await resolveOwnRestaurantId(profile.restaurant_id))
       ?? '');
  if (!restaurantId) return null;
  if (!(await puedeEnSeccion(restaurantId, ...(secciones.length ? secciones : ['inventario' as Seccion])))) return null;

  return { db: createServiceClient(), restaurantId, userId: user.id };
}

function refrescar(restaurantId: string) {
  revalidatePath('/admin/inventario');
  revalidatePath('/admin/ingredientes');
  revalidatePath('/admin/menu');
  // Las existencias y lo agotado viajan al menú público y al de Servicio.
  updateTag(`menu:${restaurantId}`);
}

const errorDeBase = (error: { code?: string; message: string }, generico: string) =>
  error.code === 'LGD01' ? error.message : generico;

const UUID = /^[0-9a-f-]{36}$/i;

export type InventoryState = { error: string } | { ok: true } | null;

const toInt = (v: FormDataEntryValue | null, def = 0) => {
  const n = parseInt(String(v ?? ''), 10);
  return isNaN(n) ? def : n;
};

/** Mínimo para avisar y desactivar el control. Activar va por `activarControl`. */
export async function saveInventory(
  prevState: InventoryState,
  formData: FormData,
): Promise<InventoryState> {
  const ctx = await resolveContext(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const id = (formData.get('id') as string)?.trim();
  if (!id || !UUID.test(id)) return { error: 'Producto inválido.' };

  const track = formData.get('track_stock') === 'true';
  const threshold = Math.max(0, toInt(formData.get('low_stock_threshold')));

  const { data: prev } = await ctx.db.from('products').select('name, track_stock, agotado_motivo, is_available')
    .eq('id', id).eq('restaurant_id', ctx.restaurantId).maybeSingle();
  if (!prev) return { error: 'Ese platillo ya no existe.' };

  if (track) {
    if (!prev.track_stock) return { error: 'Para empezar a contar usa «Activar control»: pide las existencias iniciales.' };
    const { error } = await ctx.db.from('products').update({ low_stock_threshold: threshold })
      .eq('id', id).eq('restaurant_id', ctx.restaurantId);
    if (error) return { error: 'No se pudo guardar el mínimo.' };
  } else {
    // Dejar de contar: se vende sin límite. Lo agotado sólo por existencias vuelve.
    const { error } = await ctx.db.from('products').update({
      track_stock: false,
      stock: null,
      ...(prev.is_available === false && prev.agotado_motivo === 'reponer' ? { is_available: true, unavailable_at: null } : {}),
    }).eq('id', id).eq('restaurant_id', ctx.restaurantId);
    if (error) return { error: 'No se pudo desactivar el control.' };
    await logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'inventario_desactivado', entity: prev.name as string, meta: { productId: id } });
  }

  refrescar(ctx.restaurantId);
  return { ok: true };
}

export type MotivoAjuste = 'reposicion' | 'merma' | 'conteo' | 'correccion' | 'consumo' | 'otro';
export type ModoAjuste = 'sumar' | 'restar' | 'fijar';

/** Suma, resta o fija existencias con motivo, en una sola operación. */
export async function ajustarExistencias(
  restaurantIdForm: string, productId: string, modo: ModoAjuste, cantidad: number, motivo: MotivoAjuste | null, nota?: string,
): Promise<{ ok?: true; despues?: number; error?: string }> {
  const ctx = await resolveContext(restaurantIdForm);
  if (!ctx) return { error: 'No autorizado.' };
  if (!UUID.test(productId)) return { error: 'Producto inválido.' };
  if (!['sumar', 'restar', 'fijar'].includes(modo)) return { error: 'Ajuste inválido.' };
  const n = Math.trunc(Number(cantidad));
  if (!Number.isFinite(n) || n < 0) return { error: 'Escribe una cantidad desde 0.' };

  const { data, error } = await ctx.db.rpc('leogin_ajustar_existencias', {
    p_restaurant: ctx.restaurantId, p_producto: productId, p_modo: modo, p_cantidad: n,
    p_motivo: motivo, p_nota: nota?.slice(0, 200) ?? null, p_actor: ctx.userId,
  });
  if (error) return { error: errorDeBase(error, 'No se pudo ajustar. No cambió nada.') };
  refrescar(ctx.restaurantId);
  return { ok: true, despues: (data as { despues?: number })?.despues };
}

export type FilaActivacion = { id: string; stock: number; minimo: number };

/** Activa el control de varios platillos con sus existencias iniciales; todo o nada. */
export async function activarControl(restaurantIdForm: string, filas: FilaActivacion[]): Promise<{ ok?: true; activados?: number; error?: string }> {
  const ctx = await resolveContext(restaurantIdForm);
  if (!ctx) return { error: 'No autorizado.' };
  if (!Array.isArray(filas) || filas.length === 0 || filas.length > 500) return { error: 'Elige entre 1 y 500 platillos.' };
  const limpias = [];
  for (const f of filas) {
    if (!UUID.test(f.id)) return { error: 'Selección inválida.' };
    const stock = Math.trunc(Number(f.stock));
    const minimo = Math.trunc(Number(f.minimo));
    if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(minimo) || minimo < 0) {
      return { error: 'Existencias y mínimo son números enteros desde 0.' };
    }
    limpias.push({ id: f.id, stock: String(stock), minimo: String(minimo) });
  }
  const { data, error } = await ctx.db.rpc('leogin_activar_control', { p_restaurant: ctx.restaurantId, p_filas: limpias, p_actor: ctx.userId });
  if (error) return { error: errorDeBase(error, 'No se pudo activar. No cambió ninguno.') };
  refrescar(ctx.restaurantId);
  return { ok: true, activados: (data as { activados?: number })?.activados ?? limpias.length };
}

export type LowStock = { low: number; out: number };

/** Conteo de productos con stock bajo (>0 y <= umbral) y agotados (=0). */
export async function getLowStock(restaurantId: string): Promise<LowStock> {
  if (!UUID.test(restaurantId)) return { low: 0, out: 0 };
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

/** Historial de movimientos (Kardex) de un producto, con motivo, nota y quién. */
export async function getProductMovements(restaurantId: string, productId: string): Promise<StockMovement[]> {
  const ctx = await resolveContext(restaurantId);
  if (!ctx) return [];
  if (!UUID.test(productId)) return [];
  return fetchProductMovements(ctx.restaurantId, productId);
}

/* ── Ingredientes: «se acabó» (auditoría 1.10, O04) ───────────────── */

export type PlatilloAfectado = { id: string; name: string; categoria: string | null; yaAgotado: boolean };

/** Qué platillos llevan este ingrediente, para enseñarlos antes de confirmar. */
export async function platillosDeIngrediente(restaurantIdForm: string, ingredientId: string): Promise<{ platillos?: PlatilloAfectado[]; error?: string }> {
  const ctx = await resolveContext(restaurantIdForm, 'ingredientes', 'inventario', 'catalogo');
  if (!ctx) return { error: 'No autorizado.' };
  if (!UUID.test(ingredientId)) return { error: 'Ingrediente inválido.' };
  const { data, error } = await ctx.db
    .from('recipe_items')
    .select('products!inner(id, name, is_active, is_available, vuelve_at, restaurant_id, categories(name))')
    .eq('ingredient_id', ingredientId)
    .eq('products.restaurant_id', ctx.restaurantId);
  if (error) return { error: 'No se pudo leer qué platillos lo llevan.' };
  const ahora = Date.now();
  type Fila = { products: { id: string; name: string; is_active: boolean; is_available: boolean; vuelve_at: string | null; categories: { name: string } | null } };
  const vistos = new Map<string, PlatilloAfectado>();
  for (const r of (data ?? []) as unknown as Fila[]) {
    const p = r.products;
    if (!p || !p.is_active || vistos.has(p.id)) continue;
    const agotadoAhora = p.is_available === false && !(p.vuelve_at && new Date(p.vuelve_at).getTime() <= ahora);
    vistos.set(p.id, { id: p.id, name: p.name, categoria: p.categories?.name ?? null, yaAgotado: agotadoAhora });
  }
  return { platillos: [...vistos.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')) };
}

/** «Se acabó» / «Ya hay» sobre un ingrediente: apaga o devuelve sus platillos. */
export async function agotarIngrediente(restaurantIdForm: string, ingredientId: string, agotado: boolean): Promise<{ ok?: true; platillos?: number; error?: string }> {
  const ctx = await resolveContext(restaurantIdForm, 'ingredientes', 'inventario', 'catalogo');
  if (!ctx) return { error: 'No autorizado.' };
  if (!UUID.test(ingredientId)) return { error: 'Ingrediente inválido.' };
  const { data, error } = await ctx.db.rpc('leogin_agotar_ingrediente', {
    p_restaurant: ctx.restaurantId, p_ingrediente: ingredientId, p_agotado: agotado, p_actor: ctx.userId,
  });
  if (error) return { error: errorDeBase(error, 'No se pudo cambiar. No cambió nada.') };
  refrescar(ctx.restaurantId);
  return { ok: true, platillos: (data as { platillos?: number })?.platillos ?? 0 };
}
