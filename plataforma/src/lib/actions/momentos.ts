'use server';

/* El panel pregunta por el primer pedido del restaurante (PLAN_MOMENTOS_PICO
   P3): cuando entra un pedido nuevo y la primera vez que se abre en este
   aparato. Solo contesta a quien es del restaurante, con el mismo criterio
   que las visitas (lib/actions/metrics.ts). */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveEffectiveRole } from '@/lib/db/membership';
import { getPrimerPedido, type PrimerPedido } from '@/lib/db/momentos';

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function esDelRestaurante(restaurantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();
  const efectivo = await resolveEffectiveRole({ role: profile?.role ?? null, permissions: null }, restaurantId);
  return (
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(efectivo.role) &&
      (efectivo.isMember || profile?.restaurant_id === restaurantId))
  );
}

export interface RespuestaPrimerPedido {
  /** El primer pedido, si todavía es noticia. */
  pedido: PrimerPedido | null;
  /** Ya hay más pedidos de los que se celebran: el aparato deja de preguntar. */
  yaNoAplica: boolean;
}

export async function consultarPrimerPedido(restaurantId: string): Promise<RespuestaPrimerPedido> {
  if (!UUID_RE.test(restaurantId) || !(await esDelRestaurante(restaurantId))) {
    return { pedido: null, yaNoAplica: false };
  }
  const pedido = await getPrimerPedido(restaurantId);
  if (pedido) return { pedido, yaNoAplica: false };
  // Sin pedido que celebrar puede ser porque aún no hay ninguno (sigue
  // preguntando) o porque ya pasó (deja de preguntar). Con el cliente de
  // servicio: el acceso ya se comprobó arriba.
  const { count } = await createServiceClient()
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL');
  return { pedido: null, yaNoAplica: (count ?? 0) > 0 };
}
