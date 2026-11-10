/* ============================================================
   PLANES — Definición centralizada de todos los tiers de Leogin
   ------------------------------------------------------------
   Única fuente de verdad para nombres, precios y features de plan.
   La usan: la página pública /planes, el panel admin (upsell),
   el editor del super admin y el sistema de billing (a través de
   platform_settings, que puede sobreescribir estos precios por
   defecto sin tocar código — ver src/lib/db/billing.ts).

   Modelo (desde 2026-08-21): SIN cobro por GMV/ventas y SIN precio
   variable. Planes de precio fijo (EN_LINEA se sumó el 2026-10-28, ver
   docs/planes/PLAN_NECESIDAD_Y_PLAN_EN_LINEA_2026-10-28.md §2), cada uno con su set de módulos
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

import { ACTIVATABLE_MODULES, isModuleActive, type ActivatableModuleKey, type ModuleSettings } from './modules';
import { fmtMoney } from './money';

export type PlanCode = 'BASICO' | 'EN_LINEA' | 'ESTANDAR' | 'PREMIUM' | 'PRO';

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
  /** Pedidos al mes incluidos (tope BLANDO: avisa y pide subir, nunca corta un pedido). Ver lib/tope-pedidos.ts. */
  monthlyOrderCap?: number;
  priceMonthly: number;
  priceLabel: string;
  /** Cobro único de configuración asistida (referencia; el cobro real es manual). */
  setupFee: number;
  /* «MÁS POPULAR» salió el 2026-10-27: sin clientes que lo respalden, si un
     prospecto pregunta cuántos lo usan la etiqueta se cae y arrastra la
     confianza en lo demás (auditoría de experiencia, EV-11). Volver a ella
     cuando sea cierto. */
  badge?: 'RECOMENDADO' | 'TODO INCLUIDO' | 'GRATIS';
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
  /* Para quien solo vende en línea (WhatsApp, Instagram, cocina oculta,
     cocina de casa) y va empezando: Q99 y sin alta. A cambio, solo para
     llevar y a domicilio (nada de comer en local: quien tiene mesas sigue
     necesitando Estándar o Premium), un usuario, 150 productos y sin
     finanzas, cupones, lealtad, impresión ni mesero. Los encargos con
     cupo y la transferencia del comensal (mig. 149) se retiraron el
     2026-11-02 por decisión del dueño (mig. 153). */
  EN_LINEA: {
    code: 'EN_LINEA',
    name: 'En línea',
    tagline: 'Vende para llevar y a domicilio desde tu WhatsApp o Instagram, sin comisión por pedido',
    priceMonthly: 99,
    priceLabel: 'Q99 / mes',
    setupFee: 0,
    products: 'unlimited',
    maxProducts: 150,
    // Lo que lo separa de Estándar desde que salieron los encargos
    // (2026-11-02): es para empezar. Unos 10 pedidos al día.
    monthlyOrderCap: 300,
    users: 1,
    hasOrders: true,
    hasWhatsapp: true,
    hasRealtime: true,
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
    badge: 'RECOMENDADO',
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
export const PUBLIC_PLANS: PlanCode[] = ['BASICO', 'EN_LINEA', 'ESTANDAR', 'PREMIUM'];

export const PLAN_ORDER: PlanCode[] = ['BASICO', 'EN_LINEA', 'ESTANDAR', 'PREMIUM', 'PRO'];

export function isUpgrade(current: PlanCode, target: PlanCode): boolean {
  return PLAN_ORDER.indexOf(target) > PLAN_ORDER.indexOf(current);
}

/** El plan Estándar da a elegir 2 de los 3 modos de pedido (comer en local,
 *  para llevar, a domicilio). Para tener los 3 a la vez hay que subir a
 *  Premium — este número es la única fuente de verdad de ese tope. */
export const ESTANDAR_MAX_ORDER_TYPES = 2;

/** Modos de pedido que un plan NO permite, aunque el tema los pida. En
 *  línea es para llevar y a domicilio: comer en local es de Estándar en
 *  adelante. Básico no tiene pedidos (lo controla `hasOrders`). */
export const PLAN_ORDER_TYPES_BLOCKED: Partial<Record<PlanCode, ('dine_in' | 'pickup' | 'delivery')[]>> = {
  EN_LINEA: ['dine_in'],
};

/** Los modos que el plan deja usar, de una lista pedida. */
export function orderTypesForPlan<T extends string>(plan: PlanCode | string | null | undefined, types: T[]): T[] {
  const bloqueados = (PLAN_ORDER_TYPES_BLOCKED[(plan ?? 'BASICO') as PlanCode] ?? []) as string[];
  return types.filter((t) => !bloqueados.includes(t));
}

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
  /** Tarifas de configuración asistida; opcional para conservar consumidores anteriores. */
  setupFees?: Record<PlanCode, number>;
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

/** "Q349" o "Q349.50" — precio vigente del plan, conservando centavos. */
export function planPriceQ(pricing: PlanPricing, code: PlanCode): string {
  return formatPlanAmount(pricing.prices[code]);
}

/** "Q349 / mes" — etiqueta de precio vigente (reemplaza a PLANS[x].priceLabel). "Gratis" si el precio vigente es Q0. */
export function planPriceLabel(pricing: PlanPricing, code: PlanCode): string {
  if (pricing.prices[code] === 0) return 'Gratis';
  return `${planPriceQ(pricing, code)} / mes`;
}

/** Módulos incluidos en cada plan — es lo que el plan trae, sin costo extra ni compra suelta. */
export const INCLUDED_MODULES: Record<PlanCode, ActivatableModuleKey[]> = {
  BASICO: [],
  EN_LINEA: [],
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
  EN_LINEA: '#0369a1',
  ESTANDAR: '#047857',
  PREMIUM: '#c2542f',
  PRO: '#6d28d9',
};

/* El mismo color como variable CSS (`--plan-*`, globals.css): sale de esta
   paleta en claro y sube un paso en el panel oscuro. Es lo que usan el
   Super y el panel del dueño — chips, puntos de la barra lateral, precios. */
export const PLAN_COLOR_VAR: Record<PlanCode, string> = {
  BASICO: 'var(--plan-basico)',
  EN_LINEA: 'var(--plan-en-linea)',
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
  EN_LINEA: '#075985',
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
    { text: `Hasta ${PLANS.BASICO.maxProducts} productos · ${PLANS.BASICO.users} usuario`, positive: true },
    { text: 'Tu logo y color de marca', positive: true },
    { text: 'Sin pedidos en línea', positive: false },
  ],
  EN_LINEA: [
    { text: 'Para llevar y a domicilio', positive: true },
    { text: 'Zonas de reparto y seguimiento del pedido', positive: true },
    { text: 'Avisos en tiempo real y WhatsApp', positive: true },
    { text: `Hasta ${PLANS.EN_LINEA.monthlyOrderCap} pedidos/mes sin cortar pedidos · ${PLANS.EN_LINEA.maxProducts} productos · ${PLANS.EN_LINEA.users} usuario`, positive: true },
  ],
  ESTANDAR: [
    { text: `Elige ${ESTANDAR_MAX_ORDER_TYPES} de 3 modos de pedido`, positive: true },
    { text: 'Avisos en tiempo real y WhatsApp', positive: true },
    { text: `Productos ilimitados · ${PLANS.ESTANDAR.users} usuarios`, positive: true },
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

/* Contrato de presentación 0.2. Solo lectura: no recalcula cobros ni facturas.
   La tarifa pública es GTQ; el acuerdo particular solo viaja al panel autorizado. */
export const PLAN_CONTRACT_VERSION = '2026-11-05';

type BooleanPlanFeature = 'hasOrders' | 'hasWhatsapp' | 'hasRealtime' | 'hasFullTheme'
  | 'hasWaiterPanel' | 'hasPrinting' | 'hasFinance' | 'hasAnalytics';
export type PlanCapability = {
  key: string;
  label: string;
  feature?: BooleanPlanFeature;
  flag?: PlanFeatureFlag;
  module?: ActivatableModuleKey;
  always?: boolean;
};

/** La comparativa y la suscripción muestran el mismo catálogo y cuentan sus filas. */
export const PLAN_CAPABILITIES: PlanCapability[] = [
  { key: 'catalogue', label: 'Menú digital con código QR', always: true },
  { key: 'orders', label: 'Pedidos en línea', feature: 'hasOrders', flag: 'orders' },
  { key: 'whatsapp', label: 'Avisos por WhatsApp', feature: 'hasWhatsapp', flag: 'whatsapp_notify' },
  { key: 'realtime', label: 'Alertas en tiempo real', feature: 'hasRealtime', flag: 'orders' },
  { key: 'theme', label: 'Personalización completa', feature: 'hasFullTheme' },
  { key: 'waiter', label: 'Panel de mesero y mesas', feature: 'hasWaiterPanel' },
  { key: 'printing', label: 'Impresión de comandas', feature: 'hasPrinting' },
  { key: 'finance', label: 'Reportes financieros y corte de caja', feature: 'hasFinance', flag: 'finanzas' },
  { key: 'analytics', label: 'Analítica', feature: 'hasAnalytics', flag: 'analitica' },
  { key: 'inventory', label: 'Inventario', feature: 'hasAnalytics', flag: 'inventario' },
  { key: 'staff', label: 'Personal', feature: 'hasAnalytics', flag: 'personal' },
  ...ACTIVATABLE_MODULES.map((m) => ({ key: m.key, label: m.label, module: m.key })),
];

export function publicPlanCapabilities(): PlanCapability[] {
  return PLAN_CAPABILITIES.filter((item) => PUBLIC_PLANS.some((code) =>
    item.module ? isModuleIncluded(code, item.module) : !!(item.always || (item.feature && PLANS[code][item.feature]))));
}

export type PlanOrderType = 'dine_in' | 'pickup' | 'delivery';
export const PLAN_ORDER_TYPE_LABELS: Record<PlanOrderType, string> = {
  dine_in: 'Comer en local', pickup: 'Para llevar', delivery: 'A domicilio',
};
export const ALL_PLAN_ORDER_TYPES: PlanOrderType[] = ['dine_in', 'pickup', 'delivery'];

export function validPlanCode(value: string | null | undefined): PlanCode {
  return PLAN_ORDER.includes(value as PlanCode) ? value as PlanCode : 'BASICO';
}

export function formatPlanAmount(amount: number, currency = 'GTQ'): string {
  return fmtMoney(amount, currency, Number.isInteger(amount) ? 0 : 2);
}

export type PlanBillingSnapshot = {
  monthly_fee: number;
  auto_price: boolean;
  currency?: string;
  started_at?: string | null;
};

export type PlanPresentationInput = {
  plan?: string | null;
  pricing: PlanPricing;
  modules?: Record<string, boolean> | null;
  settings?: ModuleSettings | null;
  orderTypes?: PlanOrderType[];
  /** Solo el llamador que comprobó la configuración puede afirmar que está lista. */
  configured?: Record<string, boolean | null>;
  billing?: PlanBillingSnapshot | null;
  /** Importe del motor existente de facturación, nunca calculado de nuevo aquí. */
  computedFee?: number | null;
};

export function planPresentation(input: PlanPresentationInput) {
  const code = validPlanCode(input.plan);
  const plan = PLANS[code];
  const modules = withPlanFloor(code, input.modules ?? {});
  const publicKeys = new Set(publicPlanCapabilities().map((item) => item.key));
  const capabilities = PLAN_CAPABILITIES.map((item) => {
    const included = item.module ? isModuleIncluded(code, item.module) : !!(item.always || (item.feature && plan[item.feature]));
    const enabled = included || (item.module ? modules[item.module] === true : !!(item.flag && modules[item.flag]));
    const configured = input.configured?.[item.key] ?? null;
    const active = enabled && (item.module ? isModuleActive(modules, input.settings, item.module) : true);
    return { ...item, included, enabled, configured, active };
  }).filter((item) => item.enabled || publicKeys.has(item.key));
  const availableOrderTypes = plan.hasOrders ? orderTypesForPlan(code, ALL_PLAN_ORDER_TYPES) : [];
  const selectedOrderTypes = (input.orderTypes ?? []).filter((type) => availableOrderTypes.includes(type));
  const maxOrderTypes = code === 'ESTANDAR' ? ESTANDAR_MAX_ORDER_TYPES : availableOrderTypes.length;
  const publicAmount = input.pricing.prices[code];
  const billing = input.billing;
  const manual = billing?.auto_price === false;
  const monthlyAmount = manual ? billing.monthly_fee
    : billing ? input.computedFee ?? billing.monthly_fee : publicAmount;
  const currency = billing?.currency ?? 'GTQ';
  const monthlyLabel = monthlyAmount === 0 ? 'Gratis' : `${formatPlanAmount(monthlyAmount, currency)}${currency === 'GTQ' ? '' : ` ${currency}`} / mes`;
  const policy = plan.monthlyOrderCap
    ? `Hasta ${plan.monthlyOrderCap} pedidos al mes · límite blando: ningún pedido se corta`
    : plan.hasOrders ? 'Sin tope de pedidos ni comisión por venta' : 'Menú digital · sin pedidos';
  const orderScope = !plan.hasOrders ? 'Menú digital · sin pedidos'
    : code === 'ESTANDAR' ? `Elige ${maxOrderTypes} de ${availableOrderTypes.length} modalidades de pedido`
      : availableOrderTypes.map((type) => PLAN_ORDER_TYPE_LABELS[type]).join(' · ');
  const selectedScope = selectedOrderTypes.length
    ? `Modalidades activas: ${selectedOrderTypes.map((type) => PLAN_ORDER_TYPE_LABELS[type]).join(' · ')}`
    : 'Modalidades activas: sin comprobar';
  return {
    version: PLAN_CONTRACT_VERSION, code, name: plan.name, tagline: plan.tagline,
    points: PLAN_POINTS[code], capabilities,
    includedCount: capabilities.filter((item) => item.included).length,
    enabledCount: capabilities.filter((item) => item.enabled).length,
    activeCount: capabilities.filter((item) => item.active).length,
    moduleCounts: {
      included: capabilities.filter((item) => item.module && item.included).length,
      enabled: capabilities.filter((item) => item.module && item.enabled).length,
      active: capabilities.filter((item) => item.module && item.active).length,
      configured: capabilities.filter((item) => item.module && item.enabled && item.configured === true).length,
    },
    availableOrderTypes, selectedOrderTypes, maxOrderTypes, orderScope, selectedScope, policy,
    publicAmount, publicLabel: planPriceLabel(input.pricing, code),
    setupAmount: input.pricing.setupFees?.[code] ?? plan.setupFee,
    monthlyAmount, monthlyLabel, currency, manual,
    billingConfigured: !!billing,
    priceExplanation: manual ? 'Precio acordado para este restaurante. La tarifa pública es una referencia.'
      : billing && input.computedFee == null ? 'Mensualidad guardada; no se pudo comprobar el cálculo actual.'
      : billing ? 'Mensualidad automática del plan; encender o apagar funciones no cambia la tarifa.'
        : 'Tarifa pública de referencia; el cobro de este restaurante aún no está configurado.',
    billingStartedAt: billing?.started_at ?? null,
    usersLabel: plan.users === 'unlimited' ? 'Usuarios ilimitados' : `${plan.users} ${plan.users === 1 ? 'usuario' : 'usuarios'} del panel`,
    productsLabel: plan.maxProducts ? `Hasta ${plan.maxProducts} productos` : 'Productos ilimitados',
  };
}

/** Resumen de operación para Hoy, sin confundir lo permitido con lo encendido. */
export function planOperationCopy(presentation: ReturnType<typeof planPresentation>): string {
  return `Tu plan ${presentation.name}: ${presentation.orderScope}. ${presentation.selectedScope}.`;
}

/** Una selección de plan no elimina un acuerdo manual: el motor solo aplica auto_price. */
export function planChangePresentation(current: ReturnType<typeof planPresentation> | null | undefined, target: PlanCode, pricing: PlanPricing) {
  return planPresentation({
    plan: target, pricing,
    billing: current?.manual ? { auto_price: false, monthly_fee: current.monthlyAmount, currency: current.currency } : null,
  });
}

export function capabilityStateLabel(item: ReturnType<typeof planPresentation>['capabilities'][number]): string {
  if (!item.enabled) return 'No incluido ni habilitado';
  const origin = item.included ? 'Incluido en tu plan' : 'Habilitado por excepción';
  const config = item.configured === null ? 'configuración sin comprobar' : item.configured ? 'configurado' : 'sin configurar';
  return `${origin} · ${item.active ? 'encendido' : 'apagado'} · ${config}`;
}

/** La misma política se utiliza en las tarjetas y en la FAQ; no promete pedidos ilimitados en En línea. */
export function planGrowthCopy(pricing: PlanPricing): string {
  const online = planPresentation({ plan: 'EN_LINEA', pricing });
  return `No cobramos un porcentaje de tus ventas. En línea: ${online.policy}. Si superas ese límite, te avisamos para pasar a Estándar el siguiente mes. Estándar y Premium no tienen tope de pedidos. Encender o apagar canales no cambia el precio del plan.`;
}

export function planComparisonCopy(pricing: PlanPricing): string {
  return PUBLIC_PLANS.map((code) => {
    const c = planPresentation({ plan: code, pricing });
    return `${c.name} (${c.publicLabel}): ${c.orderScope}. ${c.productsLabel}; ${c.usersLabel}. ${c.policy}. Configuración asistida: ${formatPlanAmount(c.setupAmount)}.`;
  }).join(' ');
}

/* ============================================================
   CAMBIAR DE PLAN (desde el panel del dueño, 2026-10-28)
   ------------------------------------------------------------
   `withPlanFloor` solo SUBE: garantiza lo que el plan nuevo promete,
   pero no apaga lo que traía el anterior. Al bajar de Premium a En
   línea, analítica, inventario, cupones o lealtad se quedaban
   encendidos en el jsonb y el restaurante seguía teniendo lo que ya
   no paga. Aquí se apaga lo que el plan de antes daba y el nuevo no,
   y después se aplica el piso del nuevo.
   ============================================================ */

const BANDERAS_DE_PLAN: PlanFeatureFlag[] = ['orders', 'whatsapp_notify', 'analitica', 'inventario', 'personal', 'finanzas'];

/** Módulos con los que queda el restaurante al pasar de `antes` a `despues`. */
export function modulosAlCambiarDePlan(
  antes: PlanCode,
  despues: PlanCode,
  modules: Record<string, boolean> = {},
): Record<string, boolean> {
  const out: Record<string, boolean> = { ...modules };
  const piso = planFeatureFloor(despues);
  for (const f of BANDERAS_DE_PLAN) out[f] = piso[f];
  for (const key of INCLUDED_MODULES[antes] ?? []) {
    if (!INCLUDED_MODULES[despues].includes(key)) out[key] = false;
  }
  return withPlanFloor(despues, out);
}

/** Modos de pedido con los que queda el tema al cambiar de plan: se quita lo
 *  que el plan nuevo no permite y, si no queda ninguno, los de fábrica. */
export function modosAlCambiarDePlan(
  plan: PlanCode,
  actuales: ('dine_in' | 'pickup' | 'delivery')[],
): ('dine_in' | 'pickup' | 'delivery')[] {
  if (plan === 'BASICO') return ['pickup'];
  let modos = orderTypesForPlan(plan, actuales);
  if (plan === 'ESTANDAR' && modos.length > ESTANDAR_MAX_ORDER_TYPES) {
    // Se quedan los de vender fuera antes que el salón: es lo que se pierde
    // con menos ruido (las mesas se vuelven a encender en Funciones).
    modos = (['pickup', 'delivery', 'dine_in'] as const).filter((m) => modos.includes(m)).slice(0, ESTANDAR_MAX_ORDER_TYPES);
  }
  if (modos.length > 0) return modos;
  return plan === 'EN_LINEA' ? ['pickup', 'delivery'] : plan === 'ESTANDAR' ? ['pickup', 'dine_in'] : ['dine_in', 'delivery', 'pickup'];
}

/** Lo que el restaurante deja de tener al pasar de `antes` a `despues`, para avisarle antes de confirmar. */
export function loQueSePierde(antes: PlanCode, despues: PlanCode): string[] {
  const a = PLANS[antes];
  const d = PLANS[despues];
  const fuera: string[] = [];
  if (a.hasOrders && !d.hasOrders) fuera.push('Pedidos en línea');
  if (!orderTypesForPlan(despues, ['dine_in']).length && orderTypesForPlan(antes, ['dine_in']).length && d.hasOrders) fuera.push('Pedidos para comer en local');
  if (a.hasWaiterPanel && !d.hasWaiterPanel) fuera.push('Panel de mesero y mapa de mesas');
  if (a.hasFinance && !d.hasFinance) fuera.push('Reportes financieros y corte de caja');
  if (a.hasAnalytics && !d.hasAnalytics) fuera.push('Analítica, inventario y personal');
  if (a.hasFullTheme && !d.hasFullTheme) fuera.push('Personalización completa');
  const modulos = (INCLUDED_MODULES[antes] ?? []).filter((k) => !INCLUDED_MODULES[despues].includes(k));
  if (modulos.length > 0) fuera.push(`${modulos.length} ${modulos.length === 1 ? 'herramienta incluida' : 'herramientas incluidas'} (lealtad, cupones y más)`);
  if (d.maxProducts && !a.maxProducts) fuera.push(`Productos ilimitados (el plan nuevo llega a ${d.maxProducts})`);
  return fuera;
}
