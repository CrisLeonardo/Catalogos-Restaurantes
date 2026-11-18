/* El elemento que señala un paso de los tours (`[data-tour-step]`).

   Desde la ficha 2.11 una sección puede estar dentro de «Más» en el
   teléfono: su enlace existe pero no se pinta. Entonces el paso señala la
   casilla «Más», que dice en `data-tour-alt` qué secciones guarda. Sin
   esto, el tour de bienvenida explicaba «Ajustes» sin señalar nada. */

function visible(el: Element | null): el is HTMLElement {
  return !!el && el.getBoundingClientRect().height > 0;
}

export function objetivoDelTour(target: string | null | undefined): HTMLElement | null {
  if (!target) return null;
  const todos = document.querySelectorAll<HTMLElement>(`[data-tour-step="${target}"]`);
  for (const el of todos) if (visible(el)) return el;
  const alterno = document.querySelector<HTMLElement>(`[data-tour-alt~="${target}"]`);
  if (visible(alterno)) return alterno;
  return todos[0] ?? null;
}
