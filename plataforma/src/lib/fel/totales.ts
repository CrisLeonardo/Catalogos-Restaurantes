/* ============================================================
   MONTOS DEL DTE · de un pedido cobrado a las líneas de la factura
   ------------------------------------------------------------
   El error más caro que tenía el módulo no era el XML: era que la
   factura no cobraba lo mismo que la caja.

   El pedido se cobra así (lib/actions/orders.ts):
       total = subtotal + envío − descuento + propina
   y el DTE se armaba con `order_items.subtotal + delivery_fee`, es decir
   ignorando el descuento y la propina. Consecuencias reales:

     · Se facturaba de más el descuento. El restaurante declaraba IVA
       sobre dinero que nunca entró y lo pagaba de su bolsa cada mes.
     · El total del DTE no cuadraba con el ticket ni con el arqueo de
       caja, así que cualquier revisión encontraba diferencias sin
       explicación.

   ── Cómo se arregla ──
   El descuento no se resta al final: se PRORRATEA entre las líneas y se
   declara en el campo <dte:Descuento> de cada una, que es lo que el
   esquema del SAT espera. El reparto usa restos mayores para que la suma
   de los centavos repartidos sea exactamente el descuento, sin sobrar ni
   faltar un centavo — si sobra, el certificador rechaza el documento
   porque GranTotal deja de cuadrar con la suma de líneas.

   ── La propina ──
   Una propina voluntaria no es parte del precio de venta y no debería ir
   en la base gravable. Un cargo por servicio obligatorio sí. Como eso lo
   decide cada restaurante (y su contador), es una opción, no una
   suposición: `facturarPropina`. Por defecto queda FUERA.

   ── Las tarjetas de regalo ──
   No se tocan. Una tarjeta de regalo es una forma de PAGO, no un
   descuento (ver migración 082): la venta es por el total y así se
   factura. Descontarla bajaría la base gravable de una venta que sí
   ocurrió completa.
   ============================================================ */

export const IVA_RATE = 0.12;

/** "B" = bien, "S" = servicio. Lo exige el atributo BienOServicio del ítem. */
export type BienOServicio = 'B' | 'S';

export interface LineaOrigen {
  descripcion: string;
  cantidad: number;
  /** Importe de la línea ya cobrado (cantidad × precio), antes de descuentos. */
  importe: number;
  bienOServicio?: BienOServicio;
}

export interface PedidoParaFacturar {
  lineas: LineaOrigen[];
  /** Envío. Se factura como servicio. */
  envio?: number;
  /** Descuento por cupón. */
  descuento?: number;
  /** Descuento por canje de puntos de lealtad. */
  descuentoLealtad?: number;
  /** Propina. Fuera de la base salvo que el restaurante la facture. */
  propina?: number;
  /** orders.total, para comprobar que el DTE cuadra con lo cobrado. */
  totalCobrado?: number;
}

export interface OpcionesMontos {
  /** Los precios de la carta ya llevan IVA dentro (lo normal en Guatemala). */
  ivaIncluido: boolean;
  /** Régimen general sí; pequeño contribuyente no. */
  desglosaIva: boolean;
  /** Meter la propina en la base gravable (cargo por servicio obligatorio). */
  facturarPropina: boolean;
}

export interface LineaDte {
  numeroLinea: number;
  bienOServicio: BienOServicio;
  cantidad: number;
  unidadMedida: string;
  descripcion: string;
  /** Hasta 6 decimales: el XSD admite 10 y así la línea cuadra al centavo. */
  precioUnitario: number;
  /** cantidad × precioUnitario, redondeado a 2. */
  precio: number;
  descuento: number;
  /** precio − descuento. */
  total: number;
  montoGravable: number;
  montoImpuesto: number;
}

export interface MontosDte {
  lineas: LineaDte[];
  granTotal: number;
  totalGravable: number;
  totalImpuesto: number;
  /** Propina que quedó fuera del DTE. Se imprime aparte en el ticket. */
  propinaExcluida: number;
  /** Problemas que impiden emitir. Si trae algo, NO se emite. */
  errores: string[];
}

const round = (n: number, d = 2): number => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Céntimos enteros: evita comparar flotantes al cuadrar el documento. */
const cent = (n: number): number => Math.round(n * 100);

/**
 * Reparte un monto entre pesos, sin perder ni inventar centavos.
 *
 * Repartir proporcionalmente y redondear cada parte por su cuenta deja
 * casi siempre un descuadre de uno o dos centavos contra el total, y el
 * certificador rechaza el DTE por eso. El método de restos mayores da a
 * cada línea su parte entera y luego entrega los centavos sobrantes a las
 * líneas con mayor resto, de forma que la suma es exacta por construcción.
 */
export function repartirCentavos(montoTotal: number, pesos: number[]): number[] {
  const objetivo = cent(montoTotal);
  if (objetivo <= 0 || pesos.length === 0) return pesos.map(() => 0);

  const sumaPesos = pesos.reduce((a, p) => a + p, 0);
  if (sumaPesos <= 0) return pesos.map(() => 0);

  const exactos = pesos.map((p) => (objetivo * p) / sumaPesos);
  const base = exactos.map((v) => Math.floor(v));
  let restante = objetivo - base.reduce((a, v) => a + v, 0);

  // Los centavos sobrantes van a quien tiene el resto más grande. Empate:
  // gana la línea de mayor peso, y si aun así empatan, la primera.
  const orden = exactos
    .map((v, i) => ({ i, resto: v - Math.floor(v), peso: pesos[i] }))
    .sort((a, b) => b.resto - a.resto || b.peso - a.peso || a.i - b.i);

  for (const { i } of orden) {
    if (restante <= 0) break;
    base[i] += 1;
    restante -= 1;
  }

  return base.map((c) => c / 100);
}

/**
 * Desglosa un importe en base gravable + IVA.
 *
 * El impuesto se calcula como residuo (total − gravable) y no como
 * gravable × 0.12: así gravable + impuesto da SIEMPRE el total exacto,
 * que es la igualdad que el SAT valida en cada línea. Calcularlo por
 * separado deja descuadres de un centavo en importes como Q10.00.
 */
export function desglosarIva(importe: number, ivaIncluido: boolean): { gravable: number; impuesto: number } {
  const t = round(importe);
  if (t <= 0) return { gravable: 0, impuesto: 0 };
  if (ivaIncluido) {
    const gravable = round(t / (1 + IVA_RATE));
    return { gravable, impuesto: round(t - gravable) };
  }
  return { gravable: t, impuesto: round(t * IVA_RATE) };
}

/**
 * Arma las líneas del DTE a partir de un pedido ya cobrado.
 *
 * Devuelve `errores` en vez de lanzar: quien llama necesita poder mostrar
 * el motivo en la caja y decidir, no reventar a media venta.
 */
export function calcularMontos(pedido: PedidoParaFacturar, opts: OpcionesMontos): MontosDte {
  const errores: string[] = [];

  const propina = round(pedido.propina ?? 0);
  const envio = round(pedido.envio ?? 0);
  const descuentoTotal = round((pedido.descuento ?? 0) + (pedido.descuentoLealtad ?? 0));

  // 1. Líneas brutas: los productos, más el envío y (si toca) la propina
  //    como servicios. El envío y la propina no llevan descuento: el cupón
  //    se aplica sobre lo consumido, no sobre el domicilio.
  const productos: LineaOrigen[] = pedido.lineas
    .map((l) => ({ ...l, importe: round(l.importe), cantidad: l.cantidad > 0 ? l.cantidad : 1 }))
    .filter((l) => l.importe > 0);

  const extras: LineaOrigen[] = [];
  if (envio > 0) {
    extras.push({ descripcion: 'Servicio de entrega', cantidad: 1, importe: envio, bienOServicio: 'S' });
  }
  if (opts.facturarPropina && propina > 0) {
    extras.push({ descripcion: 'Cargo por servicio', cantidad: 1, importe: propina, bienOServicio: 'S' });
  }

  if (productos.length === 0 && extras.length === 0) {
    errores.push('El pedido no tiene nada que facturar.');
    return { lineas: [], granTotal: 0, totalGravable: 0, totalImpuesto: 0, propinaExcluida: propina, errores };
  }

  const brutoProductos = round(productos.reduce((a, l) => a + l.importe, 0));

  if (descuentoTotal > brutoProductos + 0.001) {
    errores.push(
      `El descuento (Q${descuentoTotal.toFixed(2)}) es mayor que el consumo ` +
      `(Q${brutoProductos.toFixed(2)}). Revisa el pedido antes de facturarlo.`,
    );
  }

  // 2. Prorrateo del descuento entre los productos, proporcional al importe.
  const descuentos = descuentoTotal > 0 && brutoProductos > 0
    ? repartirCentavos(Math.min(descuentoTotal, brutoProductos), productos.map((l) => l.importe))
    : productos.map(() => 0);

  // 3. Construcción de cada línea con las igualdades que el SAT valida.
  const todas = [
    ...productos.map((l, i) => ({ origen: l, descuento: descuentos[i] })),
    ...extras.map((l) => ({ origen: l, descuento: 0 })),
  ];

  const lineas: LineaDte[] = todas.map((x, idx) => {
    const precio = round(x.origen.importe);
    const cantidad = x.origen.cantidad;
    const total = round(precio - x.descuento);
    const { gravable, impuesto } = opts.desglosaIva
      ? desglosarIva(total, opts.ivaIncluido)
      : { gravable: total, impuesto: 0 };

    return {
      numeroLinea: idx + 1,
      bienOServicio: x.origen.bienOServicio ?? 'B',
      cantidad,
      unidadMedida: 'UND',
      descripcion: x.origen.descripcion,
      // 6 decimales: con cantidad 3 e importe Q10.00 el unitario es
      // 3.333333 y cantidad × unitario vuelve a dar Q10.00 al centavo.
      precioUnitario: round(precio / cantidad, 6),
      precio,
      descuento: round(x.descuento),
      total,
      montoGravable: gravable,
      montoImpuesto: impuesto,
    };
  });

  const granTotal = round(lineas.reduce((a, l) => a + l.total, 0));
  const totalGravable = round(lineas.reduce((a, l) => a + l.montoGravable, 0));
  const totalImpuesto = round(lineas.reduce((a, l) => a + l.montoImpuesto, 0));

  if (granTotal <= 0) {
    errores.push('El total a facturar es cero. No se puede emitir un DTE sin monto.');
  }

  // 4. Cuadre contra lo que realmente cobró la caja.
  if (pedido.totalCobrado !== undefined) {
    const esperado = opts.facturarPropina
      ? cent(pedido.totalCobrado)
      : cent(pedido.totalCobrado) - cent(propina);
    const diferencia = Math.abs(cent(granTotal) - esperado);
    // Un centavo es redondeo; más que eso es que las cuentas no salen y
    // hay que detenerse antes de mandarlo al SAT.
    if (diferencia > 1) {
      errores.push(
        `El total de la factura (Q${granTotal.toFixed(2)}) no coincide con lo cobrado ` +
        `(Q${(esperado / 100).toFixed(2)}). No se emite hasta que cuadre.`,
      );
    }
  }

  return {
    lineas,
    granTotal,
    totalGravable,
    totalImpuesto,
    propinaExcluida: opts.facturarPropina ? 0 : propina,
    errores,
  };
}

/**
 * Comprueba las igualdades que el certificador va a comprobar.
 *
 * Es una red aparte del cálculo a propósito: si mañana alguien toca
 * `calcularMontos`, esto sigue siendo el juez independiente. Barato de
 * ejecutar y evita descubrir el descuadre en forma de rechazo del SAT
 * frente a un cliente.
 */
export function verificarMontos(m: MontosDte, desglosaIva: boolean): string[] {
  const fallos: string[] = [];

  for (const l of m.lineas) {
    if (Math.abs(cent(l.precio - l.descuento) - cent(l.total)) > 0) {
      fallos.push(`Línea ${l.numeroLinea}: Total debe ser Precio − Descuento.`);
    }
    if (Math.abs(cent(l.cantidad * l.precioUnitario) - cent(l.precio)) > 1) {
      fallos.push(`Línea ${l.numeroLinea}: Precio no es Cantidad × PrecioUnitario.`);
    }
    if (desglosaIva && Math.abs(cent(l.montoGravable + l.montoImpuesto) - cent(l.total)) > 0) {
      fallos.push(`Línea ${l.numeroLinea}: MontoGravable + MontoImpuesto debe ser el Total.`);
    }
    if (l.descuento < 0 || l.precio < 0 || l.total < 0) {
      fallos.push(`Línea ${l.numeroLinea}: el DTE no admite montos negativos.`);
    }
  }

  const sumaTotales = m.lineas.reduce((a, l) => a + cent(l.total), 0);
  if (Math.abs(sumaTotales - cent(m.granTotal)) > 0) {
    fallos.push('GranTotal no es la suma de los totales de línea.');
  }

  if (desglosaIva) {
    const sumaImpuesto = m.lineas.reduce((a, l) => a + cent(l.montoImpuesto), 0);
    if (Math.abs(sumaImpuesto - cent(m.totalImpuesto)) > 0) {
      fallos.push('TotalMontoImpuesto no es la suma del IVA de las líneas.');
    }
  } else if (cent(m.totalImpuesto) !== 0) {
    fallos.push('Un DTE sin desglose de IVA no puede llevar impuesto.');
  }

  return fallos;
}
