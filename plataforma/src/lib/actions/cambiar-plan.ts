'use server';

/* ============================================================
   CAMBIAR DE PLAN — desde «Mi suscripción» (plan 2026-10-28, fase 3)
   ------------------------------------------------------------
   Antes, «Actualizar a…» abría un WhatsApp y Leogin cambiaba el plan a
   mano. Ahora el dueño lo cambia solo:

     · el plan y sus módulos (subir trae lo incluido; bajar apaga lo
       que el plan nuevo no da — ver modulosAlCambiarDePlan);
     · los modos de pedido del tema según el nuevo plan;
     · la mensualidad, si está en automático (leogin_apply_auto_price).

   Sin prorrateo: el precio nuevo cuenta desde el próximo corte, que es
   lo que se le dice al confirmar. Se avisa a Leogin por correo.
   ============================================================ */

import { revalidatePath, updateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { duenoDelRestaurante } from '@/lib/auth/acceso-cobro';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import { emailEnabled, sendEmail } from '@/lib/email';
import {
  PLANS, PUBLIC_PLANS, modosAlCambiarDePlan, modulosAlCambiarDePlan, type PlanCode,
} from '@/lib/plans';
import type { OrderType } from '@/lib/theme/defaults';

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type CambioDePlanResult = { error: string } | { ok: true; plan: PlanCode };

export async function cambiarMiPlan(
  restaurantId: string,
  nuevo: string,
  confirmacion: { planActual: PlanCode; importe: number; moneda: string; iniciarPrueba?: boolean },
): Promise<CambioDePlanResult> {
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };
  if (!(PUBLIC_PLANS as string[]).includes(nuevo)) return { error: 'Ese plan no está disponible.' };
  const plan = nuevo as PlanCode;
  if (!confirmacion || !Number.isFinite(confirmacion.importe) || confirmacion.importe < 0 ||
      typeof confirmacion.moneda !== 'string') {
    return { error: 'Revisa la mensualidad y confirma el cambio.' };
  }

  const userId = await duenoDelRestaurante(restaurantId);
  if (!userId) return { error: 'Solo el dueño del restaurante puede cambiar el plan.' };

  // Service role a propósito: el candado de la 139 no deja que una sesión
  // cambie su propio plan. La autorización es la de arriba.
  const db = createServiceClient();
  const [{ data: rest }, { data: tema, error: errorTema }] = await Promise.all([
    db.from('restaurants').select('name, plan_actual, modules').eq('id', restaurantId).single(),
    db.from('restaurant_themes').select('config').eq('restaurant_id', restaurantId).maybeSingle(),
  ]);
  if (!rest) return { error: 'Restaurante no encontrado.' };
  const antes = ((rest.plan_actual as PlanCode | null) ?? 'BASICO');
  if (errorTema) return { error: 'No se pudo leer la configuración de pedidos. Inténtalo de nuevo.' };
  if (antes !== confirmacion.planActual && antes !== plan) {
    return { error: 'Tu plan cambió. Actualiza la página y vuelve a confirmar.' };
  }
  const modules = modulosAlCambiarDePlan(antes, plan, (rest.modules as Record<string, boolean> | null) ?? {});
  const config = (tema?.config as Record<string, unknown> | null) ?? {};
  const modosAntes = (config.orderTypes as OrderType[] | undefined) ?? ['dine_in', 'delivery', 'pickup'];
  const cambio = {
    p_restaurante: restaurantId,
    p_actor: userId,
    p_nuevo: plan,
    p_nombre: PLANS[plan].name,
    p_modulos_anteriores: rest.modules ?? null,
    p_modulos_nuevos: modules,
    p_modos_anteriores: config.orderTypes ?? null,
    p_modos_nuevos: modosAlCambiarDePlan(plan, modosAntes),
    p_importe: confirmacion.importe,
  };
  const { data: aplicado, error } = confirmacion.iniciarPrueba === true
    ? await db.rpc('leogin_iniciar_prueba_de_plan', cambio)
    : await db.rpc('leogin_confirmar_cambio_de_plan', {
        ...cambio, p_anterior: confirmacion.planActual, p_moneda: confirmacion.moneda,
      });
  if (error) return { error: error.code === 'LGP01' ? error.message : 'No se pudo cambiar el plan. Inténtalo de nuevo.' };
  if (aplicado) await avisarALeogin(rest.name as string, antes, plan);

  revalidatePath('/admin', 'layout');
  revalidatePath('/');
  updateTag(`restaurant:${restaurantId}`);
  return { ok: true, plan };
}

export async function confirmarPlanTrasPrueba(
  restaurantId: string,
  quote: { plan: PlanCode; amount: number; endsAt: string },
  acepta: boolean,
): Promise<{ error?: string }> {
  if (!UUID_RE.test(restaurantId) || !quote || typeof acepta !== 'boolean' ||
      quote.plan === 'BASICO' || !PUBLIC_PLANS.includes(quote.plan) ||
      !Number.isFinite(quote.amount) || quote.amount < 0 ||
      !Number.isFinite(Date.parse(quote.endsAt))) {
    return { error: 'Revisa los datos de tu prueba y vuelve a intentarlo.' };
  }
  const userId = await duenoDelRestaurante(restaurantId);
  if (!userId) return { error: 'Solo el dueño puede confirmar la contratación.' };
  const { error } = await createServiceClient().rpc('leogin_confirmar_prueba_de_plan', {
    p_restaurante: restaurantId, p_actor: userId, p_plan: quote.plan,
    p_importe: quote.amount, p_vencimiento: quote.endsAt, p_acepta: acepta,
  });
  if (error) return { error: error.code === 'LGP01' ? error.message : 'No se pudo guardar tu decisión. Inténtalo de nuevo.' };
  revalidatePath('/admin', 'layout');
  return {};
}

async function avisarALeogin(nombre: string, antes: PlanCode, despues: PlanCode) {
  if (!emailEnabled()) return;
  try {
    const contacto = await getPlatformContactSettings();
    if (!contacto.support_email) return;
    await sendEmail({
      to: contacto.support_email,
      subject: `Cambio de plan · ${nombre}`,
      heading: 'Un restaurante cambió de plan',
      body: [`${nombre} pasó de ${PLANS[antes].name} a ${PLANS[despues].name} desde su panel.`],
    });
  } catch {
    /* el aviso es cortesía: el cambio ya quedó hecho */
  }
}
