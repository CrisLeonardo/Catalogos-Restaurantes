'use client';

import { useMemo, useState } from 'react';
import {
  PLANS, PUBLIC_PLANS, ADDON_MODULES, isModuleIncluded, planAddonCost, isAddonAvailable,
} from '@/lib/plans';
import type { PlanCode } from '@/lib/plans';
import { ACTIVATABLE_MODULES } from '@/lib/modules';
import type { ActivatableModuleKey } from '@/lib/modules';
import { Icon } from '@/components/icons';

function fmtQ(n: number) {
  return 'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

const ACCENT_BY_PLAN: Record<PlanCode, string> = {
  BASICO: '#94a3b8',
  ESTANDAR: '#10b981',
  PREMIUM: '#6366f1',
  PRO: '#a855f7',
};

/** Sugerencia inicial de módulos según el plan (los que ya trae incluidos). */
function defaultAddonsFor(plan: PlanCode): Set<ActivatableModuleKey> {
  return new Set(ACTIVATABLE_MODULES.filter((m) => isModuleIncluded(plan, m.key)).map((m) => m.key));
}

export default function PlanBuilder() {
  const [plan, setPlan] = useState<PlanCode>('PREMIUM');
  const [addons, setAddons] = useState<Set<ActivatableModuleKey>>(() => defaultAddonsFor('PREMIUM'));

  const accent = ACCENT_BY_PLAN[plan];
  const addonList = [...addons];
  const extraCost = planAddonCost(plan, addonList);
  const total = PLANS[plan].priceMonthly + extraCost;

  const notIncludedSelected = useMemo(
    () => addonList.filter((k) => !isModuleIncluded(plan, k)),
    [addonList, plan],
  );

  function choosePlan(next: PlanCode) {
    setPlan(next);
    // Mantén lo que el usuario marcó a mano; solo se recalcula qué cuenta como "incluido".
  }

  function toggleAddon(key: ActivatableModuleKey) {
    setAddons((prev) => {
      const copy = new Set(prev);
      if (copy.has(key)) copy.delete(key); else copy.add(key);
      return copy;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Paso 1: plan base */}
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--u-text)' }}>
          1. Elige tu plan base
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
          {PUBLIC_PLANS.map((code) => {
            const p = PLANS[code];
            const a = ACCENT_BY_PLAN[code];
            const isActive = code === plan;
            return (
              <button
                key={code}
                type="button"
                onClick={() => choosePlan(code)}
                style={{
                  padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${isActive ? a : 'var(--u-hair)'}`,
                  background: isActive ? `color-mix(in srgb, ${a} 12%, transparent)` : 'transparent',
                  color: isActive ? a : 'var(--u-text-3)',
                  fontWeight: isActive ? 700 : 500, fontSize: 12.5, transition: 'all 0.15s',
                }}
              >
                {p.name}
                <br />
                <span style={{ fontSize: 11, opacity: 0.8 }}>{p.priceLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Paso 2: módulos */}
      <div>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--u-text)' }}>
          2. Marca los módulos que quieres usar
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {ACTIVATABLE_MODULES.filter((m) => isAddonAvailable(m.key)).map((m) => {
            const included = isModuleIncluded(plan, m.key);
            const checked = addons.has(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleAddon(m.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 12,
                  textAlign: 'left', cursor: 'pointer',
                  border: `1.5px solid ${checked ? accent : 'var(--u-hair)'}`,
                  background: checked ? `color-mix(in srgb, ${accent} 8%, transparent)` : 'transparent',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center',
                  border: `1.5px solid ${checked ? accent : 'var(--u-text-4)'}`,
                  background: checked ? accent : 'transparent',
                }}>
                  {checked && <Icon name="check" size={12} style={{ color: '#fff' }} />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)' }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: included ? '#4ade80' : 'var(--u-text-4)', fontWeight: included ? 700 : 500 }}>
                    {included ? 'Incluido en tu plan' : `Q${ADDON_MODULES[m.key].price}/mes`}
                  </div>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resultado */}
      <div
        style={{
          borderRadius: 18,
          padding: '22px 24px',
          border: `2px solid ${accent}`,
          background: `color-mix(in srgb, ${accent} 8%, transparent)`,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, marginBottom: 2 }}>
              Tu plan
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--u-text)', fontFamily: 'var(--font-display)' }}>
              {PLANS[plan].name}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: accent, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
              {fmtQ(total)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>por mes · precio fijo, sin importar cuánto vendas</div>
          </div>
        </div>

        {notIncludedSelected.length > 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.6 }}>
            {fmtQ(PLANS[plan].priceMonthly)} de {PLANS[plan].name} + {notIncludedSelected.map((k) => ADDON_MODULES[k].price).reduce((a, b) => a + b, 0) > 0 ? (
              <>
                {notIncludedSelected.map((k, i) => (
                  <span key={k}>
                    {i > 0 ? ' + ' : ''}{fmtQ(ADDON_MODULES[k].price)} {ACTIVATABLE_MODULES.find((m) => m.key === k)?.label}
                  </span>
                ))}
              </>
            ) : null}
          </div>
        )}

        <p style={{ fontSize: 13.5, color: 'var(--u-text-2)', lineHeight: 1.5, margin: 0 }}>
          {plan === 'BASICO' && addonList.length === 0
            ? 'Menú digital con QR, sin pedidos en línea. Ideal para empezar.'
            : `Con ${PLANS[plan].name} y ${addonList.length} módulo${addonList.length !== 1 ? 's' : ''} activo${addonList.length !== 1 ? 's' : ''}, pagas ${fmtQ(total)} al mes — pase lo que pase con tus ventas.`}
        </p>
      </div>
    </div>
  );
}
