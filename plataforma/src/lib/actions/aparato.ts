'use server';

import { revalidatePath } from 'next/cache';
import { ownerCtx } from '@/lib/auth/personal';
import { readDeviceId, rememberDevice } from '@/lib/auth/trusted-device';
import { logActivity } from '@/lib/activity';
import { leerUso, USOS } from '@/lib/aparato';

/* «⋯ › Este aparato» (ficha 2.6). Lo decide quien maneja el personal: el
   dueño o quien tenga el permiso de Personal (`ownerCtx`). El aparato es
   SIEMPRE el de la cookie de este navegador, nunca uno que llegue en el
   formulario: así solo se prepara el aparato que se tiene en la mano.

   Preparar el aparato lo deja además en la lista de aparatos del local
   (Personal › Dispositivos), que es lo que es. */
export async function guardarUsoDelAparato(
  restaurantId: string, usoCrudo: string | null, nombreCrudo: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await ownerCtx(restaurantId);
  if (!ctx || ctx.restaurantId !== restaurantId) return { error: 'Solo el dueño o quien maneja el personal puede cambiar esto.' };

  const deviceId = await readDeviceId();
  if (!deviceId) return { error: 'Este navegador no permite recordar el aparato. Revisa que las cookies estén habilitadas.' };

  const uso = leerUso(usoCrudo);
  const nombre = nombreCrudo.trim().slice(0, 60) || null;
  await rememberDevice({ restaurantId, deviceId, label: nombre, addedBy: ctx.userId });

  const { error } = await ctx.db
    .from('restaurant_devices')
    .update({ uso })
    .eq('restaurant_id', restaurantId)
    .eq('device_id', deviceId);
  if (error) {
    return { error: /uso/.test(error.message) ? 'Falta aplicar la migración 184 en la base.' : 'No se pudo guardar. Inténtalo de nuevo.' };
  }

  await logActivity({
    restaurantId, actorId: ctx.userId, action: 'aparato_uso',
    entity: nombre, meta: { uso: uso ? USOS[uso].label : 'Panel completo' },
  });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}
