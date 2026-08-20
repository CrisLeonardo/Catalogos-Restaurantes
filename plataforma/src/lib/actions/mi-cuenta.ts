'use server';

/* ============================================================
   MI CUENTA — acciones (migración 113)
   ------------------------------------------------------------
   La pantalla donde una persona ve TODOS sus restaurantes, entra a
   uno, y crea el siguiente. Ver PLAN_ACCESO_MULTICUENTA.md.
   ============================================================ */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { getMyMembership, getMyMemberships, canBill } from '@/lib/db/membership';
import { isSyntheticStaffEmail } from '@/lib/staff-email';
import { checkEntryGate, unlockWithEntryPin, setEntryPin } from '@/lib/auth/entry-pin';
import { isValidPin, PIN_LENGTH } from '@/lib/staff-pin-crypto';
import { logPanelAccess } from '@/lib/auth/access-log';
import { adminUrl } from '@/lib/tenant';
import { slugify, validateSlug, crossSlugCollision, slugTaken, uniqueSlug } from '@/lib/slug';
import { withPlanFloor, ESTANDAR_MAX_ORDER_TYPES, type PlanCode } from '@/lib/plans';
import { newRestaurantBilling } from '@/lib/billing-signup';
import { getPricingSettings } from '@/lib/db/billing';
import { findTemplate } from '@/lib/theme/templates';
import type { OrderType } from '@/lib/theme/defaults';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Usuario autenticado, o null. */
async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/* ── Entrar a un restaurante ─────────────────────────────────── */

export type EntryState = { error: string } | null;

/**
 * Abre un restaurante desde Mi cuenta.
 *
 * Comprueba, en este orden: que seas miembro, que el PIN de entrada esté
 * satisfecho, y solo entonces te manda a su panel. El PIN se pide DESPUÉS de
 * verificar la membresía a propósito: alguien que no es miembro no debe poder
 * ni siquiera averiguar si ese restaurante tiene candado.
 */
export async function enterRestaurant(prevState: EntryState, formData: FormData): Promise<EntryState> {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  const restaurantId = ((formData.get('restaurantId') as string) ?? '').trim();
  if (!UUID_RE.test(restaurantId)) return { error: 'Solicitud inválida.' };

  const membership = await getMyMembership(restaurantId);
  if (!membership) return { error: 'No tienes acceso a este restaurante.' };

  const pin = ((formData.get('pin') as string) ?? '').trim();
  const gate = await checkEntryGate(restaurantId);

  if (gate.locked) {
    if (!pin) return { error: 'Escribe el PIN de este restaurante.' };

    // Mismo techo que el PIN del personal: por IP y por persona+restaurante.
    const ip = clientIp(await headers());
    if (!(await rateLimit(`entry:${ip}`, 20, 5 * 60_000)) ||
        !(await rateLimit(`entry:${user.id}:${restaurantId}`, 8, 5 * 60_000))) {
      return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
    }

    if (!(await unlockWithEntryPin(restaurantId, pin))) {
      return { error: 'PIN incorrecto.' };
    }
  }

  const db = createServiceClient();
  const { data: rest } = await db
    .from('restaurants')
    .select('slug')
    .eq('id', restaurantId)
    .maybeSingle();
  if (!rest?.slug) return { error: 'No pudimos abrir ese restaurante.' };

  await logPanelAccess({
    profileId: user.id,
    restaurantId,
    method: 'mi_cuenta',
    headers: await headers(),
  });

  redirect(`${adminUrl(rest.slug as string)}/menu`);
}

/* ── El PIN de entrada, desde el panel del restaurante ────────── */

export type EntryPinState = { error: string } | { ok: true } | null;

/** Pone o quita el PIN de entrada. Solo el DUEÑO del restaurante. */
export async function updateEntryPin(prevState: EntryPinState, formData: FormData): Promise<EntryPinState> {
  const user = await currentUser();
  if (!user) return { error: 'No autorizado.' };

  const restaurantId = ((formData.get('restaurantId') as string) ?? '').trim();
  if (!UUID_RE.test(restaurantId)) return { error: 'Solicitud inválida.' };

  const membership = await getMyMembership(restaurantId);
  // El candado protege el negocio entero, así que lo pone quien responde por
  // él. Un gerente no puede ponerle a su jefe un PIN que su jefe no conoce.
  if (!membership || !canBill(membership.role)) return { error: 'Solo el dueño puede cambiar esto.' };

  const pin = ((formData.get('pin') as string) ?? '').trim();
  const remove = formData.get('remove') === 'true';

  if (remove) {
    await setEntryPin(restaurantId, null);
    revalidatePath('/admin/ajustes');
    return { ok: true };
  }

  if (!isValidPin(pin)) return { error: `El PIN debe tener ${PIN_LENGTH} dígitos.` };
  await setEntryPin(restaurantId, pin);
  revalidatePath('/admin/ajustes');
  return { ok: true };
}

/* ── Crear otro restaurante ──────────────────────────────────── */

export type NewRestaurantState = { error: string } | null;

/**
 * Crea un restaurante para la cuenta que ya está dentro. EL ÚNICO sitio
 * donde nace uno, sea el primero de alguien que acaba de registrarse o el
 * quinto de una cadena.
 *
 * Su hermano es signupAccount() (lib/actions/signup.ts), que crea la CUENTA y
 * nada más. Antes aquella creaba las dos cosas de un tirón y esta era "la de
 * los restaurantes siguientes"; eran dos caminos con reglas distintas —el de
 * la calle sabía de plantillas y modos de pedido, este no— y se fueron
 * separando solos. No se pide correo ni contraseña: esa es justamente la
 * gracia del modelo de membresías, una identidad y varios negocios.
 *
 * El cobro es independiente por restaurante, así que el nuevo nace con su
 * propio `restaurant_billing` y su propia mensualidad, que se suma a lo que
 * ya paga.
 */
export async function createAnotherRestaurant(
  prevState: NewRestaurantState,
  formData: FormData,
): Promise<NewRestaurantState> {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  // Anti-abuso: crear restaurantes cuesta dinero real (cada uno con su plan),
  // pero un fallo de la pantalla no puede convertirse en veinte altas.
  if (!(await rateLimit(`new-restaurant:${user.id}`, 5, 60 * 60_000))) {
    return { error: 'Has creado varios restaurantes seguidos. Espera un rato antes del siguiente.' };
  }

  // Desde aquí se crean TODOS los restaurantes, también el primero: el alta de
  // la calle solo crea la cuenta y manda a esta pantalla.
  //
  // Quien queda fuera es la cuenta de PIN del local (correo sintético): esa no
  // es la identidad de una persona que abre un negocio, es una credencial de
  // turno atada a un aparato. Un gerente invitado SÍ puede: el restaurante que
  // cree nace a su nombre, con su propia membresía de dueño, no a nombre del
  // jefe que lo invitó — negárselo era rechazar a un cliente que paga.
  if (isSyntheticStaffEmail(user.email)) {
    return { error: 'Esta cuenta es de acceso por PIN. Crea tu restaurante desde tu propia cuenta.' };
  }

  const memberships = await getMyMemberships();
  // La prueba gratis es de la PERSONA y va en su primer restaurante propio:
  // ser gerente en el local de otro no la gasta. Ver lib/billing-signup.ts.
  const esElPrimero = !memberships.some((m) => canBill(m.role));

  const name = ((formData.get('name') as string) ?? '').trim();
  const rawSlug = ((formData.get('slug') as string) ?? '').trim().toLowerCase();
  const rawPlan = formData.get('plan_code') as string | null;
  const planCode: PlanCode =
    rawPlan === 'BASICO' ? 'BASICO' : rawPlan === 'ESTANDAR' ? 'ESTANDAR' : 'PREMIUM';
  const template = findTemplate(((formData.get('template_id') as string) ?? '').trim());
  const whatsapp = ((formData.get('whatsapp') as string) ?? '').trim() || null;

  // Estándar lleva 2 de los 3 modos de pedido. Un valor inválido o con conteo
  // distinto cae al par de siempre — misma regla que aplicaba el alta de la
  // calle, que es de donde vino esta pantalla.
  const VALID_ORDER_TYPES: OrderType[] = ['dine_in', 'pickup', 'delivery'];
  const rawTypes = ((formData.get('estandar_order_types') as string | null) ?? '').split(',').map((t) => t.trim());
  const requestedEstandarTypes = [...new Set(rawTypes)].filter((t): t is OrderType => VALID_ORDER_TYPES.includes(t as OrderType));
  const estandarOrderTypes: OrderType[] =
    requestedEstandarTypes.length === ESTANDAR_MAX_ORDER_TYPES ? requestedEstandarTypes : ['pickup', 'dine_in'];

  if (!name || name.length < 2) return { error: 'Escribe el nombre de tu restaurante.' };
  if (name.length > 80) return { error: 'El nombre es demasiado largo.' };
  if (whatsapp && !/^\+?[\d\s\-()]{7,20}$/.test(whatsapp)) {
    return { error: 'El número de WhatsApp no es válido.' };
  }

  const db = createServiceClient();

  // Si quien crea administra una cadena, el local nuevo nace DENTRO de ella:
  // es lo que hace que aparezca solo en el panel consolidado, sin que nadie
  // tenga que pedirle a Leogin que lo enlace a mano después.
  const { data: creator } = await db
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .maybeSingle();
  // Si administra una cadena, el local nuevo nace dentro de ella. La cadena
  // se reconoce por la organización del perfil (migración 116).
  const organizationId = (creator?.organization_id as string | null) ?? null;

  // ── Dirección (slug) ───────────────────────────────────────
  let slug: string;
  if (rawSlug) {
    const slugErr = validateSlug(rawSlug);
    if (slugErr) return { error: slugErr };
    if (await slugTaken(db, rawSlug)) return { error: `La dirección "${rawSlug}" ya está ocupada. Elige otra.` };
    const collision = await crossSlugCollision(db, rawSlug, 'restaurants');
    if (collision) return { error: collision };
    slug = rawSlug;
  } else {
    const base = slugify(name);
    if (!base || validateSlug(base)) {
      return { error: 'No pudimos generar una dirección con ese nombre. Escribe una manualmente.' };
    }
    slug = await uniqueSlug(db, base);
  }

  // ── Restaurante ────────────────────────────────────────────
  const { data: restaurant, error: rErr } = await db
    .from('restaurants')
    .insert({
      name,
      slug,
      plan_actual: planCode,
      modules: withPlanFloor(planCode, { multi_branch: false }),
      status: 'active',
      onboarding_done: false,
      contact_email: user.email ?? null,
      whatsapp_number: whatsapp,
      orders_whatsapp: whatsapp,
      ...(organizationId ? { organization_id: organizationId } : {}),
    })
    .select('id')
    .single();

  if (rErr || !restaurant) {
    if (rErr?.message?.includes('unique') || rErr?.message?.includes('duplicate')) {
      return { error: 'Esa dirección acaba de ocuparse. Elige otra.' };
    }
    return { error: rErr?.message ?? 'No se pudo crear el restaurante.' };
  }
  const restaurantId = restaurant.id as string;

  // ── Tema ───────────────────────────────────────────────────
  const orderTypes: OrderType[] =
    planCode === 'BASICO' ? ['pickup']
      : planCode === 'ESTANDAR' ? estandarOrderTypes
        : ['dine_in', 'delivery', 'pickup'];
  await db.from('restaurant_themes').insert({
    restaurant_id: restaurantId,
    brand_name: name,
    config: { ...(template ? structuredClone(template.config) : {}), orderTypes },
  });

  // ── Cobro ──────────────────────────────────────────────────
  // La prueba gratis es UNA por persona, en su primer restaurante. Ver la
  // regla y el porqué en lib/billing-signup.ts.
  const pricing = await getPricingSettings();
  await db.from('restaurant_billing').insert({
    restaurant_id: restaurantId,
    ...newRestaurantBilling({
      planCode,
      trialDays: pricing.trialDays,
      isFirstOfOwner: esElPrimero,
    }),
  });
  await db.rpc('leogin_apply_auto_price', { p_restaurant_id: restaurantId });

  // ── La membresía de dueño ──────────────────────────────────
  // Esto es lo que hace que aparezca en Mi cuenta y que pueda entrar. NO se
  // toca `profiles.restaurant_id`: su restaurante "de casa" sigue siendo el
  // primero, y el nuevo se abre desde el selector como cualquier otro.
  const { error: mErr } = await db.from('restaurant_members').insert({
    user_id: user.id,
    restaurant_id: restaurantId,
    role: 'OWNER',
    status: 'active',
  });
  if (mErr) {
    // Sin membresía el restaurante quedaría creado y sin dueño: se deshace.
    await db.from('restaurants').delete().eq('id', restaurantId);
    return { error: 'No se pudo terminar de crear el restaurante. Inténtalo de nuevo.' };
  }

  /* El PRIMERO aterriza en la pantalla de bienvenida —qué incluye su plan y
     qué hacer ahora—, que es la que antes cerraba el registro. Del segundo en
     adelante se entra directo al panel: quien abre su tercer local no necesita
     que le expliquen el producto otra vez. */
  if (esElPrimero) redirect(`/registro/listo?slug=${encodeURIComponent(slug)}&plan=${planCode}`);
  redirect(`${adminUrl(slug)}/menu?welcome=1`);
}
