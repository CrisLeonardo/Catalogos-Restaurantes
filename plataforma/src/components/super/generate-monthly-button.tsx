'use client';

import { useActionState } from 'react';
import { generateMonthlyInvoices, type BillingState } from '@/lib/actions/billing';

/* Botón "Generar cobros del mes" (idempotente). Para /super/cobros. */
export default function GenerateMonthlyButton() {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(
    () => generateMonthlyInvoices(),
    null,
  );
  const msg = state && 'ok' in state
    ? { ok: true, text: state.msg ?? 'Listo.' }
    : state && 'error' in state
    ? { ok: false, text: state.error }
    : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <form action={formAction}>
        <button type="submit" disabled={pending} className="press btn-accent" style={{
          padding: '10px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600,
          fontSize: 14, border: 'none', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1,
        }}>
          {pending ? 'Generando…' : 'Generar cobros del mes'}
        </button>
      </form>
      {msg && (
        <span style={{ fontSize: 13, fontWeight: 500, color: msg.ok ? '#4ade80' : '#f87171' }}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
