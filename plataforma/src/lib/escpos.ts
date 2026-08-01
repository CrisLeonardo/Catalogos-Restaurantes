// Codificación ESC/POS para impresoras térmicas POS (Epson, 3Nstar, Star, etc.)
// Genera Uint8Array listo para enviar vía Web USB o QZ Tray en modo raw.

import type { OrderWithItems } from '@/lib/db/orders';

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

export function buildReceiptEscPos(
  order: OrderWithItems,
  currency: EscPosCurrency,
  restaurantName: string,
  format: TicketFormat = DEFAULT_TICKET_FORMAT,
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

  if (order.order_type !== 'DINE_IN') {
    const method = order.payment_method === 'CARD' ? 'Tarjeta al recibir' : 'Efectivo';
    b.line(method);
    if (order.payment_method !== 'CARD' && order.cash_amount && order.cash_amount > 0) {
      const change = Number(order.cash_amount) - Number(order.total);
      b.line(`Paga: ${fm(Number(order.cash_amount))}  Cambio: ${fm(change)}`);
    }
  }

  if (order.notes) b.line(`Nota: ${order.notes}`);

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
