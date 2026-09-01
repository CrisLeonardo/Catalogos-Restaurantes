'use client';

/* La cuenta de la mesa, al lado del plano.
   ------------------------------------------------------------------
   Tocar una mesa ya no cambia de pantalla: la cuenta se abre aquí,
   con el plano todavía a la vista. Es la diferencia entre «ir a ver
   la mesa 3» y «mirar la mesa 3 sin perder de vista el salón».

   Este panel LEE, no cobra: las tres acciones del pie llevan al panel
   de mesero, que es donde vive el pedido. Duplicar aquí el cobro o el
   reparto sería una segunda verdad sobre la misma mesa. */

import { Icon } from '@/components/icons';
import type { SalonTable } from '@/components/admin/salon/pieces';
import { estadoDeFicha, estadoInk } from '@/components/admin/salon/pieces';
import type { BillLine, BillBreakdown } from '@/lib/bill-split';

export interface BillData {
  lines: BillLine[];
  breakdown: BillBreakdown;
}

export default function BillPanel({
  t, data, loading, error, money, sentados, canWaiter,
  onClose, onCobrar, onDividir, onAgregar,
}: {
  t: SalonTable;
  data: BillData | null;
  loading: boolean;
  error: string | null;
  money: (n: number) => string;
  /** «sentados hace 1 h 12 min» — null si no hay reloj todavía. */
  sentados: string | null;
  /** El plan incluye el panel de mesero: sin él las acciones no llevan a ninguna parte. */
  canWaiter: boolean;
  onClose: () => void;
  onCobrar: () => void;
  onDividir: () => void;
  onAgregar: () => void;
}) {
  const libre = t.state.kind === 'libre';
  const vivas = (data?.lines ?? []).filter((l) => l.quantity > 0);
  const total = data?.breakdown.grandTotal ?? 0;

  return (
    <aside
      className="salon-bill"
      style={{
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRadius: 16, border: '1px solid var(--u-hair)',
        background: 'var(--adm-card)', boxShadow: 'var(--adm-shadow-xs)',
      }}
      aria-label={`Cuenta de la mesa ${t.n}`}
    >
      {/* Cabecera: quién es esta mesa y qué le pasa. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 16px 13px', borderBottom: '1px solid var(--u-hair)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="t-mono" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
              {t.n}
            </span>
            {t.pax && <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{t.pax.replace(' pers', ' personas')}</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: estadoInk(t) }}>
            {estadoDeFicha(t)}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2 }}>
            {libre
              ? 'Sin abrir'
              : [t.occ?.waiterName ?? 'Sin asignar', sentados && `sentados hace ${sentados}`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar la cuenta"
          className="press"
          style={{
            display: 'grid', placeItems: 'center', width: 32, height: 32, flexShrink: 0,
            borderRadius: 9, border: '1px solid var(--u-hair-2)', background: 'none',
            color: 'var(--u-text-2)', cursor: 'pointer',
          }}
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      {/* Cuerpo: la cuenta tal cual. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {libre ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Esta mesa está libre. Ábrela tomándole el pedido y la cuenta empieza aquí.
          </p>
        ) : loading ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--u-text-3)' }}>Cargando la cuenta…</p>
        ) : error ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-danger)', lineHeight: 1.5 }}>{error}</p>
        ) : (
          <>
            <div className="adm-label" style={{ color: 'var(--u-text-3)' }}>La cuenta</div>
            {vivas.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--u-text-3)' }}>Todavía no hay platos apuntados.</p>
            ) : vivas.map((l) => (
              <div key={l.itemId} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13.5 }}>
                <span className="t-mono" style={{ width: 22, flexShrink: 0, fontWeight: 600, color: 'var(--u-text-3)' }}>
                  {l.quantity}
                </span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--u-text-2)' }}>
                  {l.name}
                  {l.note && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--brand-accent-ink)', marginTop: 1 }}>
                      {l.note}
                    </span>
                  )}
                </span>
                <span className="t-mono" style={{ fontWeight: 600, color: 'var(--u-text)' }}>{money(l.lineTotal)}</span>
              </div>
            ))}

            {data && (
              <>
                <div style={{ height: 1, background: 'var(--u-hair)', margin: '4px 0' }} />
                {data.breakdown.tip > 0 && (
                  <Fila label="Propina" value={money(data.breakdown.tip)} />
                )}
                {data.breakdown.discount > 0 && (
                  <Fila label="Descuento" value={`−${money(data.breakdown.discount)}`} />
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Total</span>
                  <span className="t-mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
                    {money(total)}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Pie: la acción que toca, y las dos de siempre debajo. */}
      <div style={{ padding: '14px 16px 16px', borderTop: '1px solid var(--u-hair)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!canWaiter && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.45 }}>
            Cobrar y agregar platos se hace desde el panel de mesero, que no está en tu plan.
          </p>
        )}
        <button
          type="button"
          className="press btn-accent"
          onClick={libre ? onAgregar : onCobrar}
          disabled={!canWaiter}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 46, borderRadius: 12, border: 'none', cursor: canWaiter ? 'pointer' : 'default',
            fontSize: 15, fontWeight: 600, opacity: canWaiter ? 1 : 0.55, width: '100%',
          }}
        >
          <Icon name="creditCard" size={18} />
          {libre ? 'Abrir mesa' : total > 0 ? `Cobrar ${money(total)}` : 'Cobrar'}
        </button>
        {!libre && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Secundario icon="list" label="Dividir" onClick={onDividir} disabled={!canWaiter} />
            <Secundario icon="plus" label="Agregar" onClick={onAgregar} disabled={!canWaiter} />
          </div>
        )}
      </div>
    </aside>
  );
}

function Fila({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 13, color: 'var(--u-text-3)' }}>
      <span>{label}</span>
      <span className="t-mono" style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Secundario({ icon, label, onClick, disabled }: {
  icon: 'list' | 'plus'; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        height: 40, borderRadius: 11, cursor: disabled ? 'default' : 'pointer',
        border: '1px solid var(--u-hair-2)', background: 'none',
        color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500, opacity: disabled ? 0.55 : 1,
      }}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}
