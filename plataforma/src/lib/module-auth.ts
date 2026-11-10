import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { actorEn, tiene } from '@/lib/auth/capacidades';
import { isModuleActive, type ActivatableModuleKey, type ModulesMap, type ModuleSettings } from '@/lib/modules';

/**
 * Autoriza una acción de un módulo activable: sesión válida, pertenencia al
 * restaurante (o super admin), permiso de sección, y módulo ACTIVO.
 * Lo usan las server actions de FEL, Proveedores y Loyalty.
 */
export async function authorizeModuleAction(
  restaurantId: string,
  key: ActivatableModuleKey,
): Promise<{ error: string } | { ok: true }> {
  // Rol efectivo en ESTA sucursal, con la regla común del panel (1.7).
  const actor = await actorEn(restaurantId);
  if (!actor) return { error: 'No autorizado.' };
  if (!tiene(actor, key)) return { error: 'No autorizado.' };

  const db = createServiceClient();
  const { data: rest } = await db
    .from('restaurants')
    .select('modules, module_settings')
    .eq('id', restaurantId)
    .single();
  if (!rest || !isModuleActive(rest.modules as ModulesMap, rest.module_settings as ModuleSettings, key)) {
    return { error: 'Este módulo no está activo.' };
  }
  return { ok: true };
}
