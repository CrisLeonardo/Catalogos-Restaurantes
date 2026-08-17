'use server';

/* ============================================================
   DISPOSITIVOS DE CONFIANZA — acciones del dueño (migración 112)
   ------------------------------------------------------------
   El dueño autoriza los aparatos del local y decide si el PIN del
   personal vale SOLO en ellos. Ver lib/auth/trusted-device.ts
   para el porqué y hasta dónde llega esta protección.
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { ownerCtx } from '@/lib/actions/staff';
import { logActivity } from '@/lib/activity';
import { readDeviceId, rememberDevice } from '@/lib/auth/trusted-device';

export type DeviceState = { error: string } | { ok: true } | null;

/**
 * Autoriza el aparato desde el que se está usando el panel.
 *
 * El id NO se toma del formulario sino de la cookie del propio navegador
 * (la escribe lib/device-id.ts): así "confiar en este dispositivo" solo
 * puede autorizar ESTE, nunca uno que alguien escriba a mano.
 */
export async function trustCurrentDevice(prevState: DeviceState, formData: FormData): Promise<DeviceState> {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const deviceId = await readDeviceId();
  if (!deviceId) {
    return { error: 'Este navegador no permite recordar el aparato. Revisa que las cookies estén habilitadas.' };
  }

  const label = ((formData.get('label') as string) ?? '').trim() || null;
  await rememberDevice({
    restaurantId: ctx.restaurantId,
    deviceId,
    label,
    addedBy: ctx.userId,
  });

  await logActivity({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: 'dispositivo',
    entity: label ?? 'Este dispositivo',
    meta: { trusted: true },
  });
  revalidatePath('/admin/personal');
  return { ok: true };
}

/** Quita un aparato de la lista: deja de poder usar el PIN si el candado está puesto. */
export async function forgetDevice(formData: FormData) {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return;

  const deviceId = ((formData.get('deviceId') as string) ?? '').trim();
  if (!deviceId) return;

  await ctx.db
    .from('restaurant_devices')
    .delete()
    .eq('restaurant_id', ctx.restaurantId)
    .eq('device_id', deviceId);

  await logActivity({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: 'dispositivo',
    entity: ((formData.get('label') as string) ?? '').trim() || 'Dispositivo',
    meta: { removed: true },
  });
  revalidatePath('/admin/personal');
}

/**
 * Enciende o apaga el candado: "el PIN solo funciona en los aparatos del local".
 *
 * Se niega a encenderlo con la lista vacía. Encenderlo sin ningún aparato
 * autorizado dejaría a TODO el personal fuera de golpe, en plena hora pico y
 * sin forma de arreglarlo desde el local — el error más caro que puede
 * cometer un dueño con esta pantalla, y el más fácil de cometer.
 */
export async function setTrustedDevicePolicy(prevState: DeviceState, formData: FormData): Promise<DeviceState> {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const enabled = formData.get('enabled') === 'on' || formData.get('enabled') === 'true';

  if (enabled) {
    const { count } = await ctx.db
      .from('restaurant_devices')
      .select('device_id', { count: 'exact', head: true })
      .eq('restaurant_id', ctx.restaurantId);
    if (!count) {
      return { error: 'Primero autoriza al menos un dispositivo del local, o tu personal no podría entrar.' };
    }
  }

  const { error } = await ctx.db
    .from('restaurants')
    .update({ pin_requires_trusted_device: enabled })
    .eq('id', ctx.restaurantId);
  if (error) return { error: error.message };

  await logActivity({
    restaurantId: ctx.restaurantId,
    actorId: ctx.userId,
    action: 'dispositivo',
    entity: enabled ? 'PIN restringido a dispositivos del local' : 'PIN permitido en cualquier dispositivo',
    meta: { policy: enabled },
  });
  revalidatePath('/admin/personal');
  return { ok: true };
}
