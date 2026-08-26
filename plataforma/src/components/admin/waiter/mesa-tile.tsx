'use client';

/* La ficha de mesa.
   ------------------------------------------------------------------
   Es la pieza más repetida de todo el salón —doce, veinte, cuarenta a
   la vez— así que aquí lo que importa es lo que NO lleva.

   No lleva color de fondo por estar ocupada: antes toda mesa con gente
   se pintaba de ámbar y de rojo pasado el umbral, de modo que un salón
   lleno era una pantalla de alarmas donde ninguna significaba nada. El
   acento se reserva para la mesa que pide algo AHORA (ver
   lib/table-state.ts), y esa sí se ve desde el otro extremo del local.

   No lleva iconos ni etiquetas de estado: un número grande, el monto y
   una línea corta. Todo lo demás está a un toque.

   El aspecto vive en globals.css (`.wp-mesa`, con `data-s` y `data-on`)
   porque los mismos tres pesos los usan el riel de la tablet, la
   rejilla del teléfono y el tablero del panel del dueño. */

import type { TableState } from '@/lib/table-state';

export interface MesaTileProps {
  n: number;
  state: TableState;
  /** Consumo de la mesa, ya formateado. Vacío si está libre. */
  amount?: string;
  selected?: boolean;
  onSelect: (n: number) => void;
}

export default function MesaTile({ n, state, amount, selected = false, onSelect }: MesaTileProps) {
  const libre = state.kind === 'libre';

  return (
    <button
      type="button"
      onClick={() => onSelect(n)}
      className="wp-mesa press"
      data-s={state.kind}
      data-on={selected ? '1' : '0'}
      /* El botón se anuncia con la frase larga aunque enseñe la corta: quien
         navega con lector de pantalla no ve la rejilla, oye una lista. */
      aria-label={`Mesa ${n} · ${state.label}`}
      aria-pressed={selected}
    >
      <span className="wp-mesa-n">{n}</span>
      {!libre && amount ? <span className="wp-mesa-amt">{amount}</span> : null}
      <span className="wp-mesa-st">{state.short}</span>
    </button>
  );
}
