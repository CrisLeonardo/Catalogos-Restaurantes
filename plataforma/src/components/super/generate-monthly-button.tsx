'use client';

import { useActionState } from 'react';
import { generateMonthlyInvoices, recomputeAutoPrices, type BillingState } from '@/lib/actions/billing';

/* Acciones de cobro para Finanzas > Cobranza. El cron diario ya genera y procesa
   impago solo; estos botones son el respaldo manual del mismo motor. */
export default function GenerateMonthlyButton() {
  const [genState, genAction, genPending] = useActionState<BillingState, FormData>(
    () => generateMonthlyInvoices(),
    null,
  );
  const [recState, recAction, recPending] = useActionState<BillingState, FormData>(
    () => recomputeAutoPrices(),
    null,
  );
  const state = genState ?? recState;
  const msg = state && 'ok' in state
    ? { ok: true, text: state.msg ?? 'Listo.' }
    : state && 'error' in state
    ? { ok: false, text: state.error }
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <form action={recAction}>
          <button type="submit" disabled={recPending} className="press" style={{
            padding: '10px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13,
            border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text)',
            cursor: recPending ? 'not-allowed' : 'pointer', opacity: recPending ? 0.6 : 1,
          }}>
            {recPending ? 'Recalculando…' : 'Recalcular precios'}
          </button>
        </form>
        <form action={genAction}>
          <button type="submit" disabled={genPending} className="press btn-accent" style={{
            padding: '10px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600,
            fontSize: 14, border: 'none', cursor: genPending ? 'not-allowed' : 'pointer', opacity: genPending ? 0.6 : 1,
          }}>
            {genPending ? 'Generando…' : 'Generar cobros ahora'}
          </button>
        </form>
      </div>
      {msg ? (
        <span style={{ fontSize: 13, fontWeight: 500, color: msg.ok ? 'var(--c-ok)' : 'var(--c-danger)', textAlign: 'right' }}>
          {msg.text}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--u-text-4)', textAlign: 'right' }}>
          Se genera y revisa el impago automáticamente cada día.
        </span>
      )}
    </div>
  );
}
