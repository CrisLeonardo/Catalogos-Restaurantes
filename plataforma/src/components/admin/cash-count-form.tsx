'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCashCount, type CashState, type CashSummary } from '@/lib/actions/finanzas';

const money = (n: number) => `Q${n.toFixed(2)}`;

/* Corte de caja del día: esperado (snapshot del servidor) vs contado. */
export default function CashCountForm({
  restaurantId, summary,
}: { restaurantId: string; summary: CashSummary }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<CashState, FormData>(saveCashCount, null);
  const [opening, setOpening] = useState('0');
  const [counted, setCounted] = useState('');

  useEffect(() => {
    if (state && 'ok' in state) router.refresh();
  }, [state, router]);

  const openNum = parseFloat(opening) || 0;
  const countNum = parseFloat(counted);
  const expected = summary.expectedCash;
  const diff = isNaN(countNum) ? null : countNum - (openNum + expected);

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair)',
    borderRadius: 11, padding: '11px 13px', color: 'var(--u-text)', fontSize: 15,
    outline: 'none', fontFamily: 'var(--ui-font-mono)',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600,
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
  };

  return (
    <form action={formAction} className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <div>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Corte de caja · hoy</div>
        <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 4 }}>
          {summary.orders} pedidos · venta total {money(summary.totalSales)}
        </div>
      </div>

      {/* Esperado (snapshot del servidor, no editable) */}
      <div className="glass-quiet" style={{ borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}>Efectivo esperado</div>
          <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>Ventas en efectivo del día</div>
        </div>
        <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--u-text)' }}>
          {money(expected)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Fondo inicial</label>
          <input name="opening_float" type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Efectivo contado</label>
          <input name="counted_cash" type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" style={inputStyle} />
        </div>
      </div>

      {/* Diferencia en vivo */}
      {diff !== null && (
        <div
          style={{
            borderRadius: 12, padding: '11px 14px', fontSize: 13.5, fontWeight: 600,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: Math.abs(diff) < 0.005 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
            border: `1px solid ${Math.abs(diff) < 0.005 ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
            color: Math.abs(diff) < 0.005 ? '#4ade80' : '#f87171',
          }}
        >
          <span>{Math.abs(diff) < 0.005 ? 'Caja cuadrada' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
          <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{diff >= 0 ? '+' : ''}{money(diff)}</span>
        </div>
      )}

      <div>
        <label style={labelStyle}>Notas (opcional)</label>
        <input name="notes" type="text" placeholder="Turno mañana, observaciones…" style={{ ...inputStyle, fontFamily: 'var(--font-sans)', fontSize: 14 }} />
      </div>

      {state && 'error' in state && (
        <div style={{ fontSize: 13, color: '#f87171' }}>{state.error}</div>
      )}

      <button
        type="submit"
        disabled={isPending || isNaN(countNum)}
        className="press btn-accent"
        style={{
          width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600,
          fontSize: 15, border: 'none', cursor: isPending || isNaN(countNum) ? 'not-allowed' : 'pointer',
          opacity: isPending || isNaN(countNum) ? 0.6 : 1,
        }}
      >
        {isPending ? 'Guardando…' : 'Guardar corte de caja'}
      </button>
    </form>
  );
}
