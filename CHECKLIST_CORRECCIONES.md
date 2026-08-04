# Checklist de correcciones — Leogin

Basado en verificación directa contra el código actual (2026-08-03). No incluye el sleep de Render (ya resuelto).

## Prioridad alta — abiertos, con impacto directo

- [x] **Submódulo de git huérfano.** Resuelto 2026-08-03: desvinculado (`git rm --cached` + `.gitignore` en la raíz). La carpeta sigue en disco como su propio repo (1 commit, sin remoto), fuera del tracking del repo principal.

- [x] **Cache del menú público ausente.** Resuelto 2026-08-03: `getMenuDataCached`/`getRestaurantBySlugCached` (nuevas, en `src/lib/db/menu.ts`/`restaurants.ts`) envuelven la lectura pública en `unstable_cache` (service role, sin `cookies()`), usadas solo por `src/app/page.tsx`. Tags `menu:${restaurantId}` y `restaurant:${restaurantId}`, TTL 60s, invalidados con `updateTag` (Next 16 reemplazó `revalidateTag(tag)` de un argumento) en las server actions de productos/categorías/tema/restaurante/módulos. El resto del panel (admin/checkout/etc.) sigue con `getRestaurantBySlug` normal, sin tocar. Verificado en navegador contra Supabase local + `getRestaurantBySlug` con status activo se revisa SIEMPRE en vivo (no cacheado), así que una suspensión se refleja al instante aunque el resto esté cacheado.

- [x] **Cero tests unitarios sobre lógica de cálculo.** Resuelto 2026-08-03: Vitest instalado (`npm test`, `vitest.config.mts`). 64 tests cubriendo `computeTip`/`tipAppliesToType` (propinas), `computeCouponDiscount`/`isCouponLive` (cupones), `isModuleIncluded`/`hasModuleEntitlement`/`withPlanFloor`/`hasPlanFeature`/`planAddonCostWith`/`branchDiscountPct`/`isUpgrade` (planes y entitlements — el área con el incidente real de "Premium entregaba 4 de 7 módulos"), `isOverdue`/`currentPeriod` (facturación), y `buildSalesReport` (forma del reporte de ventas). `leogin_compute_monthly_fee` y el descuento por canal (`leogin_fee_breakdown`) siguen sin cobertura de test: viven enteramente en SQL (no hay mirror en TS que probar con Vitest); necesitarían un test de integración contra Postgres o pgTAP — no se hizo esta vez.

- [x] **`getSalesReport` agrega 20,000 pedidos en Node en vez de SQL.** Resuelto 2026-08-03: migración 098, función `security definer leogin_sales_report()` — hace el `GROUP BY` (día local/canal/pago/zona/producto) en Postgres y devuelve un `jsonb` con solo los totales. `src/lib/db/reports.ts` ahora solo llama al RPC y dale forma (`buildSalesReport`, con tests). De regalo: los límites de fecha ahora son exactos vía `AT TIME ZONE` (antes era un margen de ±1 día + refiltro en JS). Verificado contra los pedidos reales de Supabase local: coincide exacto con una consulta SQL independiente (8 pedidos, Q512.50, mismo desglose por canal). Pasa `scripts/audit-security-definer.mjs` (0 hallazgos).

## Prioridad media — corregidos con hueco residual

- [x] **Auto-archivo de pedidos abandonados solo cubre DINE_IN.** Resuelto 2026-08-03: migración 099, función paralela `leogin_archive_abandoned_delivery_orders()` (DELIVERY/PICKUP, umbral propio de 6h — decisión de Leonardo; el de DINE_IN sigue en 24h sin tocarse) + su propio cron horario. Se mantuvo separada de `leogin_archive_abandoned_orders()` a propósito: el botón "Archivar mesas abandonadas" del panel de mesero es específico de mesas, no debía empezar a cancelar pedidos a domicilio de paso. Verificado contra pedidos reales de Supabase local (dry-run: identifica exactamente los PICKUP/DELIVERY viejos correctos, ninguno de los DINE_IN). **Pendiente real, no lo pude verificar yo:** confirmar si la migración 080 (y ahora la 099) ya corrieron en producción — necesita `supabase migration list --linked` con las credenciales del proyecto en la nube.

- [x] **Panel de pedidos con techo de 200 activos simultáneos.** Resuelto 2026-08-03: subido a 500 (`src/lib/db/orders.ts`). Con el punto anterior ya cerrado (DELIVERY/PICKUP también se auto-archivan), el riesgo de acumulación que motivaba este punto baja bastante.

## Prioridad baja — abiertos, sin urgencia inmediata

- [x] **Rate limiting en memoria, por instancia.** Resuelto 2026-08-03: migración 100, tabla `rate_limit_buckets` + función `leogin_rate_limit()` (UPSERT atómico, sin condición de carrera entre requests concurrentes del mismo key). Se eligió Postgres sobre Upstash para no depender de una cuenta externa nueva. `rateLimit()` mantiene la misma firma `(key, max, windowMs)` pero ahora es `async` — se agregó `await` en los 15 call-sites (9 archivos, no ~6 como se estimó al escribir este punto). Fail-open si Postgres falla (no tumbar checkout/login por un blip del limitador). Probado en Supabase local: permite exactamente `max` llamadas por ventana, bloquea el resto, se reinicia al vencer la ventana. Limpieza automática vía cron horario.

- [~] **Funciones y archivos gigantes, y creciendo.** Parcial 2026-08-03: `createOrder` y `createWaiterOrder` (`src/lib/actions/orders.ts`) duplicaban ~50 líneas de validación/precio de productos server-authoritative — riesgo real (un fix de seguridad aplicado a una copia y no a la otra). Extraído a `verifyAndPriceItems()` compartida + `computeOrderPricing()` (cálculo de subtotal/envío/cupón/propina) + `notifyNewOrder()`. Sin cambios de comportamiento (revisado línea por línea + typecheck + lint + los 64 tests + `tests/e2e/pedidos.spec.ts` en verde). `checkout-form.tsx` (1,448 líneas) **NO se tocó**: dividirlo en subcomponentes es un refactor de UI mucho más grande y con más superficie de regresión visual/interacción, y el entorno local de este equipo no daba una forma confiable de verificarlo en navegador esta sesión (Turbopack tardando de 20s a varios minutos por ruta). Mejor como sesión aparte, dedicada, con verificación visual real.

- [ ] **CSP con `unsafe-inline` y `unsafe-eval`.** `src/proxy.ts:304,308`. Decisión consciente (estilos en línea sin nonce, `jspdf`/`exceljs` necesitan `eval`), pero sigue siendo la CSP más débil posible en `script-src`. Migrar estilos en línea a CSS Modules/clases para poder quitar `unsafe-inline` de `style-src`; aislar `jspdf`/`exceljs` en un Web Worker o ruta con CSP propia en vez de relajar la global. **No tocado esta sesión a propósito:** el checklist ya lo marca como "decisión consciente" y sin urgencia; convertir cada `style={{...}}` en línea del código (son cientos, en todo el árbol de componentes) a CSS Modules es un cambio de altísimo radio de impacto para hacer de pasada dentro de un barrido de checklist — mejor como su propio proyecto enfocado, con verificación visual real.

- [ ] **Instalador del agente sin certificado de firma de código.** Existe `agente-impresion/installer/sign.ps1` (firma manual con `.pfx`) pero no está conectado a ningún workflow de release. La clave automatizada en `release-desktop.yml` (`TAURI_SIGNING_PRIVATE_KEY`) es del updater de Tauri, no tiene nada que ver con SmartScreen. Comprar certificado Authenticode (idealmente EV) y automatizar la firma con `signtool` como paso posterior al build en `release-desktop.yml`.

## Ya corregidos — verificados en código, sin acción pendiente

- [x] Comanda de cocina se imprimía hasta 3 veces (tabla `print_jobs` evita reencolar).
- [x] Hora de tickets 6 horas adelantada (timezone del restaurante propagado en `escpos.ts`).
- [x] GROUP_OWNER veía panel de restaurante ajeno (comparación de `organization_id` en el layout admin).
- [x] Plan Premium entregaba 4 de 7 módulos (fuente única `INCLUDED_MODULES` + trigger de piso de plan).
- [x] Módulo Lista de espera nunca se cobraba (migración 095, con backfill retroactivo).
- [x] Robo de cuenta por teléfono no enlazado (ahora exige confirmar total del último pedido + rate limit).
- [x] Acciones anónimas sin freno — llamar mesero, calificar, validar cupón (rate limit por IP/restaurante en cada una).
- [x] Fuga de permisos por funciones `security definer` expuestas a `anon` (cerrado en migración 092 + guardrail automático en CI que falla el build si se repite).
- [x] Dueño no podía anular pedido sin encargado con PIN (distingue "sin permiso" de "sin PIN registrado").
- [x] Descuento por desactivar módulos con fecha de aplicación falsa (la UI ahora consulta al motor de cobro real).
