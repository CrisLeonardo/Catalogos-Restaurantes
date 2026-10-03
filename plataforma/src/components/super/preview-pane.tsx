'use client';

/* ============================================================
   VISTA PREVIA EN VIVO — lado del EDITOR
   ------------------------------------------------------------
   • useThemePreviewChannel(previewId, state): emite cada cambio
     del editor por BroadcastChannel y responde al "hello" de
     cualquier vista previa que se conecte (iframe o ventana).
   • <PreviewPane>: panel con dos modos —
       1) Vista previa en vivo APAGADA (por defecto): no monta el
          iframe → no consume CPU/GPU. Botones para activarla,
          abrirla en pestaña nueva o en una ventana aparte.
       2) Vista previa ENCENDIDA: marco de teléfono con el iframe
          de /preview/[id] (sitio del cliente). El panel admin ya no
          se previsualiza: usa 2 temas fijos, no depende del tenant.
     El iframe del sitio es lo que más pesa (fondos animados,
     watermark girando, sheen…), por eso se monta solo bajo demanda.
   ============================================================ */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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

const STORAGE_KEY = 'leogin-preview-enabled';
const PREF_EVENT = 'leogin-preview-pref';

/**
 * Preferencia "vista previa en vivo" persistida en localStorage, leída con
 * useSyncExternalStore: SSR-safe (snapshot del servidor = apagado) y sin
 * setState dentro de un effect.
 */
function useEnabledPref(): [boolean, (v: boolean) => void] {
  const enabled = useSyncExternalStore(
    (cb) => {
      window.addEventListener('storage', cb);
      window.addEventListener(PREF_EVENT, cb);
      return () => {
        window.removeEventListener('storage', cb);
        window.removeEventListener(PREF_EVENT, cb);
      };
    },
    () => {
      try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
    },
    () => false,
  );
  const setEnabled = (v: boolean) => {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* no-op */ }
    window.dispatchEvent(new Event(PREF_EVENT));
  };
  return [enabled, setEnabled];
}

export default function PreviewPane({ previewId, id }: { previewId: string; /** Ancla para saltar a la vista previa. */ id?: string }) {
  const [enabled, setEnabledPersist] = useEnabledPref();
  const [wide, setWide] = useState(false);

  const src = `/preview/${previewId}`;

  function openTab() {
    window.open(src, '_blank', 'noopener,noreferrer');
  }
  function openWindow() {
    window.open(
      src,
      `leogin-preview-${previewId}`,
      'width=430,height=900,menubar=no,toolbar=no,location=no,status=no',
    );
  }

  return (
    <aside className="preview-pane" id={id}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden
          style={{
            width: 8, height: 8, borderRadius: 'var(--radius-full)',
            background: enabled ? 'var(--c-ok)' : 'var(--u-text-4)',
            boxShadow: enabled ? '0 0 8px rgba(74,222,128,0.8)' : 'none', flexShrink: 0,
          }}
        />
        <span className="adm-label" style={{ flex: 1 }}>
          {enabled ? 'Vista previa en vivo' : 'Vista previa'}
        </span>

        {enabled && (
          <div style={{ display: 'flex', gap: 4 }}>
            <PaneBtn label="Vista móvil" active={!wide} onClick={() => setWide(false)} icon="phone" />
            <PaneBtn label="Vista ancha" active={wide} onClick={() => setWide(true)} icon="grid" />
            <PaneBtn label="Abrir en pestaña nueva" onClick={openTab} icon="arrowUpRight" />
            <PaneBtn label="Apagar vista previa en vivo (ahorra recursos)" onClick={() => setEnabledPersist(false)} icon="x" />
          </div>
        )}
      </div>

      {enabled ? (
        <>
          {/* Marco de teléfono con el iframe (montado solo al activar) */}
          <div className={`preview-frame${wide ? ' is-wide' : ''}`}>
            <iframe key={src} src={src} title="Vista previa del restaurante" loading="lazy" />
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', textAlign: 'center', lineHeight: 1.5 }}>
            Los cambios del editor se reflejan al instante, sin guardar.
            <br />
            «Abrir en ventana» sirve para mostrarla al cliente en otra pantalla.
          </p>
        </>
      ) : (
        /* Estado apagado: tarjeta ligera, sin iframe → no consume recursos */
        <div
          style={{
            border: '1px dashed var(--u-hair-2)', borderRadius: 'var(--radius-lg)', padding: '26px 18px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center',
          }}
        >
          <div style={{ width: 46, height: 46, borderRadius: 'var(--radius-lg)', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--u-text-3)' }}>
            <Icon name="eye" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>
              Vista previa en vivo apagada
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 5, lineHeight: 1.5, maxWidth: 280 }}>
              La vista en vivo dentro del editor consume CPU. Actívala solo cuando la necesites,
              o ábrela en una pestaña aparte para que el editor vaya fluido.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280 }}>
            <button type="button" onClick={() => setEnabledPersist(true)} className="press btn-white"
              style={{ padding: '11px 16px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="eye" size={15} /> Activar vista previa en vivo
            </button>
            <button type="button" onClick={openTab} className="press"
              style={{ padding: '11px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="arrowUpRight" size={15} /> Abrir en pestaña nueva
            </button>
            <button type="button" onClick={openWindow} className="press"
              style={{ padding: '9px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5, border: 'none', background: 'transparent', color: 'var(--u-text-3)', cursor: 'pointer' }}>
              Abrir en ventana aparte
            </button>
          </div>
        </div>
      )}
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
        width: 30, height: 30, borderRadius: 'var(--radius-md)', border: `1px solid ${active ? 'transparent' : 'var(--u-hair)'}`,
        background: active ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
        color: active ? 'var(--brand-bg)' : 'var(--u-text-3)',
        display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all 150ms',
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

