'use server';

import { revalidatePath } from 'next/cache';
import { assertTableAccess } from '@/lib/auth/table-access';
import { identidadCobroValida } from '@/lib/cobro-intento';
import { firmarPasePrueba } from '@/lib/pedido-prueba';
import { createServiceClient } from '@/lib/supabase/service';
import { subdomainUrl } from '@/lib/tenant';

/* Primeros pasos por resultado (ficha 2.2): el pedido de prueba.
   El panel firma el pase y abre la carta; al terminar, el pedido se cierra
   sin contar (migración 183). Lo puede hacer quien atiende pedidos. */

export async function iniciarPedidoDePrueba(restaurantId: string): Promise<{ url: string } | { error: string }> {
  if (!identidadCobroValida(restaurantId)) return { error: 'Restaurante inválido.' };
  const acceso = await assertTableAccess(restaurantId, ['pedidos']);
  if ('error' in acceso) return acceso;

  const { data } = await createServiceClient()
    .from('restaurants').select('slug').eq('id', restaurantId).maybeSingle();
  const slug = (data?.slug as string | undefined) ?? null;
  if (!slug) return { error: 'No encontramos tu carta.' };

  const pase = encodeURIComponent(firmarPasePrueba(restaurantId));
  return { url: `${subdomainUrl(slug)}/?prueba=${pase}` };
}

export async function terminarPedidoDePrueba(
  restaurantId: string, pedidoId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!identidadCobroValida(restaurantId) || !identidadCobroValida(pedidoId)) return { error: 'Pedido inválido.' };
  const acceso = await assertTableAccess(restaurantId, ['pedidos']);
  if ('error' in acceso) return acceso;

  const { error } = await createServiceClient().rpc('leogin_terminar_pedido_prueba', {
    p_restaurante: restaurantId, p_pedido: pedidoId, p_actor: acceso.actor.userId,
  });
  if (error) {
    return { error: error.code === 'LGD01' ? error.message : 'No se pudo terminar la prueba. Inténtalo de nuevo.' };
  }
  revalidatePath('/admin', 'layout');
  return { ok: true };
}
