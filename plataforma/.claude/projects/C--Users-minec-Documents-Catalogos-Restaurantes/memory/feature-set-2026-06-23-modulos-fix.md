---
name: feature-set-2026-06-23-modulos-fix
description: Fix módulos "Llamar al mesero" y "Encuestas" — implementación completa del lado cliente/menú público
metadata:
  type: project
---

Fix de módulos no funcionales detectados el 2026-06-23.

**Why:** Los módulos estaban definidos en `modules.ts` y el super admin podía activarlos, pero no tenían implementación real en el menú público ni en el checkout.

**Cambios:**

### Llamar al mesero (`llamada_mesero`)
- **Migración** `048_waiter_calls.sql` — tabla `waiter_calls(id, restaurant_id, table_number, resolved_at, created_at)` con RLS (staff lee/escribe, público solo inserta).
- **Server action** `lib/actions/waiter-call.ts` — `callWaiter(restaurantId, tableNumber)` y `resolveWaiterCall(callId)`.
- **Componente** `components/menu/waiter-call-button.tsx` — botón flotante que lee la mesa de localStorage (`qr-mesa-${restaurantId}`), envía la llamada y muestra feedback visual.
- **`page.tsx`** — agrega `isModuleActive(mod, modSettings, 'llamada_mesero')` y pasa `llamadaMeseroEnabled` a `MenuShell`.
- **`menu-shell.tsx`** — nueva prop `llamadaMeseroEnabled` pasada a `MenuClient`.
- **`menu-client.tsx`** — importa `WaiterCallButton`, prop `llamadaMeseroEnabled`, renderiza el botón flotante (posicionado sobre el `CartBar` si pedidos activos).
- **`components/admin/notifications.tsx`** — canal realtime `waiter_calls` INSERT: chime + toast "🔔 Llamada al mesero · Mesa N" + notificación push al panel admin.

### Encuestas (`encuestas`)
- **Server action** `lib/actions/encuestas.ts` — `submitRating({restaurantId, rating, comment?, orderId?, customerName?})`.
- **`checkout/page.tsx`** — agrega `isModuleActive(mod, modSettings, 'encuestas')` y pasa `encuestasActive` a `CheckoutForm`.
- **`checkout-form.tsx`** — nueva prop `encuestasActive`, nuevo estado `orderId` (guardado del resultado de `createOrder`), UI de estrellas 1–5 + comentario opcional en el paso `success`. Se envía con `submitRating` y muestra confirmación "¡Gracias por tu calificación!".

**How to apply:** Correr migración 048 en prod antes de activar módulos.

---

## Segunda ronda de fixes 2026-06-23 (cagadero report)

- **Realtime faltaba (causa raíz de "no llega nada"):** `waiter_calls` NO estaba en la publicación `supabase_realtime` (solo `orders`, mig. 010). La mig. 048 ahora hace `alter publication supabase_realtime add table waiter_calls` (do-block idempotente). Verificado en local.
- **Gating por QR de mesa:** nuevo helper [table-session.ts](plataforma/src/lib/table-session.ts) (`getScannedTable`/`setScannedTable`/`clearScannedTable`, clave `qr-mesa-<rid>`). El checkout YA NO borra la clave al leerla (antes se la quitaba al botón). El FAB "Llamar al mesero" y la opción "Comer en local" (DINE_IN en typeOptions de checkout-form) **solo aparecen si hay mesa escaneada**. `page.tsx`→`menu-shell`→`menu-client` pasan `initialMesa`.
- **Botón rediseñado:** de barra ancho-completo (estorbaba) a **FAB compacto** abajo-derecha (`raised` lo eleva sobre el CartBar).
- **Recepción accionable:** nuevo [waiter-calls-alert.tsx](plataforma/src/components/admin/waiter-calls-alert.tsx) montado en AdminShell (lo ven dueño, staff Y meseros — todos usan AdminShell). Lista persistente de pendientes + botón "Atendido" (`resolveWaiterCall`), realtime + carga inicial (`getPendingWaiterCalls`, con auth). Prop `llamadaMeseroActive` en shell, calculada en ambos layouts `(protected)` y `(waiter)`.
- **#5 auto-disparo a cocina:** `createWaiterOrder` (actions/orders.ts) ahora llama `enqueueKitchenForOrder` best-effort tras crear el pedido → la comanda se imprime al instante vía el Agente, sin esperar confirmación NEW→PREP.
- **#4 impresión:** QZ Tray eliminado SOLO de la UI ([kitchen-print-settings.tsx](plataforma/src/components/admin/kitchen-print-settings.tsx) queda con Agente + USB + `window.print`); código QZ en `printing.ts` intacto (dormido, reversible).
- **Bundle de producción:** [actualizacion_037_a_048.sql](plataforma/supabase/actualizacion_037_a_048.sql) (concatenación de 037–048, UTF-8 limpio) + checklist en `GUIA_DESPLIEGUE.md` (PARTE 8 + items de Realtime `orders`/`waiter_calls`).
- build/typecheck/lint OK. Cambios SIN commit (el usuario controla commits). Ver [[dev-gotchas]] (preview MCP roto en este proyecto).
