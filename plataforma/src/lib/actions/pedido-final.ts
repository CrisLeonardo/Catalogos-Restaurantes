'use server';

/* ============================================================
   EL FINAL DEL PEDIDO (PLAN_MOMENTOS_PICO M2 y M4)
   ------------------------------------------------------------
   La pantalla de «pedido enviado» es el pico del comensal y lo
   último que recuerda (estrategia §2.7). Aquí se le dice:

   - cuántos puntos suma con este pedido (y si van dobles por ser
     su primer pedido desde el celular, migración 147) y cuánto le
     falta para su próxima recompensa (gradiente de la meta, §2.9);
   - si no entró con su cuenta, cuántos puntos se le van (§2.1);
   - si le tocó la sorpresa de la casa (recompensa variable, §2.10).

   Se pide con el token público del pedido —el mismo del enlace de
   seguimiento—, así que solo lo ve quien hizo el pedido. El saldo
   y la recompensa salen solo si la sesión es la del dueño de la
   cuenta enlazada al pedido.
   ============================================================ */

import { randomInt } from 'node:crypto';
import { createDinerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  getPublicRewards, leerAjustesExtraLealtad, loyaltyActive, puntosDelPedido, resolveDinerAuthUserId,
} from '@/lib/db/loyalty';

const UUID_RE = /^[0-9a-f-]{36}$/i;
/** Un pedido viejo ya no entra al sorteo (alguien que reabre el enlace días después). */
const SORTEO_MAX_MS = 2 * 60 * 60 * 1000;

export interface FinalDelPedido {
  lealtad: null | {
    /** Lo que suma este pedido al entregarse, ya con el doble si aplica. */
    puntos: number;
    doble: boolean;
    /** ¿El pedido quedó enlazado a una cuenta? Si no, son puntos que se pierden. */
    conCuenta: boolean;
    /** Saldo de hoy (sin estos puntos), solo para el dueño de la cuenta. */
    saldo: number | null;
    /** La recompensa que ya alcanza con este pedido. */
    alcanza: string | null;
    /** La siguiente recompensa y cuánto le falta después de este pedido. */
    siguiente: { titulo: string; costo: number; faltan: number } | null;
  };
  /** La sorpresa de la casa, si le tocó. */
  sorpresa: string | null;
}

const NADA: FinalDelPedido = { lealtad: null, sorpresa: null };

export async function getFinalDelPedido(restaurantId: string, trackToken: string): Promise<FinalDelPedido> {
  if (!UUID_RE.test(restaurantId) || !UUID_RE.test(trackToken)) return NADA;
  try {
    const db = createServiceClient();
    const { data: order } = await db
      .from('orders')
      .select('id, customer_id, created_at, status')
      .eq('restaurant_id', restaurantId)
      .eq('public_token', trackToken)
      .maybeSingle();
    if (!order || order.status === 'CANCEL') return NADA;
    if (!(await loyaltyActive(restaurantId))) return NADA;

    const [lealtad, sorpresa] = await Promise.all([
      calcularLealtad(restaurantId, order.id as string),
      sortearSorpresa(restaurantId, order.id as string, order.created_at as string),
    ]);
    return { lealtad, sorpresa };
  } catch {
    return NADA;
  }
}

async function calcularLealtad(restaurantId: string, orderId: string): Promise<FinalDelPedido['lealtad']> {
  const { puntos, doble, customerId } = await puntosDelPedido(restaurantId, orderId);
  if (puntos <= 0) return null;
  const db = createServiceClient();

  let conCuenta = false;
  let esSuya = false;
  if (customerId) {
    const { data: cliente } = await db.from('customers').select('auth_user_id').eq('id', customerId).maybeSingle();
    const dueno = (cliente?.auth_user_id as string | null) ?? null;
    conCuenta = !!dueno;
    if (dueno) {
      const supabase = await createDinerClient();
      const { data: { user } } = await supabase.auth.getUser();
      esSuya = (await resolveDinerAuthUserId(user?.id ?? null)) === dueno;
    }
  }
  if (!esSuya) return { puntos, doble, conCuenta, saldo: null, alcanza: null, siguiente: null };

  const [{ data: cuenta }, { data: ajustes }, premios] = await Promise.all([
    db.from('loyalty_accounts').select('points_balance').eq('restaurant_id', restaurantId).eq('customer_id', customerId).maybeSingle(),
    db.from('loyalty_settings').select('rewards_enabled').eq('restaurant_id', restaurantId).maybeSingle(),
    getPublicRewards(restaurantId),
  ]);
  const saldo = Number(cuenta?.points_balance) || 0;
  const despues = saldo + puntos;
  const catalogo = ajustes?.rewards_enabled === false ? [] : premios.filter((p) => p.points_cost > 0);
  const alcanza = [...catalogo].reverse().find((p) => p.points_cost > saldo && p.points_cost <= despues) ?? null;
  const siguiente = catalogo.find((p) => p.points_cost > despues) ?? null;
  return {
    puntos, doble, conCuenta, saldo,
    alcanza: alcanza?.title ?? null,
    siguiente: siguiente ? { titulo: siguiente.title, costo: siguiente.points_cost, faltan: siguiente.points_cost - despues } : null,
  };
}

/**
 * La sorpresa de la casa (147). Se sortea UNA vez por pedido y queda
 * escrita en `orders.sorpresa` ('' = no tocó): recargar la pantalla no
 * vuelve a tirar los dados, y el personal la ve en la tarjeta del pedido.
 */
async function sortearSorpresa(restaurantId: string, orderId: string, creado: string): Promise<string | null> {
  const extra = await leerAjustesExtraLealtad(restaurantId);
  const db = createServiceClient();
  const { data, error } = await db.from('orders').select('sorpresa').eq('id', orderId).maybeSingle();
  if (error || !data) return null; // sin la 147
  const ya = (data as { sorpresa: string | null }).sorpresa;
  if (ya !== null) return ya || null;
  if (!extra.sorpresaTexto || !extra.sorpresaCada) return null;
  if (Date.now() - new Date(creado).getTime() > SORTEO_MAX_MS) return null;

  const toca = randomInt(extra.sorpresaCada) === 0;
  const valor = toca ? extra.sorpresaTexto : '';
  const { data: escrito } = await db
    .from('orders')
    .update({ sorpresa: valor })
    .eq('id', orderId)
    .is('sorpresa', null)
    .select('sorpresa');
  if (escrito && escrito.length > 0) return toca ? valor : null;
  // Otra pestaña sorteó primero: vale lo que quedó escrito.
  const { data: otra } = await db.from('orders').select('sorpresa').eq('id', orderId).maybeSingle();
  return ((otra as { sorpresa: string | null } | null)?.sorpresa) || null;
}
