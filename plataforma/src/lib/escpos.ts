// Codificación ESC/POS para impresoras térmicas POS (Epson, 3Nstar, Star, etc.)
// Genera Uint8Array listo para enviar vía Web USB o el Agente Leogin en modo raw.

import type { OrderWithItems } from '@/lib/db/orders';
import { labelOf, countsAsCash } from '@/lib/payment-method';

// ── Fecha y hora del ticket ──────────────────────────────────────────────────
/* Estos builders corren en DOS sitios con relojes distintos:
     · el navegador del local  → zona horaria del dispositivo (normalmente bien)
     · el servidor (Render)    → UTC, al encolar para el Agente de impresión
   Sin `timeZone` explícito, todo ticket encolado desde el servidor salía con la
   hora de UTC: en Guatemala, 6 horas adelantadas ("bug de la hora del ticket").
   Por eso la zona horaria del restaurante viaja SIEMPRE con el ticket. */

export interface TicketFormat {
  /** Zona IANA del restaurante, p. ej. 'America/Guatemala'. */
  timezone: string;
  /** Locale para nombres de mes/día, p. ej. 'es-GT'. */
  locale: string;
}

export const DEFAULT_TICKET_FORMAT: TicketFormat = {
  timezone: 'America/Guatemala',
  locale: 'es-GT',
};

/** "14:35" en la hora del restaurante. */
export function ticketTime(iso: string | Date, f: TicketFormat = DEFAULT_TICKET_FORMAT): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  try {
    return d.toLocaleTimeString(f.locale, { timeZone: f.timezone, hour: '2-digit', minute: '2-digit' });
  } catch {
    // Locale o zona inválidos (config a mano en la BD): mejor la hora del
    // sistema que un ticket sin hora.
    return d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
  }
}

/** "05 ago 2026, 14:35" en la hora del restaurante. */
export function ticketDateTime(iso: string | Date, f: TicketFormat = DEFAULT_TICKET_FORMAT): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  };
  try {
    return d.toLocaleString(f.locale, { ...opts, timeZone: f.timezone });
  } catch {
    return d.toLocaleString('es-GT', opts);
  }
}

// PC850 (Multilingual) — cubre español completo en impresoras térmicas
const PC850: Record<string, number> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9,
  ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  '¡': 0xad, '¿': 0xa8, '°': 0xf8, '·': 0xfa,
};

function encodeText(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) out.push(code);
    else out.push(PC850[ch] ?? 0x3f);
  }
  return out;
}

// 80mm printer = 42 cols normal, 21 cols double-width
const COLS = 42;

class EscPosBuilder {
  private b: number[] = [];

  init(): this {
    // ESC @ (reset) + ESC t 2 (codepage PC850)
    this.b.push(0x1b, 0x40, 0x1b, 0x74, 0x02);
    return this;
  }

  align(a: 'left' | 'center' | 'right'): this {
    this.b.push(0x1b, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
    return this;
  }

  bold(on: boolean): this {
    this.b.push(0x1b, 0x45, on ? 1 : 0);
    return this;
  }

  // 1 = normal (42 cols), 2 = double width+height (21 cols)
  size(n: 1 | 2): this {
    this.b.push(0x1d, 0x21, n === 2 ? 0x11 : 0x00);
    return this;
  }

  text(s: string): this {
    this.b.push(...encodeText(s));
    return this;
  }

  lf(n = 1): this {
    for (let i = 0; i < n; i++) this.b.push(0x0a);
    return this;
  }

  line(s: string, extra = 0): this {
    return this.text(s).lf(1 + extra);
  }

  sep(char = '-', cols = COLS): this {
    return this.line(char.repeat(cols));
  }

  // Columna izquierda + columna derecha justificadas
  row(left: string, right: string, cols = COLS): this {
    const pad = Math.max(1, cols - left.length - right.length);
    return this.text(left).text(' '.repeat(pad)).line(right);
  }

  /**
   * Código QR nativo de la impresora (GS ( k, modelo 2).
   *
   * Se imprime desde la impresora y no como imagen: una imagen habría que
   * rasterizarla y pesa; el comando es estándar ESC/POS y lo entienden las
   * térmicas de 80mm actuales. Aun así, quien llama debe imprimir TAMBIÉN
   * la dirección en texto — si una impresora vieja ignora el comando, el
   * cliente se queda sin forma de consultar su factura.
   */
  qr(data: string, size = 6): this {
    const bytes = encodeText(data);
    const len = bytes.length + 3;
    const pL = len & 0xff;
    const pH = (len >> 8) & 0xff;

    // Modelo 2
    this.b.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Tamaño del módulo (1..16)
    this.b.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.min(16, Math.max(1, size)));
    // Corrección de errores M (48=L, 49=M, 50=Q, 51=H). M aguanta manchas de
    // grasa y tinta corrida, que es el estado normal de un ticket de cocina.
    this.b.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    // Guardar los datos
    this.b.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...bytes);
    // Imprimir
    this.b.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  cut(): this {
    this.b.push(0x1b, 0x64, 4);    // ESC d 4: avanza 4 líneas
    this.b.push(0x1d, 0x56, 0x42, 0x00); // GS V B 0: corte parcial
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.b);
  }
}

// ── Comanda de cocina ────────────────────────────────────────────────────────

export interface KitchenTicketOptions {
  format?: TicketFormat;
  /** Copia pedida a mano ("Reimprimir comanda"): la cocina NO debe cocinarlo
      otra vez. Sin este aviso, un papel repetido es un plato repetido. */
  reprint?: boolean;
}

export function buildKitchenEscPos(
  order: OrderWithItems,
  restaurantName: string,
  opts: KitchenTicketOptions = {},
): Uint8Array {
  const { format = DEFAULT_TICKET_FORMAT, reprint = false } = opts;
  const b = new EscPosBuilder();
  const timeStr = ticketTime(order.created_at, format);
  const typeLabel =
    order.order_type === 'PICKUP'  ? 'PARA LLEVAR' :
    order.order_type === 'DINE_IN' ? 'EN LOCAL'    : 'DOMICILIO';

  b.init()
   .align('center');

  if (reprint) {
    b.bold(true).line('** COPIA - NO COCINAR **').bold(false);
  }

  b.bold(true).size(2).line('COCINA').size(1).bold(false)
   .bold(true).size(2).line(`#${order.order_number}`).size(1).bold(false)
   .line(`${timeStr}  ${typeLabel}`)
   .align('left')
   .sep('=');

  b.bold(true).line(order.customer_name).bold(false);

  if (order.order_type === 'DINE_IN' && order.address) {
    const waiter = order.waiter_name ? `  Mesero: ${order.waiter_name}` : '';
    b.line(`Mesa: ${order.address}${waiter}`);
  }
  if (order.order_type === 'DELIVERY' && order.address)
    b.line(`Dir: ${order.address}`);

  b.sep('-');

  for (const item of order.items) {
    b.bold(true).size(2).line(`${item.quantity}x ${item.name_snapshot}`).size(1).bold(false);
    if (item.options_snapshot?.length)
      b.line(`   > ${item.options_snapshot.map((o) => o.variant ? `${o.choice} (${o.variant})` : o.choice).join(', ')}`);
    if (item.note)
      b.bold(true).line(`   ⚠ ${item.note}`).bold(false);
  }

  if (order.notes) {
    b.sep('-').bold(true).line('NOTA:').bold(false).line(order.notes);
  }

  b.sep('=')
   .align('center');

  if (reprint) {
    b.bold(true).line(`COPIA - impresa ${ticketTime(new Date(), format)}`).bold(false);
  }

  b.line(restaurantName || 'Restaurante')
   .cut();

  return b.build();
}

// ── Recibo de caja ───────────────────────────────────────────────────────────

export interface EscPosCurrency {
  symbol: string;
  position: 'prefix' | 'suffix';
  locale: string;
}

function fmtMoney(n: number, c: EscPosCurrency): string {
  let num: string;
  try {
    num = n.toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    num = n.toFixed(2);
  }
  return c.position === 'suffix' ? `${num}${c.symbol}` : `${c.symbol}${num}`;
}

/**
 * Datos del DTE para imprimirlos en el ticket.
 *
 * Hasta ahora el ticket no mencionaba la factura por ningún lado, aunque el
 * DTE existiera: el cliente se iba con un papel que no le servía para nada
 * fiscal. Es lo mínimo que el SAT espera que lleve impreso un comprobante
 * del régimen FEL.
 */
export interface FelTicket {
  estado: string;
  /** Falso = registro interno de Leogin, SIN validez ante el SAT. */
  esFiscal: boolean;
  serie: string | null;
  numero: string | null;
  numeroAutorizacion: string | null;
  fechaCertificacion: string | null;
  receptorId: string;
  receptorNombre: string;
  montoIva: number;
  /** Enlace al verificador del SAT, ya con el documento cargado. */
  urlVerificacion: string | null;
}

/**
 * Bloque fiscal del ticket.
 *
 * Cada estado dice la verdad sobre lo que el cliente tiene en la mano. En
 * particular el registro interno se marca como NO factura: un documento con
 * serie y número que parece fiscal y no lo es, es peor que no imprimir nada.
 */
function felBlockEscPos(
  b: EscPosBuilder,
  fel: FelTicket,
  fm: (n: number) => string,
  format: TicketFormat,
): void {
  if (!fel.esFiscal) {
    b.sep('-')
     .align('center')
     .line('REGISTRO INTERNO')
     .line(`${fel.serie ?? ''}-${fel.numero ?? ''}`)
     .bold(true).line('NO ES UNA FACTURA').bold(false)
     .line('Sin validez fiscal ante el SAT')
     .align('left');
    return;
  }

  if (fel.estado === 'PENDIENTE') {
    b.sep('-')
     .align('center')
     .bold(true).line('FACTURA EN PROCESO').bold(false)
     .line('Se esta generando tu factura')
     .line('electronica. Vuelve a pedir el')
     .line('ticket en unos minutos.')
     .align('left');
    return;
  }

  if (fel.estado !== 'CERTIFICADO') return;

  b.sep('=')
   .align('center')
   .bold(true).line('FACTURA ELECTRONICA EN LINEA').bold(false)
   .align('left');

  if (fel.serie || fel.numero) b.row('Serie', `${fel.serie ?? ''}-${fel.numero ?? ''}`);
  b.row('NIT receptor', fel.receptorId);
  b.line(fel.receptorNombre);
  if (fel.montoIva > 0) b.row('IVA incluido', fm(fel.montoIva));
  if (fel.fechaCertificacion) b.row('Certificada', ticketDateTime(fel.fechaCertificacion, format));

  if (fel.numeroAutorizacion) {
    b.line('Autorizacion:').line(fel.numeroAutorizacion);
  }

  if (fel.urlVerificacion) {
    // QR + dirección en texto: si la impresora no entiende el comando de QR,
    // el cliente todavía puede consultar su factura a mano.
    b.align('center').lf(1).qr(fel.urlVerificacion, 5).lf(1)
     .line('Verifica tu factura en')
     .line('felpub.c.sat.gob.gt')
     .align('left');
  }
}

export function buildReceiptEscPos(
  order: OrderWithItems,
  currency: EscPosCurrency,
  restaurantName: string,
  format: TicketFormat = DEFAULT_TICKET_FORMAT,
  fel?: FelTicket | null,
): Uint8Array {
  const b = new EscPosBuilder();
  const fm = (n: number) => fmtMoney(n, currency);
  const dateStr = ticketDateTime(order.created_at, format);
  const typeLabel =
    order.order_type === 'PICKUP'  ? 'Para llevar' :
    order.order_type === 'DINE_IN' ? 'En local'    : 'Domicilio';

  b.init()
   .align('center')
   .bold(true).line(restaurantName || 'Restaurante').bold(false)
   .bold(true).line(`#${order.order_number}`).bold(false)
   .line(dateStr)
   .line(typeLabel)
   .align('left')
   .sep('-');

  b.line(order.customer_name);
  if (order.customer_phone) b.line(order.customer_phone);
  if (order.order_type === 'DELIVERY' && order.address) b.line(order.address);
  if (order.order_type === 'DINE_IN' && order.address)  b.line(`Mesa: ${order.address}`);

  b.sep('-');

  for (const item of order.items) {
    b.row(`${item.quantity}x ${item.name_snapshot}`, fm(Number(item.subtotal)));
    if (item.options_snapshot?.length)
      b.line(`   ${item.options_snapshot.map((o) => o.variant ? `${o.choice} (${o.variant})` : o.choice).join(', ')}`);
    if (item.note)
      b.line(`   Nota: ${item.note}`);
  }

  b.sep('-');

  if (Number(order.delivery_fee) > 0) b.row('Envio', fm(Number(order.delivery_fee)));
  if (Number(order.tip) > 0)         b.row('Propina', fm(Number(order.tip)));
  if (Number(order.discount) > 0) {
    const label = `Descuento${order.coupon_code ? ` (${order.coupon_code})` : ''}`;
    b.row(label, `-${fm(Number(order.discount))}`);
  }
  if (Number(order.loyalty_discount) > 0) {
    b.row(`Puntos (${Number(order.loyalty_points_redeemed)})`, `-${fm(Number(order.loyalty_discount))}`);
  }

  b.sep('=')
   .bold(true).row('TOTAL', fm(Number(order.total))).bold(false)
   .sep('-');

  if (order.order_type !== 'DINE_IN' || order.status === 'DELIVERED') {
    b.line(labelOf(order.payment_method));
    if (countsAsCash(order.payment_method) && order.cash_amount && order.cash_amount > 0) {
      const change = Number(order.cash_amount) - Number(order.total);
      b.line(`Paga: ${fm(Number(order.cash_amount))}  Cambio: ${fm(change)}`);
    }
  }

  if (order.notes) b.line(`Nota: ${order.notes}`);

  if (fel) felBlockEscPos(b, fel, fm, format);

  b.align('center')
   .sep('-')
   .line('Gracias por su preferencia')
   .cut();

  return b.build();
}

// ── Cuenta de mesa / dividir cuenta ──────────────────────────────────────────

export interface SplitTicketLine {
  quantity: number;
  name: string;
  options: string | null;
  amount: number;
  /** Si la línea se comparte, entre cuántos (para imprimir "compartido /3"). */
  sharedWith?: number;
}

/**
 * Ticket de la cuenta de UNA persona de la mesa (o de la mesa completa cuando
 * `personLabel` es null). No es un recibo fiscal ni cierra el pedido: es el
 * papel que el mesero le deja a cada comensal para que sepa cuánto poner.
 */
export function buildSplitBillEscPos(input: {
  restaurantName: string;
  tableNumber: number;
  personLabel: string | null;
  /** "Persona 2 de 4" — contexto para que nadie pague dos veces lo mismo. */
  positionLabel: string | null;
  lines: SplitTicketLine[];
  items: number;
  extras: number;
  total: number;
  extrasLabel: string;
  currency: EscPosCurrency;
  format?: TicketFormat;
}): Uint8Array {
  const b = new EscPosBuilder();
  const fm = (n: number) => fmtMoney(n, input.currency);
  const dateStr = ticketDateTime(new Date(), input.format ?? DEFAULT_TICKET_FORMAT);

  b.init()
   .align('center')
   .bold(true).line(input.restaurantName || 'Restaurante').bold(false)
   .line(`Mesa ${input.tableNumber}`)
   .line(dateStr);

  if (input.personLabel) {
    b.lf()
     .size(2).bold(true).line(input.personLabel).bold(false).size(1);
    if (input.positionLabel) b.line(input.positionLabel);
  } else {
    b.lf().bold(true).line('CUENTA DE LA MESA').bold(false);
  }

  b.align('left').sep('-');

  if (input.lines.length === 0) {
    b.line('(sin platos asignados)');
  }
  for (const l of input.lines) {
    b.row(`${l.quantity}x ${l.name}`, fm(l.amount));
    if (l.options) b.line(`   ${l.options}`);
    if (l.sharedWith && l.sharedWith > 1) b.line(`   compartido entre ${l.sharedWith}`);
  }

  b.sep('-')
   .row('Consumo', fm(input.items));
  // Un solo renglón para propina/envío/descuentos: en un ticket de 42 columnas
  // desglosarlos por persona confunde más de lo que aclara — el desglose fino
  // está en pantalla y en el recibo del pedido.
  if (round2(input.extras) !== 0) b.row(input.extrasLabel, fm(input.extras));

  b.sep('=')
   .size(2).bold(true).row('TOTAL', fm(input.total), 21).bold(false).size(1)
   .sep('-')
   .align('center')
   .line(input.personLabel ? 'Parte de la cuenta de la mesa' : 'Cuenta completa de la mesa')
   .line('Gracias por su preferencia')
   .cut();

  return b.build();
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Tickets de prueba ────────────────────────────────────────────────────────

export function buildTestKitchenEscPos(format: TicketFormat = DEFAULT_TICKET_FORMAT): Uint8Array {
  const b = new EscPosBuilder();
  const now = ticketTime(new Date(), format);

  b.init()
   .align('center')
   .bold(true).size(2).line('COCINA').size(1).bold(false)
   .bold(true).size(2).line('#TEST').size(1).bold(false)
   .line(`${now}  EN LOCAL`)
   .align('left').sep('=')
   .bold(true).line('Prueba de impresion').bold(false)
   .line('Mesa: 5')
   .sep('-')
   .bold(true).size(2).line('2x Hamburguesa Clasica').size(1).bold(false)
   .line('   > Sin cebolla, Extra queso')
   .bold(true).size(2).line('1x Papas fritas').size(1).bold(false)
   .sep('-')
   .bold(true).line('NOTA:').bold(false)
   .line('Sin gluten - alergia severa')
   .sep('=')
   .align('center').line('Leogin - Prueba')
   .cut();

  return b.build();
}

export function buildTestReceiptEscPos(format: TicketFormat = DEFAULT_TICKET_FORMAT): Uint8Array {
  const b = new EscPosBuilder();
  const now = ticketDateTime(new Date(), format);

  b.init()
   .align('center')
   .bold(true).line('Restaurante Demo').bold(false)
   .bold(true).line('#TEST').bold(false)
   .line(now)
   .align('left').sep('-')
   .line('Cliente de prueba')
   .sep('-')
   .row('2x Hamburguesa Clasica', 'Q120.00')
   .row('1x Papas fritas', 'Q35.00')
   .sep('=')
   .bold(true).row('TOTAL', 'Q155.00').bold(false)
   .sep('-')
   .line('Efectivo')
   .line('Paga: Q200.00  Cambio: Q45.00')
   .align('center').sep('-')
   .line('Gracias por su preferencia')
   .cut();

  return b.build();
}
