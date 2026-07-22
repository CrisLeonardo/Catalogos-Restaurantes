'use client';

/* VoidOrderDialog — anular un pedido completo o N unidades de un ítem, con
   motivo obligatorio. Si el pedido ya salió de NEW (se envió a cocina) y
   quien lo usa no tiene el permiso 'aprobar_anulaciones', pide el PIN de
   alguien que sí lo tenga (mismo mecanismo que el login de staff por PIN,
   pero sin abrir sesión — ver checkApproverPin en staff-pin.ts).
   Componente compartido entre order-card.tsx (panel de pedidos) y
   waiter-panel.tsx (mesero). */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { voidOrder } from '@/lib/actions/orders';
import type { OrderStatus } from '@/types';

export interface VoidApprover {
  id: string;
  full_name: string | null;
}

export default function VoidOrderDialog({
  orderId,
  orderStatus,
  item = null,
  voidApprovers,
  onClose,
  onDone,
}: {
  orderId: string;
  orderStatus: OrderStatus;
  /** null = anular el pedido completo; con valor = solo ese ítem. */
  item?: { id: string; name: string; remainingQty: number } | null;
  voidApprovers: VoidApprover[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState(item?.remainingQty ?? 1);
  const [approverId, setApproverId] = useState(voidApprovers[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsApproval = orderStatus !== 'NEW';

  async function handleSubmit() {
    setError(null);
    if (!reason.trim()) { setError('Escribe el motivo de la anulación.'); return; }
    if (needsApproval && (!approverId || pin.length !== 4)) {
      setError('Elige quién autoriza e ingresa su PIN de 4 dígitos.');
      return;
    }
    setSubmitting(true);
    const res = await voidOrder({
      orderId,
      itemId: item?.id ?? null,
      quantity: item ? qty : null,
      reason: reason.trim(),
      approverId: needsApproval ? approverId : null,
      approverPin: needsApproval ? pin : null,
    });
    setSubmitting(false);
    if (res.error) { setError(res.error); return; }
    onDone();
  }

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--u-text-3)', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '0.04em',
  };
  const fieldStyle: React.CSSProperties = {
    width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
    border: '1px solid var(--u-hair)', borderRadius: 12, padding: '10px 12px',
    color: 'var(--u-text)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass anim-slide-up"
        style={{ width: '100%', maxWidth: 460, borderRadius: '20px 20px 0 0', padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--u-text)' }}>
              {item ? `Anular ${item.name}` : 'Anular pedido'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2 }}>
              {needsApproval ? 'Este pedido ya se envió a cocina — necesita aprobación.' : 'Aún no se ha enviado a cocina.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="press glass-quiet"
            style={{ width: 32, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {item && item.remainingQty > 1 && (
          <div>
            <div style={fieldLabelStyle}>Cantidad a anular</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="press"
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', cursor: 'pointer', fontSize: 18, color: 'var(--u-text)' }}
              >
                −
              </button>
              <span style={{ fontSize: 17, fontWeight: 700, minWidth: 26, textAlign: 'center' }}>{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(item.remainingQty, q + 1))}
                className="press"
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', cursor: 'pointer', fontSize: 18, color: 'var(--u-text)' }}
              >
                +
              </button>
              <span style={{ fontSize: 12.5, color: 'var(--u-text-4)' }}>de {item.remainingQty} disponibles</span>
            </div>
          </div>
        )}

        <div>
          <div style={fieldLabelStyle}>Motivo (obligatorio)</div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. el cliente lo devolvió, error al tomar el pedido…"
            rows={2}
            style={{ ...fieldStyle, resize: 'none' }}
          />
        </div>

        {needsApproval && (
          voidApprovers.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '8px 12px' }}>
              No hay ningún encargado con permiso para aprobar anulaciones. Pide al dueño que asigne &quot;Aprobar anulaciones&quot; a alguien en Personal.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={fieldLabelStyle}>¿Quién autoriza?</div>
                <select value={approverId} onChange={(e) => setApproverId(e.target.value)} style={fieldStyle}>
                  {voidApprovers.map((a) => (
                    <option key={a.id} value={a.id}>{a.full_name ?? 'Sin nombre'}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={fieldLabelStyle}>Su PIN</div>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  type="password"
                  placeholder="••••"
                  style={{ ...fieldStyle, fontSize: 18, letterSpacing: '0.3em', textAlign: 'center' }}
                />
              </div>
            </div>
          )
        )}

        {error && (
          <div style={{ fontSize: 12.5, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || (needsApproval && voidApprovers.length === 0)}
          className="press"
          style={{
            width: '100%', padding: '13px', borderRadius: 14, border: 'none',
            cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14.5,
            background: 'rgba(239,68,68,0.85)', color: '#fff', opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Anulando…' : item ? `Anular ${qty}× ${item.name}` : 'Anular pedido completo'}
        </button>
      </div>
    </div>
  );
}
