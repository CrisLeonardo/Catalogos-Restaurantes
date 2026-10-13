/**
 * EL LIBRO DE COBROS DE UN TURNO
 * ------------------------------------------------------------
 * Migración 145 (FUN-01, PROD-02, PROD-03, PROD-05). Lo que el cajón tiene
 * que tener al cerrar no es «lo vendido hoy»: es **el dinero que entró
 * desde el cierre anterior**, menos el que salió.
 *
 * Antes se sumaba `orders.total` de todo pedido no cancelado del día de
 * calendario. Un pedido de mesero nace con `payment_method = 'CASH'`, así
 * que cada mesa todavía comiendo era un «faltante», el turno de la noche
 * esperaba el efectivo del de la mañana y un bar que cierra a la 1:30
 * cerraba la caja del día siguiente.
 *
 * El libro tiene dos fuentes, y un pedido usa UNA de las dos, nunca
 * mezcladas (mezclar a medias es lo que descuadra):
 *
 *   1. Sus filas en `order_payments`, si tiene alguna — cobro de mesa,
 *      cobro por partes, para llevar y, desde la 145, las filas negativas
 *      de devoluciones, correcciones y reaperturas. Cada una cuenta en la
 *      hora en que el dinero entró o salió.
 *   2. Si no tiene ninguna, y es un domicilio o un pedido para recoger que
 *      ya se ENTREGÓ (los del menú en línea): su total con su
 *      `payment_method`, en la hora de entrega.
 *
 * Una mesa cerrada sin filas es una mesa «liberada sin cobrar»: no entró
 * dinero y no se espera, pero se enseña aparte porque al dueño le interesa.
 *
 * Sin base de datos a propósito: de aquí sale lo que el cajero cuenta con
 * el billete en la mano, y se prueba entero en `libro.test.ts`.
 */

import { diaDeNegocio, inicioDelDia } from './dia';

export type ClaseMovimiento = 'PAYMENT' | 'TABLE_CLOSE' | 'REFUND' | 'METHOD_FIX' | 'REOPEN';

/** Una fila de `order_payments`. */
export interface Movimiento {
  id?: string;
  orderId: string;
  method: string;
  /** Positivo = entró · negativo = salió (devolución, corrección, reapertura). */
  amount: number;
  kind: ClaseMovimiento;
  /** ISO de cuándo entró o salió el dinero. */
  at: string;
}

/** Un pedido entregado sin ninguna fila en `order_payments`. */
export interface PedidoSinFilas {
  orderId: string;
  orderType: string;
  method: string;
  total: number;
  /** ISO de la entrega. */
  at: string;
}

export interface CuadreDelPeriodo {
  /** Neto por método: lo que entró menos lo que salió. */
  porMetodo: Record<string, number>;
  /** Lo que tiene que haber entrado al cajón en efectivo (neto). */
  efectivo: number;
  /** Todo lo cobrado (bruto, sin devoluciones), cualquier método. */
  cobrado: number;
  /** Lo devuelto a clientes (positivo). */
  devoluciones: number;
  /** De eso, lo que salió del cajón en efectivo (positivo). */
  devolucionesEfectivo: number;
  /** Pedidos distintos con algún movimiento en el periodo. */
  pedidos: number;
  /** Mesas que se cerraron sin cobrar: no esperan dinero. */
  liberadasSinCobrar: { pedidos: number; total: number };
}

const cent = (n: number) => Math.round(n * 100) / 100;
const metodo = (m: string | null | undefined) => (m ?? '').trim().toUpperCase() || 'CASH';

/**
 * Suma un periodo. Los movimientos y los pedidos ya vienen filtrados a la
 * ventana del turno; aquí solo se decide qué cuenta y cuánto.
 */
export function cuadrarPeriodo(
  movimientos: Movimiento[],
  sinFilas: PedidoSinFilas[],
): CuadreDelPeriodo {
  const porMetodo: Record<string, number> = {};
  const pedidos = new Set<string>();
  let cobrado = 0;
  let devoluciones = 0;
  let devolucionesEfectivo = 0;
  let sinCobrarN = 0;
  let sinCobrarTotal = 0;

  const sumar = (m: string, monto: number) => {
    const k = metodo(m);
    porMetodo[k] = cent((porMetodo[k] ?? 0) + monto);
  };

  for (const mv of movimientos) {
    const monto = cent(Number(mv.amount) || 0);
    if (monto === 0) continue;
    sumar(mv.method, monto);
    pedidos.add(mv.orderId);
    if (mv.kind === 'PAYMENT' || mv.kind === 'TABLE_CLOSE') cobrado = cent(cobrado + monto);
    if (mv.kind === 'REFUND') {
      devoluciones = cent(devoluciones - monto);
      if (metodo(mv.method) === 'CASH') devolucionesEfectivo = cent(devolucionesEfectivo - monto);
    }
    /* Una reapertura compensa un cobro que no debió pasar: resta del
       cobrado, no es una devolución (el cliente no se llevó nada). */
    if (mv.kind === 'REOPEN') cobrado = cent(cobrado + monto);
  }

  for (const p of sinFilas) {
    const total = cent(Number(p.total) || 0);
    if (total <= 0) continue;
    if (p.orderType === 'DINE_IN') {
      sinCobrarN += 1;
      sinCobrarTotal = cent(sinCobrarTotal + total);
      continue;
    }
    sumar(p.method, total);
    cobrado = cent(cobrado + total);
    pedidos.add(p.orderId);
  }

  for (const k of Object.keys(porMetodo)) if (porMetodo[k] === 0) delete porMetodo[k];

  return {
    porMetodo,
    efectivo: porMetodo.CASH ?? 0,
    cobrado,
    devoluciones,
    devolucionesEfectivo,
    pedidos: pedidos.size,
    liberadasSinCobrar: { pedidos: sinCobrarN, total: sinCobrarTotal },
  };
}

/**
 * Desde cuándo cuenta el cuadre del turno.
 *
 * El cierre anterior —lo cobrado después de que el último cajero contó es
 * del siguiente—, pero **nunca antes del inicio del día de negocio en que
 * se abrió este turno**. Sin ese tope, un local que pasó un mes sin cerrar
 * caja tendría un primer cuadre de un mes, y uno que nunca cerró, de toda
 * su historia.
 */
export function inicioDelPeriodo(opts: {
  ultimoCierre: Date | null;
  abiertoEn: Date | null;
  ahora: Date;
  timezone: string;
  corteMin: number;
}): Date {
  const ancla = opts.abiertoEn ?? opts.ahora;
  const dia = diaDeNegocio(ancla, opts.timezone, opts.corteMin);
  const inicio = inicioDelDia(dia, opts.timezone, opts.corteMin);
  if (opts.ultimoCierre && opts.ultimoCierre.getTime() > inicio.getTime()) return opts.ultimoCierre;
  return inicio;
}

/** En el cajón tiene que haber: el fondo + el efectivo neto − los gastos. */
export function esperadoEnCajon(fondo: number, efectivo: number, gastos: number): number {
  return cent((Number(fondo) || 0) + (Number(efectivo) || 0) - (Number(gastos) || 0));
}

/* ── Corregir un cobro ─────────────────────────────────────────── */

export interface FilaNueva {
  method: string;
  amount: number;
  kind: ClaseMovimiento;
  reversesId: string | null;
}

/**
 * Lo neto por método de las filas de un pedido. Es lo que un pedido «tiene
 * cobrado» después de todas sus correcciones.
 */
export function netoPorMetodo(filas: Pick<Movimiento, 'method' | 'amount'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of filas) {
    const k = metodo(f.method);
    out[k] = cent((out[k] ?? 0) + (Number(f.amount) || 0));
  }
  for (const k of Object.keys(out)) if (Math.abs(out[k]) < 0.005) delete out[k];
  return out;
}

/**
 * Las filas que mueven un cobro de un método a otro.
 *
 * Se mueve TODO lo que el pedido tiene neto en métodos distintos del nuevo
 * —una mesa que pagó mitad efectivo y mitad tarjeta y que en realidad pagó
 * toda con tarjeta—, o solo `soloDe` si se pide. Cada movimiento son dos
 * filas: una negativa en el método viejo y una positiva en el nuevo, así el
 * cobrado no cambia y el cajón deja de esperar ese efectivo.
 */
export function filasDeCambioDeMetodo(
  neto: Record<string, number>,
  nuevo: string,
  soloDe?: string | null,
): FilaNueva[] {
  const destino = metodo(nuevo);
  const filas: FilaNueva[] = [];
  for (const [m, monto] of Object.entries(neto)) {
    if (m === destino || monto <= 0) continue;
    if (soloDe && metodo(soloDe) !== m) continue;
    filas.push({ method: m, amount: -cent(monto), kind: 'METHOD_FIX', reversesId: null });
    filas.push({ method: destino, amount: cent(monto), kind: 'METHOD_FIX', reversesId: null });
  }
  return filas;
}

/** El método que más puso, para `orders.payment_method`. */
export function metodoPrincipal(neto: Record<string, number>, porOmision = 'CASH'): string {
  let mejor: string | null = null;
  for (const [m, monto] of Object.entries(neto)) {
    if (monto <= 0) continue;
    if (mejor == null || monto > (neto[mejor] ?? 0)) mejor = m;
  }
  return mejor ?? metodo(porOmision);
}

/**
 * Cuánto se puede devolver todavía de un pedido: lo cobrado neto, que ya
 * descuenta devoluciones anteriores. Nunca más que eso — devolver dos veces
 * el mismo plato sería sacar del cajón dinero que nunca entró.
 */
export function devolvible(neto: Record<string, number>): number {
  return cent(Object.values(neto).reduce((s, v) => s + Math.max(0, v), 0));
}

/** Lo que vale devolver `cantidad` de una línea, con la parte proporcional
    de propina y descuento del pedido (mismo criterio que el cobro por partes). */
export function montoDeLinea(opts: {
  lineaSubtotal: number;
  lineaCantidad: number;
  cantidad: number;
  consumoPedido: number;
  totalPedido: number;
}): number {
  const { lineaSubtotal, lineaCantidad, cantidad, consumoPedido, totalPedido } = opts;
  if (!(lineaCantidad > 0) || !(cantidad > 0)) return 0;
  const parte = (Number(lineaSubtotal) || 0) * Math.min(cantidad, lineaCantidad) / lineaCantidad;
  const factor = consumoPedido > 0 ? totalPedido / consumoPedido : 1;
  return cent(parte * factor);
}
