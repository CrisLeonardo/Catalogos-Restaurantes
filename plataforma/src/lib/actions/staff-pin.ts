'use server';

/* ============================================================
   LOGIN DE STAFF POR PIN — ver PLAN_LOGIN_STAFF_PIN.md
   verifyStaffPin no crea una identidad paralela: dispara una sesión REAL
   de Supabase Auth (generateLink + verifyOtp), así todo el panel (RLS
   incluida) sigue funcionando sin cambios. El PIN es solo el gate.
   ============================================================ */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { logActivity } from '@/lib/activity';
import { resolveStaffDestination } from '@/lib/auth/destination';
import { writeOperatorCookie } from '@/lib/auth/operator-session';
import { logPanelAccess } from '@/lib/auth/access-log';
import { getPinAccess, readDeviceId, rememberDevice } from '@/lib/auth/trusted-device';
import { ownerCtx, assertStaffOfRestaurant } from '@/lib/actions/staff';
import {
  isValidPin, newPinSalt, hashPin, verifyPin,
  PIN_LENGTH, PIN_LOCK_AFTER_ATTEMPTS, PIN_LOCK_MS,
} from '@/lib/staff-pin-crypto';

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type StaffPinState = { error: string } | { ok: true } | null;

/** El dueño asigna/cambia el PIN de un miembro desde el panel de Personal. */
export async function setStaffPin(prevState: StaffPinState, formData: FormData): Promise<StaffPinState> {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const userId = (formData.get('userId') as string)?.trim();
  const pin = (formData.get('pin') as string) ?? '';
  if (!userId || !(await assertStaffOfRestaurant(ctx, userId))) return { error: 'No autorizado.' };
  if (!isValidPin(pin)) return { error: `El PIN debe tener ${PIN_LENGTH} dígitos.` };

  const salt = newPinSalt();
  const hash = await hashPin(pin, salt);

  const { error } = await ctx.db.from('staff_pins').upsert({
    profile_id: userId,
    restaurant_id: ctx.restaurantId,
    pin_hash: hash,
    pin_salt: salt,
    failed_attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  revalidatePath('/admin/personal');
  return { ok: true };
}

/** El dueño quita el PIN de alguien (ej. deja el restaurante). */
export async function clearStaffPin(formData: FormData) {
  const ctx = await ownerCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return;
  const userId = (formData.get('userId') as string)?.trim();
  if (!userId || !(await assertStaffOfRestaurant(ctx, userId))) return;
  await ctx.db.from('staff_pins').delete().eq('profile_id', userId);
  revalidatePath('/admin/personal');
}

export type PinStaffMember = { id: string; full_name: string | null };

/**
 * Grilla "¿Quién eres?" (pre-login): solo nombre + id de quienes tienen PIN
 * activo. A diferencia de listStaff() (para el dueño ya autenticado), esto
 * es público — nunca exponer email aquí.
 *
 * Y "público" era justo el problema: cualquiera que abriera el login del
 * restaurante veía los nombres de todo el personal sin iniciar sesión. Con el
 * candado de dispositivos encendido (migración 112) la lista solo se entrega
 * a los aparatos del local. El aparato se lee de su cookie aquí dentro, no de
 * un parámetro: una acción de servidor que se fía de lo que le pasa el
 * cliente no protege nada.
 */
export async function listStaffForPin(restaurantId: string): Promise<PinStaffMember[]> {
  if (!UUID_RE.test(restaurantId)) return [];

  const access = await getPinAccess(restaurantId);
  if (!access.allowed) return [];

  const db = createServiceClient();
  const { data } = await db
    .from('staff_pins')
    .select('profile_id, profiles(full_name)')
    .eq('restaurant_id', restaurantId);

  return (data ?? []).map((r) => ({
    id: r.profile_id as string,
    full_name: ((r.profiles as unknown as { full_name: string | null } | null))?.full_name ?? null,
  }));
}

/**
 * ¿Puede este aparato usar el PIN? Solo para explicar una lista vacía.
 *
 * La pantalla de login ya decide esto en el servidor y ni siquiera ofrece el
 * PIN cuando no toca. Esto cubre el hueco de en medio: que el dueño encienda
 * el candado mientras alguien tiene la pantalla abierta. Sin esto, esa
 * persona vería "todavía no hay personal con PIN configurado" —que es falso y
 * manda a buscar el problema donde no está— en vez de "este aparato no está
 * autorizado".
 */
export async function isPinAllowedHere(restaurantId: string): Promise<boolean> {
  if (!UUID_RE.test(restaurantId)) return false;
  const access = await getPinAccess(restaurantId);
  return access.allowed;
}

export type PinVerifyState = { error: string } | null;

export async function verifyStaffPin(prevState: PinVerifyState, formData: FormData): Promise<PinVerifyState> {
  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  const profileId = (formData.get('profileId') as string)?.trim();
  const pin = (formData.get('pin') as string) ?? '';

  if (!UUID_RE.test(restaurantId) || !UUID_RE.test(profileId)) return { error: 'Solicitud inválida.' };
  if (!isValidPin(pin)) return { error: 'PIN inválido.' };

  // Anti fuerza bruta: por IP y por restaurante+persona (mismo patrón que login()).
  // Va PRIMERO, incluso antes del candado de dispositivos: es lo que acota
  // cuánto trabajo puede provocar alguien sin identificarse. Comprobar el
  // aparato antes dejaría esa consulta fuera de todo límite.
  const ip = clientIp(await headers());
  if (!(await rateLimit(`pin:${ip}`, 20, 5 * 60_000)) ||
      !(await rateLimit(`pin:${restaurantId}:${profileId}`, 8, 5 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  // Candado de dispositivos (migración 112). Se comprueba TAMBIÉN aquí, no
  // solo al pintar la pantalla: esconder la grilla sin cerrar la acción deja
  // la puerta abierta a quien la llame directamente. Y antes de mirar el PIN,
  // para que un aparato no autorizado no gaste intentos del contador de la
  // persona — si no, cualquiera podría dejar a un cajero bloqueado desde
  // fuera sin siquiera poder entrar.
  const access = await getPinAccess(restaurantId);
  if (!access.allowed) {
    return { error: 'Este dispositivo no está autorizado para entrar con PIN. Entra con tu correo o pídele al dueño que lo autorice.' };
  }

  const db = createServiceClient();
  const { data: row } = await db
    .from('staff_pins')
    .select('pin_hash, pin_salt, failed_attempts, locked_until')
    .eq('profile_id', profileId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (!row) return { error: 'PIN incorrecto.' };

  if (row.locked_until && new Date(row.locked_until as string) > new Date()) {
    return { error: 'Demasiados intentos fallidos. Espera unos minutos.' };
  }

  const ok = await verifyPin(pin, row.pin_salt as string, row.pin_hash as string);
  if (!ok) {
    const attempts = (row.failed_attempts as number) + 1;
    const locked = attempts >= PIN_LOCK_AFTER_ATTEMPTS;
    await db.from('staff_pins').update({
      failed_attempts: locked ? 0 : attempts,
      locked_until: locked ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : null,
    }).eq('profile_id', profileId);
    return { error: locked ? 'Demasiados intentos fallidos. Espera unos minutos.' : 'PIN incorrecto.' };
  }

  await db.from('staff_pins').update({ failed_attempts: 0, locked_until: null }).eq('profile_id', profileId);

  // El PIN identifica al perfil; confirmar que sigue siendo staff de ESTE
  // restaurante antes de abrirle sesión (pudo haber sido removido/movido).
  const { data: profile } = await db
    .from('profiles')
    .select('id, role, restaurant_id, permissions, full_name')
    .eq('id', profileId)
    .single();
  if (!profile || profile.restaurant_id !== restaurantId ||
      !['RESTAURANT_STAFF', 'RESTAURANT_WAITER'].includes(profile.role as string)) {
    return { error: 'No autorizado.' };
  }

  const { data: userData } = await db.auth.admin.getUserById(profileId);
  const email = userData.user?.email;
  if (!email) return { error: 'No se pudo iniciar sesión. Contacta al dueño.' };

  const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !linkData?.properties?.hashed_token) return { error: 'No se pudo iniciar sesión.' };

  const supabase = await createClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr) return { error: 'No se pudo iniciar sesión.' };

  // El PIN ya quedó validado y el perfil confirmado como staff de ESTE
  // restaurante (arriba), así que este id es de fiar. Se escribe la cookie
  // directamente en vez de pasar por touchOperatorSession(), que la deriva de
  // auth.getUser() — la sesión acaba de crearse en este mismo request.
  await writeOperatorCookie(profile.id as string);

  // Confianza al primer uso: un PIN correcto registra (o refresca) el aparato.
  // Así la lista del dueño se llena sola con las tabletas y la computadora que
  // de verdad se usan, y el día que encienda el candado lo que ya funcionaba
  // sigue funcionando. Con el candado puesto solo refresca la última visita —
  // getPinAccess ya cortó arriba a cualquier aparato desconocido, así que esto
  // nunca puede AÑADIR uno nuevo estando encendido.
  const deviceId = await readDeviceId();
  if (deviceId) {
    await rememberDevice({ restaurantId, deviceId });
  }

  await logActivity({
    restaurantId,
    actorId: profileId,
    action: 'staff_pin_login',
    entity: (profile.full_name as string | null) ?? undefined,
  });

  const headersList = await headers();
  await logPanelAccess({
    profileId: profile.id as string,
    restaurantId,
    method: 'pin',
    headers: headersList,
  });

  const tenantSlug = headersList.get('x-tenant-slug');
  const destination = await resolveStaffDestination(
    supabase,
    profile as { role: string; permissions: string[] | null; restaurant_id: string | null },
    tenantSlug,
    '?welcome=1',
  );
  redirect(destination);
}

