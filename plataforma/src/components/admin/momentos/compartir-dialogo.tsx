'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/icons';
import { descargar, puedeCompartirArchivo } from '@/lib/compartir/lienzo';

/* La ventana de «compartir»: dibuja la imagen, la enseña en chico y ofrece
   mandarla (la hoja de compartir del teléfono: WhatsApp, Instagram…) o
   descargarla. En una computadora sin hoja de compartir, solo descargar. */
export default function CompartirDialogo({
  titulo,
  archivo,
  texto,
  generar,
  onClose,
}: {
  titulo: string;
  /** Nombre del archivo PNG. */
  archivo: string;
  /** Texto que acompaña la imagen al compartir. */
  texto: string;
  generar: () => Promise<Blob>;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let vivo = true;
    let creada: string | null = null;
    generar()
      .then((b) => {
        if (!vivo) return;
        creada = URL.createObjectURL(b);
        setBlob(b);
        setUrl(creada);
      })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo crear la imagen.'); });
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [generar]);

  useEffect(() => {
    cerrarRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const file = blob ? new File([blob], archivo, { type: 'image/png' }) : null;
  const puedeMandar = !!file && puedeCompartirArchivo(file);

  async function mandar() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], text: texto });
    } catch (e) {
      // Cancelar la hoja de compartir no es un error.
      if ((e as { name?: string })?.name !== 'AbortError') descargar(file, archivo);
    }
  }

  // A <body>, igual que la fiesta del primer pedido (ver allí por qué).
  return createPortal(
    <div className="fiesta-fondo" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fiesta-tarjeta" style={{ maxWidth: 380, gap: 14 }}>
        <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2 className="t-display" style={{ fontSize: 18, margin: 0, color: 'var(--u-text)', textAlign: 'left' }}>{titulo}</h2>
          <button ref={cerrarRef} type="button" onClick={onClose} aria-label="Cerrar" className="press grid size-10 place-items-center rounded-full border-0 bg-transparent text-adm-text-3">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="compartir-vista">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- es un blob local, no una imagen optimizable
            <img src={url} alt={`Vista previa: ${titulo}`} />
          ) : error ? (
            <p style={{ fontSize: 13, color: 'var(--c-danger)', padding: 16, margin: 0 }}>{error}</p>
          ) : (
            <span className="compartir-cargando" aria-label="Preparando la imagen" />
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          {puedeMandar && (
            <button type="button" onClick={mandar} className="btn-accent press inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-adm-md border-0 px-4 text-[14px] font-semibold">
              <Icon name="whatsapp" size={16} /> Compartir
            </button>
          )}
          <button
            type="button"
            disabled={!file}
            onClick={() => file && descargar(file, archivo)}
            className={`${puedeMandar ? '' : 'btn-accent border-0 '}press inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-adm-md border border-adm-border px-4 text-[14px] font-semibold`}
          >
            <Icon name="download" size={16} /> Descargar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
