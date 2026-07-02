'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCashCount, type CashState, type CashSummary } from '@/lib/actions/finanzas';
import { DENOM_FIELDS } from '@/lib/finanzas-constants';

const money = (n: number) => `Q${n.toFixed(2)}`;
const BILLETES = DENOM_FIELDS.filter(d => d.kind === 'B');
const MONEDAS  = DENOM_FIELDS.filter(d => d.kind === 'M');

function DenomRow({
  field, label, centavos, qty, onChange,
}: {
  field: string; label: string; centavos: number; qty: number;
  onChange: (field: string, val: string) => void;
}) {
  const sub = (qty * centavos) / 100;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 72px', gap: 6, alignItems: 'center', marginBottom: 3 }}>
      <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontFamily: 'var(--ui-font-mono)', fontWeight: 600 }}>
        {label}
      </span>
      <input
        type="number" min="0" step="1"
        name={field} value={qty || ''}
        placeholder="0"
        onChange={e => onChange(field, e.target.value)}
        style={{
          background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', border: '1px solid var(--u-hair)',
          borderRadius: 7, padding: '5px 8px', color: 'var(--u-text)', fontSize: 13,
          outline: 'none', fontFamily: 'var(--ui-font-mono)', textAlign: 'right', width: '100%',
        }}
      />
      <span style={{
        fontSize: 12, textAlign: 'right', fontFamily: 'var(--ui-font-mono)',
        color: qty > 0 ? 'var(--u-text)' : 'var(--u-text-4)',
      }}>
        {money(sub)}
      </span>
    </div>
  );
}

export default function CashCountForm({
  restaurantId, summary,
}: { restaurantId: string; summary: CashSummary }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<CashState, FormData>(saveCashCount, null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [opening, setOpening] = useState('0');

  useEffect(() => {
    if (state && 'ok' in state) {
      setCounts({});
      setOpening('0');
      router.refresh();
    }
  }, [state, router]);

  const openNum = parseFloat(opening) || 0;
  const expected = summary.expectedCash;

  const billetesCents = BILLETES.reduce((s, d) => s + d.centavos * (counts[d.field] || 0), 0);
  const monedasCents  = MONEDAS.reduce((s, d)  => s + d.centavos * (counts[d.field] || 0), 0);
  const totalCents    = billetesCents + monedasCents;
  const countedCash   = totalCents / 100;
  const diff          = totalCents > 0 ? countedCash - (openNum + expected) : null;

  const setCount = (field: string, val: string) => {
    const n = Math.max(0, parseInt(val) || 0);
    setCounts(prev => ({ ...prev, [field]: n }));
  };

  const kicker: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--u-text-4)', marginBottom: 7, display: 'block',
  };
  const labelSt: React.CSSProperties = {
    fontSize: 10, color: 'var(--u-text-3)', fontWeight: 600,
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
  };
  const subtotalRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', padding: '6px 0 2px',
    fontSize: 11, color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)',
    borderTop: '1px solid var(--u-hair)', marginTop: 5,
  };
  const baseInput: React.CSSProperties = {
    width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
    borderRadius: 11, padding: '11px 13px', color: 'var(--u-text)', fontSize: 14,
    outline: 'none',
  };

  return (
    <form action={formAction} className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="counted_cash"  value={countedCash} />

      {/* Header */}
      <div>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Arqueo de caja · hoy</div>
        <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 4 }}>
          {summary.orders} pedidos · venta total {money(summary.totalSales)}
        </div>
      </div>

      {/* Efectivo esperado (snapshot del servidor) */}
      <div className="glass-quiet" style={{ borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}>Efectivo esperado</div>
          <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>Ventas en efectivo del día</div>
        </div>
        <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--u-text)' }}>
          {money(expected)}
        </div>
      </div>

      {/* Etiqueta de turno */}
      <div>
        <label style={labelSt}>Turno (opcional)</label>
        <input
          name="shift_label" type="text" list="shift-opts"
          placeholder="Apertura, Turno Tarde, Cierre…"
          style={{ ...baseInput, fontFamily: 'var(--font-sans)' }}
        />
        <datalist id="shift-opts">
          <option value="Apertura" />
          <option value="Turno Mañana" />
          <option value="Turno Tarde" />
          <option value="Turno Noche" />
          <option value="Cierre" />
        </datalist>
      </div>

      {/* Desglose por denominaciones */}
      <div className="glass-quiet" style={{ borderRadius: 12, padding: 14 }}>
        {/* Billetes */}
        <span style={kicker}>Billetes</span>
        {BILLETES.map(d => (
          <DenomRow key={d.field} {...d} qty={counts[d.field] || 0} onChange={setCount} />
        ))}
        <div style={subtotalRow}>
          <span>Subtotal billetes</span>
          <span>{money(billetesCents / 100)}</span>
        </div>

        <div style={{ height: 12 }} />

        {/* Monedas */}
        <span style={kicker}>Monedas</span>
        {MONEDAS.map(d => (
          <DenomRow key={d.field} {...d} qty={counts[d.field] || 0} onChange={setCount} />
        ))}
        <div style={subtotalRow}>
          <span>Subtotal monedas</span>
          <span>{money(monedasCents / 100)}</span>
        </div>

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--u-hair)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text-2)' }}>Total contado</span>
          <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 800, fontSize: 20, color: 'var(--u-text)' }}>
            {money(countedCash)}
          </span>
        </div>
      </div>

      {/* Fondo inicial */}
      <div>
        <label style={labelSt}>Fondo inicial de caja</label>
        <input
          name="opening_float" type="number" min="0" step="0.01"
          value={opening} onChange={e => setOpening(e.target.value)}
          style={{ ...baseInput, fontFamily: 'var(--ui-font-mono)' }}
        />
      </div>

      {/* Diferencia en vivo */}
      {diff !== null && (
        <div style={{
          borderRadius: 12, padding: '11px 14px', fontSize: 13.5, fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: Math.abs(diff) < 0.005 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${Math.abs(diff) < 0.005 ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
          color: Math.abs(diff) < 0.005 ? '#4ade80' : '#f87171',
        }}>
          <span>{Math.abs(diff) < 0.005 ? 'Caja cuadrada ✓' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
          <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{diff >= 0 ? '+' : ''}{money(diff)}</span>
        </div>
      )}

      {/* Notas */}
      <div>
        <label style={labelSt}>Observaciones (opcional)</label>
        <input
          name="notes" type="text"
          placeholder="Incidentes, entrega de fondo, observaciones…"
          style={{ ...baseInput, fontFamily: 'var(--font-sans)' }}
        />
      </div>

      {state && 'error' in state && (
        <div style={{ fontSize: 13, color: '#f87171' }}>{state.error}</div>
      )}

      <button
        type="submit"
        disabled={isPending || totalCents === 0}
        className="press btn-accent"
        style={{
          width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600,
          fontSize: 15, border: 'none',
          cursor: isPending || totalCents === 0 ? 'not-allowed' : 'pointer',
          opacity: isPending || totalCents === 0 ? 0.6 : 1,
        }}
      >
        {isPending ? 'Guardando…' : 'Guardar arqueo de caja'}
      </button>
    </form>
  );
}
