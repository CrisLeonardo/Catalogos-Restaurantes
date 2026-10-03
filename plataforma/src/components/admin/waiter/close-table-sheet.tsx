'use client';

/* ============================================================
   CERRAR LA MESA
   ------------------------------------------------------------
   Antes esto era un botón suelto a todo lo ancho: un toque cerraba
   TODOS los pedidos de la mesa como entregados y disparaba la
   facturación, sin preguntar nada — ni siquiera cuando la propia
   pantalla estaba diciendo «Quedan Q1,364.00 sin cobrar en esta
   mesa». Y como nadie preguntaba cómo se había pagado, el pedido se
   quedaba con el 'CASH' que traía de fábrica y el arqueo de la noche
   contaba como efectivo también lo que se pagó con tarjeta.

   Las dos cosas se arreglan en el mismo gesto, porque son el mismo
   momento: el cobro. La hoja pregunta lo justo —cómo pagaron y, si
   fue en efectivo, con cuánto— y solo entonces cierra.

   El vuelto se calcula mientras se teclea porque es la cuenta que el
   mesero hace de cabeza con el cliente delante, y es la que más se
   equivoca con prisa.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { Seg } from '@/components/admin/waiter/pieces';
import { PAYMENT_LABEL, PAYMENT_METHODS, type PaymentMethod } from '@/lib/payment-method';

interface Props {
  /** Para el título: «Cerrar la mesa 4». */
  tableNumber: number;
  /** El total de la mesa, ya formateado por quien la pinta. */
  total: number;
  /** Lo que queda por cobrar según el reparto. 0 = ya está todo marcado. */
  pending: number;
  money: (n: number) => string;
  busy: boolean;
  onCancel: () => void;
  /** Cómo se cobró. Uno o varios: una mesa puede pagar mitad en efectivo
      y mitad con tarjeta (M-11). */
  onConfirm: (pagos: { method: PaymentMethod; amount?: number | null; cashReceived?: number | null }[]) => void;
}

/** Los billetes con los que de verdad se paga una cuenta de este tamaño.
    Se ofrecen para no teclear: en la mano casi siempre hay un redondo. */
function sugerencias(total: number): number[] {
  if (total <= 0) return [];
  const out = new Set<number>();
  for (const paso of [50, 100, 200, 500]) {
    const arriba = Math.ceil(total / paso) * paso;
    if (arriba > total) out.add(arriba);
  }
  return [...out].sort((a, b) => a - b).slice(0, 3);
}

export default function CloseTableSheet({
  tableNumber, total, pending, money, busy, onCancel, onConfirm,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [recibido, setRecibido] = useState('');

  /* PAGO MIXTO (M-11).
     ------------------------------------------------------------
     Apagado por omisión y a propósito: la mesa que paga de una sola
     forma es la mayoría, y es un toque. Al encenderlo, cada método pone
     lo suyo y la hoja va diciendo cuánto falta — que es la cuenta que el
     cajero hace en la cabeza mientras cobra. */
  const [mixto, setMixto] = useState(false);
  const [partes, setPartes] = useState<Record<string, string>>({});
  const cashRef = useRef<HTMLInputElement | null>(null);

  /* Escape cierra, como cualquier otra hoja del panel. Se registra en
     captura para llegar antes que el buscador de platos, que también
     escucha Escape para vaciarse. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onCancel(); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel, busy]);

  const recibidoNum = useMemo(() => {
    const n = Number(recibido.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [recibido]);

  const esEfectivo = method === 'CASH';
  const vuelto = recibidoNum > 0 ? Math.round((recibidoNum - total) * 100) / 100 : null;
  /* Con un "recibí" menor que la cuenta no se cierra: o es un teclazo a
     medias o falta cobrar, y en los dos casos cerrar sería peor que
     esperar. Dejarlo vacío sí vale — significa "no lo apunto". */
  const faltaEfectivo = esEfectivo && recibidoNum > 0 && recibidoNum < total - 0.004;

  /* Lo puesto en cada método, ya en números. */
  const puesto = useMemo(() => {
    const out: { method: PaymentMethod; amount: number }[] = [];
    for (const m of PAYMENT_METHODS) {
      const n = Number((partes[m] ?? '').replace(',', '.'));
      if (Number.isFinite(n) && n > 0) out.push({ method: m, amount: Math.round(n * 100) / 100 });
    }
    return out;
  }, [partes]);
  const sumaMixta = useMemo(
    () => Math.round(puesto.reduce((s, p) => s + p.amount, 0) * 100) / 100,
    [puesto],
  );
  const faltaMixto = Math.round((total - sumaMixta) * 100) / 100;
  /* Se admite pagar de MÁS solo en efectivo, que es vuelto; de más con
     tarjeta no es nada que este sistema sepa explicar. */
  const sobraNoEfectivo = faltaMixto < -0.004
    && !puesto.some((p) => p.method === 'CASH');
  const mixtoListo = mixto && puesto.length > 0 && Math.abs(faltaMixto) < 0.005;

  const quedaSaldo = pending > 0.004;

  return (
    <div
      onClick={() => { if (!busy) onCancel(); }}
      className="waiter-sheet-scrim"
      style={{ position: 'fixed', inset: 0, zIndex: 620, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass anim-slide-up waiter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Cerrar la mesa ${tableNumber}`}
        style={{ width: '100%', maxWidth: 460, padding: '22px 20px 26px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}
      >
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--u-text)' }}>
            Cerrar la mesa {tableNumber}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 5, lineHeight: 1.45 }}>
            Se cobran {money(total)} y la mesa queda libre. Los pedidos se cierran y ya no se pueden editar.
          </div>
        </div>

        {/* Saldo pendiente: el aviso que antes no existía. */}
        {quedaSaldo && (
          <div
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', borderRadius: 'var(--radius-lg)',
              border: '1px solid color-mix(in srgb, var(--c-warn) 34%, transparent)',
              background: 'color-mix(in srgb, var(--c-warn) 10%, transparent)',
            }}
          >
            <Icon name="alertCircle" size={16} style={{ color: 'var(--c-warn)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--u-text-2)' }}>
              En el reparto quedan <b>{money(pending)}</b> sin marcar como cobrados. Si cierras ahora, la mesa
              se da por pagada de todos modos.
            </span>
          </div>
        )}

        {/* ── Cómo pagó ──────────────────────────────────────── */}
        <div>
          <div className="adm-label adm-label-caps" style={{ color: 'var(--u-text-3)', paddingBottom: 8 }}>
            ¿Cómo pagó?
          </div>
          {!mixto && (
            <Seg
              value={method}
              onChange={(v) => {
                setMethod(v);
                if (v !== 'CASH') setRecibido('');
              }}
              ariaLabel="Forma de pago"
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_LABEL[m] }))}
            />
          )}

          {/* Con dos formas de pago cada una pone lo suyo (M-11). Antes
              había que elegir UNA para toda la mesa, así que una cuenta
              partida entre efectivo y tarjeta salía entera en el bucket
              equivocado y la caja no cuadraba esa noche. */}
          {mixto && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PAYMENT_METHODS.map((m) => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--u-text-2)' }}>
                    {PAYMENT_LABEL[m]}
                  </span>
                  <input
                    value={partes[m] ?? ''}
                    onChange={(e) => setPartes((prev) => ({ ...prev, [m]: e.target.value.replace(/[^\d.,]/g, '') }))}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Cuánto se pagó en ${PAYMENT_LABEL[m].toLowerCase()}`}
                    style={{
                      width: 130, height: 46, padding: '0 12px', borderRadius: 'var(--radius-md)', outline: 'none',
                      border: '1px solid var(--u-hair-2)',
                      background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                      color: 'var(--u-text)', fontFamily: 'var(--ui-font-mono)',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 17, fontWeight: 600, textAlign: 'right',
                    }}
                  />
                </label>
              ))}

              {/* La cuenta que el cajero lleva en la cabeza mientras cobra,
                  dicha en voz alta. */}
              <div
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  padding: '10px 13px', borderRadius: 'var(--radius-md)', marginTop: 2,
                  background: mixtoListo
                    ? 'color-mix(in srgb, var(--c-ok) 10%, transparent)'
                    : 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                  border: `1px solid ${mixtoListo
                    ? 'color-mix(in srgb, var(--c-ok) 30%, transparent)'
                    : 'var(--u-hair)'}`,
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text-2)' }}>
                  {mixtoListo ? 'Cuadra' : faltaMixto > 0 ? 'Falta' : 'Sobra'}
                </span>
                <span className="t-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--u-text)' }}>
                  {money(Math.abs(mixtoListo ? 0 : faltaMixto))}
                </span>
              </div>

              {sobraNoEfectivo && (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-danger)' }}>
                  Pagar de más solo tiene sentido en efectivo, que es vuelto. Ajusta los importes.
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => { setMixto((v) => !v); setPartes({}); setRecibido(''); }}
            className="press"
            style={{
              marginTop: 10, minHeight: 38, padding: '0 14px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
              border: '1px solid var(--u-hair-2)', background: 'none',
              color: 'var(--u-text-2)', fontSize: 13, fontWeight: 600,
            }}
          >
            {mixto ? 'Pagó de una sola forma' : 'Pagó de dos formas'}
          </button>
        </div>

        {/* ── Efectivo: con cuánto pagó y cuánto se devuelve ─── */}
        {esEfectivo && !mixto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="adm-label adm-label-caps" style={{ color: 'var(--u-text-3)' }}>
              Recibí <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span>
            </div>

            <input
              ref={cashRef}
              value={recibido}
              onChange={(e) => setRecibido(e.target.value.replace(/[^\d.,]/g, ''))}
              inputMode="decimal"
              placeholder={money(total)}
              aria-label="Con cuánto pagó el cliente"
              style={{
                width: '100%', height: 52, padding: '0 14px', borderRadius: 'var(--radius-lg)', outline: 'none',
                border: `1.5px solid ${faltaEfectivo ? 'var(--c-danger)' : 'var(--u-hair-2)'}`,
                background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                color: 'var(--u-text)', fontFamily: 'var(--ui-font-mono)',
                fontVariantNumeric: 'tabular-nums',
                /* Piso de 16 px: por debajo, Safari amplía la página al
                   enfocar el campo y el mesero pierde de vista el vuelto. */
                fontSize: 20, fontWeight: 600, textAlign: 'right',
              }}
            />

            {sugerencias(total).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setRecibido(String(total))}
                  className="press"
                  style={chipBtn}
                >
                  Justo
                </button>
                {sugerencias(total).map((n) => (
                  <button key={n} type="button" onClick={() => setRecibido(String(n))} className="press" style={chipBtn}>
                    {money(n)}
                  </button>
                ))}
              </div>
            )}

            {faltaEfectivo ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-danger)' }}>
                Con {money(recibidoNum)} no alcanza: faltan {money(total - recibidoNum)}.
              </div>
            ) : vuelto != null && vuelto >= 0 ? (
              <div
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  padding: '11px 14px', borderRadius: 'var(--radius-lg)',
                  background: 'color-mix(in srgb, var(--c-ok) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--c-ok) 30%, transparent)',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text-2)' }}>Vuelto</span>
                <span
                  className="t-mono"
                  style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--u-text)' }}
                >
                  {money(vuelto)}
                </span>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Acciones ───────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 2 }}>
          <button
            type="button"
            disabled={busy || faltaEfectivo || (mixto && (!mixtoListo || sobraNoEfectivo))}
            onClick={() => onConfirm(
              mixto
                ? puesto.map((p) => ({ method: p.method, amount: p.amount }))
                : [{
                  method,
                  /* Sin importe: «lo que quede», que es la mesa entera. Es
                     la misma llamada de siempre. */
                  cashReceived: esEfectivo && recibidoNum > 0 ? recibidoNum : null,
                }],
            )}
            className="press btn-accent"
            style={{
              width: '100%', minHeight: 50, padding: '14px', borderRadius: 'var(--radius-lg)', border: 'none',
              cursor: busy || faltaEfectivo ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: 15.5,
              opacity: busy || faltaEfectivo || (mixto && (!mixtoListo || sobraNoEfectivo)) ? 0.55 : 1,
            }}
          >
            {busy
              ? 'Cerrando…'
              : mixto
                ? `Cobrar ${money(total)} repartido`
                : `Cobrar ${money(total)} en ${PAYMENT_LABEL[method].toLowerCase()}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="press glass-quiet"
            style={{
              width: '100%', minHeight: 46, padding: '13px', borderRadius: 'var(--radius-lg)', border: 'none',
              cursor: busy ? 'default' : 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--u-text-2)',
            }}
          >
            Todavía no
          </button>
        </div>
      </div>
    </div>
  );
}

const chipBtn: React.CSSProperties = {
  minHeight: 38, padding: '0 14px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
  border: '1px solid var(--u-hair-2)', background: 'none',
  color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
};
