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
import { touchOperatorSession } from '@/lib/actions/operator';
import { ownerCtx, assertStaffOfRestaurant } from '@/lib/actions/staff';
import { can } from '@/lib/permissions';
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
 */
export async function listStaffForPin(restaurantId: string): Promise<PinStaffMember[]> {
  if (!UUID_RE.test(restaurantId)) return [];
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

export type PinVerifyState = { error: string } | null;

export async function verifyStaffPin(prevState: PinVerifyState, formData: FormData): Promise<PinVerifyState> {
  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  const profileId = (formData.get('profileId') as string)?.trim();
  const pin = (formData.get('pin') as string) ?? '';

  if (!UUID_RE.test(restaurantId) || !UUID_RE.test(profileId)) return { error: 'Solicitud inválida.' };
  if (!isValidPin(pin)) return { error: 'PIN inválido.' };

  // Anti fuerza bruta: por IP y por restaurante+persona (mismo patrón que login()).
  const ip = clientIp(await headers());
  if (!rateLimit(`pin:${ip}`, 20, 5 * 60_000) ||
      !rateLimit(`pin:${restaurantId}:${profileId}`, 8, 5 * 60_000)) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
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

  await touchOperatorSession(profileId);

  await logActivity({
    restaurantId,
    actorId: profileId,
    action: 'staff_pin_login',
    entity: (profile.full_name as string | null) ?? undefined,
  });

  const tenantSlug = (await headers()).get('x-tenant-slug');
  const destination = await resolveStaffDestination(
    supabase,
    profile as { role: string; permissions: string[] | null; restaurant_id: string | null },
    tenantSlug,
    '?welcome=1',
  );
  redirect(destination);
}

/**
 * Valida el PIN de un "encargado" (permiso 'aprobar_anulaciones') SIN abrir
 * sesión — a diferencia de verifyStaffPin, esto solo confirma identidad para
 * autorizar una acción puntual (anular un pedido/ítem ya enviado a cocina)
 * dentro de la sesión de quien la solicita. Mismo rate-limit/bloqueo que el
 * login por PIN (ver verifyStaffPin arriba).
 */
export async function checkApproverPin(
  restaurantId: string,
  approverId: string,
  pin: string,
  ip: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(restaurantId) || !UUID_RE.test(approverId)) return { ok: false, error: 'Solicitud inválida.' };
  if (!isValidPin(pin)) return { ok: false, error: 'PIN inválido.' };

  if (
    !rateLimit(`pin:${ip}`, 20, 5 * 60_000) ||
    !rateLimit(`pin:${restaurantId}:${approverId}`, 8, 5 * 60_000)
  ) {
    return { ok: false, error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  const db = createServiceClient();
  const { data: row } = await db
    .from('staff_pins')
    .select('pin_hash, pin_salt, failed_attempts, locked_until')
    .eq('profile_id', approverId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (!row) return { ok: false, error: 'PIN incorrecto.' };

  if (row.locked_until && new Date(row.locked_until as string) > new Date()) {
    return { ok: false, error: 'Demasiados intentos fallidos. Espera unos minutos.' };
  }

  const ok = await verifyPin(pin, row.pin_salt as string, row.pin_hash as string);
  if (!ok) {
    const attempts = (row.failed_attempts as number) + 1;
    const locked = attempts >= PIN_LOCK_AFTER_ATTEMPTS;
    await db.from('staff_pins').update({
      failed_attempts: locked ? 0 : attempts,
      locked_until: locked ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : null,
    }).eq('profile_id', approverId);
    return { ok: false, error: locked ? 'Demasiados intentos fallidos. Espera unos minutos.' : 'PIN incorrecto.' };
  }

  await db.from('staff_pins').update({ failed_attempts: 0, locked_until: null }).eq('profile_id', approverId);
  return { ok: true };
}

/**
 * Staff con PIN activo Y permiso 'aprobar_anulaciones' — la lista de
 * "encargados" que puede autorizar una anulación ya enviada a cocina
 * (ver voidOrder en lib/actions/orders.ts). El dueño mismo no necesita
 * aparecer aquí: can() ya le da el permiso sin PIN (auto-aprobado).
 */
export async function listVoidApprovers(restaurantId: string): Promise<PinStaffMember[]> {
  if (!UUID_RE.test(restaurantId)) return [];
  const db = createServiceClient();
  const { data } = await db
    .from('staff_pins')
    .select('profile_id, profiles(full_name, role, permissions)')
    .eq('restaurant_id', restaurantId);

  return (data ?? [])
    .filter((r) => {
      const p = r.profiles as unknown as { role: string; permissions: string[] | null } | null;
      return !!p && can(p.role, p.permissions, 'aprobar_anulaciones');
    })
    .map((r) => ({
      id: r.profile_id as string,
      full_name: ((r.profiles as unknown as { full_name: string | null } | null))?.full_name ?? null,
    }));
}
