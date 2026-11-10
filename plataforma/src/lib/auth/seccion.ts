import 'server-only';

import { actorEn, tiene } from '@/lib/auth/capacidades';
/* ============================================================
   ¿TIENE ESTA SECCIÓN? — para las acciones del panel (SEC-06)
   ------------------------------------------------------------
   Varias acciones comprobaban que la persona PERTENECE al restaurante
   (`canActOnRestaurant`) pero no que tenga la SECCIÓN: un mesero con solo
   «Pedidos» podía, llamando a la acción, cambiar cupones, la facturación,
   los módulos, el horario o el diseño del menú. Las server actions se pueden
   invocar sin pasar por la pantalla, así que esconder el enlace no basta.

   Esto NO sustituye la comprobación de pertenencia de cada acción: la
   complementa. Mismo cálculo que el panel (`resolveEffectiveRole` + `can`):
   el dueño y el dueño de grupo pasan siempre; el Super Admin también; el
   personal, solo con alguna de las secciones pedidas.
   ============================================================ */

export async function puedeEnSeccion(restaurantId: string, ...secciones: string[]): Promise<boolean> {
  const actor = await actorEn(restaurantId);
  return !!actor && tiene(actor, ...secciones);
}

/** El error de siempre cuando falta la sección. */
export const SIN_SECCION = 'No tienes permiso para esta sección. Pídeselo al dueño del restaurante.';
