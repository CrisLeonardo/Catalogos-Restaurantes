# Implementación: Nueva Estructura de Planes + Página de Precios

> **Fecha:** 2026-06-23  
> **Contexto:** Se rediseña el modelo de planes de Leogin para pasar de 3 tiers fijos
> (`BASICO / POPULAR / PREMIUM`) a 6 tiers donde los planes de pago se limitan por GMV
> mensual (monto total de ventas procesadas). Se agrega una página pública `/planes`
> optimizada para conversión.
>
> **Regla de oro:** NUNCA bloquear pedidos automáticamente. Solo notificar. El upgrade
> se gestiona manualmente (tú contactas al restaurante) hasta que haya suficientes
> clientes para automatizarlo.

---

## 1. Nueva estructura de planes

| Código | Precio / mes | Límite GMV / mes | % efectivo | Incluye pedidos |
|--------|-------------|-----------------|-----------|-----------------|
| `BASICO` | Q299 | Sin pedidos | — | No |
| `PREMIUM` | Q600 | Q20,000 | 3.0% | Sí |
| `PREMIUM_PRO` | Q1,000 | Q40,000 | 2.5% | Sí |
| `PREMIUM_ULTRA` | Q1,500 | Q75,000 | 2.0% | Sí |
| `ALTO_VOLUMEN` | Q2,250 | Q150,000 | 1.5% | Sí |
| `VARIABLE` | 1% del GMV mensual (mín. Q2,250) | Sin tope | 1% real | Sí |

**Regla de transición VARIABLE:** aplica solo a partir de Q225,000 GMV/mes.
Entre Q150,001 y Q224,999 el restaurante permanece en `ALTO_VOLUMEN` (Q2,250 fijo).
A Q225,000 el 1% = Q2,250 → empieza a ser conveniente el plan variable.

**Multisucursal:** cada sucursal tiene su propio plan (`PREMIUM` o superior).
El GROUP_OWNER paga Q250/mes adicional por el panel consolidado (`/central`).
Facturar el panel grupo como concepto `OTHER` con descripción "Panel grupo - NombreGrupo".

**Migración de planes existentes:**
- `BASICO` → se mantiene igual
- `POPULAR` → renombrar a `PREMIUM` (mismo precio Q600)
- `PREMIUM` (viejo) → renombrar a `ALTO_VOLUMEN`

---

## 2. Migración de base de datos

Crear archivo `supabase/migrations/049_new_plan_tiers.sql`:

```sql
-- 049_new_plan_tiers.sql
-- Nuevos tiers de planes con límites GMV

-- 1. Ampliar el CHECK constraint de plan_actual en restaurants
ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_plan_actual_check;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_plan_actual_check
  CHECK (plan_actual IN (
    'BASICO','PREMIUM','PREMIUM_PRO','PREMIUM_ULTRA','ALTO_VOLUMEN','VARIABLE'
  ));

-- 2. Migrar planes existentes
UPDATE restaurants SET plan_actual = 'PREMIUM'      WHERE plan_actual = 'POPULAR';
UPDATE restaurants SET plan_actual = 'ALTO_VOLUMEN' WHERE plan_actual = 'PREMIUM'
  AND plan_actual != 'ALTO_VOLUMEN'; -- evita doble update

-- 3. Nuevas claves en platform_settings para los precios de cada plan
INSERT INTO platform_settings (key, value) VALUES
  ('plan_price_PREMIUM',       '600'),
  ('plan_price_PREMIUM_PRO',   '1000'),
  ('plan_price_PREMIUM_ULTRA', '1500'),
  ('plan_price_ALTO_VOLUMEN',  '2250'),
  ('plan_gmv_limit_PREMIUM',       '20000'),
  ('plan_gmv_limit_PREMIUM_PRO',   '40000'),
  ('plan_gmv_limit_PREMIUM_ULTRA', '75000'),
  ('plan_gmv_limit_ALTO_VOLUMEN',  '150000'),
  ('plan_gmv_variable_threshold',  '225000'),
  ('plan_gmv_variable_pct',        '0.01'),
  ('plan_gmv_alert_pct',           '0.80'),
  ('group_panel_fee',              '250')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Eliminar las claves viejas que ya no aplican
DELETE FROM platform_settings WHERE key IN (
  'plan_price_POPULAR', 'plan_price_PREMIUM'
) AND key NOT IN ('plan_price_PREMIUM'); -- conservar PREMIUM nueva

-- 4. Vista helper: GMV del mes actual por restaurante
CREATE OR REPLACE VIEW restaurant_gmv_current_month AS
SELECT
  restaurant_id,
  COALESCE(SUM(total), 0)::numeric AS gmv_current_month,
  COUNT(*)::int                    AS orders_current_month,
  date_trunc('month', now())       AS period_start
FROM orders
WHERE status != 'CANCEL'
  AND created_at >= date_trunc('month', now())
  AND created_at <  date_trunc('month', now()) + interval '1 month'
GROUP BY restaurant_id;

-- RLS: solo SUPER_ADMIN y el propio restaurante pueden ver su GMV
ALTER VIEW restaurant_gmv_current_month OWNER TO postgres;

-- 5. Actualizar la RPC leogin_compute_monthly_fee para nuevos planes
CREATE OR REPLACE FUNCTION leogin_compute_monthly_fee(p_restaurant_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan        text;
  v_org_id      uuid;
  v_branch_count int;
  v_base_fee    numeric;
  v_extra_fee   numeric;
  v_group_fee   numeric;
  v_gmv         numeric;
  v_var_pct     numeric;
  v_var_threshold numeric;
BEGIN
  SELECT plan_actual, organization_id
    INTO v_plan, v_org_id
    FROM restaurants WHERE id = p_restaurant_id;

  -- Precio base por plan
  v_base_fee := CASE v_plan
    WHEN 'BASICO'        THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_BASICO'        LIMIT 1)
    WHEN 'PREMIUM'       THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_PREMIUM'       LIMIT 1)
    WHEN 'PREMIUM_PRO'   THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_PREMIUM_PRO'   LIMIT 1)
    WHEN 'PREMIUM_ULTRA' THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_PREMIUM_ULTRA' LIMIT 1)
    WHEN 'ALTO_VOLUMEN'  THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_ALTO_VOLUMEN'  LIMIT 1)
    WHEN 'VARIABLE'      THEN NULL  -- se calcula por GMV abajo
    ELSE 0
  END;

  -- Plan VARIABLE: 1% del GMV del mes, mínimo Q2,250
  IF v_plan = 'VARIABLE' THEN
    SELECT COALESCE(SUM(total), 0) INTO v_gmv
      FROM orders
     WHERE restaurant_id = p_restaurant_id
       AND status != 'CANCEL'
       AND created_at >= date_trunc('month', now());
    v_var_pct := COALESCE(
      (SELECT value::numeric FROM platform_settings WHERE key = 'plan_gmv_variable_pct' LIMIT 1), 0.01
    );
    v_base_fee := GREATEST(v_gmv * v_var_pct, 2250);
  END IF;

  -- Sucursales extra (solo aplica a multisucursal)
  v_extra_fee := 0;
  IF v_org_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_branch_count
      FROM restaurants
     WHERE organization_id = v_org_id AND status = 'active';
    -- cada sucursal paga su propio plan; no hay cargo extra por sucursal aquí
    -- el cargo de panel grupo (Q250) se agrega al facturar la organización
  END IF;

  RETURN COALESCE(v_base_fee, 0);
END;
$$;
```

---

## 3. Cambios en archivos existentes

### 3a. `src/types/index.ts`

Reemplazar la línea del tipo de `plan_actual` en la interfaz `Restaurant`:

```typescript
// ANTES:
plan_actual: 'BASICO' | 'POPULAR' | 'PREMIUM';

// DESPUÉS:
plan_actual: 'BASICO' | 'PREMIUM' | 'PREMIUM_PRO' | 'PREMIUM_ULTRA' | 'ALTO_VOLUMEN' | 'VARIABLE';
```

### 3b. `src/lib/db/billing.ts`

**1. Actualizar `PricingSettings`:**

```typescript
// REEMPLAZAR la interfaz PricingSettings completa:
export interface PricingSettings {
  basico: number;
  premium: number;
  premiumPro: number;
  premiumUltra: number;
  altoVolumen: number;
  gmvLimitPremium: number;
  gmvLimitPremiumPro: number;
  gmvLimitPremiumUltra: number;
  gmvLimitAltoVolumen: number;
  gmvVariableThreshold: number;
  gmvVariablePct: number;
  gmvAlertPct: number;
  groupPanelFee: number;
  setupFeeDefault: number;
  graceDays: number;
  autoSuspend: boolean;
  autoGenerate: boolean;
  trialDays: number;
}
```

**2. Actualizar `getPricingSettings`:**

```typescript
export const getPricingSettings = cache(async (): Promise<PricingSettings> => {
  const db = createServiceClient();
  const { data } = await db.from('platform_settings').select('key, value');
  const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const n = (k: string, d: number) => { const v = parseFloat(map.get(k) ?? ''); return isNaN(v) ? d : v; };
  const b = (k: string, d: boolean) => { const v = map.get(k); return v == null || v === '' ? d : v === 'true'; };
  return {
    basico:               n('plan_price_BASICO',        299),
    premium:              n('plan_price_PREMIUM',        600),
    premiumPro:           n('plan_price_PREMIUM_PRO',   1000),
    premiumUltra:         n('plan_price_PREMIUM_ULTRA', 1500),
    altoVolumen:          n('plan_price_ALTO_VOLUMEN',  2250),
    gmvLimitPremium:      n('plan_gmv_limit_PREMIUM',       20000),
    gmvLimitPremiumPro:   n('plan_gmv_limit_PREMIUM_PRO',   40000),
    gmvLimitPremiumUltra: n('plan_gmv_limit_PREMIUM_ULTRA', 75000),
    gmvLimitAltoVolumen:  n('plan_gmv_limit_ALTO_VOLUMEN',  150000),
    gmvVariableThreshold: n('plan_gmv_variable_threshold',  225000),
    gmvVariablePct:       n('plan_gmv_variable_pct',        0.01),
    gmvAlertPct:          n('plan_gmv_alert_pct',           0.80),
    groupPanelFee:        n('group_panel_fee',              250),
    setupFeeDefault:      n('setup_fee_default',             500),
    graceDays:            n('billing_grace_days',            10),
    autoSuspend:          b('billing_auto_suspend',          true),
    autoGenerate:         b('billing_auto_generate',         true),
    trialDays:            n('trial_days',                    14),
  };
});
```

**3. Actualizar `planLabel` y agregar helpers de plan:**

```typescript
// Reemplazar PLAN_LABEL y planLabel, agregar los helpers nuevos:

export const PLAN_META: Record<string, {
  label: string;
  price: number;
  gmvLimit: number | null;  // null = variable / sin límite fijo
  hasOrders: boolean;
  color: string;            // para badges en la UI
}> = {
  BASICO:        { label: 'Básico',         price: 299,   gmvLimit: null,    hasOrders: false, color: 'gray'   },
  PREMIUM:       { label: 'Premium',        price: 600,   gmvLimit: 20000,   hasOrders: true,  color: 'blue'   },
  PREMIUM_PRO:   { label: 'Premium Pro',    price: 1000,  gmvLimit: 40000,   hasOrders: true,  color: 'purple' },
  PREMIUM_ULTRA: { label: 'Premium Ultra',  price: 1500,  gmvLimit: 75000,   hasOrders: true,  color: 'teal'   },
  ALTO_VOLUMEN:  { label: 'Alto Volumen',   price: 2250,  gmvLimit: 150000,  hasOrders: true,  color: 'orange' },
  VARIABLE:      { label: 'Variable',       price: 0,     gmvLimit: null,    hasOrders: true,  color: 'amber'  },
};

export function planLabel(plan: string | null | undefined): string {
  return PLAN_META[plan ?? '']?.label ?? (plan ?? '—');
}

/** ¿El plan incluye módulo de pedidos? */
export function planHasOrders(plan: string | null | undefined): boolean {
  return PLAN_META[plan ?? '']?.hasOrders ?? false;
}

/** Límite GMV mensual del plan (null = sin límite fijo o plan VARIABLE). */
export function planGmvLimit(plan: string | null | undefined): number | null {
  return PLAN_META[plan ?? '']?.gmvLimit ?? null;
}
```

**4. Agregar función para obtener GMV actual del restaurante:**

```typescript
/** GMV del restaurante en el mes actual (suma de orders.total no cancelados). */
export async function getRestaurantGmvCurrentMonth(restaurantId: string): Promise<{
  gmv: number;
  orders: number;
  limit: number | null;
  pct: number | null;   // null si no hay límite (VARIABLE o BASICO)
  plan: string;
}> {
  const db = createServiceClient();
  const [{ data: rest }, { data: gmvData }] = await Promise.all([
    db.from('restaurants').select('plan_actual').eq('id', restaurantId).single(),
    db.from('restaurant_gmv_current_month').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
  ]);
  const plan = (rest?.plan_actual as string) ?? 'BASICO';
  const gmv = Number(gmvData?.gmv_current_month ?? 0);
  const orders = Number(gmvData?.orders_current_month ?? 0);
  const limit = planGmvLimit(plan);
  const pct = limit ? Math.min(gmv / limit, 1) : null;
  return { gmv, orders, limit, pct, plan };
}
```

### 3c. `src/lib/actions/super-admin.ts`

En el selector de `plan_actual` del formulario de edición de restaurante, actualizar los valores válidos:

```typescript
// En la validación de plan_actual (busca la línea: const plan_actual = formData.get('plan_actual') as string)
// Agregar validación:
const VALID_PLANS = ['BASICO','PREMIUM','PREMIUM_PRO','PREMIUM_ULTRA','ALTO_VOLUMEN','VARIABLE'];
if (!VALID_PLANS.includes(plan_actual)) return { error: 'Plan inválido.' };
```

### 3d. `src/lib/actions/billing.ts`

En `savePricingSettings`, actualizar las claves que se guardan en `platform_settings`:

```typescript
// REEMPLAZAR el array `rows` dentro de savePricingSettings:
const rows = [
  { key: 'plan_price_BASICO',        value: nonNeg('plan_price_BASICO') },
  { key: 'plan_price_PREMIUM',       value: nonNeg('plan_price_PREMIUM') },
  { key: 'plan_price_PREMIUM_PRO',   value: nonNeg('plan_price_PREMIUM_PRO') },
  { key: 'plan_price_PREMIUM_ULTRA', value: nonNeg('plan_price_PREMIUM_ULTRA') },
  { key: 'plan_price_ALTO_VOLUMEN',  value: nonNeg('plan_price_ALTO_VOLUMEN') },
  { key: 'plan_gmv_limit_PREMIUM',       value: nonNeg('plan_gmv_limit_PREMIUM') },
  { key: 'plan_gmv_limit_PREMIUM_PRO',   value: nonNeg('plan_gmv_limit_PREMIUM_PRO') },
  { key: 'plan_gmv_limit_PREMIUM_ULTRA', value: nonNeg('plan_gmv_limit_PREMIUM_ULTRA') },
  { key: 'plan_gmv_limit_ALTO_VOLUMEN',  value: nonNeg('plan_gmv_limit_ALTO_VOLUMEN') },
  { key: 'plan_gmv_variable_threshold',  value: nonNeg('plan_gmv_variable_threshold') },
  { key: 'plan_gmv_variable_pct',        value: nonNeg('plan_gmv_variable_pct') },
  { key: 'plan_gmv_alert_pct',           value: nonNeg('plan_gmv_alert_pct') },
  { key: 'group_panel_fee',              value: nonNeg('group_panel_fee') },
  { key: 'setup_fee_default',            value: nonNeg('setup_fee_default') },
  { key: 'billing_grace_days',           value: graceDays },
  { key: 'billing_auto_suspend',         value: formData.get('billing_auto_suspend') === 'on' ? 'true' : 'false' },
  { key: 'billing_auto_generate',        value: formData.get('billing_auto_generate') === 'on' ? 'true' : 'false' },
];
```

---

## 4. Nuevo archivo: Configuración centralizada de planes

Crear `src/lib/plans.ts`:

```typescript
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
  products: number | 'unlimited';      // límite de productos en catálogo
  users: number | 'unlimited';         // usuarios del panel (owner + staff)
  hasOrders: boolean;                  // carrito + pedidos online
  hasWhatsapp: boolean;                // notificación WhatsApp al pedir
  hasRealtime: boolean;                // alertas en tiempo real (sonido + visual)
  hasFullTheme: boolean;               // personalización completa (glass, fuentes, fondo)
  hasWaiterPanel: boolean;             // panel /admin/mesero en tablet
  hasWaiterCall: boolean;              // módulo llamar al mesero (QR → panel)
  hasSurveys: boolean;                 // módulo encuestas de satisfacción
  hasReservations: boolean;            // módulo reservaciones de mesa
  hasCoupons: boolean;                 // módulo cupones y descuentos
  hasLoyalty: boolean;                 // módulo puntos de lealtad
  hasPrinting: boolean;               // agente de impresión (comandas a cocina)
  hasAnalytics: boolean;               // estadísticas y reportes de ventas
  hasRecipes: boolean;                 // módulo recetas e ingredientes
  hasSuppliers: boolean;               // módulo proveedores y compras
  hasFEL: boolean;                     // factura electrónica SAT Guatemala
  gmvLimit: number | null;             // null = sin límite fijo (BASICO=sin pedidos, VARIABLE=dinámico)
  gmvLimitLabel: string;               // texto para mostrar en UI
  priceMonthly: number;                // precio fijo mensual (0 para VARIABLE)
  priceLabel: string;                  // texto del precio para mostrar en la página
  badge?: 'MÁS POPULAR' | 'MEJOR VALOR' | 'PARA CRECER';
  highlight: boolean;                  // plan destacado visualmente (border azul)
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

/** ¿Este plan es un upgrade respecto al actual? */
export const PLAN_ORDER: PlanCode[] = [
  'BASICO', 'PREMIUM', 'PREMIUM_PRO', 'PREMIUM_ULTRA', 'ALTO_VOLUMEN', 'VARIABLE',
];
export function isUpgrade(current: PlanCode, target: PlanCode): boolean {
  return PLAN_ORDER.indexOf(target) > PLAN_ORDER.indexOf(current);
}

/** Siguiente plan sugerido para upsell. */
export function nextPlan(current: PlanCode): PlanCode | null {
  const idx = PLAN_ORDER.indexOf(current);
  return idx >= 0 && idx < PLAN_ORDER.length - 1 ? PLAN_ORDER[idx + 1] : null;
}
```

---

## 5. Nueva página pública de precios

### Ruta: `src/app/planes/page.tsx`

Esta página vive en el dominio raíz (no en subdominios de restaurantes).
Verificar en `middleware.ts` que la ruta `/planes` no se redirija al tenant resolver.

**Estructura de la página (diseño orientado a conversión):**

La página debe tener las siguientes secciones en orden:

```
[1] Hero      — titular + subtítulo + propuesta de valor (2 líneas máximo)
[2] Planes    — tarjetas de los 3 planes principales (Básico · Premium · Premium Pro)
              con botón "Ver todos los planes" que expande Premium Ultra y Alto Volumen
[3] Comparación — tabla completa de features, todas las filas con check/cross/texto
[4] GMV calculator — "¿Cuánto vende tu restaurante al mes?"
                     slider de ventas → muestra qué plan aplica y cuánto pagas
[5] FAQ       — 4-5 preguntas frecuentes sobre el modelo GMV, sin letra chica
[6] CTA final — "¿Listo para modernizar tu menú? Contáctanos"
```

### Componente `PlanCard` para las tarjetas:

Cada tarjeta debe mostrar:
- Badge opcional ("MÁS POPULAR", "PARA CRECER", "MEJOR VALOR")
- Nombre del plan
- Tagline del plan
- Precio grande y prominente
- Límite GMV en texto secundario (ej. "Incluye hasta Q20,000 en ventas digitales / mes")
- Lista de features con íconos ✓ (verde) y ✗ (gris) — NO texto largo, máximo 12 filas
- Botón CTA: "Empezar con Básico" / "Elegir Premium" / etc.
- El plan Premium (`highlight: true`) debe tener borde azul destacado (2px) y el badge visible

**Jerarquía visual importante para conversión:**
- El plan `PREMIUM` debe aparecer en el centro y ser el más prominente visualmente
- El plan `BASICO` a la izquierda, ligeramente más pequeño
- El plan `PREMIUM_PRO` a la derecha
- `PREMIUM_ULTRA` y `ALTO_VOLUMEN` se muestran solo al expandir ("Ver más planes")
- Al expandir, aparecen los 2 planes adicionales con un subtítulo "Para restaurantes de alto volumen"

**Nota de uso justo (debajo de las tarjetas, antes de la tabla):**
```
"Todos los planes de pago incluyen un límite mensual de ventas digitales (GMV).
Si tu restaurante supera el límite, te avisamos antes de cualquier ajuste —
nunca habrá cobros sorpresa. El precio siempre es fijo hasta que acordemos juntos un cambio."
```

### Calculadora GMV interactiva (`src/app/planes/components/gmv-calculator.tsx`):

Componente cliente con:
- Input/slider: "¿Cuánto venden tus restaurantes al mes en pedidos digitales?"
  - Range: Q0 → Q300,000 con step Q5,000
- Output dinámico:
  - Muestra el plan recomendado según el GMV
  - Muestra el precio que pagarías ese mes
  - Muestra el % efectivo (precio/gmv × 100)
  - Mensaje motivacional: ej. "Con Q40,000 en ventas digitales, pagas Q1,000 al mes — solo el 2.5%"

Lógica de la calculadora:
```typescript
function recommendPlan(gmv: number): { plan: PlanCode; price: number; pct: string } {
  if (gmv === 0)       return { plan: 'BASICO',        price: 299,  pct: '—' };
  if (gmv <= 20000)    return { plan: 'PREMIUM',       price: 600,  pct: ((600/gmv)*100).toFixed(1)+'%' };
  if (gmv <= 40000)    return { plan: 'PREMIUM_PRO',   price: 1000, pct: ((1000/gmv)*100).toFixed(1)+'%' };
  if (gmv <= 75000)    return { plan: 'PREMIUM_ULTRA', price: 1500, pct: ((1500/gmv)*100).toFixed(1)+'%' };
  if (gmv <= 225000)   return { plan: 'ALTO_VOLUMEN',  price: 2250, pct: ((2250/gmv)*100).toFixed(1)+'%' };
  return { plan: 'VARIABLE', price: Math.round(gmv * 0.01), pct: '1.0%' };
}
```

### FAQ (sección de preguntas frecuentes):

Incluir estas preguntas/respuestas exactas (adaptar el tono si es necesario):

1. **¿Qué es el límite de ventas digitales (GMV)?**
   Es el total en quetzales de los pedidos que tus clientes hacen a través de tu menú digital Leogin en un mes. Un pedido de Q800 cuenta como Q800, sin importar cuántas personas lo compartieron.

2. **¿Qué pasa si supero el límite de mi plan?**
   Te avisamos antes. Los pedidos nunca se bloquean automáticamente. Cuando superas el límite de manera consistente, te contactamos para ajustar tu plan juntos. Sin cobros sorpresa.

3. **¿Por qué el precio se basa en ventas y no en pedidos?**
   Porque un pedido puede ser de Q50 o de Q2,000. Con el modelo GMV pagas en proporción al valor real que obtienes de la plataforma. Si tuviste un mes difícil con menos ventas, pagas proporcionalmente menos.

4. **¿Qué incluye el plan Básico?**
   Un menú digital interactivo (reemplaza el PDF aburrido del QR), hasta 30 productos en catálogo, personalización con tu logo y color de marca, y un código QR listo para imprimir. No incluye pedidos online.

5. **¿Cómo funciona Multisucursal?**
   Cada sucursal tiene su propio plan según sus ventas. Adicionalmente, el grupo paga Q250/mes por el panel consolidado que permite ver todas las sucursales en un solo lugar.

---

## 6. Componente de GMV en el panel del restaurante

### Nuevo componente: `src/components/admin/plan-gmv-bar.tsx`

Debe mostrarse prominentemente en el dashboard del restaurante (`/admin`).
Solo visible si el restaurante tiene un plan con `gmvLimit !== null` (es decir, todos excepto BASICO y VARIABLE).

**Comportamiento visual:**
- Barra de progreso del GMV actual vs límite del plan
- Verde cuando `pct < 0.60`
- Amarillo cuando `0.60 <= pct < 0.80`
- Naranja cuando `0.80 <= pct < 1.0`
- Rojo cuando `pct >= 1.0`

**Texto:**
- `"Q{gmv_actual} de Q{gmv_limit} en ventas este mes"`
- Si `pct >= 0.80`: mostrar banner adicional: `"⚠️ Estás al {pct*100}% de tu límite mensual. Considera actualizar tu plan."`
- Si `pct >= 1.0`: banner rojo con `"Has superado el límite de tu plan este mes. Nos pondremos en contacto contigo."`

**Datos:** usar `getRestaurantGmvCurrentMonth(restaurantId)` del `billing.ts` actualizado.

**Posición:** insertar este componente en el layout de `/admin` justo debajo del header,
en el archivo del layout principal del panel admin. Buscar el archivo que renderiza el
admin shell (`AdminShell` o similar) y añadirlo ahí de forma que sea visible en todas
las páginas del panel.

---

## 7. Features bloqueadas visibles en plan Básico

### Componente: `src/components/admin/locked-feature-card.tsx`

Para restaurantes en plan `BASICO`, mostrar en el dashboard una sección
"Desbloquea más con Premium" con tarjetas de las funciones más valiosas que no tienen:

```
[Pedidos online]    [Notificación WhatsApp]    [Programa de lealtad]
[Cupones]           [Llamada al mesero]         [Reservaciones]
```

Cada tarjeta muestra:
- Ícono representativo (usar los íconos de `modules.ts` como referencia)
- Nombre de la función
- Una línea de descripción corta del valor
- Un candado (icon `ti-lock`) superpuesto sutilmente
- Al hacer hover: se ilumina y muestra `"Disponible en Premium → Q600/mes"`

Al hacer click en cualquier tarjeta: mostrar un modal o panel lateral con:
- Comparativa Básico vs Premium (solo las diferencias más relevantes, no todo)
- CTA: "Actualizar a Premium — Q600/mes" → enlaza a WhatsApp de Leogin con mensaje pre-llenado:
  `"Hola, quiero actualizar mi plan de Básico a Premium para [nombre del restaurante]"`

**Posición:** en el dashboard principal de admin (`/admin/page.tsx`), después del resumen
de pedidos recientes. Mostrar solo si `restaurant.plan_actual === 'BASICO'`.

---

## 8. Actualizar Super Admin — gestión de planes

### En la ficha del restaurante (`/super/restaurantes/[id]`)

El selector de `plan_actual` debe actualizarse con los nuevos valores:

```tsx
<select name="plan_actual" defaultValue={restaurant.plan_actual}>
  <option value="BASICO">Básico — Q299/mes (sin pedidos)</option>
  <option value="PREMIUM">Premium — Q600/mes (hasta Q20,000 GMV)</option>
  <option value="PREMIUM_PRO">Premium Pro — Q1,000/mes (hasta Q40,000 GMV)</option>
  <option value="PREMIUM_ULTRA">Premium Ultra — Q1,500/mes (hasta Q75,000 GMV)</option>
  <option value="ALTO_VOLUMEN">Alto Volumen — Q2,250/mes (hasta Q150,000 GMV)</option>
  <option value="VARIABLE">Variable — 1% del GMV mensual (mín. Q2,250)</option>
</select>
```

### En `/super/cobros` (billing dashboard)

La columna `plan` debe usar `planLabel()` actualizado.
Agregar columna `GMV este mes` visible junto al nombre del plan, usando
`salesRevenue30` ya disponible en `BillingRow` (formatear como `Q{valor}`).
Agregar indicador visual: si `salesRevenue30 > gmvLimit(plan) * 0.8` → badge naranja
"Cerca del límite". Si supera el límite → badge rojo "Supera límite".

### En `/super/configuracion` (pricing settings)

Actualizar el formulario de precios globales para incluir todos los campos nuevos:
precio por plan (6 planes) + límites GMV (4 planes con límite) + threshold variable
+ % variable + fee panel grupo.

---

## 9. Notas de implementación

**Orden sugerido de implementación:**
1. Migración SQL (049) — correr en Supabase primero
2. `src/types/index.ts` — actualizar tipo plan_actual
3. `src/lib/plans.ts` — crear archivo nuevo
4. `src/lib/db/billing.ts` — actualizar PricingSettings + helpers
5. `src/lib/actions/billing.ts` — actualizar savePricingSettings
6. `src/lib/actions/super-admin.ts` — validación de plan
7. `src/components/admin/plan-gmv-bar.tsx` — nuevo componente
8. `src/components/admin/locked-feature-card.tsx` — nuevo componente
9. Integrar ambos componentes en el layout admin
10. `src/app/planes/page.tsx` + `gmv-calculator.tsx` — página pública

**Cosas que NO cambiar:**
- La tabla `invoices` y su lógica de generación — sigue funcionando igual
- El sistema de suspensión por impago — no tocar
- Los módulos activables (`modules.ts`) — no cambian, son independientes del plan
- El sistema de `module_settings` — no cambia

**Verificación post-implementación:**
- Correr `npm run typecheck` — no deben quedar errores de tipo en `plan_actual`
- Verificar en Supabase que la vista `restaurant_gmv_current_month` devuelve datos correctos
- Confirmar que un restaurante migrado de `POPULAR` → `PREMIUM` mantiene todos sus módulos activos
- Confirmar que `planLabel('PREMIUM')` devuelve `'Premium'` (no `undefined`)
- Revisar el form de `/super/restaurantes/[id]` y verificar que el nuevo selector aparece correctamente
