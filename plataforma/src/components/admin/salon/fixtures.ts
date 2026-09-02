/* Las referencias fijas del salón: la barra, la caja, la cocina, los baños.
   ------------------------------------------------------------------
   Vivían en `floor-map.tsx`, junto al segundo visor de plano que el
   panel de mesero usaba por su cuenta. Al quedarse el salón con UN solo
   lienzo (components/admin/salon/salon-canvas.tsx), ese archivo se fue y
   el vocabulario se quedó aquí, que es donde lo comparten los dos que
   siguen necesitándolo:

     · el EDITOR del dueño (Ajustes › Salón), que las coloca;
     · el LIENZO del salón, que las dibuja.

   Compartirlo es el punto: la barra que el dueño coloca tiene que ser
   exactamente la barra que el mesero ve. */

import type { FloorFixture, FixtureKind } from '@/lib/theme/defaults';
import type { IconName } from '@/components/icons';

/** Nombre, ícono y tamaño inicial (relativo al lienzo) de cada referencia. */
export const FIXTURE_META: Record<FixtureKind, { label: string; icon: IconName; w: number; h: number }> = {
  bar:       { label: 'Barra',     icon: 'coffee',     w: 0.34, h: 0.10 },
  reception: { label: 'Recepción', icon: 'bellRing',   w: 0.18, h: 0.12 },
  cashier:   { label: 'Caja',      icon: 'wallet',     w: 0.15, h: 0.10 },
  kitchen:   { label: 'Cocina',    icon: 'utensils',   w: 0.24, h: 0.16 },
  entrance:  { label: 'Entrada',   icon: 'arrowRight', w: 0.16, h: 0.08 },
  restroom:  { label: 'Baños',     icon: 'users',      w: 0.14, h: 0.12 },
  wall:      { label: 'Muro',      icon: 'minus',      w: 0.30, h: 0.03 },
};

/** Orden en que se ofrecen en el editor. */
export const FIXTURE_KINDS: FixtureKind[] = ['bar', 'reception', 'cashier', 'kitchen', 'entrance', 'restroom', 'wall'];

/** Nombre visible de una referencia: el propio del dueño, o el del tipo. */
export function fixtureLabel(f: FloorFixture): string {
  return (f.label ?? '').trim() || FIXTURE_META[f.kind].label;
}
