'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';

const DISMISS_KEY = 'leogin-desktop-server-nudge';

/**
 * "¿Esta PC será el servidor del local?" — se muestra SOLO cuando:
 *  · el panel corre dentro de Leogin Desktop (window.__TAURI__), y
 *  · el restaurante NO tiene ningún agente/modo local vinculado (lo decide el
 *    layout con la nube — la única que ve TODO el local y no solo esta PC:
 *    así una segunda PC del mismo restaurante nunca recibe la invitación y
 *    no se instalan dos servidores que impriman doble), y
 *  · el usuario no lo descartó antes en esta PC (localStorage).
 *
 * Cierra el ciclo "instalar el desktop ≈ instalar el modo local": justo
 * después del primer login, la app misma ofrece activar la impresión y el
 * respaldo sin internet — un clic, sin buscar la sección Impresión a mano.
 */
export default function DesktopServerNudge() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && '__TAURI__' in window;
    if (isDesktop && localStorage.getItem(DISMISS_KEY) !== '1') setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px', borderRadius: 11, marginBottom: 16,
        background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.22)',
      }}
    >
      <Icon name="print" size={15} style={{ color: 'var(--c-ok, #4ade80)', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--u-text)', lineHeight: 1.4, minWidth: 220 }}>
        <b>¿Esta PC será el servidor del local?</b>{' '}
        <span className="t-mute">
          Activa la impresión de comandas y el respaldo sin internet — solo se necesita en una PC del restaurante.
        </span>
      </span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <Link
          href="/admin/impresion"
          style={{
            fontSize: 12, fontWeight: 700, color: 'var(--c-ok, #4ade80)', textDecoration: 'none',
            padding: '6px 12px', borderRadius: 99, border: '1px solid rgba(74,222,128,0.35)',
          }}
        >
          Activarlo ahora
        </Link>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setVisible(false);
          }}
          style={{
            fontSize: 12, color: 'var(--u-text-3)', background: 'none', border: 'none',
            cursor: 'pointer', padding: '6px 4px',
          }}
        >
          Ahora no
        </button>
      </span>
    </div>
  );
}
