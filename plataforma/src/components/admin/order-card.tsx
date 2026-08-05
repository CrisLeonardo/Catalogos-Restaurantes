'use client';

import { useTransition, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/icons';
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

const OrderLocationMap = dynamic(() => import('./order-location-map'), { ssr: false });

/** Moneda del restaurante (viene del tema resuelto en el servidor). */
export interface PanelCurrency {
  symbol: string;
  position: 'prefix' | 'suffix';
  locale: string;
}

function money(n: number, c: PanelCurrency): string {
  let num: string;
  try {
    num = n.toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    num = n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return c.position === 'suffix' ? `${num}${c.symbol}` : `${c.symbol}${num}`;
}

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
  <div class="order-num">#${order.order_number}</div>
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
 * Imprime la comanda DESDE EL NAVEGADOR (QZ Tray / USB), para los locales que
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

  const paymentHtml = order.order_type !== 'DINE_IN' ? (() => {
    const method = order.payment_method === 'CARD' ? 'Tarjeta al recibir' : 'Efectivo';
    let changeHtml = '';
    if (order.payment_method !== 'CARD' && order.cash_amount && order.cash_amount > 0) {
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
  /** El Agente Leogin imprime el recibo (servidor) → el botón encola en vez de usar el navegador. */
  agentReceipt?: boolean;
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

  /** Copia de la comanda, marcada "NO COCINAR" para que no salga el plato dos veces. */
  async function handleReprintKitchen() {
    setPrintMsg(null);
    setPrinting('kitchen');
    const res = await reprintKitchenTicket(order.id);
    setPrinting(null);
    flashPrint(res.error ?? 'Copia de la comanda enviada a cocina.', !res.error);
  }

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
  const clockClass = clock && now != null ? clockChipClass(elapsedMin, clock) : 'chip-neutral';
  const isLate = clock != null && now != null && elapsedMin >= clock.redMin;

  const origin = originLabel(order);
  const type = typeLabel(order);

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
        border: '1px solid var(--u-hair)',
        // Un pedido que se pasó del tiempo se ve distinto DESDE LEJOS: el borde
        // completo se tiñe. En una barra llena, nadie lee un chip pequeño.
        boxShadow: isLate ? '0 0 0 1.5px var(--c-danger-line)' : 'none',
        padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: 12,
        opacity: isTerminal ? 0.72 : 1,
        transition: 'opacity 200ms, box-shadow 200ms',
      }}
    >
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span className="t-mono" style={{ fontSize: 12, color: 'var(--u-text-3)' }}>
              {order.order_number}
            </span>
            <span className={`chip ${STATUS_CHIP[order.status]}`}>{STATUS_LABEL[order.status]}</span>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginTop: 4 }}>
            {order.customer_name}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name={type.icon} size={12} style={{ display: 'inline' }} />
              {type.text}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name={origin.icon} size={12} style={{ display: 'inline' }} />
              {origin.text}
            </span>
            {order.customer_phone && order.customer_phone !== '00000000' && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <a
                  href={`tel:${order.customer_phone}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'inherit', textDecoration: 'none' }}
                >
                  <Icon name="phone" size={12} style={{ display: 'inline' }} /> {order.customer_phone}
                </a>
              </>
            )}
          </p>
          {order.address && (
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
        </div>

        {/* Cronómetro de la etapa actual */}
        {clock && (
          <span
            className={`chip ${clockClass}`}
            title={`${clock.label} desde ${ticketTime(clock.since, ticketFormat)}`}
            style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
          >
            <Icon name="clock" size={11} />
            {now == null ? '—' : fmtElapsed(elapsedMs)}
          </span>
        )}
      </div>

      {clock && now != null && elapsedMin >= clock.yellowMin && (
        <div className={`note ${elapsedMin >= clock.redMin ? 'note-danger' : 'note-warn'}`}>
          <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{fmtElapsed(elapsedMs)} {clock.label}.</span>
        </div>
      )}

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {order.items.map((item) => {
          const remaining = remainingQuantity(item, order.voids ?? []);
          const voidedQty = item.quantity - remaining;
          const unitPrice = item.quantity > 0 ? Number(item.subtotal) / item.quantity : 0;
          return (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--u-text-2)', minWidth: 0 }}>
                {remaining}× {item.name_snapshot}
                {voidedQty > 0 && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--c-danger)', marginTop: 1, fontWeight: 600 }}>
                    {voidedQty} anulada{voidedQty === 1 ? '' : 's'}
                  </span>
                )}
                {item.options_snapshot && item.options_snapshot.length > 0 && (
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 1 }}>
                    {item.options_snapshot.map((o) => o.variant ? `${o.choice} (${o.variant})` : o.choice).join(' · ')}
                  </span>
                )}
                {item.note && (
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--c-warn)', marginTop: 1, fontWeight: 700 }}>
                    ⚠ {item.note}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text)' }}>
                  {money(unitPrice * remaining, currency)}
                </span>
                {!isTerminal && remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => setVoidTarget({ id: item.id, name: item.name_snapshot, remainingQty: remaining })}
                    disabled={isPending}
                    title="Anular este plato"
                    aria-label={`Anular ${item.name_snapshot}`}
                    className="press chip-danger"
                    style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderStyle: 'solid', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
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
            <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>Envío</span>
            <span style={{ fontSize: 12.5, color: 'var(--u-text-2)' }}>
              {money(Number(order.delivery_fee), currency)}
            </span>
          </div>
        )}
        {Number(order.tip) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>Propina</span>
            <span style={{ fontSize: 12.5, color: 'var(--u-text-2)' }}>
              {money(Number(order.tip), currency)}
            </span>
          </div>
        )}
        {Number(order.discount) > 0 && (
          <div className="note note-ok" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '5px 9px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="tag" size={12} style={{ display: 'inline' }} /> Cupón
              {order.coupon_code && (
                <span className="t-mono" style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'var(--c-ok-bg)' }}>
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
          <span style={{ fontSize: 13, color: 'var(--u-text-2)' }}>Total</span>
          <div style={{ textAlign: 'right' }}>
            {(Number(order.discount) > 0 || Number(order.loyalty_discount) > 0) && (
              <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', textDecoration: 'line-through', marginBottom: 1 }}>
                {money(Number(order.total) + Number(order.discount) + Number(order.loyalty_discount), currency)}
              </div>
            )}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--u-text)' }}>
              {money(Number(order.total), currency)}
            </span>
          </div>
        </div>
        {/* Método de pago — no aplica para DINE_IN (mesero lo maneja) */}
        {order.order_type !== 'DINE_IN' && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className={`chip ${order.payment_method === 'CARD' ? 'chip-alt' : 'chip-ok'}`} style={{ alignSelf: 'flex-start' }}>
              <Icon name={order.payment_method === 'CARD' ? 'creditCard' : 'banknote'} size={12} />
              {order.payment_method === 'CARD' ? 'Tarjeta al recibir' : 'Efectivo'}
            </span>
            {order.payment_method !== 'CARD' && order.cash_amount != null && order.cash_amount > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--u-text-3)', margin: 0 }}>
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
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8 }}
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

      {/* Hora de entrada — SIEMPRE en la hora del restaurante, no la del navegador */}
      <p style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
        Entró: {ticketDateTime(order.created_at, ticketFormat)}
      </p>

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

      {/* Acciones */}
      {!isTerminal && (
        <div style={{ display: 'flex', gap: 8 }}>
          {next && (
            <button
              onClick={handleAdvance}
              disabled={isPending}
              className="press btn-accent"
              style={{
                flex: 1, padding: '11px 12px',
                borderRadius: 'var(--radius-lg)',
                fontWeight: 700, fontSize: 13,
                cursor: isPending ? 'not-allowed' : 'pointer',
                border: 'none',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? '…' : nextLabel(order.status, order.order_type)}
            </button>
          )}
          <button
            onClick={() => setVoidTarget('order')}
            disabled={isPending}
            className="press btn-tinted chip-danger"
            style={{ padding: '11px 14px', fontSize: 13 }}
          >
            Anular
          </button>
        </div>
      )}

      {/* Impresión — separada de las acciones de estado para que nadie
          confunda "imprimir" con "avanzar el pedido". */}
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
            onClick={handleReprintKitchen}
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
