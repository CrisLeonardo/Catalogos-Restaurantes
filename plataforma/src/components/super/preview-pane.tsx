'use client';

/* ============================================================
   VISTA PREVIA EN VIVO — lado del EDITOR
   ------------------------------------------------------------
   • useThemePreviewChannel(previewId, state): emite cada cambio
     del editor por BroadcastChannel y responde al "hello" de
     cualquier vista previa que se conecte (iframe o ventana).
   • <PreviewPane>: marco de teléfono con el iframe de
     /preview/[id] + botones (móvil/escritorio, abrir ventana).
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { previewChannelName, type ThemePreviewState } from '@/components/super/preview-client';

/** Transmite el estado del editor a todas las vistas previas conectadas. */
export function useThemePreviewChannel(previewId: string, state: ThemePreviewState) {
  const chRef = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(previewChannelName(previewId));
    chRef.current = ch;
    // Una vista previa recién abierta pide el estado actual con "hello".
    ch.onmessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === 'hello') {
        ch.postMessage({ type: 'state', ...stateRef.current });
      }
    };
    return () => {
      ch.close();
      chRef.current = null;
    };
  }, [previewId]);

  useEffect(() => {
    stateRef.current = state;
    const timer = setTimeout(() => {
      chRef.current?.postMessage({ type: 'state', ...stateRef.current });
    }, 150);
    return () => clearTimeout(timer);
  }, [state]);
}

export default function PreviewPane({ previewId }: { previewId: string }) {
  const src = `/preview/${previewId}`;
  const [wide, setWide] = useState(false);

  function openWindow() {
    window.open(
      src,
      `leogin-preview-${previewId}`,
      'width=430,height=900,menubar=no,toolbar=no,location=no,status=no',
    );
  }

  return (
    <aside className="preview-pane">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden
          style={{
            width: 8, height: 8, borderRadius: 99, background: '#4ade80',
            boxShadow: '0 0 8px rgba(74,222,128,0.8)', flexShrink: 0,
          }}
        />
        <span className="t-kicker" style={{ fontSize: 10.5, flex: 1 }}>Vista previa en vivo</span>

        <div style={{ display: 'flex', gap: 4 }}>
          <PaneBtn label="Vista móvil" active={!wide} onClick={() => setWide(false)} icon="phone" />
          <PaneBtn label="Vista ancha" active={wide} onClick={() => setWide(true)} icon="grid" />
          <PaneBtn label="Abrir en ventana aparte (para mostrarla al cliente)" onClick={openWindow} icon="arrowUpRight" />
        </div>
      </div>

      {/* Marco de teléfono */}
      <div className={`preview-frame${wide ? ' is-wide' : ''}`}>
        <iframe src={src} title="Vista previa del restaurante" loading="lazy" />
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', textAlign: 'center', lineHeight: 1.5 }}>
        Los cambios se reflejan al instante, sin guardar.
        <br />
        «Abrir en ventana» sirve para mostrarla al cliente en otra pantalla.
      </p>
    </aside>
  );
}

function PaneBtn({
  label, icon, active, onClick,
}: {
  label: string;
  icon: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="press"
      style={{
        width: 30, height: 30, borderRadius: 9, border: `1px solid ${active ? 'transparent' : 'var(--u-hair)'}`,
        background: active ? 'var(--u-text)' : 'rgba(255,255,255,0.04)',
        color: active ? 'var(--brand-bg)' : 'var(--u-text-3)',
        display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all 150ms',
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
