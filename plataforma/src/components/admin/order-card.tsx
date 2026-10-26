'use client';

import { useTransition, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/icons';
import { labelOf, countsAsCash } from '@/lib/payment-method';
import { updateOrderStatus, printReceiptViaAgent, reprintKitchenTicket } from '@/lib/actions/orders';
import { remainingQuantity, type OrderWithItems } from '@/lib/db/orders';
import { printTicket, isKitchenAutoPrintEnabled, markKitchenPrinted, hasPrinterConfigured } from '@/lib/printing';
import { buildKitchenEscPos, buildReceiptEscPos, ticketTime, ticketDateTime, type TicketFormat } from '@/lib/escpos';
import VoidOrderDialog from '@/components/admin/void-order-dialog';
import {
  STATUS_LABEL, STATUS_CHIP, nextStatus, nextLabel, isCardTerminal,
  stageClock, fmtElapsed, clockChipClass,
} from '@/lib/order-status';
import { sourceBadge } from '@/lib/order-source';
import { assignDriver } from '@/lib/actions/drivers';
import { esHoy } from '@/lib/dates';
import { shortOrderNumber } from '@/lib/order-number';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fmtCurrency, type PanelCurrency } from '@/lib/money';

const OrderLocationMap = dynamic(() => import('./order-location-map'), { ssr: false });

/** Moneda del restaurante (viene del tema resuelto en el servidor). */
export type { PanelCurrency };

const money = (n: number, c: PanelCurrency): string => fmtCurrency(n, c);

/* ── Origen del pedido ────────────────────────────────────────
   El dueño necesita distinguir de un vistazo si lo tomó un mesero, si el
   comensal lo pidió con el QR de su mesa o si entró por internet.

   El canal externo (migración 101) manda sobre todo lo demás: si el pedido
   llegó por WhatsApp o por una plataforma, eso es lo que hay que ver — que
   nadie del local lo escribió. "En línea" a secas ocultaría justo ese dato. */
function originLabel(order: OrderWithItems): { icon: string; text: string } {
  const channel = sourceBadge(order.source);
  if (channel) return channel;
  if (order.waiter_name) return { icon: 'userPlus', text: order.waiter_name };
  if (order.order_type === 'DINE_IN') return { icon: 'grid', text: 'QR en mesa' };
  return { icon: 'globe', text: 'En línea' };
}

function typeLabel(order: OrderWithItems): { icon: string; text: string } {
  if (order.order_type === 'PICKUP')  return { icon: 'bag', text: 'Para llevar' };
  if (order.order_type === 'DINE_IN') return { icon: 'utensils', text: 'En local' };
  return { icon: 'truck', text: 'Domicilio' };
}

function buildKitchenHtml(order: OrderWithItems, restaurantName: string, format: TicketFormat): string {
  const orderTypeLabel =
    order.order_type === 'PICKUP'  ? 'Para llevar' :
    order.order_type === 'DINE_IN' ? 'En local'    : 'A domicilio';

  const timeStr = ticketTime(order.created_at, format);

  const itemsHtml = order.items.map((item) => {
    const opts = item.options_snapshot?.length
      ? `<div class="opts">– ${item.options_snapshot.map((o) => o.variant ? `${o.choice} (${o.variant})` : o.choice).join(' · ')}</div>`
      : '';
    const itemNote = item.note
      ? `<div class="item-note">⚠ ${item.note}</div>`
      : '';
    return `
      <div class="row">
        <span class="qty">${item.quantity}×</span>
        <span class="item">${item.name_snapshot}</span>
      </div>${opts}${itemNote}`;
  }).join('');

  const addressHtml = (() => {
    if (order.order_type === 'DELIVERY' && order.address)
      return `<div class="meta">📍 ${order.address}${order.delivery_zone ? ` · ${order.delivery_zone}` : ''}</div>`;
    if (order.order_type === 'DINE_IN' && order.address)
      return `<div class="meta">🪑 ${order.address}${order.waiter_name ? ` · Mesero: ${order.waiter_name}` : ''}</div>`;
    return '';
  })();

  const notesHtml = order.notes
    ? `<div class="notes"><div class="notes-label">⚠ Nota especial</div>${order.notes}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comanda ${order.order_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 14px; color: #000; background: #fff; width: 80mm; margin: 0 auto; padding: 6mm 4mm; }
  .header { text-align: center; border: 3px solid #000; padding: 8px; margin-bottom: 10px; }
  .kitchen-label { font-size: 28px; font-weight: 900; letter-spacing: 4px; }
  .order-num { font-size: 40px; font-weight: 900; letter-spacing: 2px; margin: 4px 0; }
  .sep { border: none; border-top: 2px dashed #000; margin: 8px 0; }
  .sep-solid { border: none; border-top: 2px solid #000; margin: 8px 0; }
  .meta { font-size: 13px; margin: 3px 0; }
  .tag { display: inline-block; background: #000; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 13px; }
  .row { display: flex; align-items: flex-start; gap: 6px; margin: 10px 0 3px; }
  .qty { font-size: 24px; font-weight: 900; min-width: 40px; }
  .item { font-size: 20px; font-weight: 700; line-height: 1.25; }
  .opts { font-size: 13px; font-weight: 600; color: #333; padding-left: 46px; margin-bottom: 4px; line-height: 1.4; }
  .item-note { font-size: 13px; font-weight: 800; color: #000; padding-left: 46px; margin-bottom: 6px; line-height: 1.4; }
  .notes { border: 2px solid #000; padding: 7px 9px; margin-top: 10px; font-size: 15px; font-weight: 700; line-height: 1.4; }
  .notes-label { font-size: 11px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3px; }
  .footer { text-align: center; font-size: 11px; color: #888; margin-top: 12px; }
  @media print { body { width: 100%; padding: 0; } @page { margin: 4mm; size: 80mm auto; } }
</style>
</head>
<body>
<div class="header">
  <div class="kitchen-label">COCINA</div>
  <div class="order-num">${shortOrderNumber(order.order_number)}</div>
  <div class="meta">${timeStr} · <span class="tag">${orderTypeLabel}</span></div>
</div>
<div class="meta"><strong>Cliente:</strong> ${order.customer_name}</div>
${addressHtml}
<hr class="sep-solid">
${itemsHtml}
${notesHtml}
<hr class="sep">
<div class="footer">${restaurantName || 'Restaurante'}</div>
</body>
</html>`;
}

/**
 * Imprime la comanda DESDE EL NAVEGADOR (Web USB), para los locales que
 * no usan el Agente de impresión.
 *
 * Una sola vez por pedido y por dispositivo: el candado del servidor
 * (print_jobs) no cubre este camino porque aquí no hay cola que consultar —
 * el papel sale directo de esta máquina.
 */
export function printKitchenTicket(order: OrderWithItems, restaurantName: string, format: TicketFormat) {
  if (typeof window === 'undefined') return;
  if (!isKitchenAutoPrintEnabled()) return;
  // Sin impresora asignada aquí, imprimir significaría abrir una ventana del
  // navegador con el diálogo de imprimir por CADA pedido. Mejor no participar.
  if (!hasPrinterConfigured('kitchen')) return;
  if (!markKitchenPrinted(order.id)) return;
  void printTicket(
    'kitchen',
    buildKitchenHtml(order, restaurantName, format),
    () => buildKitchenEscPos(order, restaurantName, { format }),
  );
}


/** ¿Se puede decir ya cómo se pagó este pedido?
    En domicilio y para llevar se sabe desde que entra. En una mesa no se
    sabe hasta que alguien la cobra, así que solo se enseña una vez cerrada
    (`freeTable` es quien lo escribe). */
function showsPayment(order: { order_type: string; status: string }): boolean {
  return order.order_type !== 'DINE_IN' || order.status === 'DELIVERED';
}

function buildReceiptHtml(order: OrderWithItems, currency: PanelCurrency, restaurantName: string, format: TicketFormat): string {
  function fmt(n: number) { return money(n, currency); }

  const orderTypeLabel =
    order.order_type === 'PICKUP'   ? 'Para llevar' :
    order.order_type === 'DINE_IN'  ? 'En local'    : 'Domicilio';

  const dateStr = ticketDateTime(order.created_at, format);

  const itemsHtml = order.items.map((item) => {
    const opts = item.options_snapshot?.length
      ? `<div class="opts">${item.options_snapshot.map((o) => o.variant ? `${o.choice} (${o.variant})` : o.choice).join(', ')}</div>`
      : '';
    const itemNote = item.note ? `<div class="opts">Nota: ${item.note}</div>` : '';
    return `
      <tr>
        <td class="qty">${item.quantity}×</td>
        <td class="desc">${item.name_snapshot}${opts}${itemNote}</td>
        <td class="amount">${fmt(Number(item.subtotal))}</td>
      </tr>`;
  }).join('');

  const extraRows: string[] = [];
  if (Number(order.delivery_fee) > 0)
    extraRows.push(`<tr class="sub"><td colspan="2">Envío</td><td class="amount">${fmt(Number(order.delivery_fee))}</td></tr>`);
  if (Number(order.tip) > 0)
    extraRows.push(`<tr class="sub"><td colspan="2">Propina</td><td class="amount">${fmt(Number(order.tip))}</td></tr>`);
  if (Number(order.discount) > 0) {
    const couponLabel = order.coupon_code ? ` (${order.coupon_code})` : '';
    extraRows.push(`<tr class="sub discount"><td colspan="2">Descuento${couponLabel}</td><td class="amount">−${fmt(Number(order.discount))}</td></tr>`);
  }
  if (Number(order.loyalty_discount) > 0) {
    extraRows.push(`<tr class="sub discount"><td colspan="2">Puntos canjeados (${Number(order.loyalty_points_redeemed)})</td><td class="amount">−${fmt(Number(order.loyalty_discount))}</td></tr>`);
  }

  const paymentHtml = showsPayment(order) ? (() => {
    const method = labelOf(order.payment_method);
    let changeHtml = '';
    if (countsAsCash(order.payment_method) && order.cash_amount && order.cash_amount > 0) {
      const change = Number(order.cash_amount) - Number(order.total);
      changeHtml = `<p class="small">Paga con ${fmt(Number(order.cash_amount))} · Cambio: ${fmt(change)}</p>`;
    }
    return `<p class="payment">${method}</p>${changeHtml}`;
  })() : '';

  const notesHtml = order.notes
    ? `<div class="notes">Nota: ${order.notes}</div>`
    : '';

  const addressHtml = (() => {
    if (order.order_type === 'DELIVERY' && order.address)
      return `<p class="small">${order.address}${order.delivery_zone ? ` · ${order.delivery_zone}` : ''}</p>`;
    if (order.order_type === 'DINE_IN' && order.address)
      return `<p class="small">${order.address}</p>`;
    return '';
  })();

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo ${order.order_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #000;
    background: #fff;
    width: 80mm;
    margin: 0 auto;
    padding: 8mm 4mm;
  }
  .center { text-align: center; }
  .restaurant { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
  .order-num { font-size: 22px; font-weight: bold; letter-spacing: 2px; margin: 6px 0 2px; }
  .date { font-size: 10px; color: #555; margin-bottom: 6px; }
  .sep { border: none; border-top: 1px dashed #999; margin: 7px 0; }
  .label { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: .5px; }
  .value { font-size: 12px; font-weight: 600; }
  .small { font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .qty { width: 22px; vertical-align: top; padding-top: 2px; font-size: 11px; }
  .desc { padding: 0 4px; line-height: 1.35; }
  .opts { font-size: 10px; color: #666; }
  .amount { text-align: right; white-space: nowrap; font-weight: 600; vertical-align: top; padding-top: 2px; }
  tr.sub td { font-size: 11px; padding-top: 2px; }
  tr.discount td { color: #008800; }
  .total-row { font-size: 15px; font-weight: bold; border-top: 1px solid #000; padding-top: 5px; margin-top: 4px; display: flex; justify-content: space-between; }
  .payment { font-size: 12px; font-weight: 600; margin-top: 5px; }
  .notes { font-size: 11px; color: #333; font-style: italic; margin-top: 4px; padding: 4px 0; border-top: 1px dashed #ccc; }
  .footer { text-align: center; font-size: 10px; color: #888; margin-top: 10px; }
  @media print {
    body { width: 100%; padding: 0; }
    @page { margin: 4mm; size: 80mm auto; }
  }
</style>
</head>
<body>
<div class="center">
  <div class="restaurant">${restaurantName || 'Restaurante'}</div>
  <div class="order-num">#${order.order_number}</div>
  <div class="date">${dateStr}</div>
</div>
<hr class="sep">
<div class="label">Cliente</div>
<div class="value">${order.customer_name}</div>
<div class="small">${order.customer_phone}</div>
<div class="label" style="margin-top:5px">Tipo</div>
<div class="value">${orderTypeLabel}</div>
${addressHtml}
<hr class="sep">
<table>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>
<table>
  <tbody>
    ${extraRows.join('')}
  </tbody>
</table>
<hr class="sep">
<div class="total-row">
  <span>TOTAL</span>
  <span>${fmt(Number(order.total))}</span>
</div>
${paymentHtml}
${notesHtml}
<div class="footer">¡Gracias por su preferencia!</div>
</body>
</html>`;
}

export default function OrderCard({
  order,
  currency,
  restaurantName,
  ticketFormat,
  now = null,
  kitchenYellowMin = 10,
  kitchenRedMin = 20,
  agentKitchen = false,
  agentReceipt = false,
  fallosDeImpresion = {},
  drivers = [],
  restaurantId,
}: {
  order: OrderWithItems;
  currency: PanelCurrency;
  restaurantName: string;
  /** Zona horaria + locale del restaurante — la hora del ticket es la del local. */
  ticketFormat: TicketFormat;
  /** Reloj compartido del panel (null antes de hidratar: evita mismatch SSR). */
  now?: number | null;
  kitchenYellowMin?: number;
  kitchenRedMin?: number;
  /** El Agente Leogin imprime la comanda (servidor) → no imprimir también desde el navegador. */
  agentKitchen?: boolean;
  /** Estaciones que no imprimieron, por id de pedido (M-07). */
  fallosDeImpresion?: Record<string, { stationId: string; stationName: string }[]>;
  /** El Agente Leogin imprime el recibo (servidor) → el botón encola en vez de usar el navegador. */
  agentReceipt?: boolean;
  /** Repartidores activos (Fase 2). Vacío o ausente = no se ofrece asignar:
   *  el panel del mesero y el diálogo de anulación reusan esta tarjeta y ahí
   *  no se reparte nada. */
  drivers?: { id: string; nombre: string }[];
  restaurantId?: string;
}) {
  const [isPending, start] = useTransition();
  const [mapOpen, setMapOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<'order' | { id: string; name: string; remainingQty: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [printMsg, setPrintMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [printing, setPrinting] = useState<'receipt' | 'kitchen' | null>(null);
  const next = nextStatus(order.status, order.order_type);

  function flashPrint(text: string, ok: boolean) {
    setPrintMsg({ text, ok });
    setTimeout(() => setPrintMsg(null), 4500);
  }

  async function handlePrintReceipt() {
    setPrintMsg(null);
    // Con agente: el recibo se genera e imprime en el servidor (funciona en móvil).
    if (agentReceipt) {
      setPrinting('receipt');
      const res = await printReceiptViaAgent(order.id);
      setPrinting(null);
      // Antes esto era `void printReceiptViaAgent(...)`: sin impresora de caja
      // asignada no pasaba nada y nadie sabía por qué.
      flashPrint(res.error ?? 'Recibo enviado a la impresora de caja.', !res.error);
      return;
    }
    void printTicket(
      'receipt',
      buildReceiptHtml(order, currency, restaurantName, ticketFormat),
      () => buildReceiptEscPos(order, currency, restaurantName, ticketFormat),
    );
  }

  /** Copia de la comanda, marcada "NO COCINAR" para que no salga el plato dos veces.
   *  Con `stationId` reintenta SOLO esa estación: si la barra no imprimió,
   *  volver a sacar la comanda entera por la cocina pondría a la plancha a
   *  cocinar dos veces lo mismo. */
  async function handleReprintKitchen(stationId?: string, stationName?: string) {
    setPrintMsg(null);
    setPrinting('kitchen');
    const res = await reprintKitchenTicket(order.id, stationId);
    setPrinting(null);
    flashPrint(
      res.error ?? (stationName ? `Comanda reenviada a ${stationName}.` : 'Copia de la comanda enviada a cocina.'),
      !res.error,
    );
  }

  /* Estaciones que no lograron imprimir este pedido (M-07). Sin este aviso,
     repartir la comanda cambiaría un fallo RUIDOSO —hoy no sale ningún
     papel y todos se enteran en dos minutos— por uno callado: la cocina
     imprime, la barra no, y nadie lo sabe hasta que el cliente pregunta por
     su cerveza. */
  const fallos = fallosDeImpresion[order.id] ?? [];

  async function handleAdvance() {
    if (!next) return;
    setActionError(null);
    // La comanda por navegador NO se dispara aquí: la imprime el panel al ver
    // que el pedido entró a cocina, venga de donde venga (este botón, la
    // pantalla de cocina, un mesero o la cola offline). Ver OrdersPanel.
    start(async () => {
      const res = await updateOrderStatus(order.id, next);
      if (res.error) setActionError(res.error);
    });
  }

  const isTerminal = isCardTerminal(order.status);

  const clock = stageClock(order, kitchenYellowMin, kitchenRedMin);
  const elapsedMs = clock && now != null ? now - new Date(clock.since).getTime() : 0;
  const elapsedMin = elapsedMs / 60000;
  /* UN solo reloj, con color por umbral (PED-02, maqueta D-2): verde a
     tiempo, ámbar al pasar el aviso, rojo al pasar el límite. Antes el
     tiempo salía tres veces (encabezado del grupo, chip y banda) y todo se
     teñía de rojo aunque fuera un aviso: fatiga de alarma. */
  const clockClass = clock && now != null
    ? (elapsedMin < clock.yellowMin ? 'chip-ok' : clockChipClass(elapsedMin, clock))
    : 'chip-neutral';
  /* La alarma de verdad —banda y borde rojos— solo al DOBLE del límite. */
  const isAlarm = clock != null && now != null && elapsedMin >= clock.redMin * 2;

  const origin = originLabel(order);
  const type = typeLabel(order);
  /* El estado lo dice el grupo en el que está la tarjeta («Por enviar a
     cocina», «En cocina», «Listos»): repetido en un chip era ruido. Se
     queda donde el grupo no lo dice: en camino, servido, cerrado. */
  const showStatus = !['NEW', 'PREP', 'READY'].includes(order.status);
  /* En un pedido de mesa sin nombre, nombre y dirección son los dos
     «Mesa 4»: se dice una vez. */
  const showAddress = !!order.address && (order.order_type === 'DELIVERY' || order.address !== order.customer_name);
  const entro = esHoy(order.created_at, ticketFormat.timezone)
    ? `entró a las ${ticketTime(order.created_at, ticketFormat)}`
    : `entró el ${ticketDateTime(order.created_at, ticketFormat)}`;

  return (
    <div
      // Cae con un rebote al llegar y, si es nuevo, se ilumina un instante
      // (`.adm-pedido` en admin.css).
      className="adm-pedido"
      data-estado={order.status}
      style={{
        borderRadius: 'var(--radius-lg)',
        /* La misma ficha que el resto del panel (T-12): el gris al 4 % del
           texto se veía apagado sobre el fondo gris en modo claro. */
        background: 'var(--adm-card, color-mix(in srgb, var(--u-text) 4%, transparent))',
        border: '1px solid var(--adm-border, var(--u-hair))',
        // Un pedido que se pasó del tiempo se ve distinto DESDE LEJOS: el borde
        // completo se tiñe. En una barra llena, nadie lee un chip pequeño.
        boxShadow: isAlarm ? '0 0 0 1.5px var(--c-danger-line)' : 'var(--adm-shadow-xs, none)',
        padding: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
        opacity: isTerminal ? 0.72 : 1,
        transition: 'opacity 200ms, box-shadow 200ms',
      }}
    >
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--u-text)', margin: 0, lineHeight: 1.2 }}>
              {order.customer_name}
            </h3>
            <span className="t-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--u-text-4)' }} title={order.order_number}>
              {shortOrderNumber(order.order_number)}
            </span>
            {showStatus && <span className={`chip ${STATUS_CHIP[order.status]}`}>{STATUS_LABEL[order.status]}</span>}
            {/* Cronómetro de la etapa actual: en el renglón del título, así
                los datos de abajo usan todo el ancho de la tarjeta. */}
            {clock && (
              <span
                className={`chip ${clockClass}`}
                title={`${clock.label} desde ${ticketTime(clock.since, ticketFormat)}`}
                style={{ flexShrink: 0, marginLeft: 'auto', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}
              >
                <Icon name="clock" size={11} />
                {now == null ? '—' : fmtElapsed(elapsedMs)}
              </span>
            )}
          </div>
          {/* Separados por espacio y no por «·»: si el renglón se parte, no
              queda un punto colgando al final (cada dato ya lleva icono). */}
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 4, display: 'flex', alignItems: 'center', columnGap: 12, rowGap: 2, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name={type.icon} size={12} style={{ display: 'inline' }} />
              {type.text}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name={origin.icon} size={12} style={{ display: 'inline' }} />
              {origin.text}
            </span>
            {order.customer_phone && order.customer_phone !== '00000000' && (
              <>
                <a
                  href={`tel:${order.customer_phone}`}
                  className="tap44"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'inherit', textDecoration: 'none' }}
                >
                  <Icon name="phone" size={12} style={{ display: 'inline' }} /> {order.customer_phone}
                </a>
              </>
            )}
            <span style={{ whiteSpace: 'nowrap' }}>{entro}</span>
          </p>
          {showAddress && (
            <p style={{ fontSize: 12, color: 'var(--u-text-2)', marginTop: 3, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
              <Icon name={order.order_type === 'DELIVERY' ? 'mapPin' : 'grid'} size={12} style={{ display: 'inline', flexShrink: 0, marginTop: 2 }} />
              <span>{order.address}{order.delivery_zone ? ` · ${order.delivery_zone}` : ''}</span>
            </p>
          )}
          {order.synced_from_hub && (
            <span
              title="Este pedido se tomó sin conexión (hub local) y se sincronizó al volver la señal."
              className="chip chip-warn"
              style={{ marginTop: 5 }}
            >
              <Icon name="plug" size={11} /> Tomado sin conexión
            </span>
          )}

          {/* Asignación de repartidor (Fase 2). Solo a domicilio, solo mientras
              el pedido sigue vivo y solo si el restaurante tiene repartidores. */}
          {drivers.length > 0 && restaurantId && order.order_type === 'DELIVERY'
            && order.status !== 'DELIVERED' && order.status !== 'CANCEL' && (
            <form action={assignDriver} style={{ marginTop: 8 }}>
              <input type="hidden" name="restaurantId" value={restaurantId} />
              <input type="hidden" name="orderId" value={order.id} />
              <label
                htmlFor={`drv-${order.id}`}
                style={{ fontSize: 11, color: 'var(--u-text-4)', display: 'block', marginBottom: 4 }}
              >
                Repartidor
              </label>
              <select
                id={`drv-${order.id}`}
                name="driverId"
                defaultValue={order.driver_id ?? ''}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="adm-field adm-field-sm adm-field-auto"
                style={{ maxWidth: '100%' }}
              >
                <option value="">Sin asignar</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </form>
          )}
        </div>

      </div>

      {clock && isAlarm && (
        <div className="note note-danger">
          <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Lleva {fmtElapsed(elapsedMs)} {clock.label}: el doble de lo normal.</span>
        </div>
      )}

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--u-hair)', paddingTop: 8 }}>
        {order.items.map((item) => {
          const remaining = remainingQuantity(item, order.voids ?? []);
          const voidedQty = item.quantity - remaining;
          const unitPrice = item.quantity > 0 ? Number(item.subtotal) / item.quantity : 0;
          return (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--u-text-2)', minWidth: 0 }}>
                {remaining}× {item.name_snapshot}
                {voidedQty > 0 && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--c-danger)', marginTop: 1, fontWeight: 600 }}>
                    {voidedQty} anulada{voidedQty === 1 ? '' : 's'}
                  </span>
                )}
                {item.options_snapshot && item.options_snapshot.length > 0 && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--u-text-3)', marginTop: 1 }}>
                    {item.options_snapshot.map((o) => o.variant ? `${o.choice} (${o.variant})` : o.choice).join(' · ')}
                  </span>
                )}
                {item.note && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--c-warn)', marginTop: 1, fontWeight: 700 }}>
                    ⚠ {item.note}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                <span className="t-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text)' }}>
                  {money(unitPrice * remaining, currency)}
                </span>
                {!isTerminal && remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => setVoidTarget({ id: item.id, name: item.name_snapshot, remainingQty: remaining })}
                    disabled={isPending}
                    title="Anular este plato"
                    aria-label={`Anular ${item.name_snapshot}`}
                    className="press chip-danger order-void-x tap44"
                    style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', borderWidth: 1, borderStyle: 'solid', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                  >
                    <Icon name="x" size={11} />
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {Number(order.delivery_fee) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>Envío</span>
            <span style={{ fontSize: 12, color: 'var(--u-text-2)' }}>
              {money(Number(order.delivery_fee), currency)}
            </span>
          </div>
        )}
        {Number(order.tip) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>Propina</span>
            <span style={{ fontSize: 12, color: 'var(--u-text-2)' }}>
              {money(Number(order.tip), currency)}
            </span>
          </div>
        )}
        {Number(order.discount) > 0 && (
          <div className="note note-ok" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '5px 9px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="tag" size={12} style={{ display: 'inline' }} /> Cupón
              {order.coupon_code && (
                <span className="t-mono" style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--c-ok-bg)' }}>
                  {order.coupon_code}
                </span>
              )}
            </span>
            <span style={{ fontWeight: 700 }}>−{money(Number(order.discount), currency)}</span>
          </div>
        )}
        {Number(order.loyalty_discount) > 0 && (
          <div className="note note-ok" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '5px 9px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="star" size={12} style={{ display: 'inline' }} /> {Number(order.loyalty_points_redeemed)} puntos canjeados
            </span>
            <span style={{ fontWeight: 700 }}>−{money(Number(order.loyalty_discount), currency)}</span>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--u-hair)', marginTop: 4, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, color: 'var(--u-text-3)' }}>Total</span>
          <div style={{ textAlign: 'right' }}>
            {(Number(order.discount) > 0 || Number(order.loyalty_discount) > 0) && (
              <div style={{ fontSize: 11, color: 'var(--u-text-4)', textDecoration: 'line-through', marginBottom: 1 }}>
                {money(Number(order.total) + Number(order.discount) + Number(order.loyalty_discount), currency)}
              </div>
            )}
            <span className="t-mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--u-text)' }}>
              {money(Number(order.total), currency)}
            </span>
          </div>
        </div>
        {/* Método de pago. En una mesa no se sabe hasta que se cobra, así
            que solo se enseña una vez cerrada (ver freeTable). */}
        {showsPayment(order) && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className={`chip ${countsAsCash(order.payment_method) ? 'chip-ok' : 'chip-alt'}`} style={{ alignSelf: 'flex-start' }}>
              <Icon name={countsAsCash(order.payment_method) ? 'banknote' : 'creditCard'} size={12} />
              {labelOf(order.payment_method)}
            </span>
            {countsAsCash(order.payment_method) && order.cash_amount != null && order.cash_amount > 0 && (
              <p style={{ fontSize: 11, color: 'var(--u-text-3)', margin: 0 }}>
                Paga con <strong style={{ color: 'var(--u-text-2)' }}>{money(Number(order.cash_amount), currency)}</strong>
                {' · '}cambio: <strong style={{ color: 'var(--u-text-2)' }}>{money(Number(order.cash_amount) - Number(order.total), currency)}</strong>
              </p>
            )}
          </div>
        )}
        {order.notes && (
          <div className="note note-warn" style={{ marginTop: 4 }}>
            <Icon name="edit" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{order.notes}</span>
          </div>
        )}
      </div>

      {/* Mapa de entrega (solo DELIVERY con coordenadas) */}
      {order.order_type === 'DELIVERY' && order.delivery_lat && order.delivery_lng && (
        <div>
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            className="press btn-tinted chip-info"
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)' }}
          >
            <Icon name="mapPin" size={13} /> {mapOpen ? 'Ocultar mapa' : 'Ver ubicación del cliente'}
          </button>
          {mapOpen && (
            <div style={{ marginTop: 8 }}>
              <OrderLocationMap lat={order.delivery_lat} lng={order.delivery_lng} />
            </div>
          )}
        </div>
      )}

      {actionError && (
        <div className="note note-danger">
          <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {actionError}
        </div>
      )}
      {printMsg && (
        <div className={`note ${printMsg.ok ? 'note-ok' : 'note-danger'}`}>
          <Icon name={printMsg.ok ? 'check' : 'alertCircle'} size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {printMsg.text}
        </div>
      )}

      {/* Acciones (PED-02): UN botón principal —lo que toca ahora— y «⋯» con
          lo que se usa de vez en cuando (recibo, copia de comanda) y anular,
          que es destructivo y no debe estar a un dedo del principal. */}
      {!isTerminal && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {next && (
            <button
              onClick={handleAdvance}
              disabled={isPending}
              className="press btn-accent"
              style={{
                flex: 1, minHeight: 44, padding: '0 12px',
                borderRadius: 'var(--radius-lg)',
                fontWeight: 700, fontSize: 14,
                cursor: isPending ? 'not-allowed' : 'pointer',
                border: 'none',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? '…' : nextLabel(order.status, order.order_type)}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Más acciones del pedido ${shortOrderNumber(order.order_number)}`}
              className="press"
              disabled={isPending}
              style={{
                width: 44, height: 44, flexShrink: 0, borderRadius: 'var(--radius-lg)',
                display: 'grid', placeItems: 'center', cursor: 'pointer',
                background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                border: '1px solid var(--u-hair)', color: 'var(--u-text)',
              }}
            >
              <Icon name="more" size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handlePrintReceipt} disabled={printing !== null} className="min-h-11">
                <Icon name="print" size={15} /> {printing === 'receipt' ? 'Enviando…' : 'Recibo'}
              </DropdownMenuItem>
              {agentKitchen && (
                <DropdownMenuItem onClick={() => handleReprintKitchen()} disabled={printing !== null} className="min-h-11">
                  <Icon name="print" size={15} /> {printing === 'kitchen' ? 'Enviando…' : 'Copia de comanda'}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setVoidTarget('order')} variant="destructive" className="min-h-11">
                <Icon name="x" size={15} /> Anular pedido
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Una estación que no imprimió, con su remedio al lado: el aviso y
          el botón que lo arregla tienen que estar en el mismo sitio. */}
      {fallos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fallos.map((f) => (
            <div
              key={f.stationId}
              className="chip-danger"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 'var(--radius-lg)',
                fontSize: 12, fontWeight: 600,
              }}
            >
              <Icon name="alertCircle" size={14} />
              <span style={{ flex: 1, minWidth: 0 }}>{f.stationName}: no imprimió</span>
              <button
                type="button"
                onClick={() => handleReprintKitchen(f.stationId, f.stationName)}
                disabled={printing !== null}
                className="press"
                style={{
                  padding: '4px 10px', borderRadius: 'var(--radius-md)',
                  fontSize: 12, fontWeight: 700, cursor: printing ? 'wait' : 'pointer',
                  background: 'color-mix(in srgb, currentColor 12%, transparent)',
                  border: '1px solid color-mix(in srgb, currentColor 35%, transparent)',
                  color: 'inherit',
                }}
              >
                {printing === 'kitchen' ? 'Enviando…' : 'Reintentar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Impresión de un pedido ya cerrado (en uno vivo va en el «⋯»). */}
      {isTerminal && (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={handlePrintReceipt}
          disabled={printing !== null}
          className="press"
          style={{
            flex: 1, padding: '8px 10px',
            borderRadius: 'var(--radius-lg)',
            fontWeight: 600, fontSize: 12,
            cursor: printing ? 'wait' : 'pointer',
            background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
            border: '1px solid var(--u-hair)',
            color: 'var(--u-text-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Icon name="print" size={14} /> {printing === 'receipt' ? 'Enviando…' : 'Recibo'}
        </button>
        {agentKitchen && (
          <button
            type="button"
            onClick={() => handleReprintKitchen()}
            disabled={printing !== null}
            title="Vuelve a sacar la comanda en cocina, marcada como COPIA para que no la preparen dos veces."
            className="press"
            style={{
              flex: 1, padding: '8px 10px',
              borderRadius: 'var(--radius-lg)',
              fontWeight: 600, fontSize: 12,
              cursor: printing ? 'wait' : 'pointer',
              background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
              border: '1px solid var(--u-hair)',
              color: 'var(--u-text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="print" size={14} /> {printing === 'kitchen' ? 'Enviando…' : 'Copia de comanda'}
          </button>
        )}
      </div>
      )}

      {voidTarget && (
        <VoidOrderDialog
          orderId={order.id}
          orderStatus={order.status}
          item={voidTarget === 'order' ? null : voidTarget}
          onClose={() => setVoidTarget(null)}
          onDone={() => setVoidTarget(null)}
        />
      )}
    </div>
  );
}
