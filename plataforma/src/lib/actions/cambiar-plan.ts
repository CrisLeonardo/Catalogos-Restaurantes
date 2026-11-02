'use server';

/* ============================================================
   CAMBIAR DE PLAN — desde «Mi suscripción» (plan 2026-10-28, fase 3)
   ------------------------------------------------------------
   Antes, «Actualizar a…» abría un WhatsApp y Leogin cambiaba el plan a
   mano. Ahora el dueño lo cambia solo:

     · el plan y sus módulos (subir trae lo incluido; bajar apaga lo
       que el plan nuevo no da — ver modulosAlCambiarDePlan);
     · los modos de pedido del tema (En línea sin comer en local,
       Estándar con 2 como máximo);
     · la mensualidad, si está en automático (leogin_apply_auto_price).

   Sin prorrateo: el precio nuevo cuenta desde el próximo corte, que es
   lo que se le dice al confirmar. Se avisa a Leogin por correo.
   ============================================================ */

import { revalidatePath, updateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { duenoDelRestaurante } from '@/lib/auth/acceso-cobro';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import { emailEnabled, sendEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';
import {
  PLANS, PUBLIC_PLANS, modosAlCambiarDePlan, modulosAlCambiarDePlan, type PlanCode,
} from '@/lib/plans';
import type { OrderType } from '@/lib/theme/defaults';

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type CambioDePlanResult = { error: string } | { ok: true; plan: PlanCode };

export async function cambiarMiPlan(restaurantId: string, nuevo: string): Promise<CambioDePlanResult> {
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };
  if (!(PUBLIC_PLANS as string[]).includes(nuevo)) return { error: 'Ese plan no está disponible.' };
  const plan = nuevo as PlanCode;

  const userId = await duenoDelRestaurante(restaurantId);
  if (!userId) return { error: 'Solo el dueño del restaurante puede cambiar el plan.' };

  // Service role a propósito: el candado de la 139 no deja que una sesión
  // cambie su propio plan. La autorización es la de arriba.
  const db = createServiceClient();
  const [{ data: rest }, { data: tema }] = await Promise.all([
    db.from('restaurants').select('name, plan_actual, modules').eq('id', restaurantId).single(),
    db.from('restaurant_themes').select('config').eq('restaurant_id', restaurantId).maybeSingle(),
  ]);
  if (!rest) return { error: 'Restaurante no encontrado.' };
  const antes = ((rest.plan_actual as PlanCode | null) ?? 'BASICO');
  if (antes === plan) return { error: `Ya estás en el plan ${PLANS[plan].name}.` };

  const modules = modulosAlCambiarDePlan(antes, plan, (rest.modules as Record<string, boolean> | null) ?? {});
  const { error } = await db.from('restaurants').update({ plan_actual: plan, modules }).eq('id', restaurantId);
  if (error) return { error: error.message };

  const config = (tema?.config as Record<string, unknown> | null) ?? {};
  const modosAntes = (config.orderTypes as OrderType[] | undefined) ?? ['dine_in', 'delivery', 'pickup'];
  const modos = modosAlCambiarDePlan(plan, modosAntes);
  if (modos.join() !== modosAntes.join()) {
    await db.from('restaurant_themes').upsert(
      { restaurant_id: restaurantId, config: { ...config, orderTypes: modos } },
      { onConflict: 'restaurant_id' },
    );
  }

  await db.rpc('leogin_apply_auto_price', { p_restaurant_id: restaurantId });

  await logActivity({
    restaurantId, actorId: userId, action: 'plan_cambiado', entity: PLANS[plan].name,
    meta: { antes, despues: plan },
  });
  await avisarALeogin(rest.name as string, antes, plan);

  revalidatePath('/admin', 'layout');
  revalidatePath('/');
  updateTag(`restaurant:${restaurantId}`);
  return { ok: true, plan };
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
