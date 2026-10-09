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

- [x] **CSP: `unsafe-inline` fuera de `script-src` (M-2).** Hecho el 2026-08-05 en la Fase 6. `src/proxy.ts` genera un nonce por petición y lo pasa en el header del *request*, que es de donde Next lo lee para firmar sus propios scripts; `script-src` quedó en `'self' 'nonce-…' 'strict-dynamic'`, y `'unsafe-eval'` solo en desarrollo (React lo usa para reconstruir stacks; en producción ni React ni Next lo necesitan).

  El costo que documenta Next para los nonces —perder render estático y caché de CDN— **aquí resultó ser cero**: se midió antes de tocar nada y solo 3 rutas eran estáticas (`icon.svg`, `robots.txt`, `sitemap.xml`), ninguna con scripts. La app ya se renderizaba por petición en todas sus páginas por el multi-tenant, y la caché del menú público de la Fase 0 es de datos (`unstable_cache`), no de página, así que quedó intacta.

  Verificado con el servidor levantado: 96 de 100 `<script>` llevan nonce (los 4 restantes son 2 de HMR de dev, el bloque `application/ld+json` —que no es ejecutable— y un placeholder vacío), React hidrata, el router responde y la consola sale sin errores.

- [ ] **`unsafe-inline` sigue en `style-src`, y es deliberado.** El tema de cada restaurante se inyecta como `<style>` en el layout y hay cientos de `style={{…}}` en el árbol de componentes. Quitarlo exige migrarlos todos a CSS Modules: alto radio de impacto y beneficio de seguridad mucho menor que el de `script-src` (un estilo inyectado afea o filtra por selectores; un script inyectado se lleva la sesión). Sigue mereciendo su propio proyecto enfocado, con verificación visual real.

- [x] **`connect-src` e `img-src` cerrados (Fase 6).** Antes eran `https:` a secas — cualquier dominio de internet, o sea que un script malicioso podía mandarse los datos del panel a donde quisiera. Ahora solo el propio origen, Supabase (leído de `NEXT_PUBLIC_SUPABASE_URL`) y `localhost` para la impresión. Comprobado en vivo: una petición a `https://example.com` dispara `securitypolicyviolation` y queda bloqueada.

- [ ] **Instalador del agente sin certificado de firma de código.** Existe `agente-impresion/installer/sign.ps1` (firma manual con `.pfx`) pero no está conectado a ningún workflow de release. La clave automatizada en `release-desktop.yml` (`TAURI_SIGNING_PRIVATE_KEY`) es del updater de Tauri, no tiene nada que ver con SmartScreen. Comprar certificado Authenticode (idealmente EV) y automatizar la firma con `signtool` como paso posterior al build en `release-desktop.yml`.

## Auditoría de velocidad e imágenes 2026-09-25 — abiertos

Detalle y mediciones en [`AUDITORIA_2026-09-25.md`](../auditorias/AUDITORIA_2026-09-25.md). Lo corregido en código está allí; aquí solo lo que queda.

- [ ] **Render en Oregón, Supabase en Virginia (I-1).** ~70 ms por consulta. Crear el servicio en Virginia (Render no cambia región de uno existente), mover DNS/dominios, borrar el viejo, actualizar `render.yaml`. Es lo que más velocidad da.
- [ ] **Confirmar el plan de Render (I-2).** `render.yaml` dice `free` (0,1 CPU, se duerme).
- [ ] **Tras desplegar: `cf-cache-status: HIT` en `/img/…` (I-3).**
- [x] **CSS del panel dentro del menú (M-4).** Hecho 2026-09-26: reglas del personal en `src/app/admin.css` (importado por `app/admin/layout.tsx` y `app/super/layout.tsx`); el menú baja 96,6 KB en vez de ~178. Verificado sin cambios de cascada en 224 capturas (copia de `.press` en su sitio).
- [x] **`createOrder` en fila (M-5).** Hecho 2026-09-26: lecturas en `Promise.all` (~10 → 4 viajes). Antes y después comparados en 9 escenarios contra la base local: mismos importes, ítems y errores.
- [ ] **Re-precarga de ~10 enlaces tras cada acción (P-5).** Solo si no se hace I-1.
- [ ] **`getClaims()` en `proxy.ts` (I-4).** Una ida y vuelta a Auth menos por petición; revisar antes las JWT Signing Keys del proyecto.
- [ ] **Borrar `components/admin/waiter-panel.tsx` (F-1)** — 1.750 líneas sin importar desde el módulo de Servicio.
- [ ] **Primer ingreso en el teléfono: tutorial + banner de instalación + notificaciones a la vez (F-2).**
- [x] **«Enviar a cocina» sin espera (F-4).** Hecho 2026-09-26: carrito vacío al tocar, líneas «Enviando…», vuelven al carrito si la nube rechaza; cobrar/liberar/mover bloqueados mientras hay envío en vuelo.
- [ ] **`router.refresh()` redundantes tras acciones que ya revalidan (P-3)** — quitados en Tomar pedidos, Mesas y Caja; quedan ~60 en pantallas de poco tráfico.

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
