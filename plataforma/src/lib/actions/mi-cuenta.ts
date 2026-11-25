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
import { identidadReciente } from '@/lib/auth/reauth';
import { reauthRequerida } from '@/lib/auth/reauth-policy';
import { isValidPin, PIN_LENGTH } from '@/lib/staff-pin-crypto';
import { logPanelAccess } from '@/lib/auth/access-log';
import { adminUrl } from '@/lib/tenant';
import { slugify, validateSlug, crossSlugCollision, slugTaken, uniqueSlug } from '@/lib/slug';
import { ensureOwnerOrganization } from '@/lib/db/organizations';
import { withPlanFloor } from '@/lib/plans';
import { newRestaurantBilling } from '@/lib/billing-signup';
import { getPricingSettings } from '@/lib/db/billing';
import { findTemplate } from '@/lib/theme/templates';
import type { OrderType } from '@/lib/theme/defaults';
import { registrarEvento } from '@/lib/analytics-server';
import { EVENTOS } from '@/lib/analytics';
import { leerIntencion, leerPlatosDelAlta } from '@/lib/alta';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Usuario autenticado, o null. */
async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/* ── Entrar a un restaurante ─────────────────────────────────── */

/**
 * `url` = entra aquí, y hazlo con una navegación de DOCUMENTO desde el
 * cliente. No es un `redirect()` del servidor a propósito: ver la nota larga
 * al final de `enterRestaurant`.
 */
export type EntryState = { error: string } | { url: string } | null;

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

  // La portada del panel es Hoy: entrar desde Mi cuenta abre el mismo sitio
  // que abre el login, no el catálogo.
  //
  // Y se DEVUELVE la URL en vez de hacer `redirect()`. Esto no es un capricho
  // de estilo: era el bug.
  //
  // El panel de un restaurante vive en `<slug>-admin.<dominio>` y su portada
  // es la raíz de ese host, `/`. Pero `/` solo significa "el panel" gracias
  // al rewrite del proxy (proxy.ts §3, `/` → `/admin/`). Sin ese rewrite, `/`
  // es src/app/page.tsx sin tenant, o sea la PORTADA COMERCIAL de Leogin.
  //
  // Mi cuenta se sirve TAMBIÉN dentro del subdominio del panel (el proxy la
  // excluye del rewrite a propósito, para que "Cambiar de restaurante"
  // funcione desde dentro; y en Leogin Desktop la ventana vive siempre ahí).
  // En ese caso el destino de este redirect tiene EL MISMO host que la página
  // actual, y ahí Next deja de tratarlo como una salida a otro sitio: lo
  // resuelve por dentro de la app (getAppRelativeRedirectUrl → fetch interno
  // con `next: { internal: 1 }`), que NO pasa por el proxy. Resultado medido:
  //
  //   POST 303 /mi-cuenta  ·  x-action-redirect: https://<slug>-admin…;push
  //   → la pantalla que llega es «Leogin — Menús digitales para restaurantes»
  //     dentro del marco del panel, con /planes y /registro dando 404.
  //
  // El dueño pulsaba su restaurante y aterrizaba en la web de ventas de
  // Leogin. Una navegación de documento desde el cliente siempre pasa por el
  // proxy, así que siempre llega al panel.
  return { url: adminUrl(rest.slug as string) };
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
  // ACC-09: delicado → «confirma que eres tú» si hace más de 10 min.
  if (!(await identidadReciente())) return reauthRequerida();

  const pin = ((formData.get('pin') as string) ?? '').trim();
  const remove = formData.get('remove') === 'true';

  if (remove) {
    await setEntryPin(restaurantId, null);
    revalidatePath('/admin/ajustes/restaurante');
    revalidatePath('/admin/personal'); // donde vive la tarjeta del PIN
    return { ok: true };
  }

  if (!isValidPin(pin)) return { error: `El PIN debe tener ${PIN_LENGTH} dígitos.` };
  await setEntryPin(restaurantId, pin);
  revalidatePath('/admin/ajustes/restaurante');
  revalidatePath('/admin/personal');
  return { ok: true };
}

/* ── Crear otro restaurante ──────────────────────────────────── */

export type NewRestaurantState = { error: string } | { url: string } | null;

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
  const esElPrimero = !memberships.some((m) => canBill(m.role));

  const name = ((formData.get('name') as string) ?? '').trim();
  const rawSlug = ((formData.get('slug') as string) ?? '').trim().toLowerCase();
  const planCode = formData.get('plan_code');
  if (planCode !== 'BASICO' && planCode !== 'EN_LINEA' && planCode !== 'ESTANDAR' && planCode !== 'PREMIUM') {
    return { error: 'Elige un plan válido para tu restaurante.' };
  }
  const template = findTemplate(((formData.get('template_id') as string) ?? '').trim());
  const whatsapp = ((formData.get('whatsapp') as string) ?? '').trim() || null;

  // Estándar puede activar las tres modalidades. Conserva las elecciones del alta.
  const VALID_ORDER_TYPES: OrderType[] = ['dine_in', 'pickup', 'delivery'];
  const rawTypes = ((formData.get('estandar_order_types') as string | null) ?? '').split(',').map((t) => t.trim());
  const requestedEstandarTypes = [...new Set(rawTypes)].filter((t): t is OrderType => VALID_ORDER_TYPES.includes(t as OrderType));
  const estandarOrderTypes: OrderType[] =
    requestedEstandarTypes.length ? requestedEstandarTypes : ['pickup', 'dine_in'];

  /* Los primeros platillos (ficha 2.3): nombre y precio, escritos en el
     alta. Se descartan las filas vacías; una fila a medias se rechaza para
     no crear un platillo con precio 0 que el dueño no quiso. */
  const platos = leerPlatosDelAlta(formData.get('platos'));
  if ('error' in platos) return platos;

  if (!name || name.length < 2) return { error: 'Escribe el nombre de tu restaurante.' };
  if (name.length > 80) return { error: 'El nombre es demasiado largo.' };
  if (whatsapp && !/^\+?[\d\s\-()]{7,20}$/.test(whatsapp)) {
    return { error: 'El número de WhatsApp no es válido.' };
  }

  const db = createServiceClient();

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

  // Va DESPUÉS de validar la dirección: antes se armaba el grupo y luego se
  // rechazaba el alta por una dirección ocupada, y el dueño quedaba con un
  // grupo que no había pedido y sin el local nuevo.
  //
  // Si quien crea ya tiene otro restaurante propio, el local nuevo nace
  // DENTRO de su grupo: es lo que le da al conjunto una marca y un link
  // único de pedidos sin pedírselo a nadie. El PANEL consolidado no depende
  // de esto (lo dan las membresías, ver getMyGroupScope); la organización es
  // solo la marca del grupo.
  const { data: creator } = await db
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();
  let organizationId = (creator?.organization_id as string | null) ?? null;

  if (!organizationId && !esElPrimero) {
    // Si falla, el restaurante se crea igual, suelto: la organización se
    // puede armar después desde Mi cuenta (es idempotente), y no vale la
    // pena tirar un alta que el cliente ya pagó por un extra de marca.
    organizationId = await ensureOwnerOrganization({
      userId: user.id,
      email: user.email,
      restaurantIds: memberships.filter((m) => m.role === 'OWNER').map((m) => m.restaurantId),
    });
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
      : planCode === 'EN_LINEA' ? ['pickup', 'delivery']
      : planCode === 'ESTANDAR' ? estandarOrderTypes
        : ['dine_in', 'delivery', 'pickup'];
  const { error: temaErr } = await db.from('restaurant_themes').insert({
    restaurant_id: restaurantId,
    brand_name: name,
    config: { ...(template ? structuredClone(template.config) : {}), orderTypes },
  });

  // ── Cobro ──────────────────────────────────────────────────
  // El local nace en prueba si el plan elegido es de pago y la oferta está activa.
  const pricing = await getPricingSettings();
  const { error: cobroErr } = await db.from('restaurant_billing').insert({
    restaurant_id: restaurantId,
    ...newRestaurantBilling({
      planCode,
      trialDays: pricing.trialDays,
      ownerId: user.id,
    }),
  });
  const altaErr = temaErr ?? cobroErr ?? (await db.rpc('leogin_apply_auto_price', {
    p_restaurant_id: restaurantId,
  })).error;
  if (altaErr) {
    // Sin tema o mensualidad, el restaurante todavía no está listo para abrir.
    const { error: limpiezaErr } = await db.from('restaurants').delete().eq('id', restaurantId);
    console.error('[alta] no se pudo configurar el restaurante', restaurantId, altaErr.message, limpiezaErr?.message);
    return { error: 'No se pudo terminar de crear el restaurante. Inténtalo de nuevo.' };
  }

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

  /* ── Primeros platillos (ficha 2.3) ─────────────────────────
     Van a la categoría «Platillos», la misma que crea el panel cuando el
     primer platillo llega sin categoría. Si falla, el restaurante ya
     existe y la guía de Hoy pide el paso 1: no se deshace el alta. */
  if (platos.lista.length > 0) {
    const { data: cat } = await db.from('categories')
      .insert({ restaurant_id: restaurantId, name: 'Platillos', sort_order: 0 })
      .select('id').single();
    const { error: pErr } = await db.from('products').insert(platos.lista.map((p, i) => ({
      restaurant_id: restaurantId,
      category_id: (cat?.id as string | undefined) ?? null,
      name: p.nombre,
      price: p.precio,
      is_available: true,
      is_active: true,
      sort_order: i,
    })));
    if (pErr) console.error('[alta] no se pudieron crear los primeros platillos', restaurantId, pErr.message);
    else await registrarEvento(EVENTOS.primerPlatillo, '/mi-cuenta/nuevo');
  }

  /* Todos entran directo a Hoy (ficha 2.3): la carta ya se vio en el último
     paso del alta, así que la pantalla «listo» sobraba. El panel es la raíz
     de otro host, por eso navega el cliente; mismo motivo que
     `enterRestaurant`. */
  // El plan con que lo creó y el caso que traía de la web (LZ-11).
  if (esElPrimero) {
    await registrarEvento(EVENTOS.restauranteCreado, '/mi-cuenta/nuevo', {
      plan: planCode,
      caso: leerIntencion(user.user_metadata?.alta_plan, user.user_metadata?.alta_caso)?.caso ?? 'sin elegir',
    });
  }
  return { url: `${adminUrl(slug)}?welcome=1` };
}

/* ── El link único de pedidos del grupo ──────────────────────── */

/**
 * Arma la organización de esta persona para encender el link único de
 * pedidos del grupo (`grupo.dominio`, que reparte al cliente a la sucursal
 * más cercana) y la marca de los reportes consolidados.
 *
 * Normalmente ya existe: nace sola al crear el segundo restaurante. Esto es
 * para quien tenía sus restaurantes de antes de ese cambio, o para quien se
 * quedó sin ella porque el insert falló aquel día. Antes eso era un ticket a
 * Leogin; ahora es un botón.
 */
export async function createGroupLink(): Promise<{ error: string } | { ok: true }> {
  const user = await currentUser();
  if (!user) return { error: 'No autorizado.' };

  const memberships = await getMyMemberships();
  const ownedIds = memberships.filter((m) => m.role === 'OWNER').map((m) => m.restaurantId);
  // Un solo restaurante no es un grupo: el link del grupo llevaría a un
  // selector de una sola sucursal, que es peor que el link del restaurante.
  if (ownedIds.length < 2) return { error: 'Necesitas dos o más restaurantes propios.' };

  if (!(await rateLimit(`group-link:${user.id}`, 5, 60 * 60_000))) {
    return { error: 'Demasiados intentos. Espera un rato.' };
  }

  const orgId = await ensureOwnerOrganization({
    userId: user.id,
    email: user.email,
    restaurantIds: ownedIds,
  });
  if (!orgId) return { error: 'No se pudo crear el grupo. Inténtalo de nuevo.' };

  revalidatePath('/mi-cuenta', 'layout');
  return { ok: true };
}
