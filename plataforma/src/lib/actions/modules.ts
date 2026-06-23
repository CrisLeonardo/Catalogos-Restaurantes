'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  ACTIVATABLE_MODULES,
  isEntitled,
  type ActivatableModuleKey,
  type ModuleSettings,
} from '@/lib/modules';

export type ModuleActionResult = { error?: string; ok?: boolean };

const VALID_KEYS = ACTIVATABLE_MODULES.map((m) => m.key) as string[];

/**
 * El restaurante (dueño) o Leogin (super admin) prende/apaga un módulo activable.
 * Solo se puede ENCENDER si Leogin concedió el entitlement (modules[key] === true).
 * Activar módulos es decisión de propietario → no se delega a staff.
 */
export async function setModuleEnabled(
  restaurantId: string,
  key: ActivatableModuleKey,
  enabled: boolean,
): Promise<ModuleActionResult> {
  if (!VALID_KEYS.includes(key)) return { error: 'Módulo inválido.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: 'Perfil no encontrado.' };

  const isSuper = profile.role === 'SUPER_ADMIN';
  const isOwner = profile.role === 'RESTAURANT_OWNER';
  if (!isSuper && !isOwner) return { error: 'Solo el propietario puede activar módulos.' };

  // El dueño solo puede tocar su propio restaurante.
  if (isOwner && profile.restaurant_id !== restaurantId) {
    return { error: 'No autorizado para este restaurante.' };
  }

  const db = createServiceClient();
  const { data: rest } = await db
    .from('restaurants')
    .select('modules, module_settings')
    .eq('id', restaurantId)
    .single();
  if (!rest) return { error: 'Restaurante no encontrado.' };

  // Solo se puede encender un módulo habilitado por Leogin.
  if (enabled && !isEntitled(rest.modules as Record<string, boolean> | null, key)) {
    return { error: 'Este módulo no está habilitado en tu plan. Contacta a Leogin.' };
  }

  const current = (rest.module_settings as ModuleSettings | null) ?? {};
  const next: ModuleSettings = {
    ...current,
    [key]: { ...(current[key] ?? {}), enabled },
  };

  const { error } = await db
    .from('restaurants')
    .update({ module_settings: next })
    .eq('id', restaurantId);
  if (error) return { error: error.message };

  revalidatePath('/admin/modulos');
  revalidatePath('/admin', 'layout');
  return { ok: true };
}
