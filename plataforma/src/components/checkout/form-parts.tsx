'use client';

import type { ReactNode } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';

/* Piezas pequeñas del formulario del checkout y la pantalla «sin conexión». */

export function PayOption({ icon, label, sublabel, selected, onClick, activeBg, activeText, glass, textShadow }: {
  icon: string; label: string; sublabel: string; selected: boolean; onClick: () => void;
  activeBg: string; activeText: string; glass?: boolean; textShadow?: string;
}) {
  // Glass: fondo translúcido + blur para que la opción se distinga de cualquier
  // paleta de fondo (resuelve "no se ve qué dice"). El seleccionado gana un aro
  // de acento + sombra para destacar sin depender solo del color.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press${glass ? ' glass-quiet' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--m-sp-3)',
        padding: 'var(--m-sp-4)', minHeight: 'var(--m-tap)', borderRadius: 'var(--m-r-md)', width: '100%', textAlign: 'left', cursor: 'pointer',
        border: `1.5px solid ${selected ? activeBg : 'var(--u-hair-2)'}`,
        background: glass ? undefined : (selected ? 'var(--surface-2)' : 'var(--surface-1)'),
        boxShadow: selected ? `0 0 0 1.5px ${activeBg}, 0 8px 22px rgba(0,0,0,0.28)` : undefined,
        transition: 'all 160ms',
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 'var(--m-r-md)', flexShrink: 0, display: 'grid', placeItems: 'center', background: selected ? activeBg : 'var(--surface-3)', color: selected ? activeText : 'var(--u-text)', transition: 'all 160ms' }}>
        <Icon name={icon} size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--m-fs-md)', color: 'var(--u-text)', textShadow }}>{label}</div>
        <div style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-2)', marginTop: 2, textShadow }}>{sublabel}</div>
      </div>
      <span style={{ width: 22, height: 22, borderRadius: 'var(--m-r-pill)', flexShrink: 0, border: `2px solid ${selected ? activeBg : 'var(--u-hair-2)'}`, background: selected ? activeBg : 'transparent', display: 'grid', placeItems: 'center', transition: 'all 160ms' }}>
        {selected && <Icon name="check" size={12} strokeWidth={3} style={{ color: activeText }} />}
      </span>
    </button>
  );
}

export function FormSection({ glass, children }: { glass: boolean; children: ReactNode }) {
  if (glass) {
    return (
      <Glass style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </Glass>
    );
  }
  return <>{children}</>;
}

/** El pedido se guardó en el aparato y se enviará solo al volver la señal. */
export function CheckoutQueued({ error, pending, onRetry }: { error: string; pending: boolean; onRetry: () => void }) {
  return (
    <main className="anim-fade-up themed-type" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ textAlign: 'center', maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: 'var(--surface-2)', color: 'var(--u-text-2)',
        }}>
          <Icon name="clock" size={34} strokeWidth={1.6} />
        </div>
        <div>
          <h1 className="t-display" style={{ fontSize: 'var(--fs-h1)', marginBottom: 8 }}>Sin conexión</h1>
          <p style={{ fontSize: 'var(--m-fs-md)', color: 'var(--u-text-2)', lineHeight: 1.5 }}>
            Tu pedido se guardó. Se enviará solo en cuanto vuelva la señal —
            no cierres esta pantalla.
          </p>
        </div>
        {error && (
          <p style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--c-danger, #ff6b6b)' }}>{error}</p>
        )}
        <button
          onClick={onRetry}
          disabled={pending}
          className="btn-accent press"
          style={{ padding: '13px 28px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--m-fs-md)', fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.7 : 1 }}
        >
          {pending ? 'Reintentando…' : 'Reintentar ahora'}
        </button>
      </div>
    </main>
  );
}
