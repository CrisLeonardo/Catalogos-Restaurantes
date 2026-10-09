'use client';

/* Cinta de anuncios — la franja de color que corre arriba del menú
   («Pedidos hasta las 18:00 ✦ Envíos a zona 10 ✦ …»).

   Nació con la estructura Vitrina, pero se pinta en CUALQUIER estructura en
   cuanto el dueño le escribe texto (content.vitrina.ticker): avisar del
   horario de pedidos o del envío gratis le sirve a cualquier carta. */

import type { CSSProperties } from 'react';
import { useThemeConfig, useThemeContent } from '@/lib/theme/context';

/** Frases de la cinta: el dueño las separa con «·», «|» o un salto de línea. */
export function frasesDeCinta(texto: string): string[] {
  return texto.split(/\n|·|\|/).map((t) => t.trim()).filter(Boolean);
}

export default function Cinta() {
  const config = useThemeConfig();
  const content = useThemeContent();
  const frases = frasesDeCinta(content.vitrina?.ticker ?? '');
  if (frases.length === 0) return null;

  /* Cada mitad de la pista tiene que ser más ancha que la pantalla o el bucle
     deja un hueco: con una sola frase corta se repite hasta tener unas seis. */
  const vueltas = Math.max(1, Math.ceil(6 / frases.length));
  const mitad = Array.from({ length: vueltas }, () => frases).flat();
  // Velocidad de lectura constante: más texto, más segundos por vuelta.
  const segundos = Math.max(18, Math.round(mitad.join(' ').length * 0.28));

  const half = (hidden: boolean) => (
    <span className="m-cinta-half" aria-hidden={hidden || undefined}>
      {mitad.map((f, i) => (
        <span key={i} style={{ display: 'inline-flex', gap: '1.6em' }}>
          <span>{f}</span>
          <span aria-hidden>✦</span>
        </span>
      ))}
    </span>
  );

  return (
    <div
      className="m-cinta menu-bleed"
      data-anim={config.animations ? '1' : undefined}
      style={{ '--m-cinta-dur': `${segundos}s` } as CSSProperties}
    >
      {/* Quien lee con lector de pantalla oye las frases una vez, no la pista
          duplicada que hace falta para que el bucle no tenga costura. */}
      <span className="sr-only">{frases.join('. ')}</span>
      <div className="m-cinta-track" aria-hidden>
        {half(true)}
        {half(true)}
      </div>
    </div>
  );
}
