/* «¿Pasó?» al agregar desde la carta (docs/planes/PLAN_EXPERIENCIA_VIVA_2026-10-26.md §5).
   La foto del platillo vuela hasta el carrito, el carrito rebota y el
   teléfono vibra corto. Es el pico del comensal: confirma sin palabras que
   el platillo entró, y el «¿se agregó?» deja de existir.

   El destino es el elemento marcado con `data-carrito-destino` (la barra del
   carrito o la bolsa de la Vitrina). Con el primer platillo todavía no
   existe: aparece en el siguiente pintado, por eso se busca dos cuadros
   después. Si no aparece, vuela hacia abajo al centro, donde va la barra.

   Con «reducir movimiento» solo vibra. Nunca lanza: si algo falla, el
   platillo ya está en el carrito igual. */

import { assetSrc } from '@/lib/asset-image';

const TAM = 46;

export function volarAlCarrito(origen: HTMLElement, imagen: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try { navigator.vibrate?.(12); } catch { /* sin vibración */ }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  let desde: DOMRect;
  try { desde = origen.getBoundingClientRect(); } catch { return; }
  const x0 = desde.left + desde.width / 2;
  const y0 = desde.top + desde.height / 2;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      const destino = document.querySelector<HTMLElement>('[data-carrito-destino]');
      const hasta = destino?.getBoundingClientRect();
      const x1 = hasta ? hasta.left + hasta.width / 2 : window.innerWidth / 2;
      const y1 = hasta ? hasta.top + hasta.height / 2 : window.innerHeight - 96;

      const ficha = document.createElement('div');
      ficha.className = 'm-vuelo';
      ficha.setAttribute('aria-hidden', 'true');
      const foto = imagen ? assetSrc(imagen, 96) : null;
      if (foto) ficha.style.backgroundImage = `url("${foto.replace(/"/g, '%22')}")`;
      ficha.style.left = `${x0 - TAM / 2}px`;
      ficha.style.top = `${y0 - TAM / 2}px`;
      document.body.appendChild(ficha);

      const dx = x1 - x0;
      const dy = y1 - y0;
      const vuelo = ficha.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          // Un arco hacia arriba antes de caer: se lee como «lo lancé al carrito».
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(0.92)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.32)`, opacity: 0.3 },
        ],
        { duration: 540, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
      );
      const terminar = () => {
        ficha.remove();
        destino?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
          { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
      };
      vuelo.onfinish = terminar;
      vuelo.oncancel = terminar;
    } catch { /* el platillo ya entró; la animación es lo de menos */ }
  }));
}
