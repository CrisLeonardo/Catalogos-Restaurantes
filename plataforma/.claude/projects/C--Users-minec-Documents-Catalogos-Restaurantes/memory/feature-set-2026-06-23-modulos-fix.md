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
