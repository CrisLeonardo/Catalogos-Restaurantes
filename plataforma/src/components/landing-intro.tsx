'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

/* La intro animada en la portada (la sirve la ruta /intro).
 *
 * La tarjeta muestra el gancho como imagen fija y la intro solo se carga al
 * tocar «play», dentro de una ventana: así no pesa en la primera carga de la
 * portada. En pantallas verticales se abre la versión 9:16, que llena el
 * teléfono. */
export function LandingIntro() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Al cerrar se quita el iframe: así se detienen la animación y la música.
    const onClose = () => setSrc(null);
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  const open = () => {
    const vertical = window.matchMedia('(max-aspect-ratio: 4/5)').matches;
    setSrc(`/intro?modo=web&auto=1&sonido=1&formato=${vertical ? 'v' : 'h'}`);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button type="button" className="lp-intro" onClick={open} aria-haspopup="dialog">
        <Image
          src="/intro/portada.jpg"
          alt="¿Sabes cuánto dinero se te fue hoy? Intro de Leogin"
          width={1920}
          height={1080}
          sizes="(max-width: 900px) 92vw, 620px"
          priority
          className="lp-intro-img"
        />
        <span className="lp-intro-play" aria-hidden>
          <svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
        </span>
        <span className="lp-intro-chip">Mira cómo funciona · 54 s</span>
      </button>

      {/* Un clic fuera del video (en el fondo oscuro) también cierra. */}
      <dialog
        ref={dialogRef}
        className="lp-intro-dialog"
        aria-label="Intro de Leogin"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <button type="button" className="lp-intro-close" onClick={close} aria-label="Cerrar la intro">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        {src && <iframe src={src} title="Intro de Leogin" allow="autoplay; fullscreen" className="lp-intro-frame" />}
      </dialog>
    </>
  );
}
