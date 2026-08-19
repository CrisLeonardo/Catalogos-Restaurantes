'use client';

/* ============================================================
   Precios globales del plan + reglas de cobro (mig. 035 + 072)
   · Define el precio fijo de cada plan y de cada módulo a la carta.
     Sin GMV: nadie paga en función de cuánto vende.
   · Al guardar: recalcula la mensualidad de todos los que estén en
     modo automático Y publica los precios nuevos en la web pública
     (landing, /planes, /registro) al instante.
   ============================================================ */

import { useActionState } from 'react';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icons';
import { savePricingSettings, type BillingState } from '@/lib/actions/billing';
import type { PricingSettings } from '@/lib/db/billing';

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
  display: 'flex', alignItems: 'center', gap: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--u-text) 12%, transparent)',
  borderRadius: 11, padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
  fontFamily: 'var(--ui-font-mono)',
};

const PLAN_COLORS: Record<string, string> = {
  BASICO: '#94a3b8', ESTANDAR: '#10b981', PREMIUM: '#6366f1', PRO: '#a855f7',
};

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
      <h3 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>{title}</h3>
      {description && (
        <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', margin: '6px 0 0', lineHeight: 1.55, maxWidth: 640 }}>
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
        {dot && <span style={{ width: 8, height: 8, borderRadius: 99, background: dot, flexShrink: 0 }} />}
        {label}
      </label>
      <input name={name} type="number" min="0" step={step} defaultValue={value} style={inputStyle} />
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
        <p style={{ fontSize: 12.5, color: 'var(--u-text-2)', margin: 0, lineHeight: 1.55 }}>
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
        title="Plan a tu medida (descuento por método de pedido)"
        description="En Premium y Pro, cada método de pedido que el restaurante NO use (comer en local / para llevar / a domicilio) descuenta este monto de su mensualidad. El máximo fija el piso: siempre se paga al menos un método."
      >
        <Grid>
          <Field name="channel_discount_per" label="Descuento por método (Q)" value={pricing.channelDiscountPer} step="1" />
          <Field name="channel_discount_max" label="Máx. métodos descontables (de 3)" value={pricing.channelDiscountMax} step="1" />
        </Grid>
      </Section>

      <Section
        title="Módulos a la carta (Q/mes)"
        description="Precio de cada módulo cuando se activa en un restaurante cuyo plan no lo incluye gratis (Premium incluye 6). Proveedores y FEL aún no se ofrecen a clientes — solo tú puedes activarlos desde la ficha."
      >
        <Grid>
          <Field name="module_price_reservaciones"  label="Reservaciones"     value={pricing.modulePrices.reservaciones} />
          <Field name="module_price_llamada_mesero" label="Llamar al mesero"  value={pricing.modulePrices.llamada_mesero} />
          <Field name="module_price_encuestas"      label="Encuestas"         value={pricing.modulePrices.encuestas} />
          <Field name="module_price_cupones"        label="Cupones"           value={pricing.modulePrices.cupones} />
          <Field name="module_price_loyalty"        label="Lealtad / puntos"  value={pricing.modulePrices.loyalty} />
          <Field name="module_price_recetas"        label="Recetas"           value={pricing.modulePrices.recetas} />
          <Field name="module_price_proveedores"    label="Proveedores"       value={pricing.modulePrices.proveedores} />
          <Field name="module_price_fel"            label="Factura Electrónica (FEL)" value={pricing.modulePrices.fel} />
          <Field name="module_setup_fee_fel"        label="FEL — activación única" value={pricing.moduleSetupFeeFel} />
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--u-text-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="billing_auto_generate" defaultChecked={pricing.autoGenerate} style={{ width: 16, height: 16 }} />
            Generar la mensualidad automáticamente cada mes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--u-text-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="billing_auto_suspend" defaultChecked={pricing.autoSuspend} style={{ width: 16, height: 16 }} />
            Suspender automáticamente al pasar los días de gracia sin pago
          </label>
        </div>
      </Section>

      {toast && (
        <p style={{
          fontSize: 13, padding: '10px 14px', borderRadius: 8, margin: 0,
          color: toast.ok ? '#4ade80' : '#f87171',
          background: toast.ok ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
          border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>{toast.msg}</p>
      )}

      <button type="submit" disabled={pending} className="press btn-accent" style={{
        padding: '13px 28px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 14.5,
        cursor: pending ? 'not-allowed' : 'pointer', border: 'none', alignSelf: 'flex-start',
        opacity: pending ? 0.6 : 1,
      }}>
        {pending ? 'Guardando…' : 'Guardar y publicar precios'}
      </button>
    </form>
  );
}
