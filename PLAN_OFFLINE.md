# PLAN OFFLINE — Operar sin internet (o con señal mala)

> Diseño 2026-07-03. Alcance: **personal del restaurante Y comensal**
> (decisión del dueño). Implementación por fases; cada fase es útil por sí sola.
>
> ## ✅ ESTADO: Fases 0, 1 y 2 IMPLEMENTADAS (2026-07-03, misma noche)
>
> | Pieza | Estado | Dónde |
> |---|---|---|
> | SW con caché offline (shell+páginas+imágenes+fuentes, versionado) | ✅ | `plataforma/public/sw.js` |
> | Registro SW + banner de conexión (menú, admin, mesero, cocina, grupo) | ✅ | `components/offline-support.tsx`, `lib/offline/use-online.ts`, `/api/health` |
> | Idempotencia en BD (`orders.client_id` + `place_order` dedupe con carrera cubierta) | ✅ | migración **061** (pendiente aplicar en nube) |
> | Outbox del mesero (IndexedDB + reintentos + UI pendientes/rechazados) | ✅ | `lib/offline/outbox.ts`, `use-outbox.ts`, `waiter-panel.tsx` |
> | Pedido del comensal en cola con TTL 10 min + confirmación | ✅ | `lib/offline/pending-order.ts`, `checkout-form.tsx` |
> | Hub de emergencia LAN en el Agente (puerto 9123): mini toma-pedidos, KDS-lite `/cocina`, comanda impresa local, cola persistente, sync idempotente | ✅ | `agente-impresion/src/hub.ts`, `escpos.ts` (comanda), endpoints `/api/agent/menu` y `/api/agent/offline-orders` |
> | Panel muestra el punto de emergencia (URL LAN del hub) | ✅ | migración **062** + heartbeat del agente + `print-agent-settings.tsx` |
>
> Verificado: hub probado E2E en LAN (menú snapshot → pedido con opciones →
> folio E-0001 → cola persistente → KDS-lite → validaciones); typecheck/build
> de plataforma verdes; endpoints del agente exigen token (401 sin él).
> **Para producción faltan:** aplicar migraciones 061-062 en la nube,
> configurar `hubKitchenTarget` en el agente del local y reempaquetar el .exe.
> Fase 3 (comensal contra el hub) sigue siendo futura/opcional.

---

## 1. El problema real

Hoy la plataforma es 100 % nube (Next.js en Render + Supabase). Si el internet
del local se cae:

- El menú QR no carga (ni siquiera para verlo).
- El mesero no puede tomar pedidos, la cocina no ve nada, no se imprime nada.
- El service worker actual (`public/sw.js`) es **solo push** — no cachea nada.

Hay **dos modos de falla distintos** y las soluciones son diferentes:

| Modo | Ejemplo | Solución |
|---|---|---|
| **Señal mala / intermitente** | 4G saturado, WiFi débil | PWA con caché + cola de reintentos (Fases 0–1) |
| **Corte total del local** | router muerto, corte del ISP | Hub local en la LAN (Fase 2, Agente Leogin) |

Ojo con el comensal: si el restaurante pierde internet, el comensal con datos
móviles **sí tiene internet** — la plataforma sigue viva para él (la nube no se
cayó). El caso "comensal offline" es sobre TODO señal mala dentro del local.

---

## 2. Principios de diseño

1. **Outbox con idempotencia.** Toda acción offline se guarda en una cola local
   (IndexedDB) con un `client_id` UUID generado en el dispositivo. Al reconectar
   se reenvía; el servidor deduplica por `client_id` (no importa reintentar 5
   veces, el pedido se crea UNA vez). Sin esto, los reintentos duplican pedidos.
2. **Números provisionales.** Un pedido offline muestra folio provisional
   (`M-104-3` = mesa/dispositivo) y recibe su número real al sincronizar
   (la numeración atómica vive en el RPC `place_order`, y ahí debe quedarse).
3. **La verdad es del servidor.** Offline se ENCOLA, nunca se "confirma" nada
   irreversible. La UI marca todo lo pendiente con un badge "por sincronizar".
4. **Versionar el caché del SW** (lección ya registrada en ERRORES.md): cada
   deploy invalida el shell viejo, si no los usuarios ven código muerto.
5. **Degradar con honestidad.** Banner global online/offline en admin y mesero;
   nada de spinners infinitos ni fallos silenciosos.

---

## 3. Fases

### Fase 0 — Resiliencia de lectura (PWA app-shell) · ~1-2 días

**Para quién:** comensal + staff. **Cubre:** señal mala.

- Service worker con **precache del app shell** (JS/CSS/fuentes/íconos) y
  runtime cache *stale-while-revalidate* para:
  - Menú público (`/` del tenant): los datos del menú se guardan además en
    IndexedDB → el QR abre y se navega el menú aunque la señal se caiga a
    mitad de la visita. Botón "pedir" degrada (ver Fase 1).
  - `/admin/mesero`, `/admin/cocina`, `/admin/pedidos`: el shell abre siempre;
    los datos muestran el último snapshot + banner "sin conexión".
- Indicador global de conexión (hook `useOnline` + evento `online/offline` +
  ping ligero a `/api/health`; `navigator.onLine` solo no es confiable).
- Excluir SIEMPRE del caché: server actions, `/auth/*`, Supabase.

### Fase 1 — Cola de pedidos del mesero (outbox) · ~3-5 días

**Para quién:** mesero (la acción que no puede esperar). **Cubre:** señal mala.

- **Migración BD:** `orders.client_id uuid unique` (nullable) + `place_order`
  acepta `p_client_id` y, si ya existe, devuelve el pedido existente
  (idempotencia real en BD, no en el cliente).
- `createWaiterOrder` acepta el `client_id` y lo pasa al RPC.
- En el panel de mesero: si el envío falla por red → el pedido va a la cola
  IndexedDB con su `client_id`, la mesa se marca "pedido pendiente ⏳",
  y un worker reintenta con backoff (y al evento `online`).
- La cocina/caja ven el pedido cuando sincroniza (con la impresión automática
  ya existente vía `enqueueKitchenForOrder`).
- **Comensal (mismo mecanismo, más conservador):** si `createOrder` falla por
  red, el carrito NO se pierde: se guarda como "pedido listo para enviar" con
  reintento automático durante **10 minutos** (después pide confirmación — un
  pedido de comida viejo no debe auto-enviarse). Mensaje claro: "Sin conexión.
  Tu pedido se enviará en cuanto vuelva la señal".

### Fase 2 — Modo Emergencia: hub local en el Agente Leogin · ~1-2 semanas

**Para quién:** todo el local. **Cubre:** corte TOTAL de internet.

La pieza clave ya existe: el **Agente de impresión Leogin** corre en una PC del
local y ya sabe imprimir (winspool + TCP 9100). Se le añade un rol de
**hub de emergencia en la LAN**:

- El agente levanta un mini-servidor HTTP/WebSocket **en la red local**
  (puerto fijo, p. ej. `9123`; el CSP ya permite `http://localhost:*` — se
  amplía a la IP LAN del hub, configurada en el panel).
- Los dispositivos del staff (que están en el MISMO WiFi aunque no haya
  internet) detectan "nube inaccesible + hub accesible" → **modo emergencia**:
  - El mesero toma pedidos contra el hub (el hub sirve el snapshot del menú
    que sincroniza cada pocos minutos cuando hay internet).
  - El hub **imprime la comanda de cocina al instante** (ya sabe hacerlo) —
    la cocina no se entera de que no hay internet.
  - KDS opcional: una pantalla en la LAN apuntando al hub (`http://IP:9123`).
  - Todo queda en una cola persistente del hub (SQLite) con `client_id`.
- Al volver el internet, el hub sube la cola por el mismo camino idempotente
  de la Fase 1 (los pedidos aparecen en la nube con sus números reales).
- Configuración sin fricción: el panel admin muestra "Hub detectado en tu red
  ✅" y un QR para que cada dispositivo del staff registre la IP del hub.

**Qué NO intenta la Fase 2:** pedidos del comensal por QR contra el hub
(requeriría servir el menú público desde la LAN con captive-portal; es Fase 3
opcional y solo tiene sentido para locales con WiFi para clientes).

### Fase 3 (opcional, futuro) — Comensal contra el hub

Menú público servido por el hub en la LAN + pedidos DINE_IN directos al hub.
Solo si un cliente real lo pide; el costo/beneficio no lo justifica hoy.

---

## 4. Decisiones técnicas concretas

| Tema | Decisión | Por qué |
|---|---|---|
| Almacenamiento local | IndexedDB (con wrapper propio ~100 líneas, sin librerías) | localStorage es síncrono y de ~5 MB; IndexedDB aguanta colas + snapshot del menú |
| Idempotencia | `orders.client_id uuid UNIQUE` + RPC | dedupe en BD, sobrevive a cualquier reintento |
| Detección de conexión | `navigator.onLine` + ping a `/api/health` cada 20 s cuando hay dudas | `onLine=true` con WiFi sin internet es el caso más común en restaurantes |
| SW | hecho a mano (extender `sw.js` actual), versionado con hash de build | evitar Workbox: dependencia grande para 3 rutas; el push ya vive ahí |
| Sesión offline | el staff sigue operando con la identidad cacheada; la cola sincroniza cuando el token se refresque al reconectar | el refresh token de Supabase sobrevive horas sin conexión |
| Hub | mismo binario del agente (Node empaquetado), rol activable por config | un solo instalador, una sola marca, cero hardware nuevo |

## 5. Riesgos y mitigaciones

- **Pedidos duplicados** → `client_id` único en BD (no confiar en el cliente).
- **Pedido viejo auto-enviado** → TTL de 10 min en la cola del comensal.
- **SW cachea de más** (pantalla vieja tras deploy) → versión por build +
  `skipWaiting` + banner "hay una actualización, toca para recargar".
- **Hub apagado** ("la PC de la impresora") → el modo emergencia degrada a
  Fase 1 (cola por dispositivo); el panel avisa "hub sin conexión desde…".
- **Stock/recetas descuadrados al sincronizar** → el RPC ya descuenta stock al
  insertar; los pedidos sincronizados pasan por el mismo camino. Si un producto
  se agotó mientras tanto, el pedido entra igual (ya se sirvió físicamente) —
  regla de negocio: la realidad del salón manda sobre el inventario.

## 6. Orden de implementación sugerido

1. Fase 0 (bajo riesgo, beneficio inmediato, sin tocar BD).
2. Migración de idempotencia + Fase 1 mesero (el dolor operativo real).
3. Fase 1 comensal (reusa el outbox).
4. Fase 2 hub (proyecto del Agente Leogin; planificar junto a su Fase 2
   de relay/UI/empaquetado para no hacer el trabajo dos veces).
