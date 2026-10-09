import 'server-only';

import { getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { resolveEffectiveRole } from '@/lib/db/membership';
import { can } from '@/lib/permissions';

/* ============================================================
   ¿TIENE ESTA SECCIÓN? — para las acciones del panel (SEC-06)
   ------------------------------------------------------------
   Varias acciones comprobaban que la persona PERTENECE al restaurante
   (`canActOnRestaurant`) pero no que tenga la SECCIÓN: un mesero con solo
   «Pedidos» podía, llamando a la acción, cambiar cupones, la facturación,
   los módulos, el horario o el diseño del menú. Las server actions se pueden
   invocar sin pasar por la pantalla, así que esconder el enlace no basta.

   Esto NO sustituye la comprobación de pertenencia de cada acción: la
   complementa. Mismo cálculo que el panel (`resolveEffectiveRole` + `can`):
   el dueño y el dueño de grupo pasan siempre; el Super Admin también; el
   personal, solo con alguna de las secciones pedidas.
   ============================================================ */

export async function puedeEnSeccion(restaurantId: string, ...secciones: string[]): Promise<boolean> {
  const { data: { user } } = await getStaffUser();
  if (!user) return false;

  const { data: perfil } = await createServiceClient()
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle();
  if (!perfil) return false;
  if (perfil.role === 'SUPER_ADMIN') return true;
  if (await canActOnGroupBranch(restaurantId)) return true;

  const efectivo = await resolveEffectiveRole(
    { role: (perfil.role as string | null) ?? null, permissions: (perfil.permissions as string[] | null) ?? null },
    restaurantId,
  );
  return secciones.some((s) => can(efectivo.role, efectivo.permissions, s));
}

/** El error de siempre cuando falta la sección. */
export const SIN_SECCION = 'No tienes permiso para esta sección. Pídeselo al dueño del restaurante.';
