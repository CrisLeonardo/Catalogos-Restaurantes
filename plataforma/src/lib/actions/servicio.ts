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

import { createServiceClient } from '@/lib/supabase/service';
import { assertTableAccess } from '@/lib/auth/table-access';
import { revalidarSalon } from '@/lib/salon-cache';
import { hayColumnaMesa, direccionDeMesa } from '@/lib/db/mesa-columna';
import { hayTurnosDeMesa, hayPagosDeMesa } from '@/lib/db/table-sessions';
import { faltaLaColumna, faltaLaTabla } from '@/lib/db/migracion-ausente';
import { isPaymentMethod, type PaymentMethod } from '@/lib/payment-method';
import { updateOrderStatus } from '@/lib/actions/orders';

/** Tope de líneas que una llamada puede tocar. Una mesa no acumula más. */
const MAX_LINEAS = 120;

/** El aviso cuando la 133 todavía no ha corrido en esta base. */
const SIN_COLUMNA =
  'Falta la migración 133 para poder marcar los platos uno a uno. '
  + 'Mientras tanto, «Servido» marca la ronda entera.';

function campoMesa(porNumero: boolean, tableNumber: number): [string, string | number] {
  return porNumero ? ['table_number', tableNumber] : ['address', direccionDeMesa(tableNumber)];
}

/** Los pedidos vivos de una mesa, con sus líneas. Lo comparten las tres. */
async function pedidosDeMesa(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
  tableNumber: number,
) {
  const [colMesa, valMesa] = campoMesa(await hayColumnaMesa(), tableNumber);
  return db
    .from('orders')
    .select('id, status, total')
    .eq('restaurant_id', restaurantId)
    .eq('order_type', 'DINE_IN')
    .eq(colMesa, valMesa)
    .not('status', 'in', '("DELIVERED","CANCEL")');
}

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

export interface CobroParcial {
  method: PaymentMethod;
  amount: number;
  cashReceived?: number | null;
}

export interface CobroParcialResult {
  error?: string;
  /** Lo que de verdad se apuntó. */
  cobrado?: number;
  /** La 129 no ha corrido aquí. */
  needsMigration?: boolean;
}

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
): Promise<CobroParcialResult> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };
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

  /* Las líneas, con su pedido y su importe. El importe sale de la BASE y
     no de lo que mandó el navegador: es dinero. */
  const { data: lineas, error: errLeer } = await db
    .from('order_items')
    .select('id, order_id, subtotal, order:orders!inner(restaurant_id, status)')
    .in('id', itemIds);

  if (errLeer) return { error: errLeer.message };

  type Fila = {
    id: string; order_id: string; subtotal: number;
    order?: { restaurant_id: string; status: string } | null;
  };
  const propias = ((lineas ?? []) as unknown as Fila[]).filter(
    (l) => l.order?.restaurant_id === restaurantId
      && l.order.status !== 'DELIVERED' && l.order.status !== 'CANCEL',
  );
  if (propias.length === 0) return { error: 'Esos platos ya no están en la mesa.' };

  /* Cuánto le toca a cada pedido.
     ------------------------------------------------------------
     No es la suma de sus líneas marcadas: eso es CONSUMO, y el pedido
     cobra `orders.total`, que además lleva propina y descuentos. Una
     parte tiene que pagar su trozo de esos extras — si no, quien pague
     el último carga con toda la propina de la mesa y la suma de las
     partes no da el total.

     Así que se reparte en proporción DENTRO DE CADA PEDIDO: lo marcado
     sobre lo que ese pedido consumió, aplicado a lo que ese pedido
     cobra. Mismo criterio que `lib/bill-split.ts`. */
  const marcadoPorPedido = new Map<string, number>();
  for (const l of propias) {
    marcadoPorPedido.set(l.order_id, (marcadoPorPedido.get(l.order_id) ?? 0) + Number(l.subtotal ?? 0));
  }

  const { data: todasLasLineas } = await db
    .from('order_items')
    .select('order_id, subtotal')
    .in('order_id', [...marcadoPorPedido.keys()]);

  const consumoPorPedido = new Map<string, number>();
  for (const l of (todasLasLineas ?? []) as { order_id: string; subtotal: number }[]) {
    consumoPorPedido.set(l.order_id, (consumoPorPedido.get(l.order_id) ?? 0) + Number(l.subtotal ?? 0));
  }

  const { data: totales } = await db
    .from('orders')
    .select('id, total')
    .in('id', [...marcadoPorPedido.keys()]);
  const totalPorPedido = new Map(
    ((totales ?? []) as { id: string; total: number }[]).map((o) => [o.id, Number(o.total ?? 0)]),
  );

  const porPedido = new Map<string, number>();
  for (const [orderId, marcado] of marcadoPorPedido) {
    const consumoPedido = consumoPorPedido.get(orderId) ?? marcado;
    const totalPedido = totalPorPedido.get(orderId) ?? consumoPedido;
    const factor = consumoPedido > 0 ? totalPedido / consumoPedido : 1;
    porPedido.set(orderId, Math.round(marcado * factor * 100) / 100);
  }

  const consumo = Math.round([...porPedido.values()].reduce((s, v) => s + v, 0) * 100) / 100;
  if (consumo <= 0) return { error: 'Esa parte no suma nada.' };

  /* El dinero que entró, repartido por pedido y por método. Se recorta a
     lo que esa parte vale: si alguien puso de más en efectivo, el exceso
     es vuelto y no una venta. */
  const filas: {
    restaurant_id: string; order_id: string; method: string;
    amount: number; cash_received: number | null; taken_by: string;
  }[] = [];

  let restante = Math.min(
    consumo,
    Math.round(pagos.reduce((s, p) => s + p.amount, 0) * 100) / 100,
  );

  for (const [orderId, tocaRaw] of porPedido) {
    if (restante <= 0.004) break;
    let toca = Math.min(Math.round(tocaRaw * 100) / 100, restante);
    for (const pago of pagos) {
      if (toca <= 0.004) break;
      const aplica = Math.min(Math.round(pago.amount * 100) / 100, toca);
      if (aplica <= 0.004) continue;
      filas.push({
        restaurant_id: restaurantId,
        order_id: orderId,
        method: pago.method,
        amount: aplica,
        /* Solo se deja escrito el «recibí» cuando de verdad cubre lo que
           se le aplicó: un recibí menor es un teclazo a medias y haría
           que el ticket prometiera un vuelto que nadie dio. Mismo
           criterio que `freeTable`. */
        cash_received: pago.method === 'CASH' && pago.cashReceived != null
          && pago.cashReceived >= aplica ? pago.cashReceived : null,
        taken_by: acceso.actor.userId,
      });
      toca = Math.round((toca - aplica) * 100) / 100;
      restante = Math.round((restante - aplica) * 100) / 100;
    }
  }

  if (filas.length === 0) return { error: 'Ese pago no cubre nada de la parte marcada.' };

  const { error: errPago } = await db.from('order_payments').insert(filas);
  if (errPago) {
    if (faltaLaTabla(errPago)) {
      return {
        error: 'Falta la migración 129 para poder cobrar por partes sin cerrar la mesa.',
        needsMigration: true,
      };
    }
    return { error: errPago.message };
  }

  /* Y la línea queda marcada como saldada en el reparto compartido, para
     que la siguiente persona que abra la mesa —en otra tablet— vea qué
     falta por cobrar y no vuelva a cobrarlo. La 125 puede no estar: eso
     no invalida el dinero que ya entró, así que se degrada en silencio. */
  await marcarLineasPagadas(db, restaurantId, tableNumber, propias.map((l) => l.id));

  revalidarSalon();
  return { cobrado: Math.round(filas.reduce((s, f) => s + f.amount, 0) * 100) / 100 };
}

/** Apunta en `table_splits` qué líneas ya están saldadas. */
async function marcarLineasPagadas(
  db: ReturnType<typeof createServiceClient>,
  restaurantId: string,
  tableNumber: number,
  itemIds: string[],
): Promise<void> {
  const { data, error } = await db
    .from('table_splits')
    .select('mode, people, assignment, paid')
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .maybeSingle();
  if (error && faltaLaTabla(error)) return;

  /* Una persona por cobro parcial. No se reutiliza «la misma persona»
     porque cada parte la paga alguien distinto: eso es lo que significa
     cobrar por platos. */
  const people = Array.isArray(data?.people) ? (data!.people as { id: string; name?: string }[]) : [];
  const assignment = (data?.assignment as Record<string, string[]> | null) ?? {};
  const paid = Array.isArray(data?.paid) ? (data!.paid as string[]) : [];

  const id = `p${people.length + 1}`;
  const siguiente = {
    mode: 'byItem' as const,
    people: [...people, { id, name: `Parte ${people.length + 1}` }].slice(0, 30),
    assignment: { ...assignment, ...Object.fromEntries(itemIds.map((i) => [i, [id]])) },
    paid: [...new Set([...paid, id])].slice(0, 31),
    updated_at: new Date().toISOString(),
  };

  await db.from('table_splits').upsert({
    restaurant_id: restaurantId,
    table_number: tableNumber,
    ...siguiente,
  }, { onConflict: 'restaurant_id,table_number' });
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
): Promise<{ error?: string; total?: number; lineasPagadas?: string[] }> {
  if (!restaurantId || !tableNumber) return { error: 'Datos inválidos.' };

  const acceso = await assertTableAccess(restaurantId);
  if ('error' in acceso) return acceso;

  const db = createServiceClient();
  const { data: ordenes, error } = await pedidosDeMesa(db, restaurantId, tableNumber);
  if (error) return { error: error.message };
  const ids = (ordenes ?? []).map((o) => o.id as string);
  if (ids.length === 0) return { total: 0, lineasPagadas: [] };

  const { data: pagos, error: errPagos } = await db
    .from('order_payments')
    .select('amount')
    .in('order_id', ids);
  if (errPagos && !faltaLaTabla(errPagos)) return { error: errPagos.message };

  const total = Math.round(
    ((pagos ?? []) as { amount: number }[]).reduce((s, p) => s + Number(p.amount ?? 0), 0) * 100,
  ) / 100;

  const { data: split } = await db
    .from('table_splits')
    .select('assignment, paid')
    .eq('restaurant_id', restaurantId)
    .eq('table_number', tableNumber)
    .maybeSingle();

  const assignment = (split?.assignment as Record<string, string[]> | null) ?? {};
  const paid = new Set(Array.isArray(split?.paid) ? (split!.paid as string[]) : []);
  const lineasPagadas = Object.entries(assignment)
    .filter(([, quienes]) => quienes.some((q) => paid.has(q)))
    .map(([itemId]) => itemId);

  return { total, lineasPagadas };
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
