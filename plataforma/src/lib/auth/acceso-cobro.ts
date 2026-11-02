import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { resolveEffectiveRole } from '@/lib/db/membership';

/**
 * ¿Quien llama puede ver y pagar el cobro de ESTE restaurante?
 * Devuelve su id de usuario, o null.
 *
 * Qué es esta persona EN ESTE restaurante: mirar solo el perfil dejaba
 * fuera al dueño del modelo de membresías, que lo tiene en null; y el rol
 * se toma también del efectivo para no abrirle esto a quien es personal de
 * OTRO restaurante y aquí solo es mesero.
 *
 * Lo comparten la lectura del estado de cuenta (getMyBilling) y el envío
 * del comprobante (Paga tu plan): quien ve lo que debe tiene que poder
 * pagarlo, y nadie más.
 */
export async function usuarioDelCobro(restaurantId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();

  const efectivo = await resolveEffectiveRole(
    { role: profile?.role ?? null, permissions: null },
    restaurantId,
  );
  const allowed =
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(efectivo.role) &&
      (efectivo.isMember || profile?.restaurant_id === restaurantId));
  return allowed ? user.id : null;
}

/**
 * ¿Quien llama es el DUEÑO de este restaurante (o Super Admin)? Para
 * cambiar de plan no basta con ver el cobro: el personal puede pagar lo
 * que se debe, pero cambiar lo que se contrata es decisión del dueño.
 */
export async function duenoDelRestaurante(restaurantId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();
  if (profile?.role === 'SUPER_ADMIN') return user.id;

  const efectivo = await resolveEffectiveRole(
    { role: profile?.role ?? null, permissions: null },
    restaurantId,
  );
  const esDueno = efectivo.role === 'RESTAURANT_OWNER'
    && (efectivo.isMember || profile?.restaurant_id === restaurantId);
  return esDueno ? user.id : null;
}
