# PLAN — Admin Pro del restaurante (Fases A–D)

> Doc vivo. Objetivo: que el área administrativa del restaurante "resuelva la vida entera"
> del dueño — control fino de qué vende, cómo lo vende y cuánto gana.
> Acompaña a `PLAN_GRUPOS.md` (panel multi-sucursal, Fase E) y `IMPLEMENTACIONES.md`.

## Estado de fases

| Fase | Descripción | Estado |
|------|-------------|--------|
| **A** | Finanzas y rentabilidad (costos, utilidad/margen, reportes por rango, corte de caja, export) | ✅ Completada y verificada end-to-end (2026-06-14) |
| **B** | Analítica avanzada (horas pico, más/menos vendidos, mix por canal/zona/pago, cancelación, tiempos) | ✅ Completada y verificada end-to-end (2026-06-14) |
| **C** | Inventario / stock (existencias, alertas, auto-agotar, anti-sobreventa) | ✅ Completada y verificada end-to-end (2026-06-14) |
| **D** | Promos y personal (cupones/descuentos, staff con permisos, bitácora) | ✅ Completada y verificada end-to-end (2026-06-14) |

Leyenda: ⬜ Pendiente · 🟨 En progreso · ✅ Completada

---

## Fase A — Finanzas y rentabilidad

**Migración:** `supabase/migrations/019_finanzas.sql`
- `products.cost` — costo del producto (margen = price − cost).
- `order_items.cost_snapshot` — costo congelado al vender (utilidad histórica real).
- Tabla `cash_counts` — cortes de caja (esperado vs. contado, RLS sin políticas).
- `place_order` (RPC) — ahora persiste `cost_snapshot` por ítem (misma firma que mig. 016).

**Backend**
- `src/lib/actions/products.ts` — captura `cost` en create/update (form y modal). Helper `parseCost`.
- `src/lib/actions/orders.ts` `createOrder` — lee `products.cost` y lo congela en cada ítem.
- `src/lib/db/reports.ts` — `getSalesReport(restaurantId, from, to, tz)`: ingreso, utilidad, margen, ticket, serie diaria, mix por canal/pago/zona, top por ingreso y por utilidad. Excluye cancelados; cortes de día en la zona horaria del local.
- `src/lib/actions/finanzas.ts` — `getCashSummary` (efectivo esperado hoy), `saveCashCount`, `getCashHistory`, `exportSalesReportCsv`.

**Frontend**
- `src/app/admin/(protected)/finanzas/page.tsx` — KPIs, selector de rango, gráfica diaria, mix de ventas, top productos y corte de caja. Si el módulo Pedidos está apagado, muestra aviso.
- `src/components/admin/date-range-form.tsx`, `export-report-button.tsx`, `cash-count-form.tsx`.
- `product-form.tsx` y `catalog-panel.tsx` (modal) — input **Costo** con utilidad/margen en vivo.
- `shell.tsx` — ítem "Finanzas" (con módulo Pedidos) + ícono `wallet` en `icons.tsx`.

**Notas / decisiones**
- El costo histórico se congela en `order_items.cost_snapshot`: editar el costo del producto no altera reportes pasados.
- Hoy todos los pedidos son `CASH` (place_order lo fija); el desglose "por método de pago" ya está listo para cuando se agreguen más métodos.
- Margen/utilidad solo se calculan sobre ítems con costo capturado (se avisa en la UI si faltan).

**Verificación end-to-end (2026-06-14) ✅ — Supabase local + navegador:**
1. ✅ Migración `019` aplicada (`products.cost`, `order_items.cost_snapshot`, `cash_counts`).
2. ✅ Costo + margen en vivo en el modal de producto (precio 45 / costo 18 → utilidad Q27 · 60%) y persiste en BD.
3. ✅ Pedido real de cliente → `order_items.cost_snapshot = 18.00` (captura de costo congelado funciona).
4. ✅ `/admin/finanzas`: KPIs (ingreso Q45, utilidad Q27, margen 60%, costo Q18, ticket Q45), gráfica diaria, mix por canal/pago, top por ingreso y utilidad.
5. ✅ Corte de caja: esperado recalculado en servidor (Q45), guardado con diferencia (−5 contado 40), aparece en historial.
6. ✅ `npm run build` + `typecheck` limpios; sin errores en consola del navegador.

> Nota local: el DB local solo tenía 001–008; se aplicaron 009–019 con `supabase migration up`. Dueño demo real = `azucarnegra@gmail.com`.

---

## Fase B — Analítica avanzada ✅

**Migración:** `020_order_timestamps.sql` — `orders.accepted_at/ready_at/delivered_at/cancelled_at`.

**Backend**
- `src/lib/actions/orders.ts` `updateOrderStatus` — sella la marca de tiempo según la transición (PREP→accepted_at, READY→ready_at, DELIVERED→delivered_at, CANCEL→cancelled_at); `cancelPublicOrder` también sella `cancelled_at`.
- `src/lib/db/analytics.ts` — `getAnalytics(restaurantId, from, to, tz)`: heatmap 7×24 (hora local), franja/día pico, top vendidos + "no se mueven" (incluye productos con 0 ventas), mix por canal/pago/zona (por nº de pedidos), tasa de cancelación, tiempos promedio de preparación y entrega.

**Frontend**
- `src/app/admin/(protected)/analitica/page.tsx` — KPIs, mapa de calor de horas pico, velocidad de productos, mix. Reusa `DateRangeForm` (basePath `/admin/analitica`).
- `shell.tsx` — ítem "Analítica" (ícono `dashboard`).

**Verificación end-to-end (2026-06-14) ✅:** sembré 30 pedidos variados; `updateOrderStatus` selló `accepted_at` (NEW→PREP) y `ready_at` (PREP→READY) vía el panel real; `/admin/analitica` mostró pedidos 29, cancelación 6%, prep 18 min, entrega 29 min, franja pico, heatmap y rankings correctos. Build/typecheck limpios.

---

## Fase C — Inventario / stock ✅

**Migración:** `021_inventario.sql` — `products.track_stock/stock/low_stock_threshold`, tabla `stock_movements`, `place_order` (descuento atómico + guardia anti-sobreventa + auto-agotar a 0), `restock_order` (devuelve stock al cancelar, idempotente).

**Backend**
- `src/lib/actions/inventory.ts` — `saveInventory` (activar control + stock + umbral), `adjustStock` (+/− con bitácora), `getLowStock` (conteo bajo/agotado).
- `src/lib/actions/orders.ts` — `updateOrderStatus` y `cancelPublicOrder` llaman `restock_order` antes de marcar CANCEL.

**Frontend**
- `src/app/admin/(protected)/inventario/page.tsx` + `src/components/admin/inventory-panel.tsx` — resumen (con control / stock bajo / agotados), filtro por categoría, stepper rápido, activar/editar stock y umbral, badges. Ítem "Inventario" en el nav (ícono `box`).

**Verificación end-to-end (2026-06-14) ✅:** activar control (mov. `set`), stepper +1 (`adjust`), venta descuenta (`sale`), **anti-sobreventa** (RAISE + rollback, sin pedido fantasma), restock al cancelar desde el panel (`cancel`, stock restaurado). Build/typecheck limpios. (Nota: hubo que limpiar `.next` por una caché de Turbopack que referenciaba `middleware.ts`.)

---

## Fase D — Promos y personal ✅

**Migraciones:** `022_promociones.sql` (tabla `promotions`, `orders.discount/promo_id/promo_code`, `increment_promo_usage`), `023_personal.sql` (`profiles.permissions`, tabla `activity_log`).

**Backend**
- `src/lib/db/promos.ts` — `computeDiscount`, `resolvePromo` (cupón escrito o mejor automática), `listPromotions`.
- `src/lib/actions/promos.ts` — `validatePromo` (preview público), CRUD admin (gated por permiso `promociones`).
- `src/lib/actions/orders.ts` `createOrder` — resuelve y aplica el descuento **server-side** (autoritativo), persiste promo y cuenta el uso.
- `src/lib/permissions.ts` — `can(role, permissions, section)` + `ADMIN_SECTIONS`.
- `src/lib/activity.ts` — `logActivity` (fire-and-forget); cableado en order_status, stock, promo, staff.
- `src/lib/actions/staff.ts` — el dueño crea/edita/quita staff de SU restaurante con permisos por sección; bitácora.

**Frontend**
- `/admin/promociones` (`promotions-panel.tsx`) — CRUD de cupones/descuentos automáticos, toggle, uso.
- `/admin/personal` (`staff-panel.tsx`) — equipo con permisos por chips + reset de contraseña + bitácora de actividad.
- `checkout-form.tsx` — campo de cupón con preview y desglose de descuento (también en el mensaje de WhatsApp).
- `shell.tsx` — nav reorganizado en **secciones** (Operación/Negocio/Cuenta) en escritorio, **scrollable horizontal** en móvil, **filtrado por permisos**; ítems Promos (`percent`) y Personal (`userPlus`).
- Guards de permiso en finanzas/analitica/inventario/promociones/personal (un staff restringido es redirigido).

**Verificación end-to-end (2026-06-14) ✅:** cupón `BIENVENIDA20` creado → en el checkout bajó Q90 a **Q72** (−18) → la orden guardó `discount=18`, `promo_code`, y `used_count=1`. Staff "Cajero" con permisos `[pedidos, inventario]` → al loguear el nav muestra **solo** esas 2 secciones y `/admin/finanzas` lo **redirige**. Build/typecheck limpios (35 rutas).

> Pendiente menor: hardening de guard en TODAS las páginas legacy (hoy guardadas las sensibles); el landing tras login podría ir a la primera sección permitida.

---

## Para activar en producción (cuando se despliegue)
- Aplicar en la nube las migraciones nuevas en orden. `setup_produccion.sql` está congelado en 008;
  la fuente de verdad es `supabase/migrations/` (aplicar 009…019 que falten).
