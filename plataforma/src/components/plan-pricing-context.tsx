'use client';

/* Contexto de precios vigentes para componentes CLIENTE del panel
   (upsells, candados de plan, módulos). El layout del admin lo
   alimenta con getEffectivePlanPricing() del servidor; si un
   componente se renderiza fuera del provider, cae a los precios de
   fábrica de plans.ts para no romper nada. */

import { createContext, useContext } from 'react';
import { defaultPlanPricing, type PlanPricing } from '@/lib/plans';

const PlanPricingContext = createContext<PlanPricing | null>(null);

export function PlanPricingProvider({
  pricing,
  children,
}: {
  pricing: PlanPricing;
  children: React.ReactNode;
}) {
  return (
    <PlanPricingContext.Provider value={pricing}>
      {children}
    </PlanPricingContext.Provider>
  );
}

/** Precios vigentes (o los de fábrica si no hay provider). */
export function usePlanPricing(): PlanPricing {
  return useContext(PlanPricingContext) ?? defaultPlanPricing();
}
