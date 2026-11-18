import { isModuleActive, type ActivatableModuleKey, type ModuleSettings } from '@/lib/modules';
import { withPlanFloor, PLAN_ORDER, type PlanCode } from '@/lib/plans';
import { whatsappVisiblePara } from '@/lib/whatsapp/visible';

/* ── Lo que el menú del panel necesita saber del restaurante ─────────
   Antes solo el layout principal del panel lo calculaba. Tomar pedidos y
   Cocina tienen su propio layout y le pasaban al armazón cuatro datos: el
   menú se armaba allí como si el plan fuera Básico y todo estuviera
   apagado. Con la barra por rol (ficha 2.11) se notaba: al entrar a Tomar
   pedidos desaparecía el botón, aparecía «Negocio» y nada quedaba marcado.

   Una sola fuente para los tres layouts: el menú es el mismo en cualquier
   pantalla del panel. */

export interface RestauranteDelMenu {
  plan_actual?: string | null;
  modules?: unknown;
  module_settings?: unknown;
}

export function menuDelPanel(
  r: RestauranteDelMenu | null | undefined,
  orderTypes: readonly string[] | null | undefined,
  role: string,
) {
  const planActual = (r?.plan_actual as string | null | undefined) ?? null;
  // El PLAN manda sobre restaurants.modules: si el plan lo incluye, se
  // entrega aunque la bandera del jsonb se haya quedado atrás (migración 095).
  const mod = withPlanFloor(
    ((PLAN_ORDER as string[]).includes(planActual ?? '') ? planActual : 'BASICO') as PlanCode,
    (r?.modules as Record<string, boolean> | null | undefined) ?? {},
  );
  const m = (k: string) => mod[k] === true;
  // Activables: activos solo si Leogin los habilitó Y el restaurante los prendió.
  const ajustes = (r?.module_settings as ModuleSettings | null | undefined) ?? null;
  const activo = (k: ActivatableModuleKey) => isModuleActive(mod, ajustes, k);
  return {
    planActual,
    dineInEnabled: orderTypes?.includes('dine_in') ?? false,
    deliveryEnabled: orderTypes?.includes('delivery') ?? false,
    whatsappReady: whatsappVisiblePara(role),
    ordersEnabled: m('orders'),
    analiticaEnabled: m('analitica'),
    inventarioEnabled: m('inventario'),
    ingredientesEnabled: activo('recetas'),
    personalEnabled: m('personal'),
    finanzasEnabled: m('finanzas'),
    felActive: activo('fel'),
    proveedoresActive: activo('proveedores'),
    loyaltyActive: activo('loyalty'),
    reservacionesActive: activo('reservaciones'),
    listaEsperaActive: activo('lista_espera'),
    encuestasActive: activo('encuestas'),
    cuponesActive: activo('cupones'),
    llamadaMeseroActive: activo('llamada_mesero'),
  };
}
