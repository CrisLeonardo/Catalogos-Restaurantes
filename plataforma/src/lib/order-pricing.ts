/* ============================================================
   Precios de pedido — helpers PUROS compartidos.
   ------------------------------------------------------------
   Vive fuera de lib/actions/orders.ts porque ese módulo es
   'use server' (solo puede exportar funciones async): esto lo
   usan tanto los server actions como las rutas del agente
   (pedidos offline del hub de emergencia).
   ============================================================ */

import type { OrderItemOption, ProductOptionGroup } from '@/types';

/**
 * Resuelve las opciones elegidas contra los grupos REALES del producto (BD):
 * valida ids, exige los grupos requeridos, respeta `max` y devuelve el
 * delta total + el snapshot con nombres/precios congelados.
 */
export function resolveItemOptions(
  groups: ProductOptionGroup[] | null,
  picked: { groupId: string; choiceId: string }[] | undefined,
  productName: string,
): { delta: number; snapshot: OrderItemOption[] } | { error: string } {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const picks = picked ?? [];

  const snapshot: OrderItemOption[] = [];
  let delta = 0;

  for (const group of safeGroups) {
    const inGroup = picks.filter((p) => p.groupId === group.id);

    if (group.type === 'single') {
      if (inGroup.length > 1)
        return { error: `Opciones inválidas en "${productName}".` };
      if (group.required && inGroup.length === 0)
        return { error: `Elige "${group.name}" para "${productName}".` };
    } else if (group.max && group.max > 0 && inGroup.length > group.max) {
      return { error: `Máximo ${group.max} en "${group.name}" de "${productName}".` };
    }

    const seen = new Set<string>();
    for (const pick of inGroup) {
      if (seen.has(pick.choiceId))
        return { error: `Opciones duplicadas en "${productName}".` };
      seen.add(pick.choiceId);

      const choice = group.choices.find((c) => c.id === pick.choiceId);
      if (!choice)
        return { error: `"${productName}" cambió sus opciones. Actualiza tu carrito.` };

      const d = Number(choice.priceDelta) || 0;
      delta += d;
      snapshot.push({ group: group.name, choice: choice.name, priceDelta: d });
    }
  }

  // Elecciones que apuntan a grupos inexistentes → carrito viejo.
  const knownGroupIds = new Set(safeGroups.map((g) => g.id));
  if (picks.some((p) => !knownGroupIds.has(p.groupId)))
    return { error: `"${productName}" cambió sus opciones. Actualiza tu carrito.` };

  return { delta, snapshot };
}
