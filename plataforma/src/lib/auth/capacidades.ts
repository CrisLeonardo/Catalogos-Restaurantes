import 'server-only';

import { getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { resolveEffectiveRole, type MemberRole } from '@/lib/db/membership';
import { can } from '@/lib/permissions';

/* ============================================================
   QUIÉN ES ESTA PERSONA EN ESTE RESTAURANTE (auditoría 1.7)
   ------------------------------------------------------------
   Antes cada acción lo resolvía a su manera: cupones miraba sólo
   `profiles.role`, FEL y los módulos leían los permisos del perfil y no los
   de la membresía de esa sucursal. Aquí se resuelve una vez, con la misma
   regla que el panel (`resolveEffectiveRole` + `can`), y cada acción
   pregunta sólo «¿tiene esta llave?».

   No es una acción: vive fuera de los archivos `'use server'`.
   ============================================================ */

export type Actor = {
  userId: string;
  esSuper: boolean;
  /** Dueño del restaurante, dueño de su grupo o super admin. */
  esDueno: boolean;
  role: string;
  permissions: string[] | null;
  memberRole: MemberRole | null;
  profileRestaurantId: string | null;
  fullName: string | null;
};

/** El actor de la sesión en `restaurantId`, o null si no pertenece a él. */
export async function actorEn(restaurantId: string | null | undefined): Promise<Actor | null> {
  if (!restaurantId) return null;
  const { data: { user } } = await getStaffUser();
  if (!user) return null;

  const { data: perfil } = await createServiceClient()
    .from('profiles')
    .select('role, restaurant_id, permissions, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!perfil) return null;

  const base = {
    userId: user.id,
    profileRestaurantId: (perfil.restaurant_id as string | null) ?? null,
    fullName: (perfil.full_name as string | null) ?? null,
  };

  if (perfil.role === 'SUPER_ADMIN') {
    return { ...base, esSuper: true, esDueno: true, role: 'SUPER_ADMIN', permissions: null, memberRole: null };
  }
  if (await canActOnGroupBranch(restaurantId)) {
    return { ...base, esSuper: false, esDueno: true, role: 'RESTAURANT_OWNER', permissions: null, memberRole: null };
  }

  const efectivo = await resolveEffectiveRole(
    { role: (perfil.role as string | null) ?? null, permissions: (perfil.permissions as string[] | null) ?? null },
    restaurantId,
  );
  const pertenece = efectivo.isMember || base.profileRestaurantId === restaurantId;
  if (!pertenece) return null;

  return {
    ...base,
    esSuper: false,
    esDueno: efectivo.role === 'RESTAURANT_OWNER',
    role: efectivo.role,
    permissions: efectivo.permissions,
    memberRole: efectivo.memberRole,
  };
}

/** ¿Tiene alguna de estas llaves (sección o capacidad)? El dueño, todas. */
export function tiene(actor: Actor, ...llaves: string[]): boolean {
  if (actor.esSuper || actor.esDueno) return true;
  return llaves.some((k) => can(actor.role, actor.permissions, k));
}

/** La lista con la que reparte permisos: `null` = sin techo (dueño). */
export function techoDe(actor: Actor): string[] | null {
  return actor.esDueno ? null : (actor.permissions ?? []);
}
