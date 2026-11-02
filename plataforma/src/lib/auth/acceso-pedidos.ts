import 'server-only';

import { getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { canActOnRestaurant } from '@/lib/db/membership';
import { puedeEnSeccion, SIN_SECCION } from '@/lib/auth/seccion';

/**
 * ¿Quien llama puede manejar los pedidos de ESTE restaurante? Pertenencia
 * (es suyo, de su grupo o es Super Admin) Y la sección «Pedidos» (SEC-06:
 * una server action se puede invocar sin pasar por la pantalla).
 *
 * Lo usan encargos y la confirmación de transferencias.
 */
export async function autorizarPedidos(restaurantId: string): Promise<{ userId: string } | { error: string }> {
  const { data: { user } } = await getStaffUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: perfil } = await createServiceClient()
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!perfil) return { error: 'No autorizado.' };

  const pertenece =
    perfil.role === 'SUPER_ADMIN' ||
    (await canActOnGroupBranch(restaurantId)) ||
    (await canActOnRestaurant(perfil.restaurant_id as string | null, restaurantId));
  if (!pertenece) return { error: 'No autorizado.' };
  if (!(await puedeEnSeccion(restaurantId, 'pedidos'))) return { error: SIN_SECCION };
  return { userId: user.id };
}
