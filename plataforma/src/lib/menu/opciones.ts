/* ============================================================
   OPCIONES DEL PLATILLO PARA EL COMENSAL (auditoría 1.11, M03)
   ------------------------------------------------------------
   Reglas puras de la ficha del comensal:
     · Selección inicial: la predeterminada que marcó el restaurante
       (1.9); sin ella, un grupo obligatorio EMPIEZA VACÍO y el comensal
       elige (decisión del dueño, 2026-11-09). Antes se marcaba la
       primera opción y el comensal pedía algo que no eligió.
     · La regla de cada grupo dicha completa («Elige de 1 a 2»).
     · Qué falta para poder agregar, y el texto del botón que lo dice.
     · Reconstruir la selección desde una línea del carrito (M04).
   ============================================================ */

import type { CartItemOption, ProductOptionGroup } from '@/types';

export type Seleccion = Record<string, string[]>;
type Idioma = 'es' | 'en';

const valida = (g: ProductOptionGroup, id?: string | null) => !!id && g.choices.some((c) => c.id === id);

/** Lo que viene marcado al abrir la ficha. */
export function seleccionInicial(groups: readonly ProductOptionGroup[]): Seleccion {
  const sel: Seleccion = {};
  for (const g of groups) {
    if (g.type === 'combo') sel[g.id] = g.choices.map((c) => c.id);
    else if (g.type === 'single' && valida(g, g.defaultChoiceId)) sel[g.id] = [g.defaultChoiceId!];
    else sel[g.id] = [];
  }
  return sel;
}

/** La selección de una línea del carrito, para «Cambiar» (M04). */
export function seleccionDeLinea(groups: readonly ProductOptionGroup[], opciones: readonly CartItemOption[] = []): Seleccion {
  const sel: Seleccion = {};
  for (const g of groups) {
    const elegidas = opciones.filter((o) => o.groupId === g.id && g.choices.some((c) => c.id === o.choiceId)).map((o) => o.choiceId);
    sel[g.id] = g.type === 'combo' && opciones.every((o) => o.groupId !== g.id) ? g.choices.map((c) => c.id) : elegidas;
  }
  return sel;
}

/** Las variantes elegidas en una línea (componente de combo → variante). */
export function variantesDeLinea(opciones: readonly CartItemOption[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of opciones) if (o.variantId) out[o.choiceId] = o.variantId;
  return out;
}

const minimo = (g: ProductOptionGroup) => (g.type === 'multi' ? Math.max(0, g.min ?? 0) : 0);
const maximo = (g: ProductOptionGroup) => (g.type === 'multi' ? Math.max(0, g.max ?? 0) : 0);

/** «Elige uno», «Elige de 1 a 2», «Opcional · hasta 2»… */
export function reglaDeGrupo(g: ProductOptionGroup, idioma: Idioma = 'es'): string {
  const es = idioma === 'es';
  if (g.type === 'combo') return es ? 'Personaliza tu combo' : 'Customize your combo';
  if (g.type === 'single') return g.required ? (es ? 'Elige uno' : 'Choose one') : (es ? 'Opcional' : 'Optional');
  const min = minimo(g);
  const max = maximo(g);
  if (min > 0 && max > 0) {
    if (min === max) return es ? `Elige ${min}` : `Choose ${min}`;
    return es ? `Elige de ${min} a ${max}` : `Choose ${min} to ${max}`;
  }
  if (min > 0) return es ? `Elige al menos ${min}` : `Choose at least ${min}`;
  if (max > 0) return es ? `Opcional · hasta ${max}` : `Optional · up to ${max}`;
  return es ? 'Opcional' : 'Optional';
}

/** ¿El grupo pide algo que todavía no está? */
export function grupoEsObligatorio(g: ProductOptionGroup): boolean {
  return (g.type === 'single' && !!g.required) || minimo(g) > 0;
}

/** El primer grupo al que le falta algo, o null si ya se puede agregar. */
export function grupoPendiente(groups: readonly ProductOptionGroup[], sel: Seleccion): ProductOptionGroup | null {
  for (const g of groups) {
    const n = (sel[g.id] ?? []).length;
    if (g.type === 'single' && g.required && n === 0) return g;
    if (g.type === 'multi' && n < minimo(g)) return g;
  }
  return null;
}

/** ¿Se puede marcar una opción más en este grupo? */
export function cabeOtra(g: ProductOptionGroup, sel: Seleccion): boolean {
  const max = maximo(g);
  return !(g.type === 'multi' && max > 0 && (sel[g.id] ?? []).length >= max);
}

/** El botón dice qué falta: «Elige término», «Elige al menos 1 en extras». */
export function textoPendiente(g: ProductOptionGroup, sel: Seleccion, idioma: Idioma = 'es'): string {
  const nombre = g.name.trim().toLowerCase();
  const es = idioma === 'es';
  if (g.type === 'single') return es ? `Elige ${nombre}` : `Choose ${nombre}`;
  const faltan = minimo(g) - (sel[g.id] ?? []).length;
  return es ? `Elige ${faltan === 1 ? '1 más' : `${faltan} más`} en ${nombre}` : `Choose ${faltan} more in ${nombre}`;
}
