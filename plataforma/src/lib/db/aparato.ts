import 'server-only';

import { readDeviceId } from '@/lib/auth/trusted-device';
import { leerUso, type UsoAparato } from '@/lib/aparato';
import { createServiceClient } from '@/lib/supabase/service';

export interface EsteAparato {
  uso: UsoAparato | null;
  nombre: string | null;
}

/**
 * Para qué es el aparato desde el que se abre el panel (ficha 2.6).
 *
 * Sin cookie de aparato o sin la migración 184 devuelve «panel completo»:
 * el panel sigue funcionando como hasta hoy, nunca se rompe por esto.
 */
export async function getEsteAparato(restaurantId: string | null): Promise<EsteAparato> {
  const vacio = { uso: null, nombre: null };
  if (!restaurantId) return vacio;
  const deviceId = await readDeviceId();
  if (!deviceId) return vacio;
  const { data, error } = await createServiceClient()
    .from('restaurant_devices')
    .select('uso, label')
    .eq('restaurant_id', restaurantId)
    .eq('device_id', deviceId)
    .maybeSingle();
  if (error || !data) return vacio;
  return { uso: leerUso(data.uso), nombre: (data.label as string | null) ?? null };
}
