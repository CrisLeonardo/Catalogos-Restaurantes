'use client';

import { useTransition } from 'react';
import { updateOrderStatus } from '@/lib/actions/orders';
import type { OrderWithItems } from '@/lib/db/orders';
import type { OrderStatus } from '@/types';

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
  if (status === 'READY') return order_type === 'DELIVERY' ? 'En camino' : 'Entregado';
  if (status === 'TRANSIT') return 'Entregado';
  return '';
}

export default function OrderCard({ order, currency }: { order: OrderWithItems; currency: PanelCurrency }) {
  const [isPending, start] = useTransition();
  const next = nextStatus(order);

  async function handleAdvance() {
    if (!next) return;
    start(async () => { await updateOrderStatus(order.id, next); });
  }

  async function handleCancel() {
    start(async () => { await updateOrderStatus(order.id, 'CANCEL'); });
  }

  const isTerminal = order.status === 'DELIVERED' || order.status === 'CANCEL';

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(255,255,255,0.04)',
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
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 1 }}>
            📱 {order.customer_phone}
            {' · '}
            {order.order_type === 'PICKUP' ? '🥡 Para llevar' : '🛵 Domicilio'}
          </p>
          {order.order_type === 'DELIVERY' && order.address && (
            <p style={{ fontSize: 12, color: 'var(--u-text-2)', marginTop: 2 }}>
              📍 {order.address}{order.delivery_zone ? ` · ${order.delivery_zone}` : ''}
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
        <div style={{ borderTop: '1px solid var(--u-hair)', marginTop: 4, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--u-text-2)' }}>Total</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>
            {money(Number(order.total), currency)}
          </span>
        </div>
        {order.notes && (
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', fontStyle: 'italic', marginTop: 2 }}>
            📝 {order.notes}
          </p>
        )}
      </div>

      {/* Hora */}
      <p style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
        {new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        {' · '}
        {new Date(order.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
      </p>

      {/* Acciones */}
      {!isTerminal && (
        <div style={{ display: 'flex', gap: 8 }}>
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
                border: 'none', color: '#fff',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {nextLabel(order)}
            </button>
          )}
          <button
            onClick={handleCancel}
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
        </div>
      )}
    </div>
  );
}
