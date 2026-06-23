import 'server-only';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import {
  isModuleActive,
  type ActivatableModuleKey,
  type ModulesMap,
  type ModuleSettings,
} from '@/lib/modules';

export type ModuleContext =
  | { ok: true; restaurantId: string; restaurantName: string }
  | { ok: false };

/**
 * Resuelve el restaurante actual (dueño/staff o super admin vía slug) y verifica
 * que el módulo activable esté ACTIVO (entitlement de Leogin + on del restaurante).
 * Las páginas de módulos lo usan para redirigir si no aplica.
 */
export async function resolveModuleContext(key: ActivatableModuleKey): Promise<ModuleContext> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false };

  let restaurantId: string | null = null;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }
  if (!restaurantId) return { ok: false };

  const db = createServiceClient();
  const { data: rest } = await db
    .from('restaurants')
    .select('name, modules, module_settings')
    .eq('id', restaurantId)
    .single();
  if (!rest) return { ok: false };

  const active = isModuleActive(
    rest.modules as ModulesMap,
    rest.module_settings as ModuleSettings,
    key,
  );
  if (!active) return { ok: false };

  return { ok: true, restaurantId, restaurantName: (rest.name as string) ?? 'Restaurante' };
}
