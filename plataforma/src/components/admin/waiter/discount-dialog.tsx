'use client';

/* Descuento y cortesía de una mesa.
   ------------------------------------------------------------------
   Hallazgo M-10. La cuenta pintaba «Descuento» desde siempre, pero ese
   número solo podía llegar de un cupón del menú público: el encargado no
   podía invitar un postre por una queja ni aplicar un 10 % de cumpleaños
   sin salirse del sistema. Y salirse del sistema es, en la práctica,
   restar en la calculadora y cobrar un número que no cuadra con nada de
   lo que queda escrito.

   Hermano del diálogo de anulación, y a propósito: la misma firma de
   encargado, el mismo PIN, el mismo motivo obligatorio. Mover dinero de
   una cuenta se hace igual venga por donde venga. */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { applyTableDiscount, getDiscountApproval, type VoidApproval } from '@/lib/actions/orders';
import { PIN_LENGTH } from '@/lib/staff-pin-constants';

/** Los motivos que de verdad se dan en un salón. Se tocan en vez de
    escribirse: con el salón lleno, un campo de texto vacío acaba diciendo
    «desc» o quedándose sin motivo. Sigue pudiéndose escribir otro. */
const MOTIVOS = ['Cortesía por una queja', 'Cumpleaños', 'Cliente de la casa', 'Error de cocina'];

export default function DiscountDialog({
  restaurantId, tableNumber, consumo, descuentoActual, money, onClose, onDone,
}: {
  restaurantId: string;
  tableNumber: number;
  /** Lo que la mesa lleva consumido: la base del porcentaje. */
  consumo: number;
  /** Lo que ya tiene descontado, si es que tiene. */
  descuentoActual: number;
  money: (n: number) => string;
  onClose: () => void;
  onDone: (monto: number) => void;
}) {
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Quién puede firmar esto. Lo decide el servidor porque depende de los
     permisos de quien mira y de quién tiene PIN puesto — dos cosas que el
     navegador no sabe ni debe decidir. */
  const [aprob, setAprob] = useState<VoidApproval | null>(null);
  const [firmante, setFirmante] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  useEffect(() => {
    let vivo = true;
    getDiscountApproval(restaurantId)
      .then((r) => { if (vivo) setAprob(r); })
      .catch(() => { if (vivo) setAprob({ required: true, selfApproves: false, approvers: [] }); });
    return () => { vivo = false; };
  }, [restaurantId]);

  const pidePin = !!aprob && !aprob.selfApproves;
  const sinEncargados = pidePin && aprob.approvers.length === 0;

  const num = Number(valor.replace(',', '.'));
  const valido = valor.trim() !== '' && Number.isFinite(num) && num >= 0
    && (kind === 'percent' ? num <= 100 : num <= consumo);
  /** Lo que se le va a quitar a la cuenta, ya en dinero. */
  const monto = valido
    ? Math.min(Math.round((kind === 'percent' ? (consumo * num) / 100 : num) * 100) / 100, consumo)
    : 0;
  const listo = valido && motivo.trim().length >= 3
    && (!pidePin || (!!firmante && pin.length === PIN_LENGTH));

  async function aplicar() {
    setError(null);
    if (!valido) { setError('Escribe cuánto se descuenta.'); return; }
    if (motivo.trim().length < 3) { setError('Escribe el motivo del descuento.'); return; }
    if (pidePin && !firmante) { setError('Elige quién autoriza.'); return; }
    setEnviando(true);
    const res = await applyTableDiscount({
      restaurantId,
      tableNumber,
      kind,
      value: num,
      reason: motivo.trim(),
      approverId: pidePin ? firmante : null,
      approverPin: pidePin ? pin : null,
    });
    setEnviando(false);
    // El PIN no se queda escrito tras un fallo: en una tablet compartida
    // eso es dejarlo a la vista del siguiente que la agarre.
    if (res.error) { setError(res.error); setPin(''); return; }
    onDone(res.applied ?? 0);
  }

  const etiqueta: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--u-text-3)', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '0.04em',
  };
  const campo: React.CSSProperties = {
    width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
    border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)', padding: '10px 12px',
    color: 'var(--u-text)', fontSize: 16, outline: 'none', fontFamily: 'inherit',
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
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label={`Descuento de la mesa ${tableNumber}`}
        className="glass anim-slide-up"
        style={{
          width: '100%', maxWidth: 460, borderRadius: '20px 20px 0 0',
          padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14,
          maxHeight: '90dvh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--u-text)' }}>
              Descuento · Mesa {tableNumber}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2 }}>
              {pidePin
                ? 'Un descuento lo autoriza un encargado.'
                : 'Queda firmado a tu nombre, con el motivo.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="press glass-quiet"
            style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {descuentoActual > 0 && (
          <div className="note">
            <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {/* Sustituye, no suma: aplicar «10 %» dos veces tiene que dejar
                un 10 %, no un 20 %. Se dice aquí para que nadie lo descubra
                al cobrar. */}
            <span>
              Esta mesa ya lleva {money(descuentoActual)} de descuento. Lo que pongas
              aquí lo <b>sustituye</b>; pon 0 para quitarlo.
            </span>
          </div>
        )}

        <div>
          <div style={etiqueta}>Cuánto</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <Modo activo={kind === 'percent'} onClick={() => setKind('percent')}>%</Modo>
              <Modo activo={kind === 'amount'} onClick={() => setKind('amount')}>Q</Modo>
            </div>
            <input
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
              inputMode="decimal"
              placeholder={kind === 'percent' ? '10' : '0.00'}
              aria-label={kind === 'percent' ? 'Porcentaje de descuento' : 'Importe del descuento'}
              style={{ ...campo, flex: 1, minWidth: 0 }}
            />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 6 }}>
            {/* El número que importa es el que se le quita a la cuenta, no el
                que se teclea: «10 %» no dice nada hasta que dice Q41.20. */}
            {valido
              ? `Se le quitan ${money(monto)} de ${money(consumo)} de consumo.`
              : `Consumo de la mesa: ${money(consumo)}.`}
          </div>
        </div>

        <div>
          <div style={etiqueta}>Motivo (obligatorio)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {MOTIVOS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                className="press"
                style={{
                  padding: '7px 12px', borderRadius: 'var(--radius-full)', cursor: 'pointer', minHeight: 34,
                  fontSize: 12.5, fontWeight: 600,
                  border: motivo === m ? '1.5px solid var(--brand-accent)' : '1px solid var(--u-hair-2)',
                  background: motivo === m ? 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' : 'none',
                  color: motivo === m ? 'var(--brand-accent-ink)' : 'var(--u-text-2)',
                }}
                aria-pressed={motivo === m}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="O escríbelo…"
            aria-label="Motivo del descuento"
            maxLength={200}
            style={campo}
          />
        </div>

        {pidePin && !sinEncargados && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={etiqueta}>¿Quién autoriza?</div>
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
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</span>
                    <span style={{ fontSize: 11, opacity: 0.75 }}>{a.role}</span>
                  </button>
                ))}
              </div>
            </div>

            {firmante && (
              <div>
                <div style={etiqueta}>Su PIN</div>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                  placeholder={'•'.repeat(PIN_LENGTH)}
                  aria-label="PIN del encargado"
                  className="t-mono"
                  style={{ ...campo, width: 132, fontSize: 18, letterSpacing: '0.3em', textAlign: 'center' }}
                />
              </div>
            )}
          </div>
        )}

        {sinEncargados && (
          <div className="note note-danger">
            <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Nadie con permiso de encargado tiene PIN puesto, así que no hay quien
              autorice esto desde aquí. Pídeselo al encargado desde su propia sesión,
              o que el dueño le asigne un PIN en Personal.
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
          onClick={aplicar}
          disabled={enviando || sinEncargados || !listo || aprob == null}
          className="press btn-accent"
          style={{
            width: '100%', padding: 13, borderRadius: 'var(--radius-lg)', border: 'none',
            fontSize: 14.5, fontWeight: 700,
            cursor: listo && !enviando ? 'pointer' : 'default',
            opacity: listo && !enviando && !sinEncargados ? 1 : 0.55,
          }}
        >
          {enviando ? 'Aplicando…' : monto > 0 ? `Descontar ${money(monto)}` : 'Quitar el descuento'}
        </button>
      </div>
    </div>
  );
}

function Modo({ activo, onClick, children }: {
  activo: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press"
      aria-pressed={activo}
      style={{
        width: 44, minHeight: 44, borderRadius: 'var(--radius-md)', cursor: 'pointer',
        fontSize: 15, fontWeight: 700,
        border: activo ? '1.5px solid var(--brand-accent)' : '1px solid var(--u-hair-2)',
        background: activo ? 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' : 'none',
        color: activo ? 'var(--brand-accent-ink)' : 'var(--u-text-2)',
      }}
    >
      {children}
    </button>
  );
}
