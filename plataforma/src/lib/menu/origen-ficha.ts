/* ============================================================
   LA FICHA NACE DE LA FOTO (auditoría «La carta que vende», §5 pieza 2)
   ------------------------------------------------------------
   Al tocar una tarjeta se guarda dónde estaba su foto; la ficha, al
   abrirse, hace crecer su foto desde ahí hasta su sitio (FLIP: se
   mide el final, se arranca en el origen y se anima solo `transform`).
   Se siente continuo en vez de «otra hoja». Con «reducir movimiento»
   o sin origen reciente, la ficha aparece sin más.
   Solo cliente.
   ============================================================ */

let origen: { rect: DOMRect; at: number } | null = null;

const FOTO = '.m-tile-art, .m-row-art, .m-pieza-art, .m-acomp-foto';

/** Guarda la foto de la tarjeta tocada (el propio elemento o su foto interior). */
export function marcarOrigen(el: Element | null | undefined): void {
  const foto = el?.matches?.(FOTO) ? el : el?.querySelector?.(FOTO);
  if (!foto) { origen = null; return; }
  origen = { rect: foto.getBoundingClientRect(), at: Date.now() };
}

/** Hace crecer `destino` desde la última foto tocada, si fue hace un momento. */
export function crecerDesdeOrigen(destino: HTMLElement | null): void {
  const o = origen;
  origen = null;
  if (!destino || !o || Date.now() - o.at > 800) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  // La hoja abre su <dialog> en el efecto del PADRE, que corre después de
  // este: se mide en una microtarea —ya abierta, todavía antes de pintar—.
  queueMicrotask(() => animar(destino, o.rect));
}

function animar(destino: HTMLElement, desde: DOMRect): void {
  const fin = destino.getBoundingClientRect();
  if (fin.width === 0 || fin.height === 0) return;
  /* La foto vive dentro del cuerpo con scroll de la hoja, que la recortaría
     mientras viene desde una tarjeta de más arriba. Vuela una COPIA en
     posición fija dentro del <dialog> (capa superior, sin recorte) y la
     foto real aparece al aterrizar. */
  const capa = destino.closest('dialog') ?? document.body;
  const copia = destino.cloneNode(true) as HTMLElement;
  Object.assign(copia.style, {
    position: 'fixed', left: `${fin.left}px`, top: `${fin.top}px`, width: `${fin.width}px`, height: `${fin.height}px`,
    margin: '0', zIndex: '5', pointerEvents: 'none', transformOrigin: 'top left',
  });
  copia.setAttribute('aria-hidden', 'true');
  capa.appendChild(copia);
  destino.style.visibility = 'hidden';
  const sx = desde.width / fin.width;
  const sy = desde.height / fin.height;
  const dx = desde.left - fin.left;
  const dy = desde.top - fin.top;
  const vuelo = copia.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transform: 'none' },
    ],
    { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' },
  );
  const aterrizar = () => { destino.style.visibility = ''; copia.remove(); };
  vuelo.onfinish = aterrizar;
  vuelo.oncancel = aterrizar;
}
