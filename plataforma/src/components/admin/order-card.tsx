'use client';

import { useTransition, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/icons';
import { updateOrderStatus, printReceiptViaAgent } from '@/lib/actions/orders';
import type { OrderWithItems } from '@/lib/db/orders';
import type { OrderStatus } from '@/types';
import { printTicket, isKitchenAutoPrintEnabled } from '@/lib/printing';
import { buildKitchenEscPos, buildReceiptEscPos } from '@/lib/escpos';

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

const STATUS_LABEL: Record<OrderStatus, string> = {
  NEW:       'Nuevo',
  PREP:      'En preparación',
  READY:     'Listo',
  TRANSIT:   'En camino',
  DELIVERED: 'Entregado',
  CANCEL:    'Cancelado',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  NEW:       '#3b82f6',
  PREP:      '#f59e0b',
  READY:     '#8b5cf6',
  TRANSIT:   '#f97316',
  DELIVERED: '#22c55e',
  CANCEL:    '#6b7280',
};

function nextStatus(order: OrderWithItems): OrderStatus | null {
  const { status, order_type } = order;
  if (status === 'NEW')   return 'PREP';
  if (status === 'PREP')  return 'READY';
  if (status === 'READY') return order_type === 'DELIVERY' ? 'TRANSIT' : 'DELIVERED';
  if (status === 'TRANSIT') return 'DELIVERED';
  return null;
}

function nextLabel(order: OrderWithItems): string {
  const { status, order_type } = order;
  if (status === 'NEW')   return 'Confirmar';
  if (status === 'PREP')  return 'Marcar listo';
  if (status === 'READY') {
    if (order_type === 'DELIVERY') return 'En camino';
    if (order_type === 'DINE_IN')  return 'Servir en mesa';
    return 'Entregado';
  }
  if (status === 'TRANSIT') return 'Entregado';
  return '';
}

function buildKitchenHtml(order: OrderWithItems, restaurantName: string): string {
  const orderTypeLabel =
    order.order_type === 'PICKUP'  ? 'Para llevar' :
    order.order_type === 'DINE_IN' ? 'En local'    : 'A domicilio';

  const timeStr = new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const itemsHtml = order.items.map((item) => {
    const opts = item.options_snapshot?.length
      ? `<div class="opts">– ${item.options_snapshot.map((o) => o.choice).join(' · ')}</div>`
      : '';
    return `
      <div class="row">
        <span class="qty">${item.quantity}×</span>
        <span class="item">${item.name_snapshot}</span>
      </div>${opts}`;
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

function printKitchenTicket(order: OrderWithItems, restaurantName: string) {
  if (typeof window === 'undefined') return;
  if (!isKitchenAutoPrintEnabled()) return;
  void printTicket(
    'kitchen',
    buildKitchenHtml(order, restaurantName),
    () => buildKitchenEscPos(order, restaurantName),
  );
}

function buildReceiptHtml(order: OrderWithItems, currency: PanelCurrency, restaurantName: string): string {
  function fmt(n: number) { return money(n, currency); }

  const orderTypeLabel =
    order.order_type === 'PICKUP'   ? 'Para llevar' :
    order.order_type === 'DINE_IN'  ? 'En local'    : 'Domicilio';

  const dateStr = new Date(order.created_at).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const itemsHtml = order.items.map((item) => {
    const opts = item.options_snapshot?.length
      ? `<div class="opts">${item.options_snapshot.map((o) => o.choice).join(', ')}</div>`
      : '';
    return `
      <tr>
        <td class="qty">${item.quantity}×</td>
        <td class="desc">${item.name_snapshot}${opts}</td>
        <td class="amount">${fmt(Number(item.subtotal))}</td>
      </tr>`;
  }).join('');

  const extraRows: string[] = [];
  if (Number(order.delivery_fee) > 0)
    extraRows.push(`<tr class="sub"><td colspan="2">Envío</td><td class="amount">${fmt(Number(order.delivery_fee))}</td></tr>`);
  if (Number(order.tip) > 0)
    extraRows.push(`<tr class="sub"><td colspan="2">Propina</td><td class="amount">${fmt(Number(order.tip))}</td></tr>`);
  if (Number(order.discount) > 0) {
    const promoLabel = order.promo_code ? ` (${order.promo_code})` : '';
    extraRows.push(`<tr class="sub discount"><td colspan="2">Descuento${promoLabel}</td><td class="amount">−${fmt(Number(order.discount))}</td></tr>`);
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
  agentKitchen = false,
  agentReceipt = false,
}: {
  order: OrderWithItems;
  currency: PanelCurrency;
  restaurantName: string;
  /** El Agente Leogin imprime la comanda (servidor) → no imprimir también desde el navegador. */
  agentKitchen?: boolean;
  /** El Agente Leogin imprime el recibo (servidor) → el botón encola en vez de usar el navegador. */
  agentReceipt?: boolean;
}) {
  const [isPending, start] = useTransition();
  const [mapOpen, setMapOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const next = nextStatus(order);

  function handlePrint() {
    // Con agente: el recibo se genera e imprime en el servidor (funciona en móvil).
    if (agentReceipt) {
      void printReceiptViaAgent(order.id);
      return;
    }
    void printTicket(
      'receipt',
      buildReceiptHtml(order, currency, restaurantName),
      () => buildReceiptEscPos(order, currency, restaurantName),
    );
  }

  async function handleAdvance() {
    if (!next) return;
    // Solo imprimir la comanda desde el navegador si el agente NO la maneja
    // (evita doble impresión cuando el restaurante usa el Agente Leogin).
    if (next === 'PREP' && !agentKitchen) printKitchenTicket(order, restaurantName);
    start(async () => { await updateOrderStatus(order.id, next); });
  }

  async function handleCancel() {
    setConfirmCancel(false);
    start(async () => { await updateOrderStatus(order.id, 'CANCEL'); });
  }

  const isTerminal = order.status === 'DELIVERED' || order.status === 'CANCEL';

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
        border: '1px solid var(--u-hair)',
        padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: 12,
        opacity: isTerminal ? 0.65 : 1,
        transition: 'opacity 200ms',
      }}
    >
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <span
            className="t-mono"
            style={{ fontSize: 12, color: 'var(--u-text-3)' }}
          >
            {order.order_number}
          </span>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginTop: 2 }}>
            {order.customer_name}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Icon name="phone" size={12} style={{ display: 'inline' }} /> {order.customer_phone}
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name={order.order_type === 'PICKUP' ? 'bag' : order.order_type === 'DINE_IN' ? 'utensils' : 'truck'} size={12} style={{ display: 'inline' }} />
              {order.order_type === 'PICKUP' ? 'Para llevar' : order.order_type === 'DINE_IN' ? 'En local' : 'Domicilio'}
            </span>
          </p>
          {order.order_type === 'DELIVERY' && order.address && (
            <p style={{ fontSize: 12, color: 'var(--u-text-2)', marginTop: 2, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
              <Icon name="mapPin" size={12} style={{ display: 'inline', flexShrink: 0, marginTop: 2 }} /> <span>{order.address}{order.delivery_zone ? ` · ${order.delivery_zone}` : ''}</span>
            </p>
          )}
          {order.order_type === 'DINE_IN' && order.address && (
            <p style={{ fontSize: 12, color: 'var(--u-text-2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="grid" size={12} style={{ display: 'inline' }} /> {order.address}
            </p>
          )}
          {order.waiter_name && (
            <p style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="userPlus" size={12} style={{ display: 'inline' }} /> Mesero: <strong style={{ color: 'var(--u-text-2)' }}>{order.waiter_name}</strong>
            </p>
          )}
          {order.synced_from_hub && (
            <p
              title="Este pedido se tomó sin conexión (hub local) y se sincronizó al volver la señal."
              style={{
                fontSize: 11, fontWeight: 700, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5,
                color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 'var(--radius-full)', padding: '3px 9px', width: 'fit-content',
              }}
            >
              📶 Sin conexión
            </p>
          )}
        </div>

        {/* Badge de estado */}
        <span
          style={{
            flex: '0 0 auto',
            padding: '5px 11px',
            borderRadius: 'var(--radius-full)',
            fontSize: 11, fontWeight: 700,
            background: `${STATUS_COLOR[order.status]}22`,
            color: STATUS_COLOR[order.status],
            border: `1px solid ${STATUS_COLOR[order.status]}44`,
          }}
        >
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {order.items.map((item) => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--u-text-2)', minWidth: 0 }}>
              {item.quantity}× {item.name_snapshot}
              {item.options_snapshot && item.options_snapshot.length > 0 && (
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 1 }}>
                  {item.options_snapshot.map((o) => o.choice).join(' · ')}
                </span>
              )}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text)', flexShrink: 0 }}>
              {money(Number(item.subtotal), currency)}
            </span>
          </div>
        ))}
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
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 8px', borderRadius: 8,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          }}>
            <span style={{ fontSize: 12.5, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="tag" size={12} style={{ display: 'inline' }} /> Cupón
              {order.promo_code && (
                <span style={{
                  fontFamily: 'var(--ui-font-mono)', fontSize: 10.5, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 5,
                  background: 'rgba(34,197,94,0.15)', color: '#4ade80',
                }}>
                  {order.promo_code}
                </span>
              )}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#4ade80' }}>
              −{money(Number(order.discount), currency)}
            </span>
          </div>
        )}
        {Number(order.loyalty_discount) > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 8px', borderRadius: 8,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          }}>
            <span style={{ fontSize: 12.5, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="star" size={12} style={{ display: 'inline' }} /> {Number(order.loyalty_points_redeemed)} puntos canjeados
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#4ade80' }}>
              −{money(Number(order.loyalty_discount), currency)}
            </span>
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
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>
              {money(Number(order.total), currency)}
            </span>
          </div>
        </div>
        {/* Método de pago — no aplica para DINE_IN (mesero lo maneja) */}
        {order.order_type !== 'DINE_IN' && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5,
                color: order.payment_method === 'CARD' ? '#a78bfa' : '#4ade80' }}>
                <Icon name={order.payment_method === 'CARD' ? 'creditCard' : 'banknote'} size={13} style={{ display: 'inline' }} />
                {order.payment_method === 'CARD' ? 'Tarjeta al recibir' : 'Efectivo'}
              </span>
            </div>
            {order.payment_method !== 'CARD' && order.cash_amount != null && order.cash_amount > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--u-text-3)', margin: 0 }}>
                Paga con <strong style={{ color: 'var(--u-text-2)' }}>{money(Number(order.cash_amount), currency)}</strong>
                {' · '}cambio: <strong style={{ color: 'var(--u-text-2)' }}>{money(Number(order.cash_amount) - Number(order.total), currency)}</strong>
              </p>
            )}
          </div>
        )}
        {order.notes && (
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', fontStyle: 'italic', marginTop: 2, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
            <Icon name="edit" size={12} style={{ display: 'inline', flexShrink: 0, marginTop: 2 }} /> <span>{order.notes}</span>
          </p>
        )}
      </div>

      {/* Mapa de entrega (solo DELIVERY con coordenadas) */}
      {order.order_type === 'DELIVERY' && order.delivery_lat && order.delivery_lng && (
        <div>
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)',
              color: '#60a5fa', borderRadius: 8, padding: '6px 12px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
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

      {/* Hora */}
      <p style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
        {new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        {' · '}
        {new Date(order.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
      </p>

      {/* Acciones */}
      {!isTerminal && (
        <div style={{ display: 'flex', gap: 8 }}>
          {confirmCancel ? (
            <>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#ef4444', display: 'flex', alignItems: 'center' }}>
                ¿Cancelar este pedido?
              </span>
              <button
                onClick={() => setConfirmCancel(false)}
                disabled={isPending}
                className="press"
                style={{
                  padding: '10px 14px', borderRadius: 'var(--radius-lg)',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                  border: '1px solid var(--u-hair)',
                  color: 'var(--u-text-2)',
                }}
              >
                No
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="press"
                style={{
                  padding: '10px 14px', borderRadius: 'var(--radius-lg)',
                  fontWeight: 700, fontSize: 13,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  background: 'rgba(239,68,68,0.18)',
                  border: '1px solid rgba(239,68,68,0.40)',
                  color: '#ef4444',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                Sí, cancelar
              </button>
            </>
          ) : (
            <>
              {next && (
                <button
                  onClick={handleAdvance}
                  disabled={isPending}
                  className="press btn-accent"
                  style={{
                    flex: 1, padding: '10px 12px',
                    borderRadius: 'var(--radius-lg)',
                    fontWeight: 700, fontSize: 13,
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    border: 'none',
                    opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {nextLabel(order)}
                </button>
              )}
              <button
                onClick={() => setConfirmCancel(true)}
                disabled={isPending}
                className="press"
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-lg)',
                  fontWeight: 600, fontSize: 13,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#ef4444',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      )}

      {/* Imprimir recibo */}
      <button
        type="button"
        onClick={handlePrint}
        className="press"
        style={{
          width: '100%', padding: '8px 12px',
          borderRadius: 'var(--radius-lg)',
          fontWeight: 600, fontSize: 12,
          cursor: 'pointer',
          background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
          border: '1px solid var(--u-hair)',
          color: 'var(--u-text-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <Icon name="print" size={14} /> Imprimir recibo
      </button>
    </div>
  );
}
