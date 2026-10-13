/**
 * LA FIRMA DEL ENCARGADO
 * ------------------------------------------------------------
 * El mismo PIN de entrar al panel (`staff_pins`, migración 074), con su
 * mismo candado por intentos, firma todo lo que mueve dinero después de
 * hecho: anular un plato ya cocinado (079), descontar de una cuenta (M-10)
 * y, desde la migración 145, corregir un cobro, reabrir una mesa, devolver
 * y anular un corte de caja.
 *
 * Vive aquí y no en `lib/actions/orders.ts` porque ese archivo es
 * `'use server'`: lo exportado allí es una acción que el navegador puede
 * llamar, y estas dos piezas no deben serlo.
 */

import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { puedeAprobar, type Aprobador } from '@/lib/void-approval';
import { isValidPin, verifyPin, PIN_LOCK_AFTER_ATTEMPTS, PIN_LOCK_MS } from '@/lib/staff-pin-crypto';

/**
 * A quién se le puede pasar la tablet para que firme.
 *
 * Solo quien tiene PIN puesto: es la lista de quien puede autorizar AHORA,
 * no la de quien podría en teoría. Y solo nombre y cargo, los mismos datos
 * que ya enseña la pantalla de entrar con PIN.
 *
 * Vive aparte desde M-10 porque la comparten dos firmas distintas —anular
 * un plato ya cocinado y descontar de una cuenta—: si cada una armara su
 * lista, una podría quedarse sin el candado del PIN al cambiar la otra.
 */
export async function listarAprobadores(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
): Promise<Aprobador[]> {
  const { data: pins } = await db
    .from('staff_pins').select('profile_id').eq('restaurant_id', restaurantId);
  const conPin = new Set((pins ?? []).map((p) => p.profile_id as string));
  if (conPin.size === 0) return [];

  const { data: perfiles } = await db
    .from('profiles')
    .select('id, full_name, role, permissions')
    .eq('restaurant_id', restaurantId);

  return (perfiles ?? [])
    .filter((p) => conPin.has(p.id as string))
    .filter((p) => puedeAprobar(p.role as string | null, p.permissions as string[] | null))
    .map((p) => ({
      id: p.id as string,
      name: (p.full_name as string | null)?.trim() || 'Sin nombre',
      role: p.role === 'RESTAURANT_OWNER' ? 'Dueño' : 'Encargado',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Comprueba el PIN del encargado y devuelve su id para `approved_by`.
 *
 * Vuelve a verificar que quien firma SIGUE pudiendo firmar y sigue siendo
 * de este restaurante: el diálogo pudo haberse quedado abierto desde antes
 * de que el dueño le cambiara los permisos.
 */
export async function verificarAprobador(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
  approverId: string,
  pin: string,
): Promise<{ id: string } | { error: string }> {
  if (!isValidPin(pin)) return { error: 'El PIN son 4 dígitos.' };

  // El mismo techo que el login por PIN: sin esto, el diálogo de anulación
  // sería un oráculo cómodo para probar los 10 000 PIN de un encargado.
  const ip = clientIp(await headers());
  if (!(await rateLimit(`void-pin:${ip}`, 20, 5 * 60_000)) ||
      !(await rateLimit(`void-pin:${restaurantId}:${approverId}`, 8, 5 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos.' };
  }

  const { data: perfil } = await db
    .from('profiles').select('id, role, permissions, restaurant_id').eq('id', approverId).maybeSingle();
  if (!perfil || perfil.restaurant_id !== restaurantId) return { error: 'PIN incorrecto.' };
  if (!puedeAprobar(perfil.role as string | null, perfil.permissions as string[] | null)) {
    return { error: 'Esa persona ya no puede autorizar anulaciones.' };
  }

  const { data: row } = await db
    .from('staff_pins')
    .select('pin_hash, pin_salt, failed_attempts, locked_until')
    .eq('profile_id', approverId).eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (!row) return { error: 'PIN incorrecto.' };
  if (row.locked_until && new Date(row.locked_until as string) > new Date()) {
    return { error: 'Demasiados intentos fallidos. Espera unos minutos.' };
  }

  const ok = await verifyPin(pin, row.pin_salt as string, row.pin_hash as string);
  if (!ok) {
    // El MISMO contador que el login: cinco fallos aquí también dejan el PIN
    // bloqueado un rato. Si no, esta pantalla sería la puerta de atrás.
    const intentos = (row.failed_attempts as number) + 1;
    const bloqueado = intentos >= PIN_LOCK_AFTER_ATTEMPTS;
    await db.from('staff_pins').update({
      failed_attempts: bloqueado ? 0 : intentos,
      locked_until: bloqueado ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : null,
    }).eq('profile_id', approverId);
    return { error: bloqueado ? 'Demasiados intentos fallidos. Espera unos minutos.' : 'PIN incorrecto.' };
  }

  await db.from('staff_pins').update({ failed_attempts: 0, locked_until: null }).eq('profile_id', approverId);
  return { id: approverId };
}
