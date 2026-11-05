'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import { Icon } from '@/components/icons';
import { cambiarMiPlan } from '@/lib/actions/cambiar-plan';
import {
  PLANS, PLAN_POINTS, PUBLIC_PLANS, PLAN_COLOR_VAR, isUpgrade, loQueSePierde, planPriceLabel,
  planChangePresentation, type planPresentation, type PlanCode, type PlanPricing,
} from '@/lib/plans';

/* ============================================================
   CAMBIAR DE PLAN — Mi suscripción (plan 2026-10-28, fase 3)
   ------------------------------------------------------------
   Los planes uno al lado del otro; tocar uno abre la confirmación
   con lo que cambia: el precio, desde cuándo, y —si es bajar— lo que
   se deja de tener, dicho antes y no después. Antes cada «Actualizar»
   abría un WhatsApp a Leogin.
   ============================================================ */

interface Props {
  restaurantId: string;
  planActual: PlanCode;
  pricing: PlanPricing;
  /** Solo el dueño cambia el plan; el personal ve los planes sin botón. */
  esDueno: boolean;
  enPrueba: boolean;
  /** «1 dic 2026» */
  proximoCorte: string | null;
  currentPresentation?: ReturnType<typeof planPresentation> | null;
}

export default function CambiarPlan({ restaurantId, planActual, pricing, esDueno, enPrueba, proximoCorte, currentPresentation }: Props) {
  const router = useRouter();
  const [elegido, setElegido] = useState<PlanCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pierde = elegido ? loQueSePierde(planActual, elegido) : [];
  const sube = elegido ? isUpgrade(planActual, elegido) : false;
  const preview = elegido ? planChangePresentation(currentPresentation, elegido, pricing) : null;

  function confirmar() {
    if (!elegido) return;
    setError(null);
    start(async () => {
      const r = await cambiarMiPlan(restaurantId, elegido);
      if ('error' in r) return setError(r.error);
      setHecho(`Listo: ya estás en ${PLANS[r.plan].name}.`);
      setElegido(null);
      router.refresh();
    });
  }

  return (
    <Section title="Cambiar de plan">
      <div id="cambiar-plan" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        {PUBLIC_PLANS.map((code) => {
          const p = PLANS[code];
          const actual = code === planActual;
          const activo = code === elegido;
          return (
            <button
              key={code}
              type="button"
              disabled={actual || !esDueno || pending}
              onClick={() => { setHecho(null); setError(null); setElegido(activo ? null : code); }}
              aria-pressed={activo}
              style={{
                textAlign: 'left', padding: '14px 14px', borderRadius: 'var(--radius-lg)', cursor: actual || !esDueno ? 'default' : 'pointer',
                background: 'var(--adm-card)', color: 'inherit',
                border: activo ? `2px solid ${PLAN_COLOR_VAR[code]}` : actual ? '1px solid var(--adm-border-2)' : '1px solid var(--adm-border)',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--u-text)', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: PLAN_COLOR_VAR[code] }} />
                  {p.name}
                </span>
                <span className="t-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text-2)' }}>{actual && currentPresentation ? currentPresentation.monthlyLabel : planPriceLabel(pricing, code)}</span>
              </div>
              {actual && <span className="chip chip-ok" style={{ alignSelf: 'flex-start' }}>{currentPresentation?.manual ? 'Tu plan · precio acordado' : 'Tu plan'}</span>}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {PLAN_POINTS[code].map((pt) => (
                  <li key={pt.text} style={{ display: 'flex', gap: 6, fontSize: 12, color: pt.positive ? 'var(--u-text-3)' : 'var(--u-text-4)' }}>
                    <Icon name={pt.positive ? 'check' : 'x'} size={13} style={{ flexShrink: 0, marginTop: 1, color: pt.positive ? 'var(--c-ok)' : 'var(--u-text-4)' }} />
                    {pt.text}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {!esDueno && (
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '8px 0 0' }}>Solo el dueño del restaurante puede cambiar el plan.</p>
      )}

      {elegido && preview && (
        <Card className="p-4" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--u-text)' }}>
            {sube ? 'Subir' : 'Cambiar'} a {PLANS[elegido].name} · {preview.monthlyLabel}
          </div>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
            {preview.manual
              ? `El cambio del plan es inmediato. Se conserva tu mensualidad acordada (${preview.monthlyLabel}); la tarifa pública de ${preview.name} es ${preview.publicLabel}.`
              : pricing.prices[elegido] === 0
              ? 'Es gratis: dejas de pagar mensualidad desde tu próximo corte.'
              : enPrueba
                ? `Sigues en tu prueba gratis. Al terminar, se cobra ${planPriceLabel(pricing, elegido)}.`
                : `El cambio es inmediato. La mensualidad nueva se cobra desde tu próximo corte${proximoCorte ? ` (${proximoCorte})` : ''}.`}
          </p>
          {pierde.length > 0 && (
            <div className="note note-warn" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <strong style={{ fontSize: 13 }}>Dejarás de tener:</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {pierde.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          )}
          {error && <p role="alert" style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" onClick={confirmar} disabled={pending} className="rounded-adm-full">
              {pending ? 'Cambiando…' : `Confirmar cambio a ${PLANS[elegido].name}`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setElegido(null)} disabled={pending}>Cancelar</Button>
          </div>
        </Card>
      )}
      {hecho && <p role="status" style={{ fontSize: 13, color: 'var(--c-ok)', margin: '10px 0 0', fontWeight: 600 }}>{hecho}</p>}
    </Section>
  );
}
