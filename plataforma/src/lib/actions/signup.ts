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

   Seguridad: rate-limit por IP + validación estricta de entrada.
   Todo el alta usa service role; no requiere sesión previa.
   ============================================================ */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getPricingSettings } from '@/lib/db/billing';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { slugify, validateSlug, crossSlugCollision, slugTaken, uniqueSlug } from '@/lib/slug';
import { findTemplate } from '@/lib/theme/templates';
import { ESTANDAR_MAX_ORDER_TYPES } from '@/lib/plans';
import type { OrderType } from '@/lib/theme/defaults';

export type SignupState = { error: string } | null;

const SIGNUP_MODULES_PREMIUM = {
  catalog: true,
  orders: true,
  whatsapp_notify: true,
  analitica: true,
  inventario: true,
  promociones: true,
  personal: true,
  finanzas: true,
  multi_branch: false,
  // Módulos activables incluidos en Premium y superiores.
  // reservaciones, loyalty, proveedores y fel se activan manualmente
  // desde el super admin cuando el módulo esté listo para el restaurante.
  llamada_mesero: true,
  encuestas: true,
  cupones: true,
  recetas: true,
  reservaciones: false,
  lista_espera: false,
  loyalty: false,
  proveedores: false,
  fel: false,
};

const SIGNUP_MODULES_ESTANDAR = {
  catalog: true,
  orders: true,
  whatsapp_notify: true,
  analitica: false,
  inventario: false,
  promociones: false,
  personal: false,
  finanzas: false,
  multi_branch: false,
};

const SIGNUP_MODULES_BASICO = {
  catalog: true,
  orders: false,
  analitica: false,
  multi_branch: false,
};

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signupRestaurant(
  prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  // ── Rate limit por IP (anti-abuso) ──────────────────────────
  const ip = clientIp(await headers());
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000)) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  // ── Entrada ─────────────────────────────────────────────────
  const name = (formData.get('name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = (formData.get('password') as string) ?? '';
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
  if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  if (whatsapp && !/^\+?[\d\s\-()]{7,20}$/.test(whatsapp)) {
    return { error: 'El número de WhatsApp no es válido.' };
  }
  if (terms !== 'on' && terms !== 'true') {
    return { error: 'Debes aceptar los términos para continuar.' };
  }

  const db = createServiceClient();

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
  const userId = created.user.id;

  // ── 2. Restaurante (en vivo, plan elegido, onboarding pendiente) ──
  const { data: restaurant, error: rErr } = await db
    .from('restaurants')
    .insert({
      name,
      slug,
      plan_actual: planCode,
      modules: planCode === 'BASICO' ? SIGNUP_MODULES_BASICO : planCode === 'ESTANDAR' ? SIGNUP_MODULES_ESTANDAR : SIGNUP_MODULES_PREMIUM,
      status: 'active',
      onboarding_done: false,
      whatsapp_number: whatsapp,
      orders_whatsapp: whatsapp,
      contact_email: email,
    })
    .select('id')
    .single();

  if (rErr || !restaurant) {
    await db.auth.admin.deleteUser(userId); // rollback
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

  // ── 4. Cobro pausado con prueba gratis ──────────────────────
  const pricing = await getPricingSettings();
  const trialDays = Math.max(0, Math.round(pricing.trialDays || 30));
  const trialEnds = new Date(Date.now() + trialDays * 86_400_000).toISOString();
  await db.from('restaurant_billing').insert({
    restaurant_id: restaurantId,
    auto_price: true,
    active: false,            // sin cobro durante la prueba
    trial_ends_at: trialEnds,
    currency: 'GTQ',
  });
  // Calcula y guarda la mensualidad del plan (se muestra al dueño, se cobra al graduar).
  await db.rpc('leogin_apply_auto_price', { p_restaurant_id: restaurantId });

  // ── 5. Perfil del dueño ─────────────────────────────────────
  const { error: profErr } = await db.from('profiles').upsert({
    id: userId,
    restaurant_id: restaurantId,
    role: 'RESTAURANT_OWNER',
    full_name: fullName,
  });
  if (profErr) {
    // Rollback completo: borra restaurante (cascada) y usuario.
    await db.from('restaurants').delete().eq('id', restaurantId);
    await db.auth.admin.deleteUser(userId);
    return { error: 'No se pudo terminar el registro. Inténtalo de nuevo.' };
  }

  // ── 6. Iniciar sesión (best-effort; cookie compartida en prod) ──
  try {
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email, password });
  } catch {
    // En local los subdominios no comparten cookie; el dueño inicia sesión
    // en su panel. La página de éxito lo guía igual.
  }

  redirect(`/registro/listo?slug=${encodeURIComponent(slug)}&plan=${planCode}`);
}
