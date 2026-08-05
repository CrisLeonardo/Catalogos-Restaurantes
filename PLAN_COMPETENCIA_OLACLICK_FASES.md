# Plan por fases — cerrar la brecha con OlaClick

> Deriva de `ANALISIS_COMPETENCIA_OLACLICK_2026-08-04.md`. Cada fase está
> anclada a archivos y tablas que **existen hoy** en `plataforma/`,
> `agente-impresion/` y las 100 migraciones SQL — no a lo que dicen los
> documentos de planificación previos.
>
> **Fuera de alcance por decisión propia: pagos en línea con tarjeta.**
> La brecha #2 del análisis no se implementa. La sección 0.2 explica qué
> consecuencias tiene eso y cómo se compensa en el diseño de las demás fases,
> porque no es una brecha que se pueda simplemente ignorar: cambia cómo se
> cierra el ciclo de delivery y cómo se cierra el pedido por WhatsApp.

---

## 0. Antes de empezar

### 0.1 Orden de las fases y por qué

El análisis priorizó: (1) WhatsApp IA, (2) pagos, (3) repartidores, (4) FEL,
(5) plataformas externas, (6) reactivar compras/kardex. Quitando pagos, y
subiendo lo barato al frente, el orden de ejecución queda así:

| Fase | Qué | Esfuerzo | Depende de |
|------|-----|----------|------------|
| **F0** | Ganancias baratas (kardex + caché de menú + `orders.source`) | ~1 semana | — |
| **F1** | WhatsApp: canal → bot → agente IA | ~7–10 semanas (3 subfases) | F0 (`orders.source`) |
| **F2** | Reparto propio con repartidores | ~3–4 semanas | F0. Independiente de F1 |
| **F3** | FEL conectado a certificador real | ~2–3 semanas | — |
| **F4** | App móvil Android (dueño / mesero / repartidor) | ~2–3 semanas | F2 (para incluir al repartidor) |
| **F5** | Consolidar pedidos de PedidosYa / Rappi / UberEats | ~3–4 semanas de código, meses de gestión comercial | F0 (`orders.source`) |
| **F6** | Endurecimiento (CSP + auditoría de superficies nuevas) | ~1–2 semanas | F1, F2, F5 |

Estimaciones asumen **un desarrollador a tiempo parcial**. F2 y F3 se pueden
intercalar mientras F1 espera aprobaciones de Meta (que no dependen de código y
tardan días). **F5 arranca comercialmente en la semana 1** aunque su código se
entregue al final: los acuerdos con las plataformas son la parte lenta.

### 0.2 Consecuencia de no implementar pagos en línea

No es neutro. Tres efectos concretos, con su compensación:

1. **El reparto cobra en la puerta.** F2 tiene que incluir control de efectivo
   del repartidor (cuánto lleva de cambio, cuánto entrega al cierre). Sin eso el
   módulo de reparto queda a medias. Ya existe la base: `orders.cash_amount`
   (monto con el que el cliente va a pagar, en `src/lib/schemas.ts:80`).
2. **El pedido por WhatsApp cierra sin cobrar.** Sube el riesgo de pedidos falsos
   o no recogidos. Compensación en F1B: el número de WhatsApp ya viene verificado
   por Meta, así que se cuenta pedidos no entregados por número y se permite al
   restaurante bloquear a un cliente reincidente.
3. **En una comparación lado a lado, el checkout de OlaClick se ve más fluido.**
   El contrapunto de venta no es técnico: *cero comisión por pedido, cero
   dependencia de una pasarela, el 100% del dinero entra directo al restaurante
   el mismo día.* Ese argumento va en `MANEJO_DE_OBJECIONES.md`.

Si más adelante se reconsidera, el lugar reservado ya existe:
`src/lib/api-keys.ts` documenta que las llaves de Stripe/Recurrente irían por
variables de entorno, y el checkout ya distingue `CASH` / `CARD`.

### 0.3 Métricas de éxito (definir el número *antes* de construir)

Cada fase se declara terminada contra un número, no contra una sensación:

| Fase | Métrica | Meta |
|------|---------|------|
| F0 | Tiempo de carga del menú público (TTFB) | −60% vs. hoy |
| F1 | % de pedidos que entran por WhatsApp | ≥25% del total en pilotos |
| F2 | Pedidos DELIVERY que llegan a `DELIVERED` dentro del sistema | ≥90% |
| F3 | Facturas transmitidas al SAT sin intervención manual | 100% en ambiente PRUEBAS, luego producción |
| F4 | Notificaciones push entregadas al dueño | ≥95% |
| F5 | Pedidos externos visibles en el KDS sin segunda pantalla | 100% de los canales conectados |

---

## Fase 0 — Ganancias baratas (~1 semana)

Lo más barato del plan. Nada aquí requiere construir funcionalidad nueva; es
desbloquear lo que ya está construido y preparar el terreno para F1 y F5.

### 0.A Reactivar Compras/Kardex comercialmente

El código está completo (incluye costo promedio ponderado, migración
`088_kardex_costo_promedio.sql`). Está fuera de venta por decisión propia desde
el 2026-07-12, marcado en `src/lib/plans.ts`.

- [ ] QA de punta a punta del flujo de proveedores → compra → kardex → costo del
      platillo, con datos reales de un restaurante piloto
- [ ] Poner `comingSoon: false` en `proveedores` dentro de `ADDON_MODULES`
      (`src/lib/plans.ts:196`)
- [ ] Revisar que la tarjeta del módulo en `/admin/modulos` describa bien lo que
      hace (viene de `ACTIVATABLE_MODULES` en `src/lib/modules.ts`)
- [ ] Actualizar `PRECIOS_VIGENTES.md` y `Leogin_Planes_y_Precios_2026.docx`

**Riesgo:** si el QA revela huecos, esto deja de ser barato. Hacer el QA *antes*
de anunciarlo a cualquier prospecto.

### 0.B Caché del menú público (hallazgo M-1 de la auditoría) — ✅ hecho

> **Corrección (2026-08-04).** La versión original de este plan daba por hecho,
> siguiendo la auditoría del 29 de julio, que el menú público no cacheaba nada.
> **Eso ya no era cierto al momento de implementar**: la caché se construyó
> después de esa auditoría y el plan quedó desactualizado. El estado real era:
>
> - `getMenuDataCached` (`src/lib/db/menu.ts`) y `getRestaurantBySlugCached`
>   (`src/lib/db/restaurants.ts`), ambos con `unstable_cache`, TTL de 60s y
>   tags `menu:${id}` / `restaurant:${id}`
> - `src/app/page.tsx` ya consume las dos variantes cacheadas
> - 20 llamadas a `updateTag` invalidando desde `products.ts`, `categories.ts`,
>   `restaurant.ts` y `modules.ts`
>
> Nota de método: la búsqueda inicial de `revalidateTag` no encontró nada y por
> un momento pareció que la invalidación faltaba por completo. El código usa
> `updateTag`, que es la API correcta para server actions en esta versión de
> Next (expira de inmediato; `revalidateTag` sirve contenido viejo mientras
> revalida, y su forma de un solo argumento está deprecada).

Lo que sí faltaba era la invalidación en **inventario**, y se corrigió:

- [x] `saveInventory` y `adjustStock` (`src/lib/actions/inventory.ts`) cambian
      `is_available` —columna que el menú público sí muestra— y solo llamaban
      `revalidatePath`, que no toca las entradas de `unstable_cache`. Marcar
      "se acabó el pollo" tardaba hasta 60s en verse en el menú del comensal
- [ ] Medir TTFB antes y después (el número va en la tesis y en la demo)

**Decisión deliberada: NO se invalida en cada pedido.** La RPC `place_order`
también pone `is_available = false` cuando el stock llega a cero, pero invalidar
el menú en cada pedido anularía la caché justo en los restaurantes con más
tráfico —que son los que más la necesitan— a cambio de un caso poco frecuente
(solo aplica si el restaurante lleva control de stock y el producto se agota
exactamente con esa venta). Ahí el TTL de 60s es suficiente. Si algún día se
quiere inmediato, el lugar correcto es que `place_order` devuelva qué productos
se agotaron, no invalidar a ciegas.

### 0.C Migración 101 — origen del pedido

Prerrequisito de F1 y F5: hoy no hay forma de saber por qué canal entró un
pedido. Sin esto no se puede medir la métrica de F1 ni mostrar el chip de origen
de F5.

```
-- 101_orders_source.sql
alter table orders
  add column if not exists source text not null default 'LEOGIN'
  check (source in ('LEOGIN','WHATSAPP','PEDIDOSYA','RAPPI','UBEREATS','OTRO'));
```

- [ ] Migración 101 (idempotente, mismo estilo que 096–100)
- [ ] Exponer `source` en `/admin/pedidos`, KDS y analítica como chip
- [ ] Comparativa por canal en `/admin/analitica`

---

## Fase 1 — WhatsApp (~7–10 semanas, en 3 subfases)

El gancho #1 de OlaClick y la brecha más visible en una demo. Hoy Leogin solo
tiene un enlace `wa.me` con texto prellenado (`src/lib/reminder.ts`): el cliente
igual tiene que ir al menú web a armar el pedido.

**Se divide en tres subfases entregables por separado.** 1A ya vale por sí sola
y es de bajo riesgo; 1C es la que impresiona pero la que más puede salir mal.
No empezar 1C sin 1A y 1B funcionando en producción.

### 1A — Canal de WhatsApp y notificaciones de estado (~2 semanas)

Sin IA todavía. El restaurante conecta su número y el cliente recibe avisos
automáticos: *pedido recibido → en cocina → listo → en camino → entregado*.
Reutiliza los estados que ya existen en `src/lib/order-status.ts`.

**Esquema (migración 102):**

```
whatsapp_accounts     -- restaurant_id, phone_number_id, waba_id,
                      -- access_token (cifrado), verify_token, activo
whatsapp_conversations -- restaurant_id, wa_id (teléfono), estado jsonb,
                      -- ultima_actividad, customer_id (fk a customers)
whatsapp_messages     -- conversation_id, direccion (IN/OUT), tipo,
                      -- payload jsonb, wa_message_id, estado_envio
```

RLS por `restaurant_id` siguiendo el patrón de las migraciones existentes; los
tokens nunca se leen desde el cliente (mismo patrón que `staff_pins` en la
migración 074: sin políticas públicas, solo service role).

**Endpoints:**

- [ ] `GET /api/whatsapp/webhook` — verificación de Meta (`hub.challenge`)
- [ ] `POST /api/whatsapp/webhook` — recepción. **Verificar la firma
      `X-Hub-Signature-256` (HMAC-SHA256 con el app secret) antes de procesar
      nada.** Un webhook público sin verificación de firma es una puerta abierta
- [ ] Rate limiting reutilizando `100_rate_limit_postgres.sql`
- [ ] Envío saliente desde los cambios de estado del pedido

**Detalles de la Cloud API que condicionan el diseño:**

- Fuera de la ventana de servicio de 24h solo se pueden enviar **plantillas
  aprobadas previamente por Meta**. Las notificaciones de estado casi siempre
  caen dentro de la ventana (el cliente acaba de escribir), pero las plantillas
  hay que tenerlas aprobadas igual como respaldo. **Someterlas a aprobación en la
  semana 1 de esta fase**, no al final: la revisión tarda días
- Verificar en la documentación vigente de Meta las **tarifas por mensaje** y los
  requisitos de verificación del negocio antes de prometer un precio al cliente:
  ese costo es recurrente y por conversación
- Multi-tenant: cada restaurante conecta su propio número (Embedded Signup) o se
  usa un número compartido de Leogin. **Recomendación: número propio por
  restaurante** — el costo de mensajes lo asume cada quien y no hay un solo punto
  de bloqueo si Meta suspende una cuenta
- Respetar `restaurants.orders_whatsapp_enabled` (migración 096): si el dueño lo
  apagó, no se ofrece nada de esto

**Terminado cuando:** un pedido hecho en el menú web dispara los cinco avisos de
estado al WhatsApp del cliente, y todo queda registrado en `whatsapp_messages`.

### 1B — Bot determinista: pedir sin salir de WhatsApp (~2–3 semanas)

Máquina de estados, sin IA. Aquí es donde se cierra la brecha real: el cliente
arma el pedido dentro de WhatsApp.

- [ ] Flujo: saludo → categorías → productos → cantidad → opciones/notas →
      carrito → tipo de servicio → dirección/mesa → método de pago → confirmación
- [ ] Mensajes interactivos: listas (máximo 10 filas por sección) y botones
      (máximo 3 por mensaje). El menú hay que paginarlo — un catálogo de 60
      productos no cabe en una lista
- [ ] Estado de la conversación en `whatsapp_conversations.estado` (jsonb)
- [ ] **El pedido se crea llamando a la misma RPC `create_order` que usa el
      checkout web.** Nada de lógica de precios duplicada: `order-pricing.ts` y
      la RPC son la única fuente de verdad para totales, propina y descuentos
- [ ] Reutilizar `upsert_customer` con lat/lng (migración 068) para recordar la
      dirección del cliente entre pedidos
- [ ] Método de pago: `CASH` o `CARD` contra entrega (ver 0.2)
- [ ] Anti-fraude: contador de pedidos no entregados por `wa_id` y lista de
      bloqueo por restaurante
- [ ] Palabra clave de escape ("humano", "agente") que silencia el bot y avisa al
      dueño

**Terminado cuando:** un cliente que nunca ha usado el sistema completa un pedido
de principio a fin sin salir de WhatsApp, y el pedido aparece en el KDS con
`source = 'WHATSAPP'`.

### 1C — Agente conversacional con IA (~3–4 semanas)

Lo que hace OlaClick y lo que más se nota en una demo: el cliente escribe
*"quiero dos hamburguesas sin cebolla y una coca"* y el pedido se arma solo.

**Arquitectura recomendada — el modelo nunca inventa datos:**

- SDK oficial `@anthropic-ai/sdk`, modelo `claude-opus-5`, pensamiento adaptativo
  (`thinking: { type: 'adaptive' }`)
- **Tool use.** El modelo no recibe el menú como texto libre para improvisar:
  recibe herramientas que consultan la base. Precios, disponibilidad y stock
  salen siempre de la BD, nunca del modelo:
  - `buscar_producto(consulta)` → coincidencias del catálogo del tenant
  - `ver_categorias()`
  - `agregar_al_carrito(producto_id, cantidad, opciones, nota)`
  - `ver_carrito()` → líneas + total calculado por `order-pricing.ts`
  - `confirmar_pedido()` → **solo tras confirmación explícita del cliente**
  - `escalar_a_humano(motivo)`
- Prompt caching del prompt de sistema con el contexto del restaurante
  (`cache_control: { type: 'ephemeral' }`). El mínimo cacheable en `claude-opus-5`
  es de 512 tokens, así que el contexto del tenant sí califica
- El total y el pedido final **siempre** se construyen con `create_order`, igual
  que en 1B. La IA maneja la conversación, no la aritmética

**Guardrails obligatorios:**

- [ ] Confirmación explícita del cliente antes de crear el pedido (leer el
      resumen y el total)
- [ ] Límite de turnos por conversación y presupuesto de tokens; al excederlo,
      handoff a humano
- [ ] Si una herramienta falla o el modelo no encuentra el producto → handoff, no
      inventar
- [ ] El contenido que llega por WhatsApp es **entrada no confiable**: un cliente
      puede escribir instrucciones dirigidas al modelo. El prompt de sistema debe
      dejar claro que los mensajes del cliente son datos, no órdenes, y que no
      puede cambiar precios, aplicar descuentos ni saltarse la confirmación
- [ ] Registrar cada llamada a herramienta en `whatsapp_messages` para auditar y
      depurar
- [ ] Interruptor por restaurante: el dueño puede apagar la IA y quedarse con el
      bot determinista de 1B. **1B es el respaldo de 1C**, no código desechado

**Control de costo:** cada conversación con IA cuesta tokens además del mensaje
de WhatsApp. Medir el costo por pedido en el piloto antes de fijar el precio del
módulo. Si sale caro, `claude-haiku-4-5` es una alternativa para el clasificador
de intención inicial, dejando el modelo grande solo para armar el pedido.

**Empaquetado comercial (aplica a toda la F1):**

- [ ] Nuevo módulo `whatsapp_bot` en `ActivatableModuleKey` (`src/lib/modules.ts`)
      y en `ADDON_MODULES` (`src/lib/plans.ts`), grupo `crecimiento`
- [ ] `requiresSetup: true` — necesita conexión de número, como FEL
- [ ] Precio a definir tras medir el costo real por conversación

---

## Fase 2 — Reparto propio (~3–4 semanas)

Hoy "repartidor" solo aparece como texto de ayuda en el checkout. El sistema
termina en "el pedido está listo"; quién lo lleva y cuándo llega queda fuera.

**Lo que ya existe y hay que reutilizar (no reconstruir):**

- `haversine_km()` en SQL (migración 011) y su port a TS en `src/lib/geo.ts`
- `restaurants.location_lat/lng` y `delivery_radius_km`
- `customers.default_lat/default_lng` (migración 068) — el pin del cliente ya se
  guarda
- `src/components/delivery-map.tsx` (Leaflet) — mapa interactivo ya funcionando
- Estado `TRANSIT` ("En camino") ya está en el ciclo de vida del pedido
  (`src/lib/order-status.ts`): `READY → TRANSIT → DELIVERED` para DELIVERY
- `staff_pins` (migración 074) — login rápido por PIN, reutilizable tal cual
- `push.ts` + `push_subscriptions` (migración 014) — notificaciones al repartidor

**Esquema (migración 103):**

```
drivers          -- id, restaurant_id, profile_id (nullable), nombre,
                 -- telefono, vehiculo, activo
delivery_zones   -- restaurant_id, nombre, tarifa, minutos_estimados,
                 -- radio_km o polígono
orders           -- + driver_id, assigned_at, picked_up_at, delivered_at,
                 -- cash_collected, delivery_zone_id
```

**Decisión de rol — no tocar el CHECK de `profiles.role`:** el repartidor es un
`RESTAURANT_STAFF` con una sección nueva `reparto` en `ADMIN_SECTIONS`
(`src/lib/permissions.ts`). Así hereda RBAC, PIN y sesión sin agregar un rol al
constraint ni tocar las políticas RLS existentes. Ampliar `isMeseroOnly` con un
`isRepartidorOnly` equivalente, para que el repartidor no vea el panel completo.

**Tareas:**

- [ ] Migración 103 con RLS por `restaurant_id`; el repartidor solo ve pedidos
      donde `driver_id` es el suyo
- [ ] Sección `reparto` en `ADMIN_SECTIONS` + `STAFF_ASSIGNABLE`
- [ ] `/admin/repartidores` — alta, edición, PIN, activar/desactivar
- [ ] `/admin/zonas` — zonas con tarifa propia (hoy `delivery_fee` es plano por
      restaurante, migración 008). Reutilizar `delivery-map.tsx` para dibujarlas
- [ ] Selector de repartidor en `/admin/pedidos` (asignar / reasignar)
- [ ] **Vista móvil del repartidor** (`/repartidor`): lista de pedidos asignados,
      botón "Recogí" → `TRANSIT`, "Entregado" → `DELIVERED`, link al mapa con el
      pin del cliente, botón de llamar, **monto a cobrar y cambio a llevar**
      (de `orders.cash_amount`)
- [ ] Push al repartidor al asignarle un pedido (reutilizar `push.ts`)
- [ ] **Cierre de caja del repartidor**: efectivo esperado vs. entregado al final
      del turno, integrado con `/admin/finanzas`. Sin pagos en línea esto no es
      opcional (ver 0.2)
- [ ] El checkout usa la tarifa de la zona en lugar de la tarifa plana cuando hay
      zonas configuradas
- [ ] Comportamiento sin internet: verificar cómo se degrada la asignación con el
      outbox y el hub LAN (`src/lib/order-queue.ts`, `hub-fallback.ts`). Si no se
      puede sincronizar, que falle visiblemente, no en silencio

**Empaquetado:** módulo `reparto` en `modules.ts` + `plans.ts`, grupo `operacion`.

**Terminado cuando:** un pedido a domicilio se asigna, el repartidor lo marca
recogido y entregado desde su teléfono, el cliente recibe el aviso de "en camino"
por WhatsApp (si F1A está lista), y el efectivo cuadra en el cierre.

---

## Fase 3 — FEL conectado de verdad (~2–3 semanas)

No es sobre OlaClick: es sobre poder facturar con validez fiscal. Hoy el cálculo
del DTE está completo (`src/lib/fel.ts`) pero la transmisión real devuelve un
error explícito en `src/lib/actions/fel.ts:219`:

> *"La transmisión automática con {certificador} aún no está conectada en tu
> cuenta."*

Solo funciona el modo `MANUAL` (numeración interna, sin validez ante SAT).

**Tareas:**

- [ ] Adaptador por certificador en `src/lib/fel/providers/`, empezando por
      **INFILE** (el más común en Guatemala). `PROVIDER_META` en `fel.ts:157` ya
      declara INFILE, G4S, DIGIFACT y OTRO con su flag `transmits`
- [ ] **Credenciales por restaurante, cifradas en base de datos** — no en
      variables de entorno. Esto es multi-tenant: cada restaurante tiene su
      propia cuenta con el certificador. Es la diferencia clave con
      `api-keys.ts`, que documenta el patrón de env vars para llaves *de Leogin*
- [ ] Firma electrónica del DTE según el esquema del certificador
- [ ] Sustituir el `return { error: ... }` de `actions/fel.ts:219` por la llamada
      real, conservando el camino MANUAL para quien no tenga certificador
- [ ] **Cola de reintento**: si el certificador está caído, la venta no puede
      quedar sin factura ni bloquear la caja. Mismo patrón de outbox que ya se usa
      para pedidos offline
- [ ] `anularInvoice` hoy solo marca el documento como anulado localmente — debe
      transmitir la anulación al certificador
- [ ] Probar completo en ambiente `PRUEBAS` antes de tocar `PRODUCCION`
      (`fel_settings.ambiente` ya distingue los dos)
- [ ] Quitar `comingSoon: true` de `fel` en `ADDON_MODULES` solo cuando esté
      certificado de punta a punta con un cliente real

**Riesgo principal:** depende de un tercero (contrato, credenciales de prueba,
documentación del certificador). **Iniciar el trámite con INFILE en la semana 1
del plan completo**, no cuando empiece la fase — el tiempo de espera es externo.

---

## Fase 4 — App móvil Android (~2–3 semanas)

OlaClick tiene app en Google Play. Para el comensal no importa (el QR abre el
navegador y está bien), pero para el **dueño, el mesero y el repartidor** una app
instalable con push confiable es una expectativa instalada en el mercado.

**Lo que ya existe:** `src/app/manifest.ts`, service worker con push
(`src/lib/push.ts` + VAPID), `install-banner.tsx`, y `leogin-desktop` (shell Tauri
para escritorio, no sirve para móvil).

**Enfoque recomendado: TWA (Trusted Web Activity) publicada en Play Store.**
Envuelve el panel web que ya existe, mantiene una sola base de código, y da la
presencia en Play Store que pide el mercado. Capacitor es la alternativa si más
adelante se necesita hardware nativo (impresora Bluetooth, cámara para escanear).

- [ ] Generar la TWA y publicarla (cuenta de Google Play: pago único de ~$25)
- [ ] `assetlinks.json` en el dominio para que la app abra sin barra de navegador
- [ ] Íconos, splash y ficha de Play Store
- [ ] Verificar que el push web VAPID funcione dentro de la TWA en dispositivos
      reales — **probar en Android físico, no solo en emulador**
- [ ] Selector de rol al abrir: panel / KDS / mesero / repartidor (F2)
- [ ] Política de privacidad enlazada desde la ficha (ya existe `/privacidad`)

**Fuera de alcance:** iOS. Ahí queda la PWA con "Agregar a inicio", que funciona
pero con push menos confiable. Decirlo explícitamente en la venta, no dejar que
el prospecto lo asuma.

---

## Fase 5 — Pedidos de plataformas externas (~3–4 semanas de código)

PedidosYa, Rappi y UberEats no aparecen en ninguna parte del código. Un
restaurante que ya vende por esas apps hoy tiene que atenderlas en pantallas
aparte.

**Lo lento no es el código, son los acuerdos.** Cada plataforma tiene su programa
de integración con requisitos, tiempos y a veces costos. **Arrancar la gestión
comercial en la semana 1 del plan completo.**

### 5.A Ingesta genérica primero (no requiere acuerdos)

Esto se puede construir sin depender de nadie, y sirve de inmediato con un
middleware (n8n, Zapier o un integrador local):

- [ ] `POST /api/v1/orders` autenticado con las API keys que **ya existen**
      (`src/lib/api-keys.ts`: formato `lk_live_...`, hash SHA-256, scopes,
      verificación en tiempo constante). Hoy `/api/v1` solo tiene `me/route.ts`
- [ ] Scope nuevo `orders:write` para estas llaves
- [ ] Validación con Zod reutilizando los esquemas de `src/lib/schemas.ts`
- [ ] El pedido entra con `source` de F0.C y aterriza en la misma RPC
      `create_order`
- [ ] Tabla `channel_product_map` — mapeo producto externo ↔ producto Leogin
- [ ] Pantalla `/admin/canales` para gestionar llaves y mapeos
- [ ] Chip de origen visible en `/admin/pedidos` y en el KDS
- [ ] Rate limiting por llave (reutilizar migración 100)

### 5.B Integraciones oficiales (cuando haya acuerdo)

- [ ] Un adaptador por plataforma que traduzca su webhook al formato de 5.A
- [ ] Sincronización de disponibilidad: agotar un producto en Leogin debería
      agotarlo en la plataforma externa (si su API lo permite)
- [ ] Confirmación / rechazo de pedido desde el KDS hacia la plataforma

**Terminado cuando:** un pedido enviado por el canal externo aparece en el KDS
con su chip de origen, sin que nadie mire una segunda pantalla.

---

## Fase 6 — Endurecimiento y cierre (~1–2 semanas)

Las fases anteriores agregan superficies de ataque nuevas: un webhook público
(F1), una API de ingesta (F5) y una vista móvil con datos de clientes (F2). Esta
fase las audita y cierra el pendiente M-2 de la auditoría del 29 de julio.

- [ ] **CSP sin `unsafe-inline`** (hallazgo M-2). Hoy la política es
      `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, aplicada en un solo
      lugar: `src/proxy.ts → applySecurityHeaders`. Next 16 soporta nonces, así
      que `unsafe-inline` se puede quitar. `unsafe-eval` puede seguir siendo
      necesario para jsPDF/exceljs — si es así, acotarlo solo a las rutas que
      generan documentos, no a toda la aplicación
- [ ] Cerrar `connect-src https:` e `img-src https:` a los dominios que realmente
      se usan (hoy permiten exfiltración a cualquier dominio)
- [ ] Verificar que el webhook de WhatsApp valide firma en todos los caminos
- [ ] Verificar RLS de `drivers` y `orders.driver_id`: un repartidor no debe poder
      leer pedidos de otro ni de otro restaurante — probarlo tabla por tabla, como
      se hizo en `AUDITORIA_2026-07-29.md`
- [ ] Los tokens de WhatsApp y las credenciales FEL nunca deben viajar al cliente
- [ ] Pruebas: vitest para lógica (pricing, máquina de estados del bot, cálculo
      de zonas) y Playwright para los flujos nuevos
- [ ] Actualizar `CHECKLIST_CORRECCIONES.md` y `GUION_DEMO_90S.md`

---

## Tablero de seguimiento

| # | Entregable | Fase | Estado |
|---|-----------|------|--------|
| 1 | Kardex/Compras a la venta | F0 | ⬜ pendiente del QA de Leonardo |
| 2 | Menú público cacheado | F0 | ✅ ya existía; corregido el hueco de inventario |
| 3 | `orders.source` | F0 | 🟡 código listo; falta aplicar la migración 101 |
| 4 | Canal WhatsApp + avisos de estado | F1A | 🟡 código listo; falta migración 102, credenciales y plantilla aprobada |
| 5 | Bot determinista de pedidos | F1B | ⬜ |
| 6 | Agente IA | F1C | ⬜ |
| 7 | Repartidores + vista móvil + asignación | F2 | 🟡 código listo; falta migración 103 |
| 7b | Zonas de reparto (tarifa por zona en el checkout) | F2 | ⬜ tabla creada, sin UI ni uso en checkout |
| 8 | Cierre de caja del repartidor | F2 | 🟡 el repartidor ve su turno; falta el reporte del dueño |
| 9 | FEL transmitiendo a INFILE | F3 | ⬜ |
| 10 | App Android en Play Store | F4 | ⬜ |
| 11 | Ingesta genérica de pedidos externos | F5A | ⬜ |
| 12 | Integraciones oficiales | F5B | ⬜ |
| 13 | CSP endurecida + auditoría de superficies nuevas | F6 | ⬜ |

---

## Lo que hay que arrancar en la semana 1 aunque su fase sea tardía

Tres cosas dependen de terceros y su reloj corre en paralelo al desarrollo. Si se
inician cuando toca su fase, la fase se retrasa por espera pura:

1. **Verificación de negocio con Meta y aprobación de plantillas** (F1) — días o
   semanas de revisión
2. **Contrato y credenciales de prueba con INFILE** (F3) — trámite externo
3. **Contacto comercial con PedidosYa / Rappi / UberEats** (F5) — el más lento de
   todos, potencialmente meses
4. Cuenta de Google Play (F4) — trámite corto pero con verificación de identidad

---

## Nota de posicionamiento

Cerrar estas brechas no convierte a Leogin en OlaClick, y no debería. OlaClick
compite con "gratis, sin comisión, sin contrato" y tiene 120,000 negocios en 27
países; esa guerra de precio no se gana con el mismo movimiento.

Lo que este plan hace es **quitar las razones para decir que no** — las brechas
que un prospecto ve en una comparación de 5 minutos — mientras la ventaja real de
Leogin sigue siendo la que ya está verificada en código hoy: personalización
completa por restaurante, modo offline que de verdad funciona sin internet,
multi-sucursal con panel de grupo, y profundidad operativa (kardex, propinas,
recetas con costo, alérgenos) que un producto masivo y genérico no puede igualar
sin dejar de ser genérico.

El mensaje de venta que sostiene todo esto no cambia con este plan:
*no somos el más barato, somos el que se ve y funciona como si fuera tuyo.*
