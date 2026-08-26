'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Mide cuánta pantalla le queda al armazón y la escribe en `--wp-h`.
 *
 * Hace falta porque el armazón de dos paneles necesita una altura FIJA
 * para que cada columna se desplace por dentro, y ninguna cuenta a ojo
 * acierta: encima lleva la barra superior del panel (64 px), a veces la
 * sub-barra de pestañas, y el dueño puede haber configurado un `zoom`
 * distinto de 1 en todo el contenido del panel.
 *
 * Ese `zoom` es justamente la trampa: `getBoundingClientRect()` devuelve
 * los valores ya escalados, mientras que `innerHeight` no. Sin dividir
 * por la escala, un panel al 90 % dejaba el armazón cortado por abajo.
 *
 * Si algo falla se deja el valor de reserva del CSS (`72svh`): una
 * altura razonable es mejor que una altura cero.
 */
export function usePaneHeight(
  ref: RefObject<HTMLElement | null>,
  /** Se vuelve a medir cuando cambia algo que mueve el armazón hacia
      abajo (un aviso que aparece encima, por ejemplo). */
  deps: unknown[] = [],
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function medir() {
      const node = ref.current;
      if (!node) return;
      const escala = Number(
        getComputedStyle(document.documentElement).getPropertyValue('--admin-panel-scale').trim() || '1',
      ) || 1;
      const top = node.getBoundingClientRect().top / escala;
      const alto = window.innerHeight / escala - top - 24; // 24 = respiro inferior
      if (alto > 320) node.style.setProperty('--wp-h', `${Math.round(alto)}px`);
      else node.style.removeProperty('--wp-h');
    }

    medir();
    window.addEventListener('resize', medir);
    // La barra de direcciones del móvil cambia el alto visible sin
    // disparar `resize` en algunos navegadores.
    window.visualViewport?.addEventListener('resize', medir);
    return () => {
      window.removeEventListener('resize', medir);
      window.visualViewport?.removeEventListener('resize', medir);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
