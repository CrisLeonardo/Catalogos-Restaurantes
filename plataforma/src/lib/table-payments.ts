/**
 * CÓMO SE REPARTE LO QUE PAGÓ UNA MESA
 * ------------------------------------------------------------
 * Migración 129 (hallazgo M-11). Una mesa paga Q400: Q250 en efectivo y
 * Q150 con tarjeta. Esa mesa puede tener tres pedidos (tres rondas), y
 * cada pedido es una VENTA que el arqueo, los informes y la factura leen
 * por separado. Así que hay que decidir qué parte de cada pago le toca a
 * cada pedido, y esa decisión mueve dinero real.
 *
 * La regla es la de una caja de verdad: **se van cubriendo los pedidos en
 * orden, con los pagos en el orden en que se dieron**, hasta que uno de
 * los dos se acaba. No se reparte «a prorrata» —que dejaría a los tres
 * pedidos medio pagados en efectivo y medio con tarjeta, que es una
 * ficción— sino como se paga de verdad: el primer billete cubre lo
 * primero.
 *
 * Vive aparte y sin tocar la base a propósito: es la única aritmética de
 * esta función y quería poder probarla sin levantar Postgres.
 */

export interface PagoEntrada {
  method: string;
  /** Lo que se aplica a la cuenta con este método. */
  amount: number;
  /** Solo en efectivo: lo que el cliente puso en la mano, que puede ser
      más que el importe (el resto es vuelto, no ingreso). */
  cashReceived?: number | null;
}

export interface FilaPago {
  orderId: string;
  method: string;
  amount: number;
  /** Va SOLO en la primera fila de cada pago: si un pago en efectivo se
      parte entre dos pedidos, repetir aquí lo recibido lo contaría dos
      veces al sumar la columna. */
  cashReceived: number | null;
}

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Reparte los pagos entre los pedidos vivos de la mesa.
 *
 * Lo que sobra de los pagos NO se reparte: pagar con un billete de Q500
 * una cuenta de Q400 son Q400 de ingreso y Q100 de vuelto, y meter los
 * Q100 en la caja como venta sería exactamente el descuadre que esta
 * migración viene a cerrar. Lo que falta tampoco se inventa: si los pagos
 * no llegan al total, salen menos filas y el pedido queda cobrado a
 * medias — que es lo que antes no se podía ni escribir.
 */
export function repartirPagos(
  ordenes: { id: string; total: number }[],
  pagos: PagoEntrada[],
): FilaPago[] {
  const filas: FilaPago[] = [];
  const cola = pagos
    .filter((p) => Number.isFinite(p.amount) && p.amount > 0)
    .map((p) => ({ ...p, restante: cent(p.amount), primera: true }));

  let i = 0;
  for (const orden of ordenes) {
    let falta = cent(Math.max(0, orden.total));
    while (falta > 0.001 && i < cola.length) {
      const pago = cola[i];
      if (pago.restante <= 0.001) { i++; continue; }

      const parte = cent(Math.min(falta, pago.restante));
      filas.push({
        orderId: orden.id,
        method: pago.method,
        amount: parte,
        cashReceived: pago.primera ? (pago.cashReceived ?? null) : null,
      });
      pago.primera = false;
      pago.restante = cent(pago.restante - parte);
      falta = cent(falta - parte);
    }
  }

  return filas;
}

/**
 * Con qué método se pagó MÁS de este pedido.
 *
 * Es lo que se sigue escribiendo en `orders.payment_method`, para que el
 * ticket, los informes y analítica sigan leyendo la misma columna de
 * siempre. No es una verdad completa cuando hubo mezcla —por eso existe
 * la tabla— pero es la mejor respuesta de una sola palabra, y es la que
 * daría una persona: «esa mesa pagó sobre todo con tarjeta».
 */
export function metodoDominante(filas: FilaPago[], porDefecto = 'CASH'): string {
  if (filas.length === 0) return porDefecto;
  const suma = new Map<string, number>();
  for (const f of filas) suma.set(f.method, cent((suma.get(f.method) ?? 0) + f.amount));

  let ganador = porDefecto;
  let mayor = -1;
  for (const [metodo, monto] of suma) {
    // A igualdad exacta gana el primero que se cobró, que es el que la
    // cola conserva: sin este desempate el resultado dependería del orden
    // en que Map decida iterar.
    if (monto > mayor) { mayor = monto; ganador = metodo; }
  }
  return ganador;
}

/** Lo que falta por cobrar de una cuenta, dados los pagos ya anotados. */
export function faltaPorCobrar(total: number, pagos: PagoEntrada[]): number {
  const puesto = pagos.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0);
  return cent(Math.max(0, total - puesto));
}
