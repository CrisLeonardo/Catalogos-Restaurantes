'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

/* La intro animada en la portada (la sirve la ruta /intro).
 *
 * La tarjeta muestra el gancho como imagen fija y la intro solo se carga al
 * tocar «play», dentro de una ventana: así no pesa en la primera carga de la
 * portada. En pantallas verticales se abre la versión 9:16, que llena el
 * teléfono.
 *
 * Encima de la imagen corre un bucle de 7.5 s sin sonido (el caos y la cuenta
 * de lo que se fue, PLAN_MOMENTOS_PICO W3): movimiento desde el primer
 * segundo. Se pide cuando la página ya cargó (o a los 2 s), no con «reducir
 * movimiento» ni con ahorro de datos, y se pausa fuera de la pantalla. Si el
 * navegador no lo sabe reproducir, se queda la imagen.
 *
 * La misma tarjeta sirve a «Del chat al pedido» en /vende-en-linea: otra ruta
 * (`/intro-en-linea`, con su portada y su bucle) y solo vertical. */
export function LandingIntro({
  ruta = 'intro',
  vertical = false,
  alt = '¿Sabes cuánto dinero se te fue hoy? Intro de Leogin',
  etiqueta = 'Mira cómo funciona · 54 s',
}: {
  /** Carpeta en public/ y ruta del HTML: 'intro' o 'intro-en-linea'. */
  ruta?: string;
  /** Solo 9:16: la tarjeta es vertical y la ventana nunca pide el 16:9. */
  vertical?: boolean;
  alt?: string;
  etiqueta?: string;
} = {}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [enMovimiento, setEnMovimiento] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const ahorro = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || ahorro) return;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!v.src) return;
      if (visible) v.play().catch(() => {}); else v.pause();
    });
    io.observe(v);
    const empezar = () => {
      v.src = `/${ruta}/bucle.webm`;
      if (visible) v.play().catch(() => {});
    };
    // Al terminar de cargar la página, o a los dos segundos si algo pesado
    // (el iframe de la vitrina) la hace esperar: lo que pase primero.
    let empezado = false;
    const una = () => { if (!empezado) { empezado = true; empezar(); } };
    const tope = setTimeout(una, 2000);
    let t: ReturnType<typeof setTimeout> | null = null;
    const alCargar = () => { t = setTimeout(una, 400); };
    if (document.readyState === 'complete') alCargar();
    else window.addEventListener('load', alCargar, { once: true });
    return () => {
      io.disconnect();
      clearTimeout(tope);
      if (t) clearTimeout(t);
      window.removeEventListener('load', alCargar);
    };
  }, [ruta]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Al cerrar se quita el iframe: así se detienen la animación y la música.
    const onClose = () => setSrc(null);
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  const open = () => {
    videoRef.current?.pause();
    const enVertical = vertical || window.matchMedia('(max-aspect-ratio: 4/5)').matches;
    setSrc(`/${ruta}?modo=web&auto=1&sonido=1&formato=${enVertical ? 'v' : 'h'}`);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button type="button" className={`lp-intro${vertical ? ' lp-intro-v' : ''}`} onClick={open} aria-haspopup="dialog">
        <Image
          src={`/${ruta}/portada.jpg`}
          alt={alt}
          width={vertical ? 1080 : 1920}
          height={vertical ? 1920 : 1080}
          sizes={vertical ? '(max-width: 900px) 70vw, 320px' : '(max-width: 900px) 92vw, 620px'}
          priority={!vertical}
          className="lp-intro-img"
        />
        <video
          ref={videoRef}
          className="lp-intro-video"
          data-on={enMovimiento ? '1' : '0'}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          tabIndex={-1}
          onPlaying={() => setEnMovimiento(true)}
        />
        <span className="lp-intro-play" aria-hidden>
          <svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
        </span>
        <span className="lp-intro-chip">{etiqueta}</span>
      </button>

      {/* Un clic fuera del video (en el fondo oscuro) también cierra. */}
      <dialog
        ref={dialogRef}
        className={`lp-intro-dialog${vertical ? ' lp-intro-dialog-v' : ''}`}
        aria-label={alt}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <button type="button" className="lp-intro-close" onClick={close} aria-label="Cerrar el video">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        {src && <iframe src={src} title={alt} allow="autoplay; fullscreen" className="lp-intro-frame" />}
      </dialog>
    </>
  );
}
