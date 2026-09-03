'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { usePathname as useRutaNavegador } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';

const DISMISS_KEY = 'leogin-main-pc-banner';

/**
 * "Tu local no tiene PC principal" — aviso del panel completo.
 *
 * Reemplaza al nudge anterior, que solo aparecía DENTRO de Leogin Desktop:
 * quien abría el panel desde el navegador (la mayoría) nunca se enteraba de
 * que le faltaba la pieza que imprime y cubre los cortes de internet. Ahora
 * el aviso se ve siempre, con dos textos distintos:
 *
 *   · 'missing' — nunca se configuró ninguna.
 *   · 'off'     — había una y el dueño la apagó (no es un olvido, es una
 *                 decisión suya; el tono es de recordatorio, no de alarma).
 *
 * Se puede ocultar por dispositivo. Vuelve a aparecer si el estado cambia,
 * porque la clave de descarte incluye el estado.
 */
export default function MainPcBanner({ state }: { state: 'missing' | 'off' }) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = panelBaseFrom(useRutaNavegador());
  const [visible, setVisible] = useState(false);
  const key = `${DISMISS_KEY}-${state}`;

  useEffect(() => {
    setVisible(localStorage.getItem(key) !== '1');
  }, [key]);

  if (!visible) return null;

  const missing = state === 'missing';
  const accent = missing ? 'var(--c-warn, #f59e0b)' : 'var(--u-text-3)';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px', borderRadius: 11, marginBottom: 16,
        background: `color-mix(in srgb, ${accent} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 26%, transparent)`,
      }}
    >
      <Icon name={missing ? 'alertCircle' : 'monitor'} size={15} style={{ color: accent, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--u-text)', lineHeight: 1.45, minWidth: 240 }}>
        <b>{missing ? 'Tu local no tiene PC principal.' : 'La PC principal está apagada.'}</b>{' '}
        <span className="t-mute">
          {missing
            ? 'Sin ella las comandas no se imprimen solas y un corte de internet detiene el servicio. Se configura una vez, en la computadora que está junto a la impresora.'
            : 'Mientras siga apagada no se imprimen comandas solas ni hay respaldo si se cae el internet.'}
        </span>
      </span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <Link
          href={panelHref(base, "/admin/mi-pc")}
          style={{
            fontSize: 12, fontWeight: 700, color: accent, textDecoration: 'none',
            padding: '6px 12px', borderRadius: 99,
            border: `1px solid color-mix(in srgb, ${accent} 38%, transparent)`,
          }}
        >
          {missing ? 'Configurarla' : 'Encenderla'}
        </Link>
        <button
          type="button"
          onClick={() => { localStorage.setItem(key, '1'); setVisible(false); }}
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
