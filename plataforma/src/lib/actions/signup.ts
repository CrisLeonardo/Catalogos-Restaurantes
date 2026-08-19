'use server';

/* ============================================================
   REGISTRO SELF-SERVE (migración 047)
   ------------------------------------------------------------
   Un restaurante se da de alta solo desde la web y queda EN VIVO
   con una prueba gratis. Crea, en una sola operación:
     · usuario de Auth (dueño, ya confirmado)
     · restaurante (status active, plan Estándar, onboarding pendiente)
     · tema (marca)
     · cobro pausado con trial_ends_at = hoy + trial_days
     · perfil RESTAURANT_OWNER enlazado

   DOS FORMAS DE CREAR LA CUENTA (el resto del alta es idéntico):
     · correo + contraseña → se crea el usuario de Auth aquí mismo.
     · cuenta de Google    → el usuario de Auth YA existe: el wizard mandó a
       Google antes de enviar el formulario y volvió con la sesión abierta
       (ver /admin/auth/google/callback). Aquí solo se le cuelga el
       restaurante y el perfil. La identidad se relee de la sesión, nunca
       del formulario.

   Seguridad: rate-limit por IP + validación estricta de entrada.
   Todo el alta usa service role; no requiere sesión previa.
   ============================================================ */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getPricingSettings } from '@/lib/db/billing';
import { newRestaurantBilling } from '@/lib/billing-signup';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { sendEmailVerification } from '@/lib/auth/email-verification';
import { slugify, validateSlug, crossSlugCollision, slugTaken, uniqueSlug } from '@/lib/slug';
import { findTemplate } from '@/lib/theme/templates';
import { ESTANDAR_MAX_ORDER_TYPES, withPlanFloor, type PlanCode } from '@/lib/plans';
import type { OrderType } from '@/lib/theme/defaults';

export type SignupState = { error: string } | null;

/**
 * Módulos con los que nace un restaurante, DERIVADOS del plan.
 *
 * Antes había una lista escrita a mano por plan y se había desincronizado de
 * plans.ts: SIGNUP_MODULES_PREMIUM ponía reservaciones, lista_espera y loyalty
 * en false, mientras /planes vendía Premium con "7 módulos incluidos gratis"
 * y INCLUDED_MODULES.PREMIUM los daba por incluidos. Resultado: quien se daba
 * de alta solo en Premium pagaba Q349 y esos tres módulos no le aparecían por
 * ningún lado — ni activos ni bloqueados. Ahora sale todo de withPlanFloor(),
 * así que la única forma de cambiar lo que incluye un plan es cambiar plans.ts.
 *
 * multi_branch queda fuera a propósito: no lo da ningún plan, se habilita al
 * armar un grupo.
 */
function signupModulesFor(plan: PlanCode): Record<string, boolean> {
  return withPlanFloor(plan, { multi_branch: false });
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signupRestaurant(
  prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  // ── Rate limit por IP (anti-abuso) ──────────────────────────
  const ip = clientIp(await headers());
  if (!(await rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  // ── ¿Con qué se está creando la cuenta? ─────────────────────
  // El campo del formulario es solo una pista: lo que manda es si hay una
  // sesión de Google viva y sin restaurante. Si alguien pone
  // `auth_provider=google` a mano sin sesión, cae al alta normal y se le
  // pedirá contraseña como a todo el mundo.
  const supabase = await createClient();
  const wantsGoogle = (formData.get('auth_provider') as string | null) === 'google';
  const googleUser = wantsGoogle ? (await supabase.auth.getUser()).data.user : null;
  const withGoogle = !!googleUser?.email;

  // Venía por Google pero la sesión ya no está (tardó, cerró sesión en otra
  // pestaña). Sin esto el formulario llegaba con el correo en blanco —porque
  // el wizard no lo pide cuando hay Google— y el error que veía era "escribe
  // un correo válido", que no dice nada de lo que de verdad pasó.
  if (wantsGoogle && !withGoogle) {
    return { error: 'Tu sesión de Google se cerró. Vuelve a pulsar "Registrarme con Google".' };
  }

  // ── Entrada ─────────────────────────────────────────────────
  const name = (formData.get('name') as string)?.trim();
  const email = withGoogle
    ? googleUser!.email!.trim().toLowerCase()
    : (formData.get('email') as string)?.trim().toLowerCase();
  const password = (formData.get('password') as string) ?? '';
  const password2 = (formData.get('password2') as string) ?? '';
  const fullName = (formData.get('full_name') as string)?.trim() || null;
  const whatsapp = (formData.get('whatsapp') as string)?.trim() || null;
  const rawSlug = (formData.get('slug') as string)?.trim().toLowerCase() || '';
  const terms = formData.get('terms');
  const rawPlan = formData.get('plan_code') as string | null;
  const planCode: 'BASICO' | 'ESTANDAR' | 'PREMIUM' =
    rawPlan === 'BASICO' ? 'BASICO' : rawPlan === 'ESTANDAR' ? 'ESTANDAR' : 'PREMIUM';
  // Modos de pedido elegidos en el registro para Estándar (2 de 3: comer en
  // local, para llevar, a domicilio). Un valor inválido o con conteo distinto
  // de ESTANDAR_MAX_ORDER_TYPES cae al default (para llevar + comer en local).
  const VALID_ORDER_TYPES: OrderType[] = ['dine_in', 'pickup', 'delivery'];
  const rawTypes = ((formData.get('estandar_order_types') as string | null) ?? '').split(',').map((s) => s.trim());
  const requestedEstandarTypes = [...new Set(rawTypes)].filter((t): t is OrderType => VALID_ORDER_TYPES.includes(t as OrderType));
  const estandarOrderTypes: OrderType[] =
    requestedEstandarTypes.length === ESTANDAR_MAX_ORDER_TYPES ? requestedEstandarTypes : ['pickup', 'dine_in'];
  // Plantilla visual elegida en el wizard; un id desconocido cae al look por defecto.
  const template = findTemplate(((formData.get('template_id') as string) ?? '').trim());

  if (!name || name.length < 2) return { error: 'Escribe el nombre de tu restaurante.' };
  if (name.length > 80) return { error: 'El nombre es demasiado largo.' };
  if (!email || !validEmail(email)) return { error: 'Escribe un correo válido.' };
  if (!withGoogle) {
    if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
    // La doble captura de la contraseña se valida TAMBIÉN aquí, no solo en el
    // wizard: el formulario manda campos ocultos y cualquiera puede saltarse el
    // paso del navegador. El correo ya no se pide dos veces —era un campo más en
    // la pantalla donde más gente abandona—: el dedazo se ataja mostrándolo
    // grande en el paso "Confirmar", antes de crear nada.
    if (password !== password2) return { error: 'Las dos contraseñas no coinciden.' };
  }
  if (whatsapp && !/^\+?[\d\s\-()]{7,20}$/.test(whatsapp)) {
    return { error: 'El número de WhatsApp no es válido.' };
  }
  if (terms !== 'on' && terms !== 'true') {
    return { error: 'Debes aceptar los términos para continuar.' };
  }

  const db = createServiceClient();

  // Una cuenta de Google que ya administra un restaurante no puede crear otro
  // con ella misma: hoy `profiles` es uno a uno con el usuario de Auth. Se
  // detiene ANTES de ocupar el slug o cobrar nada. (El modelo de varios
  // restaurantes bajo una sola cuenta está planteado en
  // PLAN_ACCESO_MULTICUENTA.md — es lo que quita esta limitación.)
  if (withGoogle) {
    const { data: already } = await db
      .from('profiles')
      .select('id')
      .eq('id', googleUser!.id)
      .maybeSingle();
    if (already) {
      return { error: 'Esta cuenta de Google ya administra un restaurante. Entra a tu panel o usa otra cuenta.' };
    }
  }

  // ── Slug: el del usuario (validado) o derivado del nombre ───
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
      return { error: 'No pudimos generar una dirección con ese nombre. Escribe una dirección manualmente.' };
    }
    slug = await uniqueSlug(db, base);
  }

  // ── 1. Usuario de Auth (dueño, confirmado) ──────────────────
  // Con Google ya existe (lo creó el propio inicio de sesión); solo se reusa.
  let userId: string;
  if (withGoogle) {
    userId = googleUser!.id;
  } else {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created?.user) {
      const m = createErr?.message?.toLowerCase() ?? '';
      if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
        return { error: 'Ya existe una cuenta con ese correo. Inicia sesión en su lugar.' };
      }
      return { error: createErr?.message ?? 'No se pudo crear la cuenta.' };
    }
    userId = created.user.id;
  }

  // ── 2. Restaurante (en vivo, plan elegido, onboarding pendiente) ──
  const { data: restaurant, error: rErr } = await db
    .from('restaurants')
    .insert({
      name,
      slug,
      plan_actual: planCode,
      modules: signupModulesFor(planCode),
      status: 'active',
      onboarding_done: false,
      whatsapp_number: whatsapp,
      orders_whatsapp: whatsapp,
      contact_email: email,
    })
    .select('id')
    .single();

  if (rErr || !restaurant) {
    // Rollback: solo se borra el usuario si lo creamos NOSOTROS. El de Google
    // es la identidad de la persona (puede tener sesión abierta en el menú de
    // otro restaurante): borrarlo por un slug repetido sería desproporcionado.
    if (!withGoogle) await db.auth.admin.deleteUser(userId);
    if (rErr?.message?.includes('unique') || rErr?.message?.includes('duplicate')) {
      return { error: 'Esa dirección acaba de ocuparse. Elige otra.' };
    }
    return { error: rErr?.message ?? 'No se pudo crear el restaurante.' };
  }
  const restaurantId = restaurant.id as string;

  // ── 3. Tema (marca) ─────────────────────────────────────────
  // Canales según plan:
  //   BASICO   → ['pickup'] (sin pedidos en línea, valor por defecto).
  //   ESTANDAR → los 2 modos elegidos en el registro (editable después desde el panel).
  //   PREMIUM+ → los tres canales.
  const orderTypes: OrderType[] =
    planCode === 'BASICO'
      ? ['pickup']
      : planCode === 'ESTANDAR'
        ? estandarOrderTypes
        : ['dine_in', 'delivery', 'pickup'];
  // La plantilla solo trae claves visuales (nunca operación): orderTypes
  // va después para que el canal del plan siempre gane.
  await db.from('restaurant_themes').insert({
    restaurant_id: restaurantId,
    brand_name: name,
    config: { ...(template ? structuredClone(template.config) : {}), orderTypes },
  });

  // ── 4. Cobro ──────────────────────────────────────────────
  // BASICO es gratis para siempre (Q0, sin trial que "vencer"): se activa
  // el cobro automático desde ya — como la tarifa calculada es 0, nunca
  // genera factura (ver leogin_generate_monthly_invoices), y así el panel
  // no muestra un banner de "tu prueba termina en X días" que no aplica.
  // ESTANDAR/PREMIUM sí quedan en prueba gratis, sin cobrar hasta graduar.
  const pricing = await getPricingSettings();
  const trialDays = Math.max(0, Math.round(pricing.trialDays || 30));
  // Esta es el alta de la calle: el primer restaurante de la persona, y el
  // único que lleva prueba gratis. Ver lib/billing-signup.ts.
  await db.from('restaurant_billing').insert({
    restaurant_id: restaurantId,
    ...newRestaurantBilling({ planCode, trialDays, isFirstOfOwner: true }),
  });
  // Calcula y guarda la mensualidad del plan (se muestra al dueño, se cobra al graduar).
  await db.rpc('leogin_apply_auto_price', { p_restaurant_id: restaurantId });

  // ── 5. Perfil del dueño ─────────────────────────────────────
  const profileRow = {
    id: userId,
    restaurant_id: restaurantId,
    role: 'RESTAURANT_OWNER',
    full_name: fullName,
    // Con Google el correo ya viene verificado por Google: marcarlo evita
    // pedirle al dueño que confirme un correo que nunca escribió (migración
    // 109 — el aviso de "confirma tu correo" del panel).
    ...(withGoogle ? { email_verified_at: new Date().toISOString() } : {}),
  };
  // Con Google se INSERTA, no se hace upsert: el id ya existía antes de esta
  // petición, así que dos envíos a la vez (doble clic en "Crear mi
  // restaurante") podrían pasar los dos la comprobación de arriba y el
  // segundo le PISARÍA el restaurante al primero, dejándolo huérfano. Con
  // insert, el segundo choca contra la clave primaria y hace rollback de lo
  // suyo. En el camino de contraseña el usuario acaba de nacer aquí mismo y
  // no puede colisionar; se deja el upsert que ya tenía.
  const { error: profErr } = withGoogle
    ? await db.from('profiles').insert(profileRow)
    : await db.from('profiles').upsert(profileRow);
  if (profErr) {
    // Rollback completo: borra restaurante (cascada) y, si lo creamos
    // nosotros, también el usuario.
    await db.from('restaurants').delete().eq('id', restaurantId);
    if (!withGoogle) await db.auth.admin.deleteUser(userId);
    return { error: 'No se pudo terminar el registro. Inténtalo de nuevo.' };
  }

  // ── 5c. Membresía de dueño (migración 113) ─────────────────
  // Es lo que hace que este restaurante aparezca en Mi cuenta y lo que
  // permitirá que esta misma persona abra otro mañana. El perfil de arriba
  // sigue siendo la vía de siempre; esta es la que escala.
  await db.from('restaurant_members').insert({
    user_id: userId,
    restaurant_id: restaurantId,
    role: 'OWNER',
    status: 'active',
  });

  // ── 5b. Confirmación del correo (suave, no bloquea) ─────────
  // La cuenta ya está viva; esto solo comprueba que el buzón existe y es
  // suyo. Hasta que abra el enlace, el panel se lo recuerda con un aviso.
  // Ver lib/auth/email-verification.ts para por qué no es un muro.
  if (!withGoogle) await sendEmailVerification(email);

  // ── 6. Iniciar sesión (best-effort; cookie compartida en prod) ──
  // Con Google la sesión ya está abierta desde el callback: no hay nada que
  // hacer aquí (y no hay contraseña con la que entrar).
  if (!withGoogle) {
    try {
      await supabase.auth.signInWithPassword({ email, password });
    } catch {
      // En local los subdominios no comparten cookie; el dueño inicia sesión
      // en su panel. La página de éxito lo guía igual.
    }
  }

  redirect(`/registro/listo?slug=${encodeURIComponent(slug)}&plan=${planCode}`);
}
