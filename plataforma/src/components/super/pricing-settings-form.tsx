'use client';

/* ============================================================
   Precios globales del plan + reglas de cobro (mig. 035 + 072 + 120)
   · Define el precio fijo de cada plan — sin GMV, sin módulos a la
     carta ni descuento por canal (cada plan ya trae definido lo suyo).
   · Al guardar: recalcula la mensualidad de todos los que estén en
     modo automático Y publica los precios nuevos en la web pública
     (landing, /planes, /registro) al instante.
   ============================================================ */

import { useActionState } from 'react';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icons';
import { savePricingSettings, type BillingState } from '@/lib/actions/billing';
import type { PricingSettings } from '@/lib/db/billing';
import { FIELD_LABEL } from '@/components/admin/field-label';
import { PLAN_COLOR_VAR } from '@/lib/plans';

/* El rótulo de campo del panel (D-8), con sitio para un icono al lado. */
const labelStyle: React.CSSProperties = { ...FIELD_LABEL, display: 'flex', alignItems: 'center', gap: 6 };

const PLAN_COLORS: Record<string, string> = PLAN_COLOR_VAR;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ padding: '20px 22px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>{title}</h3>
      {description && (
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '6px 0 0', lineHeight: 1.55, maxWidth: 640 }}>
          {description}
        </p>
      )}
      <div style={{ marginTop: 16 }}>{children}</div>
    </Card>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      {children}
    </div>
  );
}

function Field({
  name, label, value, step = '0.01', dot,
}: {
  name: string; label: string; value: number; step?: string; dot?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {dot && <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: dot, flexShrink: 0 }} />}
        {label}
      </label>
      <input name={name} type="number" min="0" step={step} defaultValue={value} className="adm-field adm-field-mono" />
    </div>
  );
}

export default function PricingSettingsForm({ pricing }: { pricing: PricingSettings }) {
  const [state, action, pending] = useActionState<BillingState, FormData>(savePricingSettings, null);
  const toast = state && 'ok' in state
    ? { ok: true, msg: state.msg ?? 'Guardado.' }
    : state && 'error' in state
    ? { ok: false, msg: state.error }
    : null;

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>

      {/* Aviso de alcance: esto ES el precio publicado */}
      <Card style={{ padding: '13px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid color-mix(in srgb, var(--brand-accent) 30%, transparent)' }}>
        <Icon name="sparkle" size={16} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: 'var(--u-text-2)', margin: 0, lineHeight: 1.55 }}>
          Estos precios son la <strong>única fuente de verdad</strong>: al guardar se actualizan la página
          pública de planes, el registro, los upsells del panel de cada restaurante y la mensualidad
          de todos los que estén en precio automático.
        </p>
      </Card>

      <Section
        title="Precio mensual por plan"
        description="Lo que paga cada restaurante al mes según su plan. Pro no se ofrece al público; solo tú puedes asignarlo."
      >
        <Grid>
          <Field name="plan_price_BASICO"   label="Básico"   value={pricing.basico}   dot={PLAN_COLORS.BASICO} />
          <Field name="plan_price_ESTANDAR" label="Estándar" value={pricing.estandar} dot={PLAN_COLORS.ESTANDAR} />
          <Field name="plan_price_PREMIUM"  label="Premium"  value={pricing.premium}  dot={PLAN_COLORS.PREMIUM} />
          <Field name="plan_price_PRO"      label="Pro"      value={pricing.pro}      dot={PLAN_COLORS.PRO} />
        </Grid>
      </Section>

      <Section
        title="Configuración asistida — cobro único"
        description={<>Referencia por plan; el cobro real se genera manual desde la ficha del restaurante («Cobro de implementación»).</>}
      >
        <Grid>
          <Field name="setup_fee_BASICO"   label="Básico"   value={pricing.setupFeeBasico}   dot={PLAN_COLORS.BASICO} />
          <Field name="setup_fee_ESTANDAR" label="Estándar" value={pricing.setupFeeEstandar} dot={PLAN_COLORS.ESTANDAR} />
          <Field name="setup_fee_PREMIUM"  label="Premium"  value={pricing.setupFeePremium}  dot={PLAN_COLORS.PREMIUM} />
          <Field name="setup_fee_PRO"      label="Pro (incluida)" value={pricing.setupFeePro} dot={PLAN_COLORS.PRO} />
          <Field name="setup_fee_default"  label="Default (sin plan)" value={pricing.setupFeeDefault} />
        </Grid>
      </Section>

      <Section
        title="Reglas de cobranza"
        description="Cada sucursal paga su plan, pertenezca o no a un grupo: el descuento por volumen se retiró en la migración 115."
      >
        <Grid>
          <Field name="group_panel_fee" label="Panel de grupo (Q/mes)" value={pricing.groupPanelFee} />
          <Field name="grace_days"      label="Días de gracia (global)" value={pricing.graceDays} step="1" />
          <Field name="trial_days"      label="Días de prueba (1er restaurante)" value={pricing.trialDays} step="1" />
        </Grid>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--u-text-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="billing_auto_generate" defaultChecked={pricing.autoGenerate} style={{ width: 16, height: 16 }} />
            Generar la mensualidad automáticamente cada mes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--u-text-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="billing_auto_suspend" defaultChecked={pricing.autoSuspend} style={{ width: 16, height: 16 }} />
            Suspender automáticamente al pasar los días de gracia sin pago
          </label>
        </div>
      </Section>

      {toast && (
        <p style={{
          fontSize: 13, padding: '10px 14px', borderRadius: 'var(--radius-sm)', margin: 0,
          color: toast.ok ? 'var(--c-ok)' : 'var(--c-danger)',
          background: toast.ok ? 'var(--c-ok-bg)' : 'var(--c-danger-bg)',
          border: `1px solid ${toast.ok ? 'var(--c-ok-line)' : 'var(--c-danger-line)'}`,
        }}>{toast.msg}</p>
      )}

      <button type="submit" disabled={pending} className="press btn-accent" style={{
        padding: '13px 28px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 14,
        cursor: pending ? 'not-allowed' : 'pointer', border: 'none', alignSelf: 'flex-start',
        opacity: pending ? 0.6 : 1,
      }}>
        {pending ? 'Guardando…' : 'Guardar y publicar precios'}
      </button>
    </form>
  );
}
