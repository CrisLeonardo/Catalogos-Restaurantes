/* ============================================================
   PLANES — Definición centralizada de todos los tiers de Leogin
   ------------------------------------------------------------
   Única fuente de verdad para nombres, precios y features de plan.
   La usan: la página pública /planes, el panel admin (upsell),
   el editor del super admin y el sistema de billing (a través de
   platform_settings, que puede sobreescribir estos precios por
   defecto sin tocar código — ver src/lib/db/billing.ts).

   Modelo (desde 2026-08-21): SIN cobro por GMV/ventas y SIN precio
   variable. 4 planes de precio fijo, cada uno con su set de módulos
   ya definido — nada de comprar módulos sueltos ni de descuento por
   desactivar un canal. Quien quiere solo lo de entrada va a Estándar;
   quien lo quiere todo va a Premium. (Antes hubo un modelo de "módulos
   a la carta" + "descuento por canal"; se retiró por decisión de
   Leonardo al bajar los precios base — dos precios variables sobre un
   precio ya reducido era complejidad sin beneficio claro. Puede volver
   en el futuro si hace falta, pero por ahora los planes son fijos.)

   El dueño de un restaurante SIGUE pudiendo apagar un módulo o un canal
   desde su panel por preferencia propia (no quiere verlo, no lo usa) —
   eso es restaurants.module_settings, es puramente de visibilidad y
   nunca fue parte del cobro. Ver src/lib/modules.ts.

   PAUSADO (2026-07-12, decisión de Leonardo): el plan PRO y los
   módulos "proveedores" y "fel" existen en el código y siguen
   soportados por billing/DB, pero NO se ofrecen a clientes todavía
   (proveedores/facturación electrónica aún no están listos). Pro
   queda fuera de PUBLIC_PLANS y solo es seleccionable desde el panel
   del super admin, para que Leonardo pueda asignarlo manualmente.
   Para reactivar: agrega 'PRO' de vuelta a PUBLIC_PLANS.
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
    highlight: false,
  },
  ESTANDAR: {
    code: 'ESTANDAR',
    name: 'Estándar',
    tagline: 'Elige 2 de 3 modos de pedido, con avisos en tiempo real y reportes financieros',
    priceMonthly: 199,
    priceLabel: 'Q199 / mes',
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
    highlight: false,
  },
  PREMIUM: {
    code: 'PREMIUM',
    name: 'Premium',
    tagline: 'Para llevar, comer en local y a domicilio — panel de mesero, analítica e inventario',
    badge: 'MÁS POPULAR',
    highlight: true,
    priceMonthly: 349,
    priceLabel: 'Q349 / mes',
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
  },
  PRO: {
    code: 'PRO',
    name: 'Pro',
    tagline: 'Todo Premium + facturación electrónica, proveedores y soporte prioritario',
    badge: 'TODO INCLUIDO',
    highlight: false,
    // Provisional: reubicado al bajar Premium a Q349 (lanzamiento 2026-08-17).
    // Pro sigue pausado comercialmente hasta que Proveedores y FEL estén listos.
    priceMonthly: 599,
    priceLabel: 'Q599 / mes',
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

/* ── Precios efectivos (platform_settings puede sobreescribirlos) ──
   Los montos de PLANS son los DEFAULTS de fábrica. El super admin puede
   cambiarlos en /super/configuracion sin tocar código; ese override vive
   en platform_settings y llega a la UI en esta forma. Toda superficie
   que muestre un precio debe usar un PlanPricing (el servidor lo obtiene
   con getEffectivePlanPricing() de lib/db/billing; los componentes
   cliente lo reciben por props o por usePlanPricing()). */

export interface PlanPricing {
  /** Precio mensual vigente de cada plan. */
  prices: Record<PlanCode, number>;
  /** Mensualidad del panel de grupo (franquicias). */
  groupPanelFee: number;
  /** Días de prueba gratis del registro self-serve. */
  trialDays: number;
}

/** Precios de fábrica (fallback cuando no hay override cargado). */
export function defaultPlanPricing(): PlanPricing {
  return {
    prices: Object.fromEntries(
      PLAN_ORDER.map((code) => [code, PLANS[code].priceMonthly]),
    ) as Record<PlanCode, number>,
    groupPanelFee: GROUP_PANEL_FEE,
    trialDays: 30,
  };
}

/** "Q349" — precio vigente del plan, sin decimales. */
export function planPriceQ(pricing: PlanPricing, code: PlanCode): string {
  return 'Q' + pricing.prices[code].toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

/** "Q349 / mes" — etiqueta de precio vigente (reemplaza a PLANS[x].priceLabel). "Gratis" si el precio vigente es Q0. */
export function planPriceLabel(pricing: PlanPricing, code: PlanCode): string {
  if (pricing.prices[code] === 0) return 'Gratis';
  return `${planPriceQ(pricing, code)} / mes`;
}

/** Módulos incluidos en cada plan — es lo que el plan trae, sin costo extra ni compra suelta. */
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
   entrega siempre; lo que no, solo se entrega si Leogin lo activó a
   mano como excepción interna (no hay compra a la carta — los planes
   son de precio fijo, ver nota de cabecera). */

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

/* ── Color por plan (páginas públicas) ─────────────────────────
   Vivía duplicado en /planes/page.tsx y en el armador de planes, y las dos
   copias tenían los tonos -400 pensados para la web ANTIGUA (fondo negro):
   sobre el blanco del sitio claro, #94a3b8 daba 2.3:1 y #10b981 2.5:1 — el
   precio grande del Básico y el Estándar se leían lavados. Estos son los
   -600/-700 de la misma familia, todos por encima de 4.5:1 sobre blanco.

   Premium usa el coral de Leogin en lugar de un índigo prestado: es el plan
   destacado y es lo que ata la página al resto de la marca. */
export const PLAN_ACCENT: Record<PlanCode, string> = {
  BASICO: '#475569',
  ESTANDAR: '#047857',
  PREMIUM: '#c2542f',
  PRO: '#6d28d9',
};

/* El mismo color como variable CSS (`--plan-*`, globals.css): sale de esta
   paleta en claro y sube un paso en el panel oscuro. Es lo que usan el
   Super y el panel del dueño — chips, puntos de la barra lateral, precios. */
export const PLAN_COLOR_VAR: Record<PlanCode, string> = {
  BASICO: 'var(--plan-basico)',
  ESTANDAR: 'var(--plan-estandar)',
  PREMIUM: 'var(--plan-premium)',
  PRO: 'var(--plan-pro)',
};

/* Misma familia, un paso más oscura, para cuando el color va como TEXTO.
   Es la misma separación que ya existe entre --brand-accent (rellenos) y
   --brand-accent-ink (tinta) en globals.css, y por el mismo motivo: el coral
   de Premium da 4.56:1 sobre BLANCO PURO, pero los sitios donde se usa como
   texto pequeño están encima de la propia tarjeta tintada al 8-12 %, y ahí
   se cae a 3.9:1. Como relleno con texto blanco encima, PLAN_ACCENT sigue
   siendo el bueno — no uses este. */
export const PLAN_ACCENT_INK: Record<PlanCode, string> = {
  BASICO: '#3f4b5c',
  ESTANDAR: '#04624a',
  PREMIUM: '#9c3f21',
  PRO: '#5b21b6',
};

/* ── Grupos y franquicias ──────────────────────────────────────── */

export const GROUP_PANEL_FEE = 299;

/* ============================================================
   LO QUE SE DICE DE CADA PLAN (auditoría 2026-10-02, MIC-05)
   ------------------------------------------------------------
   La portada, «Crear otro restaurante» y Suscripción describían los
   planes cada una a su manera («Lealtad, cupones y reservaciones»
   aquí, «Panel de mesero, recetas y cupones» allá). Cuatro puntos por
   plan, aquí, y todas las pantallas los leen de este sitio. `false`
   marca lo que el plan NO trae (se pinta tachado o en gris).
   ============================================================ */
export const PLAN_POINTS: Record<PlanCode, { text: string; positive: boolean }[]> = {
  BASICO: [
    { text: 'Menú digital con código QR', positive: true },
    { text: 'Hasta 150 productos · 1 usuario', positive: true },
    { text: 'Tu logo y color de marca', positive: true },
    { text: 'Sin pedidos en línea', positive: false },
  ],
  ESTANDAR: [
    { text: 'Elige 2 de 3 modos de pedido', positive: true },
    { text: 'Avisos en tiempo real y WhatsApp', positive: true },
    { text: 'Productos ilimitados · 2 usuarios', positive: true },
    { text: 'Reportes financieros y corte de caja', positive: true },
  ],
  PREMIUM: [
    { text: 'Para llevar, comer en local y a domicilio', positive: true },
    { text: 'Panel de mesero y plano de mesas', positive: true },
    { text: 'Lealtad, cupones y reservaciones', positive: true },
    { text: 'Analítica, inventario y personal', positive: true },
  ],
  PRO: [
    { text: 'Todo lo de Premium', positive: true },
    { text: 'Facturación electrónica (FEL)', positive: true },
    { text: 'Proveedores y compras', positive: true },
    { text: 'Soporte prioritario', positive: true },
  ],
};
