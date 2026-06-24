'use client';

/* ============================================================
   Precios globales del plan + reglas de cobro (mig. 035 + 049)
   · Define el precio y límite GMV de cada plan.
   · Al guardar, recalcula la mensualidad de todos los que estén
     en modo automático.
   ============================================================ */

import { useActionState } from 'react';
import { savePricingSettings, type BillingState } from '@/lib/actions/billing';
import type { PricingSettings } from '@/lib/db/billing';

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 11, padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const sectionStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  marginBottom: 10, marginTop: 4, borderBottom: '1px solid var(--u-hair)', paddingBottom: 6,
};

export default function PricingSettingsForm({ pricing }: { pricing: PricingSettings }) {
  const [state, action, pending] = useActionState<BillingState, FormData>(savePricingSettings, null);
  const toast = state && 'ok' in state
    ? { ok: true, msg: state.msg ?? 'Guardado.' }
    : state && 'error' in state
    ? { ok: false, msg: state.error }
    : null;

  return (
    <div style={{
      borderRadius: 16, background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.10)', padding: '24px 26px', maxWidth: 680,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginBottom: 6 }}>
        Precios de los planes
      </h2>
      <p style={{ fontSize: 13, color: 'var(--u-text-4)', marginBottom: 20, lineHeight: 1.5 }}>
        Estos montos se usan como precio automático de cada restaurante según su plan. Al
        guardar, se recalcula la mensualidad de todos los que estén en modo automático.
      </p>

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Precios fijos por plan */}
        <div>
          <p style={sectionStyle}>Precio mensual por plan (Q)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Field name="plan_price_BASICO"        label="Básico"        value={pricing.basico} />
            <Field name="plan_price_PREMIUM"       label="Premium"       value={pricing.premium} />
            <Field name="plan_price_PREMIUM_PRO"   label="Premium Pro"   value={pricing.premiumPro} />
            <Field name="plan_price_PREMIUM_ULTRA" label="Premium Ultra" value={pricing.premiumUltra} />
            <Field name="plan_price_ALTO_VOLUMEN"  label="Alto Volumen"  value={pricing.altoVolumen} />
          </div>
        </div>

        {/* Límites GMV por plan */}
        <div>
          <p style={sectionStyle}>Límite GMV mensual por plan (Q)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Field name="plan_gmv_limit_PREMIUM"       label="Premium"       value={pricing.gmvLimitPremium} />
            <Field name="plan_gmv_limit_PREMIUM_PRO"   label="Premium Pro"   value={pricing.gmvLimitPremiumPro} />
            <Field name="plan_gmv_limit_PREMIUM_ULTRA" label="Premium Ultra" value={pricing.gmvLimitPremiumUltra} />
            <Field name="plan_gmv_limit_ALTO_VOLUMEN"  label="Alto Volumen"  value={pricing.gmvLimitAltoVolumen} />
          </div>
        </div>

        {/* Plan variable */}
        <div>
          <p style={sectionStyle}>Plan Variable</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Field name="plan_gmv_variable_threshold" label="Umbral de entrada (Q)" value={pricing.gmvVariableThreshold} />
            <Field name="plan_gmv_variable_pct"       label="% del GMV (ej: 0.01)"  value={pricing.gmvVariablePct} step="0.001" />
            <Field name="plan_gmv_alert_pct"          label="Alerta al % del límite" value={pricing.gmvAlertPct} step="0.01" />
          </div>
        </div>

        {/* Otros cobros */}
        <div>
          <p style={sectionStyle}>Otros cobros</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Field name="group_panel_fee"  label="Panel grupo /mes" value={pricing.groupPanelFee} />
            <Field name="setup_fee_default" label="Implementación (default)" value={pricing.setupFeeDefault} />
            <Field name="grace_days"       label="Días de gracia (global)"  value={pricing.graceDays} step="1" />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--u-text-2)', cursor: 'pointer' }}>
          <input type="checkbox" name="billing_auto_generate" defaultChecked={pricing.autoGenerate} style={{ width: 16, height: 16 }} />
          Generar la mensualidad automáticamente cada mes
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--u-text-2)', cursor: 'pointer' }}>
          <input type="checkbox" name="billing_auto_suspend" defaultChecked={pricing.autoSuspend} style={{ width: 16, height: 16 }} />
          Suspender automáticamente al pasar los días de gracia sin pago
        </label>

        {toast && (
          <p style={{
            fontSize: 13, padding: '10px 14px', borderRadius: 8,
            color: toast.ok ? '#4ade80' : '#f87171',
            background: toast.ok ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
            border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}>{toast.msg}</p>
        )}

        <button type="submit" disabled={pending} style={{
          padding: '12px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14,
          cursor: pending ? 'not-allowed' : 'pointer',
          background: pending ? 'rgba(255,255,255,0.08)' : 'var(--u-text)',
          color: pending ? 'var(--u-text-3)' : 'var(--brand-bg)', border: 'none', alignSelf: 'flex-start',
        }}>
          {pending ? 'Guardando…' : 'Guardar precios'}
        </button>
      </form>
    </div>
  );
}

function Field({ name, label, value, step = '0.01' }: { name: string; label: string; value: number; step?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input name={name} type="number" min="0" step={step} defaultValue={value} style={inputStyle} />
    </div>
  );
}
