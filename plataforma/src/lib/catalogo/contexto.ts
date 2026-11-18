import 'server-only';

import { createClient, getStaffUser } from '@/lib/supabase/server';
import { puedeEnSeccion } from '@/lib/auth/seccion';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { resolveOwnRestaurantId } from '@/lib/db/membership';
import { PLANS, type PlanCode } from '@/lib/plans';

/* Quién puede tocar el catálogo de qué restaurante. Lo comparten las
   acciones de platillos (lib/actions/products.ts) y la importación de una
   carta (lib/actions/importar-carta.ts). */

/**
 * `restaurantIdDelSuper` solo cuenta para SUPER_ADMIN, que trabaja sobre
 * cualquier restaurante por su id. Quien administra un grupo entra a la
 * sucursal del subdominio (verificada contra su organización); el resto,
 * al suyo. Ver la migración 116.
 */
export async function contextoDeCatalogo(restaurantIdDelSuper: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await getStaffUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const groupBranchId = profile.role === 'SUPER_ADMIN' ? null : await resolveGroupBranchId();
  const elevated = profile.role === 'SUPER_ADMIN' || groupBranchId !== null;
  const restaurantId = profile.role === 'SUPER_ADMIN'
    ? restaurantIdDelSuper
    : (groupBranchId ?? (await resolveOwnRestaurantId(profile.restaurant_id)));

  if (!restaurantId) return null;
  if (!(await puedeEnSeccion(restaurantId, 'catalogo'))) return null;

  const db = elevated ? createServiceClient() : supabase;
  return { db, restaurantId, role: profile.role, userId: user.id };
}

export type ContextoCatalogo = NonNullable<Awaited<ReturnType<typeof contextoDeCatalogo>>>;

/**
 * Tope de productos del plan (PLANS.maxProducts): mensaje si agregar
 * `nuevos` lo pasa, o null si cabe.
 */
export async function topeDeProductos(ctx: ContextoCatalogo, nuevos = 1): Promise<string | null> {
  const { data: restaurant } = await ctx.db
    .from('restaurants')
    .select('plan_actual')
    .eq('id', ctx.restaurantId)
    .single();

  const maxProducts = restaurant?.plan_actual
    ? PLANS[restaurant.plan_actual as PlanCode]?.maxProducts
    : undefined;
  if (!maxProducts) return null;

  const { count } = await ctx.db
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', ctx.restaurantId);

  const actuales = count ?? 0;
  if (actuales >= maxProducts) {
    return `Llegaste al límite de ${maxProducts} platillos de tu plan. Sube de plan para agregar platillos ilimitados.`;
  }
  if (actuales + nuevos > maxProducts) {
    return `Tu plan permite ${maxProducts} platillos y ya tienes ${actuales}: caben ${maxProducts - actuales} más. Quita algunos de la importación o sube de plan.`;
  }
  return null;
}
