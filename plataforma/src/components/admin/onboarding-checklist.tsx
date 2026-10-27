'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Leo } from '@/components/leo';
import { dismissOnboarding } from '@/lib/actions/restaurant';

export interface OnboardingStep {
  key: string;
  label: string;
  desc: string;
  icon: string;
  href: string;
  done: boolean;
  /** Paso de cortesía: no cuenta para el avance (la PC del local). */
  optional?: boolean;
}

/* «Termina de armar tu restaurante» (estrategia §2.8, progreso dotado).

   Una tarjeta de sellos con dos ya puestos se completa casi el doble de
   veces que una vacía, con el mismo esfuerzo. Por eso la guía nunca arranca
   en 0 %: el primer paso, «Creaste tu cuenta», ya viene hecho y la barra
   sale en 20 %. Leo señala el paso que sigue y, al llegar a 100 %, celebra.

   La barra crece con `transform: scaleX`, no con `width`: así se anima en
   el compositor también en un Android barato. */
export default function OnboardingChecklist({
  restaurantId,
  firstName,
  steps,
}: {
  restaurantId: string;
  firstName: string;
  steps: OnboardingStep[];
}) {
  const [isPending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  // La barra entra desde 0 la primera vez que se pinta: se ve avanzar.
  const [pintada, setPintada] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPintada(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  const total = required.length;
  const allDone = doneCount >= total;
  const pct = Math.round((doneCount / total) * 100);
  const siguiente = steps.find((s) => !s.done && !s.optional)?.key ?? null;

  function dismiss() {
    startTransition(async () => {
      await dismissOnboarding(restaurantId);
      setHidden(true);
    });
  }

  if (hidden) return null;

  return (
    <div className="flex flex-col gap-4 rounded-adm-xl border border-adm-border bg-adm-card p-5 shadow-adm-sm">
      <div className="flex items-start gap-3.5">
        <Leo id="leo-armar" expresion={allDone ? 'feliz' : 'senala'} size={60} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="t-display" style={{ fontSize: 18 }}>
            {allDone
              ? '¡Tu restaurante está listo!'
              : `Termina de armar tu restaurante${firstName ? `, ${firstName}` : ''}`}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 4 }}>
            {allDone
              ? 'Ya tienes todo lo esencial. Tus clientes pueden ver tu menú y pedir.'
              : `Vas en ${pct} %. Te falta${total - doneCount === 1 ? ' un paso' : `n ${total - doneCount} pasos`} y te toma minutos.`}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          disabled={isPending}
          className="press"
          title="Ocultar guía"
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--u-text-4)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {allDone ? 'Ocultar' : 'Omitir'}
        </button>
      </div>

      {/* Avance */}
      <div className="flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance para armar tu restaurante"
          style={{ flex: 1, height: 8, borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--u-text) 10%, transparent)', overflow: 'hidden' }}
        >
          <div
            className="onb-barra"
            style={{
              height: '100%', borderRadius: 'var(--radius-full)', transformOrigin: '0 50%',
              background: allDone ? 'var(--c-ok)' : 'var(--brand-accent)',
              transform: `scaleX(${pintada ? doneCount / total : 0})`,
            }}
          />
        </div>
        <span className="t-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text-2)', flexShrink: 0 }}>{pct} %</span>
      </div>

      {/* Pasos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {steps.map((s) => {
          const esSiguiente = s.key === siguiente;
          return (
            <Link
              key={s.key}
              href={s.href}
              className="press"
              aria-current={esSiguiente ? 'step' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
                borderRadius: 'var(--radius-lg)', textDecoration: 'none',
                background: s.done ? 'var(--c-ok-bg)' : 'var(--surface-3, color-mix(in srgb, var(--u-text) 4%, transparent))',
                border: `1px solid ${s.done ? 'var(--c-ok-line)' : esSiguiente ? 'var(--brand-accent)' : 'var(--u-hair)'}`,
                boxShadow: esSiguiente ? '0 0 0 3px color-mix(in srgb, var(--brand-accent) 18%, transparent)' : undefined,
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 'var(--radius-md)', flexShrink: 0, display: 'grid', placeItems: 'center',
                background: s.done ? 'var(--c-ok-bg)' : 'rgba(var(--brand-accent-rgb, 99,102,241),0.12)',
                color: s.done ? 'var(--c-ok)' : 'var(--brand-accent)',
              }}>
                <Icon name={s.done ? 'check' : s.icon} size={16} strokeWidth={s.done ? 2.6 : 2} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)', textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? 0.7 : 1 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
                  {esSiguiente ? <strong style={{ color: 'var(--brand-accent-ink, var(--brand-accent))' }}>Sigue · </strong> : null}
                  {s.optional && !s.done ? 'Opcional · ' : null}
                  {s.desc}
                </div>
              </div>
              {!s.done && <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
