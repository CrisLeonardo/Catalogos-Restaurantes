'use server';

/* ════════════════════════════════════════════════════════════
   LO QUE EL MÓDULO DE SERVICIO NECESITABA Y NO EXISTÍA
   ------------------------------------------------------------
   El rediseño de «Tomar pedidos y Mesas» (handoff «Servicio»,
   2026-09-17) pide tres cosas que la base no sabía escribir:

     1. SERVIR UN PLATO, no un pedido. El estado vivía en `orders`, así
        que «servido» era todo o nada: la limonada tenía que esperar al
        pepián de la misma comanda. Migración 133 → `order_items.served_at`.

     2. COBRAR UNA PARTE Y SEGUIR ABIERTA. El diseño dice «cobrar una
        parte quita esas líneas y deja la mesa abierta». Quitarlas de
        verdad sería ANULARLAS —motivo, PIN y una venta que desaparece—,
        así que aquí no se quita nada: se escribe el dinero que entró en
        `order_payments` (migración 129: «un cobro parcial es una fila y
        ya») y se marca la línea como saldada en el reparto compartido
        (migración 125). La cuenta sigue cuadrando y la línea se ve
        pagada, no borrada.

     3. EL NOMBRE DE LA MESA. «Cumpleaños de Sofi» tiene que verlo TODO
        el local, no el aparato que lo escribió: vive en
        `table_sessions.note`.

   Viven aquí y no en `actions/orders.ts` porque ese archivo ya pasa de
   las 2.700 líneas y porque estas tres son del módulo de servicio: se
   leen juntas o no se entienden.
   ════════════════════════════════════════════════════════════ */

import {
  identidadCobroValida, type ContextoCobroMesa, type PagoCobro, type RepartoCobro,
  type ResultadoCobro, type SolicitudCobro,
} from '@/lib/cobro-intento';
import { createServiceClient } from '@/lib/supabase/service';
import { assertTableAccess } from '@/lib/auth/table-access';
import { revalidarSalon } from '@/lib/salon-cache';
import { hayTurnosDeMesa, hayPagosDeMesa } from '@/lib/db/table-sessions';
import { faltaLaColumna, faltaLaTabla, faltaLaFuncion } from '@/lib/db/migracion-ausente';
import { isPaymentMethod } from '@/lib/payment-method';
import { updateOrderStatus } from '@/lib/actions/orders';
import { emitirFacturaAutomatica } from '@/lib/actions/fel';
import { revalidatePath, updateTag } from 'next/cache';
import { after } from 'next/server';

/** Tope de líneas que una llamada puede tocar. Una mesa no acumula más. */
const MAX_LINEAS = 120;

/** El aviso cuando la 133 todavía no ha corrido en esta base. */
const SIN_COLUMNA =
  'Falta la migración 133 para poder marcar los platos uno a uno. '
  + 'Mientras tanto, «Servido» marca la ronda entera.';

/* ────────────────────────────────────────────────────────────
   1 · SERVIR PLATO A PLATO
   ──────────────────────────────────────────────────────────── */

export interface ServirResult {
  error?: string;
  /** Las líneas que de verdad cambiaron, para poder deshacer. */
  ids?: string[];
  /** Pedidos que quedaron enteros servidos con esta llamada. */
  pedidosServidos?: string[];
  /** La 133 no ha corrido aquí: quien llame debe caer a servir el pedido. */
  needsMigration?: boolean;
}

/**
 * Marca como servidas unas líneas concretas.
 *
 * El salto del PEDIDO a `SERVED` se hace aquí y no con un disparador: ese
 * estado ya tiene dueño (`updateOrderStatus`, `serveTableReady`) y dos
 * sitios escribiendo el mismo dato es cómo se llega a que discrepen. Lo
 * que sí se respeta es la regla de siempre: un pedido pasa a servido
 * cuando no le queda ninguna línea viva sin servir.
 */
export async function servirLineas(
  restaurantId: string,
  itemIds: string[],
): Promise<ServirResult> {
  if (!restaurantId || !Array.isArray(itemIds) || itemIds.length === 0) {
    return { error: 'Datos inválidos.' };
  }
  if (itemIds.length > MAX_LINEAS) return { error: 'Demasiados platos de una vez.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();

  /* Que las líneas sean de ESTE restaurante. Sin esto, un id de línea
     ajeno sería servible desde aquí — misma comprobación que
     `setItemSeat`. */
  const { data: lineas, error: errLeer } = await db
    .from('order_items')
    .select('id, order_id, order:orders!inner(restaurant_id, status)')
    .in('id', itemIds);

  if (errLeer) return { error: errLeer.message };

  type Fila = { id: string; order_id: string; order?: { restaurant_id: string; status: string } | null };
  const propias = ((lineas ?? []) as unknown as Fila[])
    .filter((l) => l.order?.restaurant_id === restaurantId);
  if (propias.length === 0) return { error: 'Esos platos no son de esta mesa.' };

  const ahora = new Date().toISOString();
  const { data: servidas, error } = await db
    .from('order_items')
    .update({ served_at: ahora })
    .in('id', propias.map((l) => l.id))
    .is('served_at', null)
    .select('id, order_id');

  if (error) {
    // La 133 no ha llegado a esta base: quien llame cae a servir la ronda.
    if (faltaLaColumna(error)) return { error: SIN_COLUMNA, needsMigration: true };
    return { error: error.message };
  }

  const ids = (servidas ?? []).map((r) => r.id as string);
  const pedidosTocados = [...new Set((servidas ?? []).map((r) => r.order_id as string))];

  /* ¿Alguno de esos pedidos se quedó sin nada por servir? Se pregunta por
     el pedido entero y no por lo que acabamos de tocar: otra persona pudo
     servir el resto hace un segundo desde otra tablet. */
  const pedidosServidos: string[] = [];
  for (const orderId of pedidosTocados) {
    const { count } = await db
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .is('served_at', null);
    if ((count ?? 0) > 0) continue;

    const { data: cerrado } = await db
      .from('orders')
      .update({ status: 'SERVED', served_at: ahora })
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .in('status', ['NEW', 'PREP', 'READY', 'TRANSIT'])
      .select('id');
    if ((cerrado ?? []).length > 0) pedidosServidos.push(orderId);
  }

  revalidarSalon();
  return { ids, pedidosServidos };
}

/**
 * Deshace un «Servido» de línea.
 *
 * Mismo criterio que `undoServeTable`: solo revierte lo que sigue
 * exactamente como lo dejó la acción. Si el pedido se cobró mientras
 * tanto, deshacer sería pisar un cambio más nuevo.
 */
export async function deshacerServirLineas(
  restaurantId: string,
  itemIds: string[],
  pedidosServidos: string[] = [],
): Promise<{ error?: string; undone?: number }> {
  if (!restaurantId || !Array.isArray(itemIds) || itemIds.length === 0) {
    return { error: 'Datos inválidos.' };
  }
  if (itemIds.length > MAX_LINEAS) return { error: 'Demasiados platos que deshacer.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();

  /* El pedido vuelve ANTES que las líneas: si volviera después, entre las
     dos escrituras habría un instante con el pedido servido y una línea
     sin servir, que es justo la contradicción que este módulo lee. */
  if (pedidosServidos.length > 0) {
    await db
      .from('orders')
      .update({ status: 'READY', served_at: null })
      .eq('restaurant_id', restaurantId)
      .in('id', pedidosServidos.slice(0, MAX_LINEAS))
      .eq('status', 'SERVED');
  }

  const { data, error } = await db
    .from('order_items')
    .update({ served_at: null })
    .in('id', itemIds)
    .not('served_at', 'is', null)
    .select('id');

  if (error) {
    if (faltaLaColumna(error)) return { error: SIN_COLUMNA };
    return { error: error.message };
  }

  revalidarSalon();
  return { undone: data?.length ?? 0 };
}

/* ────────────────────────────────────────────────────────────
   2 · COBRAR UNA PARTE SIN CERRAR LA MESA
   ──────────────────────────────────────────────────────────── */

export type CobroParcial = PagoCobro;

export type CobroParcialResult = ResultadoCobro;

/**
 * Cobra unas líneas de la mesa y la deja abierta.
 *
 * El importe NO se reparte a ojo entre los pedidos: cada línea pertenece
 * a uno, así que a cada pedido le toca exactamente lo suyo. Un reparto
 * proporcional aquí haría que el arqueo de la noche dijera que se cobró
 * de un pedido dinero que era de otro.
 */
export async function cobrarParteDeMesa(
  restaurantId: string,
  tableNumber: number,
  itemIds: string[],
  pagos: CobroParcial[],
  intentoId: string,
): Promise<CobroParcialResult> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };
  if (!identidadCobroValida(intentoId)) return { error: 'Falta la identidad del intento de cobro.' };
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { error: 'No hay nada marcado que cobrar.' };
  }
  if (itemIds.length > MAX_LINEAS) return { error: 'Demasiados platos de una vez.' };
  if (!Array.isArray(pagos) || pagos.length === 0) return { error: 'Falta cómo se pagó.' };
  if (pagos.some((p) => !isPaymentMethod(p.method))) return { error: 'Forma de pago inválida.' };
  if (pagos.some((p) => !(Number.isFinite(p.amount) && p.amount > 0))) {
    return { error: 'Importe de pago inválido.' };
  }

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();

  const { data, error } = await db.rpc('leogin_cobrar_parte_mesa_idempotente', {
    p_restaurant: restaurantId,
    p_mesa: tableNumber,
    p_intento: intentoId,
    p_items: itemIds,
    p_pagos: pagos,
    p_actor: acceso.actor.userId,
  });
  if (error) {
    if (faltaLaFuncion(error)) return { error: 'Falta la migración 161 para recuperar los intentos de cobro.', needsMigration: true };
    return { error: error.message, incierto: !/^(LGD0[12]|22023)$/.test(error.code ?? '') };
  }
  if (!data || !(Number(data.cobrado) > 0)) return { error: 'No se pudo confirmar el cobro. Reintenta para recuperar el resultado.', incierto: true };
  revalidarSalon();
  return data as CobroParcialResult;
}

/**
 * Lo que una mesa lleva cobrado sin cerrarse.
 *
 * La comanda lo necesita para no volver a cobrar lo mismo y para que el
 * pie diga «faltan Q120», que es la cuenta que el mesero hace de cabeza.
 */
export async function cobradoDeMesa(
  restaurantId: string,
  tableNumber: number,
): Promise<{ error?: string; total?: number; lineasPagadas?: string[]; lineasPendientes?: Record<string, number>; avisoCuotas?: string | null; needsMigration?: boolean }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const { data, error } = await db.rpc('leogin_saldos_platos_mesa', {
    p_restaurant: restaurantId, p_mesa: tableNumber,
  });
  if (error) {
    if (faltaLaFuncion(error)) return { error: 'Falta la migración 164 para consultar las cuotas exactas por plato.', needsMigration: true };
    return { error: error.message };
  }
  if (!data) return { error: 'No se pudo leer el saldo por plato.' };
  return data;

}

const SIN_ABONOS = 'Falta la migración 169 para consultar y registrar abonos y partes.';

export async function transicionDeMesa(
  restaurantId: string, mesa: number, turno: string | null, cuenta: string,
  accion: 'limpiar' | 'liberar' | 'reabrir' | 'sin_cobro',
): Promise<{ error?: string }> {
  if (!Number.isInteger(mesa) || mesa < 1 || !/^[a-f0-9]{32}$/.test(cuenta)
      || (turno !== null && !identidadCobroValida(turno))
      || !['limpiar', 'liberar', 'reabrir', 'sin_cobro'].includes(accion)) {
    return { error: 'Datos de mesa inválidos.' };
  }
  const acceso = await assertTableAccess(restaurantId,
    accion === 'sin_cobro' || accion === 'reabrir' ? ['finanzas'] : ['mesero', 'mesas']);
  if ('error' in acceso) return acceso;
  const { data, error } = await createServiceClient().rpc('leogin_transicion_mesa', {
    p_restaurant: restaurantId, p_mesa: mesa, p_turno: turno, p_cuenta: cuenta,
    p_accion: accion, p_actor: acceso.actor.userId,
  });
  if (error || !data) return { error: error?.message ?? 'No se pudo actualizar la mesa.' };
  const { orderIds, saldada } = data as { orderIds: string[]; saldada: boolean };
  if (accion === 'liberar' && saldada && orderIds.length) {
    after(async () => {
      for (const id of orderIds) await emitirFacturaAutomatica(restaurantId, id);
    });
  }
  revalidarSalon();
  return {};
}

export async function leerContextoCobroMesa(restaurantId: string, mesa: number):
  Promise<{ contexto: ContextoCobroMesa } | { error: string; needsMigration?: boolean }> {
  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;
  const { data, error } = await createServiceClient().rpc('leogin_contexto_pago_mesa', {
    p_restaurant: restaurantId, p_mesa: mesa,
  });
  if (error && faltaLaFuncion(error)) return { error: SIN_ABONOS, needsMigration: true };
  if (error || !data) return { error: error?.message ?? 'No se pudo leer la cuenta de la mesa.' };
  return { contexto: data as ContextoCobroMesa };
}

export async function guardarPartesMesa(
  restaurantId: string, mesa: number, cuenta: string, anterior: string | null, cantidad: number,
): Promise<{ reparto: RepartoCobro } | { error: string }> {
  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;
  const { data, error } = await createServiceClient().rpc('leogin_guardar_partes_mesa', {
    p_restaurant: restaurantId, p_mesa: mesa, p_cuenta: cuenta, p_anterior: anterior, p_n: cantidad,
  });
  if (error || !data) return { error: error?.message ?? 'No se pudo guardar el reparto.' };
  return { reparto: data as RepartoCobro };
}

export async function ejecutarAbonoMesa(
  restaurantId: string,
  solicitud: Extract<SolicitudCobro, { operacion: 'abono' | 'pagada' }>,
  intentoId: string,
): Promise<ResultadoCobro> {
  if (!identidadCobroValida(intentoId) || !Number.isInteger(solicitud.mesa) || solicitud.mesa <= 0
      || !/^[a-f0-9]{32}$/.test(solicitud.cuenta)) {
    return { error: 'Datos de cobro inválidos.', incierto: false };
  }
  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;
  const db = createServiceClient();
  const args = { p_restaurant: restaurantId, p_mesa: solicitud.mesa, p_cuenta: solicitud.cuenta,
    p_actor: acceso.actor.userId, p_intento: intentoId };
  const { data, error } = solicitud.operacion === 'abono'
    ? await db.rpc('leogin_registrar_abono_mesa', {
      ...args, p_reparto: solicitud.reparto, p_partes: solicitud.partes, p_pagos: solicitud.pagos,
    })
    : await db.rpc('leogin_cerrar_cuenta_pagada', args);
  if (error) {
    if (faltaLaFuncion(error)) return { error: SIN_ABONOS, needsMigration: true, incierto: true };
    return { error: error.message, incierto: !/^(LGD0[12]|22\d{3})$/.test(error.code ?? '') };
  }
  const resultado = data as ResultadoCobro | null;
  if (resultado?.intentoId !== intentoId) return { error: 'No se pudo confirmar el cobro.', incierto: true };
  if (solicitud.operacion === 'pagada' && !resultado.repetido && resultado.orderIds?.length) {
    const ids = resultado.orderIds;
    after(async () => {
      for (const id of ids) await emitirFacturaAutomatica(restaurantId, id);
    });
  }
  revalidarSalon();
  return resultado;
}

/* ────────────────────────────────────────────────────────────
   3 · EL NOMBRE DE LA MESA
   ──────────────────────────────────────────────────────────── */

/** Un nombre de mesa no es un campo de texto libre sin fondo. */
const MAX_NOMBRE = 40;

/**
 * Le pone (o le quita) nombre a una mesa: «cumpleaños de Sofi».
 *
 * Vive en `table_sessions.note` y no en el aparato porque una mesa la
 * atienden tres personas: el nombre que escribe quien la sienta tiene que
 * leerlo quien va a cobrarla. Si la mesa no tenía turno abierto se abre
 * uno —igual que hace `updateSeating`—, porque ponerle nombre a una mesa
 * ES decir que está ocupada.
 */
export async function ponerNombreDeMesa(
  restaurantId: string,
  tableNumber: number,
  nombre: string,
): Promise<{ error?: string; ok?: boolean; needsMigration?: boolean }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId, ['mesero', 'mesas']);
  if ('error' in acceso) return acceso;
  if (!(await hayTurnosDeMesa())) {
    return { error: 'Falta la migración 128 para poder nombrar mesas.', needsMigration: true };
  }

  const limpio = (nombre ?? '').trim().slice(0, MAX_NOMBRE);
  const db = createServiceClient();

  const { data, error } = await db
    .from('table_sessions')
    .update({ note: limpio || null })
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .is('closed_at', null)
    .select('id');

  if (error) return { error: error.message };

  if ((data ?? []).length === 0) {
    // Sin nombre y sin turno no hay nada que abrir: quitarle el nombre a
    // una mesa que no tiene turno es una operación sin efecto, no un error.
    if (!limpio) return { ok: true };
    const abierto = await db.from('table_sessions').insert({
      restaurant_id: restaurantId,
      table_number: tableNumber,
      note: limpio,
      seated_by: acceso.actor.userId,
      source: 'order',
    });
    if (abierto.error) {
      if (abierto.error.code === '23505') {
        return { error: 'Alguien acaba de tocar esta mesa. Vuelve a intentar.' };
      }
      return { error: abierto.error.message };
    }
  }

  revalidarSalon();
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────
   4 · COBRAR UN PEDIDO PARA LLEVAR
   ──────────────────────────────────────────────────────────── */

/**
 * Cierra y cobra un pedido de mostrador.
 *
 * Un «para llevar» no ocupa mesa, así que `freeTable` no le sirve: su
 * cierre es pasar a DELIVERED, que es lo que dispara los puntos de
 * lealtad, la factura electrónica y el aviso al cliente. Lo único que
 * faltaba era dejar escrito CÓMO pagó —hasta ahora se quedaba con el
 * 'CASH' de fábrica y el arqueo contaba como efectivo lo que se pagó con
 * tarjeta, que es el mismo agujero que la migración 129 cerró para las
 * mesas.
 */
export async function cobrarPedidoParaLlevar(
  restaurantId: string,
  orderId: string,
  pago: CobroParcial,
): Promise<{ error?: string; ok?: boolean }> {
  if (!restaurantId || !orderId) return { error: 'Datos inválidos.' };
  if (!isPaymentMethod(pago?.method)) return { error: 'Forma de pago inválida.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const { data: pedido } = await db
    .from('orders')
    .select('id, total, status, restaurant_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!pedido || pedido.restaurant_id !== restaurantId) return { error: 'Pedido no encontrado.' };
  if (pedido.status === 'DELIVERED' || pedido.status === 'CANCEL') {
    return { error: 'Ese pedido ya está cerrado.' };
  }

  const total = Number(pedido.total ?? 0);
  const cobrado = Math.min(
    Math.round((pago.amount || total) * 100) / 100,
    total,
  );

  const recibido = pago.method === 'CASH' && pago.cashReceived != null && pago.cashReceived >= cobrado
    ? pago.cashReceived
    : null;

  /* `cash_amount` (no `cash_received`): en `orders` la columna se llama
     así desde siempre; `cash_received` es la de `order_payments`. Escribir
     la equivocada no fallaría en voz alta — PostgREST devolvería
     PGRST204— pero el vuelto no quedaría por escrito en el ticket. */
  await db
    .from('orders')
    .update({ payment_method: pago.method, cash_amount: recibido })
    .eq('id', orderId);

  if (cobrado > 0 && (await hayPagosDeMesa())) {
    const { error } = await db.from('order_payments').insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      method: pago.method,
      amount: cobrado,
      cash_received: recibido,
      taken_by: acceso.actor.userId,
    });
    // Sin la 129 el cobro sigue valiendo: `orders.payment_method` es lo que
    // el arqueo leía desde siempre y acaba de quedar escrito.
    if (error && !faltaLaTabla(error)) return { error: error.message };
  }

  const cerrado = await updateOrderStatus(orderId, 'DELIVERED');
  if (cerrado?.error) return { error: cerrado.error };

  revalidarSalon();
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────
   5 · AGOTAR UN PLATO DESDE EL SERVICIO
   ------------------------------------------------------------
   En Toast se llama «86»: cocina avisa que se acabó y quien lleva la
   carta lo marca ahí mismo, sin ir a Menú. Lo puede hacer quien tiene
   permiso de carta (dueño, gerente o personal con «catalogo»); el
   mesero sin ese permiso no ve el botón, y aquí se vuelve a comprobar
   porque la interfaz no es un candado.
   ──────────────────────────────────────────────────────────── */

export async function marcarAgotado(
  restaurantId: string,
  productId: string,
  agotado: boolean,
): Promise<{ error?: string }> {
  if (!restaurantId || !productId) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId, ['catalogo']);
  if ('error' in acceso) return { error: 'Solo quien administra la carta puede marcar un plato como agotado.' };

  const db = createServiceClient();
  const { data, error } = await db
    .from('products')
    .update({ is_available: !agotado, unavailable_at: agotado ? new Date().toISOString() : null })
    .eq('id', productId)
    .eq('restaurant_id', restaurantId)
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Ese plato no es de este restaurante.' };

  // La misma etiqueta que invalida Menú: el catálogo del mesero está en
  // caché con ella (getWaiterCatalogCached) y el menú público también.
  updateTag(`menu:${restaurantId}`);
  revalidatePath('/admin/menu');
  revalidarSalon();
  return {};
}

/* ────────────────────────────────────────────────────────────
   6 · ALERGIAS DE LA MESA (migración 151)
   ------------------------------------------------------------
   Se anotan una vez y salen en cada comanda de la mesa como
   «ALERGIA: …» (la nota del pedido, que ya imprime el agente y enseña
   la pantalla de cocina). Mismo camino que el nombre: viven en el turno
   y, si la mesa no tenía, se abre uno.
   ──────────────────────────────────────────────────────────── */

const MAX_ALERGIA = 120;

export async function ponerAlergiaDeMesa(
  restaurantId: string,
  tableNumber: number,
  alergia: string,
): Promise<{ error?: string; ok?: boolean; needsMigration?: boolean }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId, ['mesero', 'mesas']);
  if ('error' in acceso) return acceso;
  if (!(await hayTurnosDeMesa())) {
    return { error: 'Falta la migración 128 para anotar alergias en la mesa.', needsMigration: true };
  }

  const limpio = (alergia ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ALERGIA);
  const db = createServiceClient();

  const { data, error } = await db
    .from('table_sessions')
    .update({ allergies: limpio || null })
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .is('closed_at', null)
    .select('id');

  if (error) {
    if (faltaLaColumna(error)) {
      return { error: 'Falta la migración 151 para anotar alergias en la mesa.', needsMigration: true };
    }
    return { error: error.message };
  }

  if ((data ?? []).length === 0) {
    if (!limpio) return { ok: true };
    const abierto = await db.from('table_sessions').insert({
      restaurant_id: restaurantId,
      table_number: tableNumber,
      allergies: limpio,
      seated_by: acceso.actor.userId,
      source: 'order',
    });
    if (abierto.error) {
      if (abierto.error.code === '23505') return { error: 'Alguien acaba de tocar esta mesa. Vuelve a intentar.' };
      return { error: abierto.error.message };
    }
  }

  revalidarSalon();
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────
   7 · PASAR UN PLATO A OTRA MESA (migración 152)
   ------------------------------------------------------------
   «Ese pepián era de la 7.» El plato cambia de cuenta sin anularlo ni
   volver a imprimirlo: ya está hecho. Todo el dinero (subtotal, propina,
   total de las dos cuentas) lo mueve `move_order_item` en una sola
   transacción, y ahí viven también los «no»: lo anulado, una cuenta con
   cobros o descuentos.
   ──────────────────────────────────────────────────────────── */

export async function moverPlatoDeMesa(
  restaurantId: string,
  itemId: string,
  cantidad: number,
  mesaDestino: number,
): Promise<{ error?: string; needsMigration?: boolean; creada?: boolean; origenCerrado?: boolean }> {
  const qty = Math.trunc(cantidad);
  if (!restaurantId || !itemId || qty < 1 || !Number.isInteger(mesaDestino) || mesaDestino < 1 || mesaDestino > 500) {
    return { error: 'Datos inválidos.' };
  }

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  // El plato tiene que ser de ESTE restaurante (mismo candado que setItemSeat).
  const { data: item } = await db
    .from('order_items')
    .select('id, order:orders!inner(restaurant_id)')
    .eq('id', itemId)
    .maybeSingle();
  const dueño = (item as { order?: { restaurant_id: string } | null } | null)?.order?.restaurant_id;
  if (!item || dueño !== restaurantId) return { error: 'Plato no encontrado.' };

  const { data, error } = await db.rpc('move_order_item', {
    p_order_item_id: itemId,
    p_quantity: qty,
    p_target_table: mesaDestino,
  });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      return { error: 'Falta la migración 152 para pasar platos entre mesas.', needsMigration: true };
    }
    return { error: error.message };
  }

  const r = (data ?? {}) as { created?: boolean; source_closed?: boolean };
  revalidarSalon();
  return { creada: !!r.created, origenCerrado: !!r.source_closed };
}
