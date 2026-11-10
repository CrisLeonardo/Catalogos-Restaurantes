'use client';

/* VoidOrderDialog — anular un pedido completo o N unidades de un ítem, con
   motivo obligatorio. Componente compartido entre order-card.tsx (panel de
   pedidos) y waiter-panel.tsx (mesero). */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { voidOrder, getVoidApproval, type IntentoPedido, type VoidApproval } from '@/lib/actions/orders';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PIN_LENGTH } from '@/lib/staff-pin-constants';
import type { OrderStatus } from '@/types';

export default function VoidOrderDialog({
  orderId,
  orderStatus,
  version,
  cobro,
  item = null,
  onClose,
  onDone,
}: {
  orderId: string;
  orderStatus: OrderStatus;
  version?: string;
  cobro?: string;
  /** null = anular el pedido completo; con valor = solo ese ítem. */
  item?: { id: string; name: string; remainingQty: number } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState(item?.remainingQty ?? 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviando = useRef(false);
  const original = useRef({ estado: orderStatus, version });
  const ultimo = useRef<{ contenido: string; intento: IntentoPedido } | null>(null);

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
    if (enviando.current) return;
    setError(null);
    if (!reason.trim()) { setError('Escribe el motivo de la anulación.'); return; }
    if (pidePin && !firmante) { setError('Elige quién autoriza.'); return; }
    if (pidePin && pin.length !== PIN_LENGTH) { setError(`El PIN son ${PIN_LENGTH} dígitos.`); return; }
    enviando.current = true;
    const contenido = JSON.stringify([item?.id, qty, reason.trim()]);
    if (original.current.version && ultimo.current?.contenido !== contenido) {
      ultimo.current = { contenido, intento: { id: crypto.randomUUID(), estado: original.current.estado, version: original.current.version } };
    }
    setSubmitting(true);
    try {
      const res = await voidOrder({ orderId, itemId: item?.id ?? null, quantity: item ? qty : null,
        reason: reason.trim(), approverId: pidePin ? firmante : null, approverPin: pidePin ? pin : null,
        intento: ultimo.current?.intento });
      if (res.error) { setError(res.error); return; }
      onDone();
    } catch { setError('Se perdió la respuesta. Vuelve a confirmar para recuperar el resultado.'); }
    finally { enviando.current = false; setSubmitting(false); setPin(''); }
  }

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--u-text-3)', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '0.04em',
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !enviando.current) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-32px)] flex-col gap-3 overflow-y-auto">
        <div className="pr-10">
          <div>
            <DialogTitle>
              {item ? `Anular ${item.name}` : 'Anular pedido'}
            </DialogTitle>
            <DialogDescription>
              {orderStatus === 'NEW'
                ? 'Todavía no se ha enviado a cocina.'
                : !aprob ? 'Consultando quién puede autorizar.' : pidePin
                  ? 'Ya se envió a cocina: tiene que autorizarlo un encargado.'
                  : 'Ya se envió a cocina. Queda firmado a tu nombre.'}
            </DialogDescription>
          </div>
        </div>
        <p className="note note-warn">
          <span>Se repone el inventario de los productos con control de stock. {cobro ? `Hay ${cobro} netos registrados. ` : ''}
            Si ya recibiste dinero, revisa el cobro y registra cualquier devolución por separado en Caja.</span>
        </p>

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
            aria-label="Motivo de la anulación"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. el cliente lo devolvió, error al tomar el pedido…"
            rows={2}
            maxLength={500}
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
          <div className="note note-danger" role="status">
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
      </DialogContent>
    </Dialog>
  );
}
