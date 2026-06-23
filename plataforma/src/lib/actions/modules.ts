'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  ACTIVATABLE_MODULES,
  isManaged,
  moduleMeta,
  type ActivatableModuleKey,
  type ModuleSettings,
} from '@/lib/modules';

export type ModuleActionResult = { error?: string; ok?: boolean };

const VALID_KEYS = ACTIVATABLE_MODULES.map((m) => m.key) as string[];

/**
 * El restaurante (dueño) prende/apaga un módulo self-service. No hay gating de
 * plan: son herramientas que el dueño activa a voluntad.
 *
 * Excepciones:
 *  · Módulos requiresSetup (FEL) los activa Leogin, no el restaurante.
 *  · Módulos gestionados por Leogin (modules[key] === true) están forzados ON
 *    y no se pueden apagar desde aquí.
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

  const meta = moduleMeta(key);
  if (meta.requiresSetup && !isSuper) {
    return { error: 'Este módulo lo activa el equipo de Leogin. Solicítalo desde Soporte.' };
  }

  const db = createServiceClient();
  const { data: rest } = await db
    .from('restaurants')
    .select('modules, module_settings')
    .eq('id', restaurantId)
    .single();
  if (!rest) return { error: 'Restaurante no encontrado.' };

  // Si Leogin lo gestiona, está forzado ON y no se apaga desde el panel.
  if (isManaged(rest.modules as Record<string, boolean> | null, key) && !isSuper) {
    return { error: 'Leogin gestiona este módulo por ti. Contáctanos para cambiarlo.' };
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
