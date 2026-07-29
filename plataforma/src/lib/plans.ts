/* ============================================================
   PLANES — Definición centralizada de todos los tiers de Leogin
   ------------------------------------------------------------
   Única fuente de verdad para nombres, precios y features de plan.
   La usan: la página pública /planes, el panel admin (upsell),
   el editor del super admin y el sistema de billing (a través de
   platform_settings, que puede sobreescribir estos precios por
   defecto sin tocar código — ver src/lib/db/billing.ts).

   Modelo (desde 2026-07-12): SIN cobro por GMV/ventas. 4 planes de
   precio fijo + 8 módulos vendibles a la carta sobre cualquier plan.
   Ver PLAN_PLANES_PRICING_2026.md para el razonamiento completo.

   PAUSADO (2026-07-12, decisión de Leonardo): el plan PRO y los
   módulos "proveedores" y "fel" existen en el código y siguen
   soportados por billing/DB, pero NO se ofrecen a clientes todavía
   (proveedores/facturación electrónica aún no están listos). Quedan
   fuera de PUBLIC_PLANS y marcados comingSoon en ADDON_MODULES, así
   que desaparecen de /planes, el armador y el upsell de suscripción.
   Pro sigue seleccionable SOLO desde el panel del super admin, para
   que Leonardo pueda asignarlo manualmente si quiere.
   Para reactivar: agrega 'PRO' de vuelta a PUBLIC_PLANS y quita
   comingSoon de proveedores/fel abajo.
   ============================================================ */

import type { ActivatableModuleKey } from './modules';

export type PlanCode = 'BASICO' | 'ESTANDAR' | 'PREMIUM' | 'PRO';

export interface PlanFeatures {
  products: 'unlimited';
  /** Tope duro de productos (solo el plan gratuito lo tiene; el resto es ilimitado). */
  maxProducts?: number;
  users: number | 'unlimited';
  hasOrders: boolean;
  hasWhatsapp: boolean;
  hasRealtime: boolean;
  hasFullTheme: boolean;
  hasWaiterPanel: boolean;
  /** Impresión de comandas a cocina (agente de impresión). */
  hasPrinting: boolean;
  /** Reportes financieros (ingreso/utilidad/margen) + corte de caja. */
  hasFinance: boolean;
  /** Analítica avanzada + inventario + personal (finanzas va aparte, ver hasFinance). */
  hasAnalytics: boolean;
  /** Participa del descuento "Plan a tu medida" por canal desactivado. */
  hasChannelDiscount: boolean;
  /** Visitas mensuales al menú público a partir de las que se avisa (solo aviso, nunca bloquea el menú). */
  monthlyVisitWarning?: number;
  priceMonthly: number;
  priceLabel: string;
  /** Cobro único de configuración asistida (referencia; el cobro real es manual). */
  setupFee: number;
  badge?: 'MÁS POPULAR' | 'TODO INCLUIDO' | 'GRATIS';
  highlight: boolean;
}

export const PLANS: Record<PlanCode, PlanFeatures & { code: PlanCode; name: string; tagline: string }> = {
  BASICO: {
    code: 'BASICO',
    name: 'Básico',
    tagline: 'Menú digital con QR, gratis para siempre — sin pedidos en línea',
    badge: 'GRATIS',
    priceMonthly: 0,
    priceLabel: 'Gratis',
    setupFee: 0,
    products: 'unlimited',
    maxProducts: 150,
    monthlyVisitWarning: 3000,
    users: 1,
    hasOrders: false,
    hasWhatsapp: false,
    hasRealtime: false,
    hasFullTheme: false,
    hasWaiterPanel: false,
    hasPrinting: false,
    hasFinance: false,
    hasAnalytics: false,
    hasChannelDiscount: false,
    highlight: false,
  },
  ESTANDAR: {
    code: 'ESTANDAR',
    name: 'Estándar',
    tagline: 'Elige 2 de 3 modos de pedido, con avisos en tiempo real y reportes financieros',
    priceMonthly: 299,
    priceLabel: 'Q299 / mes',
    setupFee: 300,
    products: 'unlimited',
    users: 2,
    hasOrders: true,
    hasWhatsapp: true,
    hasRealtime: true,
    hasFullTheme: false,
    hasWaiterPanel: false,
    hasPrinting: false,
    hasFinance: true,
    hasAnalytics: false,
    hasChannelDiscount: false,
    highlight: false,
  },
  PREMIUM: {
    code: 'PREMIUM',
    name: 'Premium',
    tagline: 'Para llevar, comer en local y delivery — panel de mesero, analítica e inventario',
    badge: 'MÁS POPULAR',
    highlight: true,
    priceMonthly: 599,
    priceLabel: 'Q599 / mes',
    setupFee: 300,
    products: 'unlimited',
    users: 'unlimited',
    hasOrders: true,
    hasWhatsapp: true,
    hasRealtime: true,
    hasFullTheme: true,
    hasWaiterPanel: true,
    hasPrinting: true,
    hasFinance: true,
    hasAnalytics: true,
    hasChannelDiscount: true,
  },
  PRO: {
    code: 'PRO',
    name: 'Pro',
    tagline: 'Todo Premium + facturación electrónica, proveedores y soporte prioritario',
    badge: 'TODO INCLUIDO',
    highlight: false,
    priceMonthly: 999,
    priceLabel: 'Q999 / mes',
    setupFee: 0,
    products: 'unlimited',
    users: 'unlimited',
    hasOrders: true,
    hasWhatsapp: true,
    hasRealtime: true,
    hasFullTheme: true,
    hasWaiterPanel: true,
    hasPrinting: true,
    hasFinance: true,
    hasAnalytics: true,
    hasChannelDiscount: true,
  },
};

/** Planes que se ofrecen a clientes (público, armador, upsell). Pro se
 *  arma y factura igual internamente, pero no aparece aquí — ver nota
 *  "PAUSADO" arriba. PLAN_ORDER (abajo) sigue teniendo los 4, para que
 *  el super admin pueda seguir asignando Pro a mano. */
export const PUBLIC_PLANS: PlanCode[] = ['BASICO', 'ESTANDAR', 'PREMIUM'];

export const PLAN_ORDER: PlanCode[] = ['BASICO', 'ESTANDAR', 'PREMIUM', 'PRO'];

export function isUpgrade(current: PlanCode, target: PlanCode): boolean {
  return PLAN_ORDER.indexOf(target) > PLAN_ORDER.indexOf(current);
}

/** El plan Estándar da a elegir 2 de los 3 modos de pedido (comer en local,
 *  para llevar, a domicilio). Para tener los 3 a la vez hay que subir a
 *  Premium — este número es la única fuente de verdad de ese tope. */
export const ESTANDAR_MAX_ORDER_TYPES = 2;

/** Siguiente plan que se le puede ofrecer a un cliente (solo dentro de
 *  PUBLIC_PLANS — nunca recomienda un plan pausado como Pro). */
export function nextPlan(current: PlanCode): PlanCode | null {
  const idx = PUBLIC_PLANS.indexOf(current);
  return idx >= 0 && idx < PUBLIC_PLANS.length - 1 ? PUBLIC_PLANS[idx + 1] : null;
}

/* ── Módulos a la carta ────────────────────────────────────────
   Reutilizan el mismo entitlement de ACTIVATABLE_MODULES (modules.ts):
   Leogin activa restaurants.modules[key] = true y ESO es lo que se
   cobra si el plan actual no lo incluye gratis. El on/off del propio
   dueño (module_settings) no cambia el cobro, solo la visibilidad. */

export interface AddonModule {
  key: ActivatableModuleKey;
  /** Precio mensual si se compra suelto (no incluido en el plan). */
  price: number;
  /** Cobro único adicional (ej. FEL: conexión con certificador). */
  setupFee?: number;
  /** Plan más bajo desde el que se puede añadir (por dependencias funcionales). */
  minPlan: PlanCode;
  /** Existe y se factura, pero no se ofrece a clientes todavía (ver nota "PAUSADO"). */
  comingSoon?: boolean;
}

export const ADDON_MODULES: Record<ActivatableModuleKey, AddonModule> = {
  reservaciones:  { key: 'reservaciones',  price: 99,  minPlan: 'BASICO' },
  lista_espera:   { key: 'lista_espera',   price: 49,  minPlan: 'BASICO' },
  llamada_mesero: { key: 'llamada_mesero', price: 49,  minPlan: 'ESTANDAR' },
  encuestas:      { key: 'encuestas',      price: 49,  minPlan: 'ESTANDAR' },
  cupones:        { key: 'cupones',        price: 79,  minPlan: 'ESTANDAR' },
  loyalty:        { key: 'loyalty',        price: 99,  minPlan: 'ESTANDAR' },
  recetas:        { key: 'recetas',        price: 79,  minPlan: 'BASICO' },
  proveedores:    { key: 'proveedores',    price: 99,  minPlan: 'BASICO', comingSoon: true },
  fel:            { key: 'fel',            price: 249, setupFee: 500, minPlan: 'ESTANDAR', comingSoon: true },
};

/** ¿Se le puede ofrecer este módulo a un cliente ahora mismo? */
export function isAddonAvailable(key: ActivatableModuleKey): boolean {
  return !ADDON_MODULES[key]?.comingSoon;
}

/* ── Precios efectivos (platform_settings puede sobreescribirlos) ──
   Los montos de PLANS/ADDON_MODULES son los DEFAULTS de fábrica. El
   super admin puede cambiarlos en /super/configuracion sin tocar
   código; ese override vive en platform_settings y llega a la UI en
   esta forma. Toda superficie que muestre un precio debe usar un
   PlanPricing (el servidor lo obtiene con getEffectivePlanPricing()
   de lib/db/billing; los componentes cliente lo reciben por props o
   por usePlanPricing()). */

export interface PlanPricing {
  /** Precio mensual vigente de cada plan. */
  prices: Record<PlanCode, number>;
  /** Precio mensual vigente de cada módulo a la carta. */
  modulePrices: Record<ActivatableModuleKey, number>;
  /** Cobro único de activación de FEL. */
  moduleSetupFeeFel: number;
  /** Mensualidad del panel de grupo (franquicias). */
  groupPanelFee: number;
  /** Descuento "plan a tu medida" por método de pedido desactivado. */
  channelDiscountPer: number;
  channelDiscountMax: number;
  /** Días de prueba gratis del registro self-serve. */
  trialDays: number;
}

/** Precios de fábrica (fallback cuando no hay override cargado). */
export function defaultPlanPricing(): PlanPricing {
  return {
    prices: Object.fromEntries(
      PLAN_ORDER.map((code) => [code, PLANS[code].priceMonthly]),
    ) as Record<PlanCode, number>,
    modulePrices: Object.fromEntries(
      (Object.keys(ADDON_MODULES) as ActivatableModuleKey[]).map((k) => [k, ADDON_MODULES[k].price]),
    ) as Record<ActivatableModuleKey, number>,
    moduleSetupFeeFel: ADDON_MODULES.fel.setupFee ?? 500,
    groupPanelFee: GROUP_PANEL_FEE,
    channelDiscountPer: 50,
    channelDiscountMax: 2,
    trialDays: 30,
  };
}

/** "Q599" — precio vigente del plan, sin decimales. */
export function planPriceQ(pricing: PlanPricing, code: PlanCode): string {
  return 'Q' + pricing.prices[code].toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

/** "Q599 / mes" — etiqueta de precio vigente (reemplaza a PLANS[x].priceLabel). "Gratis" si el precio vigente es Q0. */
export function planPriceLabel(pricing: PlanPricing, code: PlanCode): string {
  if (pricing.prices[code] === 0) return 'Gratis';
  return `${planPriceQ(pricing, code)} / mes`;
}

/** Costo mensual de una lista de módulos con precios vigentes (Q0 si el plan los incluye). */
export function planAddonCostWith(pricing: PlanPricing, plan: PlanCode, addons: ActivatableModuleKey[]): number {
  return addons.reduce((sum, key) => sum + (isModuleIncluded(plan, key) ? 0 : (pricing.modulePrices[key] ?? 0)), 0);
}

/** Total mensual con precios vigentes: plan base + módulos no incluidos. */
export function planTotalWith(pricing: PlanPricing, plan: PlanCode, addons: ActivatableModuleKey[]): number {
  return pricing.prices[plan] + planAddonCostWith(pricing, plan, addons);
}

/** Módulos incluidos SIN costo adicional en cada plan. */
export const INCLUDED_MODULES: Record<PlanCode, ActivatableModuleKey[]> = {
  BASICO: [],
  ESTANDAR: [],
  PREMIUM: ['llamada_mesero', 'encuestas', 'cupones', 'loyalty', 'recetas', 'reservaciones', 'lista_espera'],
  PRO: ['reservaciones', 'lista_espera', 'llamada_mesero', 'encuestas', 'cupones', 'loyalty', 'recetas', 'proveedores', 'fel'],
};

export function isModuleIncluded(plan: PlanCode, key: ActivatableModuleKey): boolean {
  return INCLUDED_MODULES[plan]?.includes(key) ?? false;
}

/* ── Titularidad efectiva: el PLAN manda ───────────────────────
   Durante mucho tiempo hubo dos verdades sobre "qué tiene este
   restaurante" y no coincidían:

     1. el plan (plans.ts) — lo que se vende en /planes y se cobra;
     2. restaurants.modules (jsonb) — banderas que se escriben a mano
        desde el super admin y en el alta self-serve, y que es lo que
        el panel leía de verdad.

   Cuando (2) se quedaba corto respecto de (1), el cliente pagaba por
   algo que su panel nunca le mostraba, sin candado ni aviso: la
   función simplemente no existía para él. Ese hueco es exactamente lo
   que pasaba en Premium con Reservaciones, Lista de espera y Lealtad.

   Regla única a partir de aquí: el jsonb solo puede AÑADIR sobre lo
   que el plan ya incluye, nunca quitarlo. Lo que el plan incluye se
   entrega siempre; lo que no, se entrega si Leogin lo habilitó
   (compra a la carta) — y eso es justo lo que se factura. */

/** ¿Este restaurante tiene derecho al módulo? (incluido en su plan O habilitado a mano). */
export function hasModuleEntitlement(
  plan: PlanCode | string | null | undefined,
  modules: Record<string, boolean> | null | undefined,
  key: ActivatableModuleKey,
): boolean {
  const p = (plan ?? 'BASICO') as PlanCode;
  return isModuleIncluded(p, key) || modules?.[key] === true;
}

/** Banderas de plan "legacy" que viven en restaurants.modules pero las define el plan. */
export type PlanFeatureFlag = 'orders' | 'whatsapp_notify' | 'analitica' | 'inventario' | 'personal' | 'finanzas';

/** Mínimo que cada plan garantiza para esas banderas — derivado de PLANS, sin listas paralelas. */
export function planFeatureFloor(plan: PlanCode): Record<PlanFeatureFlag, boolean> {
  const f = PLANS[plan];
  return {
    orders:          f.hasOrders,
    whatsapp_notify: f.hasWhatsapp,
    finanzas:        f.hasFinance,
    analitica:       f.hasAnalytics,
    inventario:      f.hasAnalytics,
    personal:        f.hasAnalytics,
  };
}

/** ¿La función está disponible? El plan la garantiza, o se habilitó a mano. */
export function hasPlanFeature(
  plan: PlanCode | string | null | undefined,
  modules: Record<string, boolean> | null | undefined,
  flag: PlanFeatureFlag,
): boolean {
  const p = (PLAN_ORDER as string[]).includes(plan ?? '') ? (plan as PlanCode) : 'BASICO';
  return planFeatureFloor(p)[flag] || modules?.[flag] === true;
}

/**
 * Aplica el piso del plan sobre un mapa de módulos: nunca quita lo que ya
 * estaba encendido, solo garantiza lo que el plan promete. Se usa al crear
 * un restaurante y al guardar plan desde el super admin, para que el jsonb
 * no pueda volver a quedarse por debajo de lo vendido.
 */
export function withPlanFloor(
  plan: PlanCode,
  modules: Record<string, boolean> = {},
): Record<string, boolean> {
  const out: Record<string, boolean> = { ...modules, catalog: true };
  const floor = planFeatureFloor(plan);
  for (const [flag, on] of Object.entries(floor)) {
    if (on) out[flag] = true;
  }
  for (const key of INCLUDED_MODULES[plan]) {
    out[key] = true;
  }
  return out;
}

export function addonPrice(key: ActivatableModuleKey): number {
  return ADDON_MODULES[key]?.price ?? 0;
}

/** Costo mensual de una lista de módulos sobre un plan dado (Q0 si ya vienen incluidos). */
export function planAddonCost(plan: PlanCode, addons: ActivatableModuleKey[]): number {
  return addons.reduce((sum, key) => sum + (isModuleIncluded(plan, key) ? 0 : addonPrice(key)), 0);
}

/** Total mensual: plan base + módulos a la carta no incluidos (sin descuentos de canal/sucursal). */
export function planTotal(plan: PlanCode, addons: ActivatableModuleKey[]): number {
  return PLANS[plan].priceMonthly + planAddonCost(plan, addons);
}

/* ── Descuento por volumen de sucursales (franquicias/grupos) ──── */

export const GROUP_PANEL_FEE = 299;

export const BRANCH_DISCOUNT_TIERS: { minBranches: number; pct: number; label: string }[] = [
  { minBranches: 10, pct: 0.20, label: '10+ sucursales' },
  { minBranches: 5, pct: 0.15, label: '5–9 sucursales' },
  { minBranches: 2, pct: 0.10, label: '2–4 sucursales' },
];

/** % de descuento sobre el precio de plan de cada sucursal adicional (no aplica a la primera). */
export function branchDiscountPct(totalBranches: number): number {
  for (const tier of BRANCH_DISCOUNT_TIERS) {
    if (totalBranches >= tier.minBranches) return tier.pct;
  }
  return 0;
}
