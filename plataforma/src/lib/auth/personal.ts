import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveOwnRestaurantId } from '@/lib/db/membership';
import { actorEn, tiene, techoDe } from '@/lib/auth/capacidades';
import { esCuentaDelLocal, esPersonalDelLocal } from '@/lib/equipo-reglas';

/* ============================================================
   QUIÉN ADMINISTRA EL PERSONAL (auditoría 1.7)
   ------------------------------------------------------------
   Vivía en `lib/actions/staff.ts`, un archivo `'use server'`: ahí todo lo
   exportado es una acción que el navegador puede invocar, y una guarda no
   debe serlo. Ahora es un módulo de servidor normal.

   Desde la 1.7 lo decide la capacidad «personal» (la da el puesto
   Encargado), no el rol de gerente ni cómo entra la persona. Quien no es
   dueño administra con un techo:
     1. sólo reparte lo que él mismo tiene, y nunca «personal»;
     2. sólo crea accesos por PIN (los de usuario los da el dueño);
     3. no se toca a sí mismo, ni al dueño, ni a otro responsable;
     4. todo queda en la bitácora que ve el dueño.
   ============================================================ */

export type PersonalCtx = {
  db: ReturnType<typeof createServiceClient>;
  restaurantId: string;
  userId: string;
  /** 'OWNER' = dueño, dueño de grupo o super admin; 'MANAGER' = responsable con «personal». */
  as: 'OWNER' | 'MANAGER';
  /** Techo de lo que puede repartir; null para el dueño. */
  ownPermissions: string[] | null;
};

export async function ownerCtx(restaurantIdFromForm?: string | null): Promise<PersonalCtx | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const db = createServiceClient();

  if (profile.role === 'SUPER_ADMIN') {
    const restaurantId = restaurantIdFromForm ?? '';
    if (!restaurantId) return null;
    return { db, restaurantId, userId: user.id, as: 'OWNER', ownPermissions: null };
  }

  // El restaurante sobre el que se actúa sale del subdominio cuando esta
  // persona es miembro de él: su perfil solo apunta a uno y podría ser otro.
  const restaurantId = (await resolveOwnRestaurantId(profile.restaurant_id)) ?? '';
  if (!restaurantId) return null;

  const actor = await actorEn(restaurantId);
  if (!actor || !tiene(actor, 'personal')) return null;
  return {
    db,
    restaurantId,
    userId: user.id,
    as: actor.esDueno ? 'OWNER' : 'MANAGER',
    ownPermissions: techoDe(actor),
  };
}

/**
 * Solo permite operar sobre el PERSONAL de este restaurante. Y si quien
 * administra no es el dueño: nunca sobre sí mismo ni sobre otro responsable
 * (membresía OWNER/MANAGER o con «personal»). Sin esa regla, un encargado
 * podía ponerle un PIN a otro encargado y entrar como él.
 *
 * Quién es personal de aquí lo dice la membresía de ESTE local, no el
 * restaurante de casa del perfil (auditoría 2026-11-21): quien trabaja en
 * dos sucursales es del equipo de las dos.
 *
 * `credencial: true` es para cambiarle el PIN o la contraseña: además exige
 * que la cuenta sea sólo de este local (ver `esCuentaDelLocal`).
 */
export async function assertStaffOfRestaurant(
  ctx: PersonalCtx,
  userId: string,
  opciones: { credencial?: boolean } = {},
): Promise<boolean> {
  const [{ data: perfil }, { data: miembro }] = await Promise.all([
    ctx.db.from('profiles').select('role, restaurant_id').eq('id', userId).maybeSingle(),
    ctx.db
      .from('restaurant_members')
      .select('role, permissions, status')
      .eq('user_id', userId)
      .eq('restaurant_id', ctx.restaurantId)
      .maybeSingle(),
  ]);
  if (!esPersonalDelLocal(perfil, miembro, ctx.restaurantId)) return false;

  if (opciones.credencial) {
    const { data: otras } = await ctx.db
      .from('restaurant_members')
      .select('restaurant_id')
      .eq('user_id', userId)
      .eq('status', 'active');
    const restaurantes = (otras ?? []).map((m) => m.restaurant_id as string);
    if (!esCuentaDelLocal(perfil, restaurantes, ctx.restaurantId)) return false;
  }

  if (ctx.as === 'OWNER') return true;
  if (userId === ctx.userId) return false; // no se edita a sí mismo

  const targetRole = (miembro?.role as string | null) ?? 'STAFF';
  const targetPerms = Array.isArray(miembro?.permissions) ? (miembro.permissions as string[]) : [];
  return targetRole !== 'OWNER' && targetRole !== 'MANAGER' && !targetPerms.includes('personal');
}
