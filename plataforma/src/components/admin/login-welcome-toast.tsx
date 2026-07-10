'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

/**
 * Toast "Bienvenido" que aparece una sola vez, justo después de iniciar
 * sesión — confirma que la cuenta resolvió el restaurante y el rol
 * correctos (útil sobre todo para el login central sin subdominio, donde
 * antes no había ninguna señal de "sí llegaste al lugar correcto").
 *
 * Se dispara por el query param `?welcome=1` que agrega login() en
 * auth.ts SOLO justo tras un login exitoso — no por localStorage ni por
 * "primera vez", así que reaparece en cada login (a diferencia de
 * WelcomeTour, que es el tour guiado de producto, una vez por cuenta).
 * El párametro se limpia de la URL al mostrarse para que un refresh no lo
 * repita.
 */
export default function LoginWelcomeToast({
  restaurantName,
  userName,
  roleLabel,
}: {
  restaurantName: string;
  userName?: string | null;
  roleLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') !== '1') return;

    params.delete('welcome');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));

    setVisible(true);
    const enter = setTimeout(() => setEntered(true), 20);
    const dismiss = setTimeout(() => setVisible(false), 6000);
    return () => { clearTimeout(enter); clearTimeout(dismiss); };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="glass-solid"
      style={{
        position: 'fixed', left: '50%', bottom: 24, zIndex: 200,
        transform: `translate(-50%, ${entered ? '0' : '12px'})`,
        opacity: entered ? 1 : 0,
        transition: 'transform 320ms var(--ease-entry, ease), opacity 320ms var(--ease-entry, ease)',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 16px', borderRadius: 16, maxWidth: 'calc(100vw - 32px)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
      }}
    >
      <span style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center',
        background: 'rgba(var(--brand-accent-rgb,99,102,241),0.14)', color: 'var(--brand-accent)',
      }}>
        <Icon name="sparkle" size={18} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Bienvenido a {restaurantName}
        </div>
        <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 1 }}>
          {userName ? `${userName} · ${roleLabel}` : roleLabel}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Cerrar"
        className="press"
        style={{
          flexShrink: 0, width: 26, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'var(--u-text-4)', display: 'grid', placeItems: 'center',
        }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
