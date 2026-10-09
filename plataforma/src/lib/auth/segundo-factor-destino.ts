import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveStaffDestination } from '@/lib/auth/destination';

/**
 * A dónde va quien acaba de escribir su código (ACC-01).
 *
 * Lo usan la acción que verifica el código Y la propia pantalla: al cambiar
 * las cookies, Next vuelve a pintar /admin/dos-pasos en la respuesta de la
 * acción, y esa pintada ya ve la sesión verificada — si mandara a otro sitio
 * que la acción, ganaría ella (pasó: aterrizaba en el login).
 *
 * El rol se lee con el cliente de servicio porque la petición empezó sin
 * `aal2` y el cliente de sesión se armó antes de subir de nivel.
 */
export async function destinoTrasSegundoFactor(userId: string): Promise<string> {
  const { data: profile } = await createServiceClient()
    .from('profiles')
    .select('role, permissions, restaurant_id')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return '/mi-cuenta';

  return resolveStaffDestination(
    await createClient(),
    profile as { role: string; permissions: string[] | null; restaurant_id: string | null },
    null,
  );
}
