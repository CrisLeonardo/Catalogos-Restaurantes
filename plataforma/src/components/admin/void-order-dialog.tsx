'use client';

/* VoidOrderDialog — anular un pedido completo o N unidades de un ítem, con
   motivo obligatorio. Componente compartido entre order-card.tsx (panel de
   pedidos) y waiter-panel.tsx (mesero). */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { voidOrder, getVoidApproval, type VoidApproval } from '@/lib/actions/orders';
import { PIN_LENGTH } from '@/lib/staff-pin-constants';
import type { OrderStatus } from '@/types';

export default function VoidOrderDialog({
  orderId,
  orderStatus,
  item = null,
  onClose,
  onDone,
}: {
  orderId: string;
  orderStatus: OrderStatus;
  /** null = anular el pedido completo; con valor = solo ese ítem. */
  item?: { id: string; name: string; remainingQty: number } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState(item?.remainingQty ?? 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Quién puede firmar esto. Se pregunta al servidor porque la respuesta
     depende de los permisos de quien está mirando y de quién tiene PIN
     puesto — dos cosas que el navegador no sabe ni debe decidir. */
  const [aprob, setAprob] = useState<VoidApproval | null>(null);
  const [firmante, setFirmante] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  useEffect(() => {
    let vivo = true;
    getVoidApproval(orderId)
      .then((r) => { if (vivo) setAprob(r); })
      .catch(() => { if (vivo) setAprob({ required: true, selfApproves: false, approvers: [] }); });
    return () => { vivo = false; };
  }, [orderId]);

  /** Hay que pedir PIN: ya salió a cocina y quien anula no puede firmar solo. */
  const pidePin = !!aprob && aprob.required && !aprob.selfApproves;
  const sinEncargados = pidePin && aprob.approvers.length === 0;
  const listo = !pidePin || (!!firmante && pin.length === PIN_LENGTH);

  async function handleSubmit() {
    setError(null);
    if (!reason.trim()) { setError('Escribe el motivo de la anulación.'); return; }
    if (pidePin && !firmante) { setError('Elige quién autoriza.'); return; }
    if (pidePin && pin.length !== PIN_LENGTH) { setError(`El PIN son ${PIN_LENGTH} dígitos.`); return; }
    setSubmitting(true);
    const res = await voidOrder({
      orderId,
      itemId: item?.id ?? null,
      quantity: item ? qty : null,
      reason: reason.trim(),
      approverId: pidePin ? firmante : null,
      approverPin: pidePin ? pin : null,
    });
    setSubmitting(false);
    // El PIN no se queda escrito tras un fallo: en una tablet compartida
    // eso es dejarlo a la vista del siguiente que la agarre.
    if (res.error) { setError(res.error); setPin(''); return; }
    onDone();
  }

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--u-text-3)', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '0.04em',
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
            <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
              {orderStatus === 'NEW'
                ? 'Todavía no se ha enviado a cocina.'
                : pidePin
                  ? 'Ya se envió a cocina: tiene que autorizarlo un encargado.'
                  : 'Ya se envió a cocina. Queda firmado a tu nombre.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="press glass-quiet"
            style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}
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
                style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', cursor: 'pointer', fontSize: 18, color: 'var(--u-text)' }}
              >
                −
              </button>
              <span style={{ fontSize: 16, fontWeight: 700, minWidth: 26, textAlign: 'center' }}>{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(item.remainingQty, q + 1))}
                className="press"
                style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', cursor: 'pointer', fontSize: 18, color: 'var(--u-text)' }}
              >
                +
              </button>
              <span style={{ fontSize: 12, color: 'var(--u-text-4)' }}>de {item.remainingQty} disponibles</span>
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
            className="adm-field" style={{ resize: 'none' }}
          />
        </div>

        {/* ── La firma del encargado ──────────────────────────────
            Lo que ya salió a cocina se cocinó, se pagó y puede acabar
            en la basura: quitarlo de la cuenta mueve dinero de verdad.
            El PIN es el mismo de entrar al panel; no hay una segunda
            credencial que aprender. */}
        {pidePin && !sinEncargados && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={fieldLabelStyle}>¿Quién autoriza?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {aprob.approvers.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setFirmante(a.id); setPin(''); }}
                    className="press"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                      padding: '8px 13px', borderRadius: 'var(--radius-md)', cursor: 'pointer', minHeight: 44,
                      justifyContent: 'center', textAlign: 'left',
                      border: firmante === a.id ? '1.5px solid var(--brand-accent)' : '1px solid var(--u-hair-2)',
                      background: firmante === a.id
                        ? 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' : 'none',
                      color: firmante === a.id ? 'var(--brand-accent-ink)' : 'var(--u-text-2)',
                    }}
                    aria-pressed={firmante === a.id}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                    <span style={{ fontSize: 11, opacity: 0.75 }}>{a.role}</span>
                  </button>
                ))}
              </div>
            </div>

            {firmante && (
              <div>
                <div style={fieldLabelStyle}>Su PIN</div>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                  placeholder={'•'.repeat(PIN_LENGTH)}
                  aria-label="PIN del encargado"
                  /* 18px de suelo: por debajo de 16 Safari amplía la página
                     entera al enfocar y la hoja se sale de la pantalla. */
                  className="adm-field adm-field-mono" style={{ width: 132, fontSize: 18, letterSpacing: '0.3em', textAlign: 'center' }}
                />
              </div>
            )}
          </div>
        )}

        {sinEncargados && (
          <div className="note note-danger">
            <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Esto ya salió a cocina y nadie con permiso de encargado tiene PIN puesto,
              así que no hay quien lo autorice desde aquí. Pídeselo al encargado desde
              su propia sesión, o que el dueño le asigne un PIN en Personal.
            </span>
          </div>
        )}

        {error && (
          <div className="note note-danger">
            <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || sinEncargados || !listo || aprob == null}
          className="press btn-tinted chip-solid chip-danger"
          style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700 }}
        >
          {submitting ? 'Anulando…' : item ? `Anular ${qty}× ${item.name}` : 'Anular pedido completo'}
        </button>
      </div>
    </div>
  );
}
