'use server';

import { revalidatePath } from 'next/cache';
import { assertTableAccess } from '@/lib/auth/table-access';
import { identidadCobroValida } from '@/lib/cobro-intento';
import { logActivity } from '@/lib/activity';
import { createServiceClient } from '@/lib/supabase/service';
import { fallosPendientes, leerTrabajosRecientes } from '@/lib/db/estado-pc';

/* «Reintentar» de La PC del local (ficha 2.6, PA-T22).
   Vuelve a la cola SOLO los papeles que fallaron y que nadie volvió a
   mandar: si el mismo pedido ya salió en una reimpresión, su fallo viejo no
   se repite (sin duplicado silencioso). Salen como el original, no como
   COPIA, porque ese papel nunca llegó a la cocina. */
export async function reintentarImpresiones(
  restaurantId: string, papel: 'kitchen' | 'receipt',
): Promise<{ ok: true; n: number } | { error: string }> {
  if (!identidadCobroValida(restaurantId) || (papel !== 'kitchen' && papel !== 'receipt')) {
    return { error: 'Datos inválidos.' };
  }
  const acceso = await assertTableAccess(restaurantId, ['impresion']);
  if ('error' in acceso) return acceso;

  const pendientes = fallosPendientes((await leerTrabajosRecientes(restaurantId)).filter((t) => t.role === papel));
  if (pendientes.length === 0) return { ok: true, n: 0 };

  const { error } = await createServiceClient()
    .from('print_jobs')
    .update({ status: 'pending', attempts: 0, error: null, updated_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'failed')
    .in('id', pendientes.map((t) => t.id));
  if (error) return { error: 'No se pudo volver a mandar. Inténtalo de nuevo.' };

  await logActivity({
    restaurantId, actorId: acceso.actor.userId, action: 'impresion_reintento',
    meta: { papel, n: pendientes.length },
  });
  revalidatePath('/admin', 'layout');
  return { ok: true, n: pendientes.length };
}
