'use client';

import type React from 'react';

/* ============================================================
   PIEZAS COMPARTIDAS DE LOS DOS ASISTENTES
   ------------------------------------------------------------
   Desde que el alta se partió en dos, hay dos asistentes con la misma
   forma y distinto contenido:

     · `/registro`         → crea la CUENTA (y nada más).
     · `/mi-cuenta/nuevo`  → crea un RESTAURANTE de esa cuenta.

   El paso a paso, los campos y el pie de navegación se ven igual en los
   dos a propósito: para quien se registra hoy y crea su local a los dos
   minutos, es un solo camino aunque por dentro sean dos pantallas. Vivir
   aquí es lo que impide que se separen con el tiempo.
   ============================================================ */

/* El mismo relleno que el login: con blanco al 5 %, en la web clara el
   registro tenía campos blancos con borde y el login grises rellenos — dos
   estilos de campo en el mismo flujo (auditoría 2026-10-02, WEB-06). */
export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  color: 'var(--u-text)',
  fontSize: 16,
  outline: 'none',
};

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
}

export function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--u-text-4)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--u-text)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

/** La barra de progreso con el nombre de cada paso. */
export function Stepper({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {steps.map((label, i) => (
        <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            height: 4, borderRadius: 99,
            background: i <= step ? 'var(--brand-accent)' : 'rgba(255,255,255,0.12)',
            transition: 'background 200ms',
          }} />
          <span style={{ fontSize: 10.5, fontWeight: 600, color: i === step ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13.5 }}>
      {children}
    </div>
  );
}

/**
 * El pie de navegación, pegado al fondo de la pantalla.
 *
 * Va sticky porque el paso del estilo es largo por naturaleza —hay 154
 * combinaciones que enseñar— y tener que bajar hasta el final para pulsar
 * «Continuar» era justo lo que se sentía pesado.
 */
export function WizardNav({
  step, lastStep, onBack, onNext, submitLabel, pendingLabel, isPending, canSubmit = true,
}: {
  step: number;
  lastStep: number;
  onBack: () => void;
  onNext: () => void;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  canSubmit?: boolean;
}) {
  const blocked = isPending || !canSubmit;
  return (
    <div
      style={{
        position: 'sticky', bottom: 0, zIndex: 5,
        display: 'flex', gap: 10,
        margin: '0 -24px', padding: '14px 24px',
        background: 'linear-gradient(to top, var(--brand-bg) 60%, color-mix(in srgb, var(--brand-bg) 72%, transparent))',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid var(--u-hair)',
      }}
    >
      {step > 0 && (
        <button
          type="button"
          onClick={onBack}
          className="press"
          style={{ padding: '13px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)', color: 'var(--u-text)', cursor: 'pointer' }}
        >
          Atrás
        </button>
      )}
      {step < lastStep ? (
        <button
          type="button"
          onClick={onNext}
          className="press btn-accent"
          style={{ flex: 1, padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', color: '#fff', cursor: 'pointer' }}
        >
          Continuar
        </button>
      ) : (
        <button
          type="submit"
          disabled={blocked}
          className="press btn-accent"
          style={{ flex: 1, padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', color: '#fff', cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.6 : 1 }}
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
      )}
    </div>
  );
}

/** La dirección del menú, tal como se teclea. */
export function localSlugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
