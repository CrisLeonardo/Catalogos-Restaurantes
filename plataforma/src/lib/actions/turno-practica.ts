'use server';

import { assertTableAccess } from '@/lib/auth/table-access';
import { identidadCobroValida } from '@/lib/cobro-intento';
import { logActivity } from '@/lib/activity';

/* Turno de práctica (ficha 2.5): la práctica entera pasa en el aparato y
   no deja nada en la base. Lo único que se anota es que alguien la
   terminó, para que el dueño lo vea en Personal. */

export async function registrarTurnoPractica(
  restaurantId: string, minutos: number,
): Promise<{ ok: true } | { error: string }> {
  if (!identidadCobroValida(restaurantId)) return { error: 'Restaurante inválido.' };
  const acceso = await assertTableAccess(restaurantId, ['mesero', 'caja.cobrar']);
  if ('error' in acceso) return acceso;

  const min = Number.isFinite(minutos) ? Math.min(240, Math.max(1, Math.round(minutos))) : null;
  await logActivity({
    restaurantId, actorId: acceso.actor.userId, action: 'turno_practica',
    meta: min ? { minutos: min } : null,
  });
  return { ok: true };
}
