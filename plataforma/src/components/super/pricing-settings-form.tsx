'use client';

/* ============================================================
   Precios globales del plan + reglas de cobro (mig. 035 + 072)
   · Define el precio fijo de cada plan y de cada módulo a la carta.
     Sin GMV: nadie paga en función de cuánto vende.
   · Al guardar, recalcula la mensualidad de todos los que estén
     en modo automático (los congelados manualmente no se tocan).
   ============================================================ */

import { useActionState } from 'react';
import { savePricingSettings, type BillingState } from '@/lib/actions/billing';
import type { PricingSettings } from '@/lib/db/billing';

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--u-text) 12%, transparent)',
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
      borderRadius: 16, background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
      border: '1px solid color-mix(in srgb, var(--u-text) 10%, transparent)', padding: '24px 26px', maxWidth: 680,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginBottom: 6 }}>
        Precios de los planes
      </h2>
      <p style={{ fontSize: 13, color: 'var(--u-text-4)', marginBottom: 20, lineHeight: 1.5 }}>
        Estos montos se usan como precio automático de cada restaurante según su plan. Al
        guardar, se recalcula la mensualidad de todos los que estén en modo automático.
      </p>

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Precios fijos por plan — sin GMV, nadie paga según cuánto vende */}
        <div>
          <p style={sectionStyle}>Precio mensual por plan (Q)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Field name="plan_price_BASICO"   label="Básico"   value={pricing.basico} />
            <Field name="plan_price_ESTANDAR" label="Estándar" value={pricing.estandar} />
            <Field name="plan_price_PREMIUM"  label="Premium"  value={pricing.premium} />
            <Field name="plan_price_PRO"      label="Pro"      value={pricing.pro} />
          </div>
        </div>

        {/* Plan a tu medida — descuento por canal de servicio desactivado */}
        <div>
          <p style={sectionStyle}>Plan a tu medida (descuento por canal)</p>
          <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', margin: '-4px 0 10px', lineHeight: 1.5 }}>
            En Premium y Pro, cada canal de servicio que el restaurante NO use (local / domicilio)
            descuenta este monto de su mensualidad. El máximo de canales descontables fija el
            piso (siempre se paga al menos un canal).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Field name="channel_discount_per" label="Descuento por método de pedido (Q)" value={pricing.channelDiscountPer} step="1" />
            <Field name="channel_discount_max" label="Máx. métodos descontables (de 3)" value={pricing.channelDiscountMax} step="1" />
          </div>
        </div>

        {/* Módulos a la carta */}
        <div>
          <p style={sectionStyle}>Módulos a la carta (Q/mes)</p>
          <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', margin: '-4px 0 10px', lineHeight: 1.5 }}>
            Precio de cada módulo cuando se activa en un restaurante cuyo plan no lo incluye
            gratis (Premium incluye 6). Proveedores y FEL existen aquí para cuando estén listos,
            pero no se ofrecen a clientes todavía — el plan Pro tampoco. Ver la ficha del
            restaurante para activarlos manualmente.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Field name="module_price_reservaciones"  label="Reservaciones"     value={pricing.modulePrices.reservaciones} />
            <Field name="module_price_llamada_mesero" label="Llamar al mesero"  value={pricing.modulePrices.llamada_mesero} />
            <Field name="module_price_encuestas"      label="Encuestas"         value={pricing.modulePrices.encuestas} />
            <Field name="module_price_cupones"        label="Cupones"           value={pricing.modulePrices.cupones} />
            <Field name="module_price_loyalty"        label="Lealtad / puntos"  value={pricing.modulePrices.loyalty} />
            <Field name="module_price_recetas"        label="Recetas"           value={pricing.modulePrices.recetas} />
            <Field name="module_price_proveedores"    label="Proveedores"       value={pricing.modulePrices.proveedores} />
            <Field name="module_price_fel"            label="Factura Electrónica (FEL)" value={pricing.modulePrices.fel} />
            <Field name="module_setup_fee_fel"        label="FEL — activación única" value={pricing.moduleSetupFeeFel} />
          </div>
        </div>

        {/* Implementación por plan */}
        <div>
          <p style={sectionStyle}>Configuración asistida — cobro único (Q)</p>
          <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', margin: '-4px 0 10px', lineHeight: 1.5 }}>
            Referencia por plan; el cobro real se genera manual desde la ficha del restaurante
            (&ldquo;Cobro de implementación&rdquo;).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Field name="setup_fee_BASICO"   label="Básico"   value={pricing.setupFeeBasico} />
            <Field name="setup_fee_ESTANDAR" label="Estándar" value={pricing.setupFeeEstandar} />
            <Field name="setup_fee_PREMIUM"  label="Premium"  value={pricing.setupFeePremium} />
            <Field name="setup_fee_PRO"      label="Pro (incluida)" value={pricing.setupFeePro} />
          </div>
        </div>

        {/* Otros cobros */}
        <div>
          <p style={sectionStyle}>Otros cobros</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Field name="group_panel_fee"    label="Panel grupo /mes" value={pricing.groupPanelFee} />
            <Field name="setup_fee_default"  label="Implementación (default)" value={pricing.setupFeeDefault} />
            <Field name="grace_days"         label="Días de gracia (global)"  value={pricing.graceDays} step="1" />
            <Field name="trial_days"         label="Días de prueba gratis"    value={pricing.trialDays} step="1" />
          </div>
          <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '10px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
            El descuento por volumen de sucursales (10% / 15% / 20% según el tamaño del grupo)
            no es editable aquí: vive en <code>leogin_branch_discount_pct()</code> en la base de datos.
          </p>
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
          background: pending ? 'color-mix(in srgb, var(--u-text) 8%, transparent)' : 'var(--u-text)',
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
