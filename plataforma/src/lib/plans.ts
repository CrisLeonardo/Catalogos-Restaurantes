/* ============================================================
   PLANES — Definición centralizada de todos los tiers de Leogin
   Usada por la página /planes, el panel admin, el super admin,
   y el sistema de billing.
   ============================================================ */

export type PlanCode =
  | 'BASICO'
  | 'PREMIUM'
  | 'PREMIUM_PRO'
  | 'PREMIUM_ULTRA'
  | 'ALTO_VOLUMEN'
  | 'VARIABLE';

export interface PlanFeatures {
  products: number | 'unlimited';
  users: number | 'unlimited';
  hasOrders: boolean;
  hasWhatsapp: boolean;
  hasRealtime: boolean;
  hasFullTheme: boolean;
  hasWaiterPanel: boolean;
  hasWaiterCall: boolean;
  hasSurveys: boolean;
  hasReservations: boolean;
  hasCoupons: boolean;
  hasLoyalty: boolean;
  hasPrinting: boolean;
  hasAnalytics: boolean;
  hasRecipes: boolean;
  hasSuppliers: boolean;
  hasFEL: boolean;
  gmvLimit: number | null;
  gmvLimitLabel: string;
  priceMonthly: number;
  priceLabel: string;
  badge?: 'MÁS POPULAR' | 'MEJOR VALOR' | 'PARA CRECER';
  highlight: boolean;
}

export const PLANS: Record<PlanCode, PlanFeatures & { code: PlanCode; name: string; tagline: string }> = {
  BASICO: {
    code: 'BASICO',
    name: 'Básico',
    tagline: 'Para restaurantes que inician su presencia digital',
    priceMonthly: 299,
    priceLabel: 'Q299 / mes',
    gmvLimit: null,
    gmvLimitLabel: 'Sin pedidos online',
    products: 30,
    users: 1,
    hasOrders: false,
    hasWhatsapp: false,
    hasRealtime: false,
    hasFullTheme: false,
    hasWaiterPanel: false,
    hasWaiterCall: false,
    hasSurveys: false,
    hasReservations: false,
    hasCoupons: false,
    hasLoyalty: false,
    hasPrinting: false,
    hasAnalytics: false,
    hasRecipes: false,
    hasSuppliers: false,
    hasFEL: false,
    highlight: false,
  },
  PREMIUM: {
    code: 'PREMIUM',
    name: 'Premium',
    tagline: 'Pedidos online, tiempo real y personalización completa',
    badge: 'MÁS POPULAR',
    highlight: true,
    priceMonthly: 600,
    priceLabel: 'Q600 / mes',
    gmvLimit: 20000,
    gmvLimitLabel: 'Hasta Q20,000 en ventas / mes',
    products: 'unlimited',
    users: 3,
    hasOrders: true,
    hasWhatsapp: true,
    hasRealtime: true,
    hasFullTheme: true,
    hasWaiterPanel: true,
    hasWaiterCall: true,
    hasSurveys: true,
    hasReservations: true,
    hasCoupons: true,
    hasLoyalty: true,
    hasPrinting: true,
    hasAnalytics: true,
    hasRecipes: true,
    hasSuppliers: false,
    hasFEL: false,
  },
  PREMIUM_PRO: {
    code: 'PREMIUM_PRO',
    name: 'Premium Pro',
    tagline: 'Para restaurantes con mayor flujo de pedidos',
    badge: 'PARA CRECER',
    highlight: false,
    priceMonthly: 1000,
    priceLabel: 'Q1,000 / mes',
    gmvLimit: 40000,
    gmvLimitLabel: 'Hasta Q40,000 en ventas / mes',
    products: 'unlimited',
    users: 5,
    hasOrders: true,
    hasWhatsapp: true,
    hasRealtime: true,
    hasFullTheme: true,
    hasWaiterPanel: true,
    hasWaiterCall: true,
    hasSurveys: true,
    hasReservations: true,
    hasCoupons: true,
    hasLoyalty: true,
    hasPrinting: true,
    hasAnalytics: true,
    hasRecipes: true,
    hasSuppliers: true,
    hasFEL: false,
  },
  PREMIUM_ULTRA: {
    code: 'PREMIUM_ULTRA',
    name: 'Premium Ultra',
    tagline: 'Control total de operación y alto volumen',
    badge: 'MEJOR VALOR',
    highlight: false,
    priceMonthly: 1500,
    priceLabel: 'Q1,500 / mes',
    gmvLimit: 75000,
    gmvLimitLabel: 'Hasta Q75,000 en ventas / mes',
    products: 'unlimited',
    users: 10,
    hasOrders: true,
    hasWhatsapp: true,
    hasRealtime: true,
    hasFullTheme: true,
    hasWaiterPanel: true,
    hasWaiterCall: true,
    hasSurveys: true,
    hasReservations: true,
    hasCoupons: true,
    hasLoyalty: true,
    hasPrinting: true,
    hasAnalytics: true,
    hasRecipes: true,
    hasSuppliers: true,
    hasFEL: true,
  },
  ALTO_VOLUMEN: {
    code: 'ALTO_VOLUMEN',
    name: 'Alto Volumen',
    tagline: 'Restaurantes de alta afluencia con facturación electrónica',
    highlight: false,
    priceMonthly: 2250,
    priceLabel: 'Q2,250 / mes',
    gmvLimit: 150000,
    gmvLimitLabel: 'Hasta Q150,000 en ventas / mes',
    products: 'unlimited',
    users: 'unlimited',
    hasOrders: true,
    hasWhatsapp: true,
    hasRealtime: true,
    hasFullTheme: true,
    hasWaiterPanel: true,
    hasWaiterCall: true,
    hasSurveys: true,
    hasReservations: true,
    hasCoupons: true,
    hasLoyalty: true,
    hasPrinting: true,
    hasAnalytics: true,
    hasRecipes: true,
    hasSuppliers: true,
    hasFEL: true,
  },
  VARIABLE: {
    code: 'VARIABLE',
    name: 'Variable',
    tagline: 'Para restaurantes con ventas digitales superiores a Q225,000/mes',
    highlight: false,
    priceMonthly: 0,
    priceLabel: '1% de tus ventas del mes',
    gmvLimit: null,
    gmvLimitLabel: 'Sin tope · se factura según GMV real',
    products: 'unlimited',
    users: 'unlimited',
    hasOrders: true,
    hasWhatsapp: true,
    hasRealtime: true,
    hasFullTheme: true,
    hasWaiterPanel: true,
    hasWaiterCall: true,
    hasSurveys: true,
    hasReservations: true,
    hasCoupons: true,
    hasLoyalty: true,
    hasPrinting: true,
    hasAnalytics: true,
    hasRecipes: true,
    hasSuppliers: true,
    hasFEL: true,
  },
};

/** Planes ordenados para mostrar en la página pública (excluye VARIABLE en la vista principal). */
export const PUBLIC_PLANS: PlanCode[] = [
  'BASICO', 'PREMIUM', 'PREMIUM_PRO', 'PREMIUM_ULTRA', 'ALTO_VOLUMEN',
];

export const PLAN_ORDER: PlanCode[] = [
  'BASICO', 'PREMIUM', 'PREMIUM_PRO', 'PREMIUM_ULTRA', 'ALTO_VOLUMEN', 'VARIABLE',
];

export function isUpgrade(current: PlanCode, target: PlanCode): boolean {
  return PLAN_ORDER.indexOf(target) > PLAN_ORDER.indexOf(current);
}

export function nextPlan(current: PlanCode): PlanCode | null {
  const idx = PLAN_ORDER.indexOf(current);
  return idx >= 0 && idx < PLAN_ORDER.length - 1 ? PLAN_ORDER[idx + 1] : null;
}

export function recommendPlan(gmv: number): { plan: PlanCode; price: number; pct: string } {
  if (gmv === 0)     return { plan: 'BASICO',        price: 299,              pct: '—' };
  if (gmv <= 20000)  return { plan: 'PREMIUM',       price: 600,              pct: ((600  / gmv) * 100).toFixed(1) + '%' };
  if (gmv <= 40000)  return { plan: 'PREMIUM_PRO',   price: 1000,             pct: ((1000 / gmv) * 100).toFixed(1) + '%' };
  if (gmv <= 75000)  return { plan: 'PREMIUM_ULTRA', price: 1500,             pct: ((1500 / gmv) * 100).toFixed(1) + '%' };
  if (gmv <= 225000) return { plan: 'ALTO_VOLUMEN',  price: 2250,             pct: ((2250 / gmv) * 100).toFixed(1) + '%' };
  return              { plan: 'VARIABLE',            price: Math.round(gmv * 0.01), pct: '1.0%' };
}
