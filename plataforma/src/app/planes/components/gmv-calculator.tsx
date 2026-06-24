'use client';

import { useState } from 'react';
import { PLANS, PUBLIC_PLANS } from '@/lib/plans';
import type { PlanCode } from '@/lib/plans';

function fmtQ(n: number) {
  return 'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

function recommendPlan(gmv: number): { plan: PlanCode; price: number; pct: string } {
  if (gmv === 0)     return { plan: 'BASICO',        price: 299,  pct: '—' };
  if (gmv <= 10000)  return { plan: 'BASICO',        price: 299,  pct: ((299  / gmv) * 100).toFixed(1) + '%' };
  if (gmv <= 20000)  return { plan: 'PREMIUM',       price: 599,  pct: ((599  / gmv) * 100).toFixed(1) + '%' };
  if (gmv <= 40000)  return { plan: 'PREMIUM_PRO',   price: 999,  pct: ((999  / gmv) * 100).toFixed(1) + '%' };
  if (gmv <= 75000)  return { plan: 'PREMIUM_ULTRA', price: 1499, pct: ((1499 / gmv) * 100).toFixed(1) + '%' };
  if (gmv <= 225000) return { plan: 'ALTO_VOLUMEN',  price: 2249, pct: ((2249 / gmv) * 100).toFixed(1) + '%' };
  return { plan: 'VARIABLE', price: Math.round(gmv * 0.01), pct: '1.0%' };
}

const ACCENT_BY_PLAN: Record<PlanCode, string> = {
  BASICO:        '#94a3b8',
  PREMIUM:       '#6366f1',
  PREMIUM_PRO:   '#a855f7',
  PREMIUM_ULTRA: '#14b8a6',
  ALTO_VOLUMEN:  '#f97316',
  VARIABLE:      '#f59e0b',
};

export default function GmvCalculator() {
  const [gmv, setGmv] = useState(20000);
  const { plan, price, pct } = recommendPlan(gmv);
  const planData = PLANS[plan];
  const accent = ACCENT_BY_PLAN[plan];

  const motivation =
    gmv === 0
      ? 'Con el plan Básico tienes tu menú digital activo sin pedidos online.'
      : plan === 'VARIABLE'
      ? `Con ${fmtQ(gmv)} en ventas digitales, pagas ${fmtQ(price)} al mes — solo el 1%.`
      : `Con ${fmtQ(gmv)} en ventas digitales, pagas ${fmtQ(price)} al mes — solo el ${pct} de tus ventas.`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <label
          htmlFor="gmv-slider"
          style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--u-text)' }}
        >
          ¿Cuánto venden tus restaurantes al mes en pedidos digitales?
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <input
            id="gmv-slider"
            type="range"
            min={0}
            max={300000}
            step={5000}
            value={gmv}
            onChange={(e) => setGmv(Number(e.target.value))}
            style={{ flex: 1, accentColor: accent }}
          />
          <span
            style={{
              minWidth: 110, textAlign: 'right', fontFamily: 'var(--ui-font-mono)',
              fontWeight: 700, fontSize: 18, color: accent,
            }}
          >
            {fmtQ(gmv)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 4 }}>
          <span>Q0</span><span>Q300,000</span>
        </div>
      </div>

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
              Plan recomendado
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--u-text)', fontFamily: 'var(--font-display)' }}>
              {planData.name}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: accent, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
              {plan === 'VARIABLE' ? `${fmtQ(price)}` : `${fmtQ(price)}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>por mes · {pct !== '—' ? `${pct} efectivo` : 'sin pedidos'}</div>
          </div>
        </div>

        <p style={{ fontSize: 14, color: 'var(--u-text-2)', lineHeight: 1.5, margin: 0 }}>
          {motivation}
        </p>

        {planData.gmvLimitLabel && (
          <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', fontStyle: 'italic' }}>
            {planData.gmvLimitLabel}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
        {PUBLIC_PLANS.map((code) => {
          const p = PLANS[code];
          const a = ACCENT_BY_PLAN[code];
          const isActive = code === plan;
          return (
            <button
              key={code}
              type="button"
              onClick={() => {
                const mid = code === 'BASICO' ? 5000
                  : code === 'PREMIUM' ? 15000
                  : code === 'PREMIUM_PRO' ? 30000
                  : code === 'PREMIUM_ULTRA' ? 60000
                  : 100000;
                setGmv(mid);
              }}
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
        <button
          type="button"
          onClick={() => setGmv(250000)}
          style={{
            padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
            border: `1.5px solid ${'VARIABLE' === plan ? ACCENT_BY_PLAN.VARIABLE : 'var(--u-hair)'}`,
            background: 'VARIABLE' === plan ? `color-mix(in srgb, ${ACCENT_BY_PLAN.VARIABLE} 12%, transparent)` : 'transparent',
            color: 'VARIABLE' === plan ? ACCENT_BY_PLAN.VARIABLE : 'var(--u-text-3)',
            fontWeight: 'VARIABLE' === plan ? 700 : 500, fontSize: 12.5, transition: 'all 0.15s',
          }}
        >
          Variable
          <br />
          <span style={{ fontSize: 11, opacity: 0.8 }}>1% del GMV</span>
        </button>
      </div>
    </div>
  );
}
