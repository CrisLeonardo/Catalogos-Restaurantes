'use client';

import Image, { getImageProps } from 'next/image';
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
 * (`/intro-en-linea`, con su portada y su bucle) y solo vertical.
 *
 * Con `cuadrada`, en el teléfono la tarjeta es cuadrada y enseña la versión
 * vertical recortada arriba: en el 16:9 de 335 px el gancho medía 13 px de
 * alto; así, 22. La decide el CSS y el <picture>: no hay salto al hidratar.
 *
 * Con `pelicula`, la ventana no abre una ruta con animación sino un video
 * MP4 de la misma carpeta: `horizontal.mp4` en pantallas anchas y
 * `vertical.mp4` en las verticales. Así va «Un solo lugar» en la portada
 * (promo-video/, docs/negocio/GUION_VIDEO_UN_SOLO_LUGAR_2026-11-15.md). */
const CUADRADA = '(max-width: 560px)';
/** Si la persona pausó el bucle, el aparato lo recuerda. */
const CLAVE_PAUSA = 'leogin-bucle-pausado';

export function LandingIntro({
  ruta = 'intro',
  vertical = false,
  cuadrada = false,
  pelicula = false,
  alt = '¿Sabes cuánto dinero se te fue hoy? Intro de Leogin',
  etiqueta = 'Mira cómo funciona · 54 s',
}: {
  /** Carpeta en public/ y ruta del HTML: 'intro' o 'intro-en-linea'. */
  ruta?: string;
  /** Solo 9:16: la tarjeta es vertical y la ventana nunca pide el 16:9. */
  vertical?: boolean;
  /** En el teléfono, tarjeta cuadrada (portada-cuadrada.jpg y bucle-cuadrado.webm). */
  cuadrada?: boolean;
  /** La ventana reproduce /<ruta>/horizontal.mp4 o vertical.mp4 en vez de abrir la ruta. */
  pelicula?: boolean;
  alt?: string;
  etiqueta?: string;
} = {}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [enMovimiento, setEnMovimiento] = useState(false);
  /* Pausa del bucle (WEB-UX-07, WCAG 2.2.2): el movimiento se repetía sin
     fin y solo se detenía abriendo el video. `null` = sin bucle en este
     aparato (movimiento reducido, ahorro de datos): no hay botón. El
     teléfono recuerda la elección. */
  const [pausado, setPausado] = useState<boolean | null>(null);
  const pausadoRef = useRef(false);
  const empezarRef = useRef<() => void>(() => {});

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const ahorro = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || ahorro) return;
    let guardado = false;
    try { guardado = localStorage.getItem(CLAVE_PAUSA) === '1'; } catch { /* sin almacenamiento */ }
    pausadoRef.current = guardado;
    setPausado(guardado);
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!v.src || pausadoRef.current) return;
      if (visible) v.play().catch(() => {}); else v.pause();
    });
    io.observe(v);
    const empezar = () => {
      // En pausa no se descarga: el bucle se pide al reanudar.
      if (pausadoRef.current) return;
      if (!v.src) v.src = cuadrada && matchMedia(CUADRADA).matches ? `/${ruta}/bucle-cuadrado.webm` : `/${ruta}/bucle.webm`;
      if (visible) v.play().catch(() => {});
    };
    empezarRef.current = empezar;
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
  }, [ruta, cuadrada]);

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
    setSrc(pelicula ? `/${ruta}/${enVertical ? 'vertical' : 'horizontal'}.mp4` : `/${ruta}?modo=web&auto=1&sonido=1&formato=${enVertical ? 'v' : 'h'}`);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  const alternarPausa = () => {
    const nuevo = !pausadoRef.current;
    pausadoRef.current = nuevo;
    setPausado(nuevo);
    try { localStorage.setItem(CLAVE_PAUSA, nuevo ? '1' : '0'); } catch { /* sin almacenamiento */ }
    if (nuevo) videoRef.current?.pause();
    else empezarRef.current();
  };

  return (
    <>
      <div className={`lp-intro-caja${vertical ? ' lp-intro-caja-v' : ''}`}>
      <button
        type="button"
        className={`lp-intro${vertical ? ' lp-intro-v' : ''}${cuadrada ? ' lp-intro-cuadrada' : ''}`}
        onClick={open}
        aria-haspopup="dialog"
      >
        {cuadrada ? (
          <PortadaCuadrada ruta={ruta} alt={alt} />
        ) : (
          <Image
            src={`/${ruta}/portada.jpg`}
            alt={alt}
            width={vertical ? 1080 : 1920}
            height={vertical ? 1920 : 1080}
            sizes={vertical ? '(max-width: 900px) 70vw, 320px' : '(max-width: 900px) 92vw, 620px'}
            priority={!vertical}
            className="lp-intro-img"
          />
        )}
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
      {/* Fuera de la tarjeta: un botón no puede ir dentro de otro. */}
      {pausado !== null && (
        <button
          type="button"
          className="lp-intro-pausa"
          onClick={alternarPausa}
          aria-label={pausado ? 'Reanudar la animación' : 'Pausar la animación'}
          title={pausado ? 'Reanudar la animación' : 'Pausar la animación'}
        >
          {pausado ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
          )}
        </button>
      )}
      </div>

      {/* Un clic fuera del video (en el fondo oscuro) también cierra. */}
      <dialog
        ref={dialogRef}
        className={`lp-intro-dialog${vertical ? ' lp-intro-dialog-v' : ''}${pelicula ? ' lp-intro-dialog-peli' : ''}`}
        aria-label={alt}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <button type="button" className="lp-intro-close" onClick={close} aria-label="Cerrar el video">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        {src && (pelicula
          ? <video src={src} className="lp-intro-peli" controls autoPlay playsInline aria-label={alt} />
          : <iframe src={src} title={alt} allow="autoplay; fullscreen" className="lp-intro-frame" />)}
      </dialog>
    </>
  );
}

/* La portada con dirección de arte: cuadrada en el teléfono, 16:9 en lo demás
   (getImageProps + <picture>, como lo recomienda la guía de next/image). */
function PortadaCuadrada({ ruta, alt }: { ruta: string; alt: string }) {
  const {
    props: { srcSet: telefono },
  } = getImageProps({ alt, src: `/${ruta}/portada-cuadrada.jpg`, width: 1080, height: 1080, sizes: '92vw' });
  const {
    props: { srcSet: ancha, ...resto },
  } = getImageProps({ alt, src: `/${ruta}/portada.jpg`, width: 1920, height: 1080, sizes: '(max-width: 900px) 92vw, 620px', priority: true });
  return (
    <picture>
      <source media={CUADRADA} srcSet={telefono} sizes="92vw" />
      <img {...resto} srcSet={ancha} alt={alt} className="lp-intro-img" />
    </picture>
  );
}
