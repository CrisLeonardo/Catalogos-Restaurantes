'use client';

import { useEffect } from 'react';

/* Abre el <details> de una sección cuando se llega a ella por su ancla.
 *
 * «Ver los cuatro planes lado a lado» (portada) lleva a /planes#comparativa,
 * pero la tabla vive dentro de un <details> cerrado: se llegaba a un botón
 * y había que tocarlo otra vez para ver lo que se había pedido (WEB-UX-04).
 * Con esto, llegar por el ancla —al cargar o con un enlace de la misma
 * página— abre la sección y la deja a la vista. Sin JavaScript queda como
 * antes: el botón sigue abriendo. */
export function AbrirPorAncla({ id }: { id: string }) {
  useEffect(() => {
    const abrir = () => {
      if (window.location.hash !== `#${id}`) return;
      const seccion = document.getElementById(id);
      const detalle = seccion?.querySelector('details');
      if (!seccion || !detalle) return;
      detalle.open = true;
      // Cuando la página termina de cargar (ver abajo): al hidratar,
      // el navegador o el enrutador todavía movían el desplazamiento y en la
      // PC la página quedaba arriba con la tabla ya abierta.
      seccion.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    const alCargar = () => setTimeout(abrir, 0);
    if (document.readyState === 'complete') alCargar();
    else window.addEventListener('load', alCargar, { once: true });
    window.addEventListener('hashchange', abrir);
    return () => {
      window.removeEventListener('load', alCargar);
      window.removeEventListener('hashchange', abrir);
    };
  }, [id]);
  return null;
}
