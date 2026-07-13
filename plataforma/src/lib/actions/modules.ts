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
 * El restaurante (dueño) prende/apaga un módulo self-service, una vez que
 * Leogin lo habilitó (modules[key] === true — ver header de modules.ts).
 * No hay gating de plan más allá de esa entitlement: son herramientas que el
 * dueño activa o desactiva a voluntad dentro de lo que su plan ya incluye.
 *
 * Excepciones:
 *  · Módulos requiresSetup (FEL) los activa Leogin, no el restaurante.
 *  · Módulos que Leogin NO habilitó (modules[key] !== true) no existen para
 *    este restaurante — nada que prender/apagar (el panel ni los muestra).
 *
 * Bug corregido (2026-07-13): este guard antes bloqueaba exactamente el caso
 * contrario — cualquier módulo SÍ habilitado por Leogin quedaba forzado ON
 * para el dueño ("Leogin gestiona este módulo por ti"), dejando el toggle de
 * la UI (SelfServiceCard) sin efecto real para todo módulo entitled.
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

  // Leogin debe haber habilitado el módulo (modules[key]) para que exista algo
  // que prender/apagar; si no, ni siquiera debería mostrarse en el panel.
  if (!isManaged(rest.modules as Record<string, boolean> | null, key) && !isSuper) {
    return { error: 'Este módulo no está disponible en tu plan. Contáctanos para activarlo.' };
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
