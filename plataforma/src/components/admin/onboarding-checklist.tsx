'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { dismissOnboarding } from '@/lib/actions/restaurant';

export interface OnboardingStep {
  key: string;
  label: string;
  desc: string;
  icon: string;
  href: string;
  done: boolean;
}

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

  const required = steps.filter((s) => s.key !== 'qr' && s.key !== 'escritorio');
  const doneCount = required.filter((s) => s.done).length;
  const total = required.length;
  const allDone = doneCount >= total;

  function dismiss() {
    startTransition(async () => {
      await dismissOnboarding(restaurantId);
      setHidden(true);
    });
  }

  if (hidden) return null;

  return (
    <div
      className="glass"
      style={{
        borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
        border: '1px solid color-mix(in srgb, var(--brand-accent) 30%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkle" size={18} style={{ color: 'var(--brand-accent-ink)' }} />
            <h3 className="t-display" style={{ fontSize: 18 }}>
              {allDone ? '¡Tu restaurante está listo!' : `Pongamos a punto tu restaurante${firstName ? `, ${firstName}` : ''}`}
            </h3>
          </div>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 4 }}>
            {allDone
              ? 'Completaste lo esencial. Puedes ocultar esta guía cuando quieras.'
              : 'Unos pasos rápidos para dejar tu menú impecable. Te toma minutos.'}
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

      {/* Progreso */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--u-text) 10%, transparent)', overflow: 'hidden' }}>
          <div style={{ width: `${(doneCount / total) * 100}%`, height: '100%', background: 'var(--brand-accent)', borderRadius: 'var(--radius-full)', transition: 'width 300ms' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text-2)', flexShrink: 0 }}>{doneCount}/{total}</span>
      </div>

      {/* Pasos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {steps.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className="press"
            style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
              borderRadius: 'var(--radius-lg)', textDecoration: 'none',
              background: s.done ? 'var(--c-ok-bg)' : 'var(--surface-3, color-mix(in srgb, var(--u-text) 4%, transparent))',
              border: `1px solid ${s.done ? 'var(--c-ok-line)' : 'var(--u-hair)'}`,
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
              <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{s.desc}</div>
            </div>
            {!s.done && <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
          </Link>
        ))}
      </div>
    </div>
  );
}
