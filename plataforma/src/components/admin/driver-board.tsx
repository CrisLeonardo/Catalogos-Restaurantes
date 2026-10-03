'use client';

import { Icon } from '@/components/icons';
import { markPickedUp, markDelivered } from '@/lib/actions/drivers';
import type { DriverOrder, ShiftSummary } from '@/lib/db/drivers';
import { fmtMoney } from '@/lib/money';
import { shortOrderNumber } from '@/lib/order-number';

/* ============================================================
   Pantalla del repartidor (Fase 2)
   ------------------------------------------------------------
   Pensada para un teléfono, con una mano, en la calle: botones grandes,
   una acción por pedido y nada que leer de más.

   El monto a cobrar va destacado porque Leogin no cobra en línea: el
   repartidor necesita saber cuánto pedir y cuánto cambio llevar ANTES de
   tocar el timbre. `cash_amount` es con cuánto dijo el cliente que iba a
   pagar; la resta contra el total es el cambio que hay que llevar.
   ============================================================ */

function money(n: number): string {
  return fmtMoney(n ?? 0);
}

export default function DriverBoard({
  driverName, orders, summary,
}: {
  driverName: string;
  orders: DriverOrder[];
  summary: ShiftSummary;
}) {
  const cardSt: React.CSSProperties = {
    border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)',
    padding: 16, marginBottom: 14,
  };
  const bigBtn: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 'var(--radius-lg)',
    fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 12,
    border: 'none',
  };

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Mis entregas</h1>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{driverName}</p>
      </header>

      {/* Cuadre del turno */}
      <div style={{ ...cardSt, background: 'color-mix(in srgb, var(--u-text) 4%, transparent)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--u-text-4)', marginBottom: 8 }}>
          Hoy
        </p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: 13 }}>
            <strong style={{ fontSize: 18 }}>{summary.entregados}</strong> entregados
          </span>
          <span style={{ fontSize: 13 }}>
            Efectivo: <strong style={{ fontSize: 18 }}>{money(summary.efectivoRecibido)}</strong>
          </span>
        </div>
        {summary.sinRegistro > 0 && (
          <p style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 8 }}>
            {summary.sinRegistro} {summary.sinRegistro === 1 ? 'entrega' : 'entregas'} sin efectivo anotado (pago con tarjeta al recibir, o quedó pendiente).
          </p>
        )}
      </div>

      {orders.length === 0 && (
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', textAlign: 'center', padding: '32px 0' }}>
          No tienes pedidos asignados ahora mismo.
        </p>
      )}

      {orders.map((o) => {
        const enCamino = o.status === 'TRANSIT';
        const esEfectivo = o.payment_method === 'CASH';
        const cambio = esEfectivo && o.cash_amount != null ? o.cash_amount - o.total : null;
        const mapUrl = o.delivery_lat != null && o.delivery_lng != null
          ? `https://www.google.com/maps/search/?api=1&query=${o.delivery_lat},${o.delivery_lng}`
          : o.address
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`
            : null;

        return (
          <div key={o.id} style={cardSt}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 16 }}>{shortOrderNumber(o.order_number)}</strong>
              <span className={`chip ${enCamino ? 'chip-alt' : 'chip-ok'}`}>
                {enCamino ? 'En camino' : 'Listo para salir'}
              </span>
            </div>

            <p style={{ fontSize: 15, fontWeight: 600 }}>{o.customer_name}</p>

            {o.address && (
              <p style={{ fontSize: 13, color: 'var(--u-text-2)', marginTop: 4, display: 'flex', gap: 6 }}>
                <Icon name="mapPin" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{o.address}{o.delivery_zone ? ` · ${o.delivery_zone}` : ''}</span>
              </p>
            )}

            {o.notes && (
              <p style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 6, fontStyle: 'italic' }}>
                {o.notes}
              </p>
            )}

            {/* Cobro: lo primero que necesita saber al llegar */}
            <div style={{
              marginTop: 10, padding: 10, borderRadius: 'var(--radius-md)',
              background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <p style={{ fontSize: 13 }}>
                Cobrar <strong style={{ fontSize: 17 }}>{money(o.total)}</strong>
                <span style={{ color: 'var(--u-text-4)' }}> · {esEfectivo ? 'efectivo' : 'tarjeta al recibir'}</span>
              </p>
              {cambio != null && cambio > 0 && (
                <p style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 3 }}>
                  Paga con {money(o.cash_amount!)} — lleva {money(cambio)} de cambio.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <a href={`tel:${o.customer_phone}`} className="chip" style={{ textDecoration: 'none' }}>
                <Icon name="phone" size={12} /> Llamar
              </a>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="chip" style={{ textDecoration: 'none' }}>
                  <Icon name="mapPin" size={12} /> Ver mapa
                </a>
              )}
            </div>

            {!enCamino ? (
              <form action={markPickedUp}>
                <input type="hidden" name="orderId" value={o.id} />
                <button type="submit" className="btn-primary" style={bigBtn}>
                  Salí con el pedido
                </button>
              </form>
            ) : (
              <form action={markDelivered}>
                <input type="hidden" name="orderId" value={o.id} />
                <label
                  htmlFor={`cash-${o.id}`}
                  style={{ fontSize: 11, color: 'var(--u-text-3)', display: 'block', marginTop: 12, marginBottom: 5 }}
                >
                  Efectivo recibido (dejalo vacío si pagó con tarjeta)
                </label>
                <input
                  id={`cash-${o.id}`}
                  name="cash_collected"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  defaultValue={esEfectivo ? o.total : ''}
                  style={{
                    width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                    border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-md)', padding: '11px 13px',
                    color: 'var(--u-text)', fontSize: 16, outline: 'none',
                  }}
                />
                <button type="submit" className="btn-primary" style={bigBtn}>
                  Entregué el pedido
                </button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
