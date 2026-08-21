import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { resolveEffectiveRole } from '@/lib/db/membership';
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'Perfil no encontrado.' };

  const isSuper = profile.role === 'SUPER_ADMIN';
  if (!isSuper) {
    // Quien administra el grupo de esta sucursal entra por ahí, sin más
    // comprobaciones (migración 116: el grupo se lee de la organización).
    if (await canActOnGroupBranch(restaurantId)) {
      // autorizado por el grupo
    } else {
      // Qué es esta persona EN ESTE restaurante. Antes se leía del perfil, y
      // el perfil solo sabe de uno: desde el modelo de membresías el dueño lo
      // tiene en null, así que no podía encender ni apagar un módulo de su
      // propio restaurante.
      const efectivo = await resolveEffectiveRole(
        { role: (profile.role as string | null) ?? null, permissions: (profile.permissions as string[] | null) ?? null },
        restaurantId,
      );
      if (!efectivo.isMember && profile.restaurant_id !== restaurantId) return { error: 'No autorizado.' };
      const role = efectivo.role;
      const perms = efectivo.permissions;
      const allowed = role === 'RESTAURANT_OWNER' || (role === 'RESTAURANT_STAFF' && (perms == null || perms.includes(key)));
      if (!allowed) return { error: 'No autorizado.' };
    }
  }

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
