import type { PlanCode } from '@/lib/plans';

/* ============================================================
   COBRO DE UN RESTAURANTE RECIÉN CREADO
   ------------------------------------------------------------
   Vive aparte —y sin dependencias de servidor— porque la misma decisión se
   toma en dos altas distintas: la de la calle (registro) y la de "crear
   otro restaurante" dentro de Mi cuenta. Estaban duplicadas literalmente,
   que es como una regla de negocio acaba diciendo dos cosas distintas sin
   que nadie lo note.

   LA REGLA: la prueba gratis es UNA por persona, en su primer restaurante.

   El motivo es que la prueba existe para que alguien que no conoce Leogin
   se atreva a probarlo. Quien ya tiene un restaurante aquí ya lo conoce: si
   cada local nuevo trajera 30 días gratis, bastaría con abrir uno al mes
   para no pagar nunca — y ahora que crear restaurantes es un botón cómodo
   dentro de Mi cuenta, ese sería el camino fácil, no el rebuscado.
   ============================================================ */

/** La fila de `restaurant_billing` con la que nace un restaurante. */
export type NewRestaurantBilling = {
  auto_price: true;
  /** Suscripción en marcha (se cobra). En prueba es `false`. */
  active: boolean;
  trial_ends_at: string | null;
  currency: 'GTQ';
};

export function newRestaurantBilling(input: {
  planCode: PlanCode;
  /** Días de prueba configurados en /super/configuracion. */
  trialDays: number;
  /** ¿Es el primer restaurante de esta persona? Solo ese lleva prueba. */
  isFirstOfOwner: boolean;
  now?: number;
}): NewRestaurantBilling {
  const base = { auto_price: true, currency: 'GTQ' } as const;

  // BÁSICO es gratis para siempre: no hay nada que probar ni que graduar,
  // así que nace activo y sin prueba, sea el primero o el quinto.
  if (input.planCode === 'BASICO') {
    return { ...base, active: true, trial_ends_at: null };
  }

  const days = Math.max(0, Math.round(input.trialDays));
  if (!input.isFirstOfOwner || days === 0) {
    // Cobro desde el día uno. `active: true` lo mete en la facturación
    // mensual de inmediato; `leogin_apply_auto_price` le pone la tarifa.
    return { ...base, active: true, trial_ends_at: null };
  }

  return {
    ...base,
    active: false,
    trial_ends_at: new Date((input.now ?? Date.now()) + days * 86_400_000).toISOString(),
  };
}
