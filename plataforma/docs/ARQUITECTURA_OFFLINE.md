# Arquitectura offline / mala conexión — Plataforma Leogin

> Documento de estrategia. Objetivo: que las áreas esenciales del sistema (tomar
> pedidos, mandarlos a cocina, imprimir) sigan funcionando por completo cuando
> el restaurante se queda sin internet o con conexión muy mala.
>
> Fecha: 2026-07-06.

---

## 1. Diagnóstico: hoy el sistema depende 100% de internet

Revisando el código actual (`src/`), no existe ningún mecanismo offline: cero
Service Worker, cero cola local, cero caché de datos de negocio. Cada capa
necesita la nube en cada request:

- **El menú** se renderiza en el servidor (SSR) contra Supabase en cada
  visita — sin conexión, la página ni siquiera carga.
- **`createOrder`** (`lib/actions/orders.ts`) es un *server action* que llama
  directo a Supabase (RPC `place_order`, migración `016_atomic_order_placement.sql`).
  El número de pedido y el token de seguimiento se generan **en el servidor**,
  no hay ningún ID idempotente generado en el cliente.
- **Cocina y mesero** (`app/admin/(kitchen)/cocina`, `app/admin/(waiter)/mesero`)
  dependen de Supabase Realtime.
- **La impresión** (`lib/print-agent.ts`, `/api/agent/poll`) funciona así: el
  pedido se guarda en Supabase → se encola un `print_job` en Supabase → el
  agente instalado en el restaurante (`LeoginAgent.exe`) **sondea la nube cada
  ~3 segundos** para recogerlo e imprimir. Es decir: incluso la impresión local
  pasa por la nube.
- El único almacenamiento local que existe hoy es `localStorage` para cosas
  de UX del cliente final (`lib/customer-local.ts`, `lib/table-session.ts`):
  perfil del comensal, historial de "mis pedidos", mesa escaneada. Nada de
  esto sirve para operar sin conexión.

**Conclusión honesta:** si el restaurante pierde internet por completo,
ningún dispositivo (celular del mesero, tablet de cocina, PC de caja) puede
llegar al servidor en Render. No es un problema de código que se arregle con
más caché — es una limitación física de la arquitectura actual (todo pasa por
la nube compartida). La única forma real de que algo "funcione sin internet"
es que exista **algo corriendo físicamente dentro del restaurante** que no
necesite salir a internet para operar.

---

## 2. Cómo lo resuelve la competencia (benchmark)

Se investigó específicamente **Restaurant.pe** (mencionado por el equipo) y
varios sistemas más usados en el rubro:

| Sistema | Cómo logra funcionar sin internet |
|---|---|
| **Restaurant.pe** (QuipuNET / QuipuPOS) | Es una aplicación **instalada** en Windows o en una tablet Android — no una web pura en la nube. Guarda ventas, inventario y caja localmente; cuando hay señal, sincroniza y envía los comprobantes a SUNAT. Todo lo operado offline se guarda y se actualiza solo al volver la conexión. |
| **Odoo Restaurant** | Cuando se corta el internet, guarda todo en la memoria del dispositivo (tablet) y sincroniza automáticamente al recuperar señal. |
| **Soft Restaurant** | Funciona sin internet hasta ~2 días en Android; todo lo registrado se sincroniza al reconectar. |
| **KwickPOS** (EE.UU.) | Arquitectura "hybrid cloud + local": el motor de pedidos, comandas de cocina y mesas corre en el hardware local del restaurante; los pagos con tarjeta se guardan y se procesan por lote al volver la señal. Nacido de la lección de huracanes que dejaban restaurantes sin POS por días. |
| **PANCA** (comparativa nube vs. local) | Resume el trade-off: un POS 100% en la nube es más barato y fácil de escalar, pero "funciona sin internet" **depende del proveedor**; un POS con componente local **garantiza** el offline, a cambio de mayor inversión inicial en hardware/dispositivo dedicado. |

**El patrón es siempre el mismo:** un componente local (app instalada, no una
pestaña de navegador) es la fuente de verdad mientras dura el corte, y la nube
es el respaldo/consolidador que se sincroniza cuando vuelve la señal. No hay
ningún truco de "cacheo inteligente" que reemplace esto — es la única forma en
que estos sistemas cumplen la promesa.

**Fuentes:**
- [Restaurant.pe](https://www.restaurant.pe/)
- [Cómo Elegir el Mejor Sistema POS para tu Restaurante en 2026 — Blog PANCA](https://www.panca.pe/blog/como-elegir-sistema-pos-para-restaurante/)
- [Offline POS System for Restaurants — KwickPOS](https://kwickpos.com/offline-pos-system/)
- [POS offline mode — Magestore](https://www.magestore.com/blog/pos-offline-mode/)
- Menciones de Odoo Restaurant y Soft Restaurant recopiladas de comparativas de mercado (búsqueda web, julio 2026).

---

## 3. Principio de arquitectura objetivo

**No todo el sistema necesita funcionar offline — solo el loop operativo que
no puede detenerse durante el servicio.** Intentar llevar *todo* el panel
admin offline sería un proyecto enorme y, peor, diluiría el esfuerzo en
pantallas que no son urgentes a mitad de un corte de luz/internet.

Se propone clasificar cada área del sistema en 3 niveles:

### Nivel 1 — no puede parar nunca
Tomar el pedido (mesero o QR en mesa) → que llegue a cocina → que se imprima
la comanda/recibo → cobrar en efectivo.

Archivos/pantallas involucradas: `app/admin/(kitchen)/cocina`,
`app/admin/(waiter)/mesero`, `app/pedido/[token]`, `app/checkout`,
`lib/actions/orders.ts`, `lib/print-agent.ts`, `lib/escpos.ts`.

### Nivel 2 — debe degradarse con gracia, no romperse
Que el comensal pueda ver el menú aunque el WiFi del local esté fallando;
seguimiento de su propio pedido (`components/order-tracker.tsx`,
`components/my-orders.tsx`).

### Nivel 3 — puede esperar a que vuelva la señal
Todo lo que es back-office o no urgente durante el servicio: finanzas,
inventario, proveedores, promociones, encuestas, reservaciones, personal,
`central` (multi-sucursal), `super` (super admin), lealtad con Google, y
cualquier cosa que dependa de un tercero externo (pagos con tarjeta,
facturación electrónica en tiempo real a SUNAT/FEL): estos **inherentemente**
necesitan internet, no hay forma de evitarlo, y no vale la pena intentarlo.

---

## 4. Decisión: ¿instalable en PC y en móvil?

Sí — pero son dos decisiones distintas, con mecanismos distintos, y conviene
no confundir "instalable" con "funciona sin internet" (son cosas separadas:
instalar es UX, offline es una capa de datos + sincronización).

### PC (la máquina que corre cocina/caja en el restaurante)

**No conviene un PWA aquí.** Un PWA instalado sigue siendo el motor de Chrome
pidiendo HTML a Render — si no hay internet, no tiene con qué hablar por más
que esté "instalado". La jugada correcta es evolucionar algo que **ya
existe**: `LeoginAgent.exe` (el agente de impresión, que ya se autoinstala
con un clic — ver `/api/agent/download-exe/route.ts` — y ya vive físicamente
en esa PC).

Se propone convertirlo en el **"hub local"**:
- Levanta un servidor local (Node/Express) además de la lógica de impresión
  que ya tiene.
- Guarda una copia local de lo esencial (menú, mesas, productos) en SQLite.
- Sirve ahí mismo las pantallas de cocina/caja (build estático de esas
  vistas) cuando el navegador no puede llegar a Render.
- Recibe pedidos directo por la red local (LAN) cuando la app del mesero/QR
  no puede llegar a Supabase.
- Imprime al instante (ya lo hace hoy).
- Sincroniza a Supabase en cuanto detecta que regresó la señal.

Esto es exactamente el patrón QuipuNET de Restaurant.pe: una app instalada en
Windows, no una página web.

*Nota de alcance:* no hace falta reescribirlo como Electron ni darle una
interfaz gráfica propia — puede seguir siendo un proceso en segundo plano
(como hoy) que simplemente expone un servidor local; el navegador del
restaurante apunta a `localhost:PUERTO` para las pantallas de Nivel 1 cuando
detecta que la nube no responde. Una versión Electron con ventana propia
(look de terminal POS real) es una mejora de pulido para más adelante, no un
requisito para que funcione.

### Celular / tablet (mesero, QR del comensal)

**Aquí sí conviene un PWA instalable** (Agregar a pantalla de inicio), no una
app nativa de tienda (Play Store / App Store). Motivos:

- Ya existe casi toda la base: manifest dinámico separado para admin
  (`/api/admin-manifest/route.ts`, con `id`/`start_url`/`scope` propios para
  que se instale como app independiente del catálogo), `display: 'standalone'`,
  y el banner de instalación con detección iOS/Android
  (`components/install-banner.tsx`).
- Lo que realmente resuelve el offline no es "ser nativo" sino: (1) un
  Service Worker que precachee la pantalla, (2) una cola local (IndexedDB)
  para los pedidos que no se pudieron enviar, y (3) que el dispositivo sepa
  hablarle al hub local por la IP de la red WiFi del restaurante cuando la
  nube no responde. Un PWA hace las tres cosas sin problema — no hace falta
  código nativo para eso.
- Mantener apps nativas (dos tiendas, revisiones, actualizaciones) es mucho
  más caro que mantener un PWA, para un beneficio que aquí es marginal.

### Un matiz importante de alcance

Hoy **todo** `/admin/*` comparte un solo manifest/identidad de instalación.
Conviene separar conceptualmente: cocina + mesero + caja/pedidos (Nivel 1,
deben sobrevivir sin internet) del resto del panel admin (Nivel 3, puede
seguir dependiendo 100% de la nube sin ningún cambio). No hace falta que
"todo el admin" sea offline — solo esa porción operativa.

---

## 5. Arquitectura técnica propuesta

### 5.1 El hub local (pieza central)

- **Dónde vive:** la misma PC/mini-PC donde hoy corre `LeoginAgent.exe`.
- **Qué guarda localmente (SQLite):** snapshot del menú/productos/precios,
  mesas, y una cola de pedidos pendientes de sincronizar.
- **Qué expone en la LAN:** un endpoint HTTP (y opcionalmente WebSocket para
  empujar actualizaciones a cocina en tiempo real dentro del local) que las
  tablets/celulares del restaurante puedan usar cuando no llegan a Supabase.
- **Sincronización:** al recuperar internet, reenvía los pedidos pendientes a
  Supabase. Requiere un cambio en el backend actual: **el cliente (o el hub)
  debe generar un ID idempotente (UUID) al crear el pedido**, y el RPC
  `place_order` (migración 016) debe aceptarlo y respetarlo si ya existe —
  hoy el número de pedido y el token se generan solo en el servidor, lo cual
  puede duplicar pedidos si se reintenta sin este cambio.
- **Reconciliación visible:** marcar en el panel admin los pedidos que se
  sincronizaron desde modo offline, para que el dueño/gerente sepa que hubo
  un corte y pueda revisar caja/inventario de ese período.

### 5.2 App instalada en PC

Extensión de `LeoginAgent.exe` (ver arriba, sección 4). Reutiliza el mismo
frontend (build estático de las pantallas de cocina/caja) en vez de mantener
una interfaz nueva.

### 5.3 PWA instalable en móviles

- Agregar el **Service Worker que hoy no existe**: precache del shell +
  estrategia *stale-while-revalidate* para catálogo/imágenes.
- Cola local con IndexedDB (Dexie o `idb`) para pedidos que no se pudieron
  enviar: reintento con Background Sync API (Android/Chrome) o por
  temporizador/al recuperar el foco (iOS Safari, que no soporta Background
  Sync).
- Lógica de "a quién le hablo": intento normal a la nube → si falla, intento
  al hub local (misma red WiFi) → si ambos fallan, cola local + reintento.
- Guardar el último snapshot del menú en IndexedDB para que el comensal vea
  al menos el último menú cargado si ni la nube ni el hub local responden
  (ej. no está en el WiFi del restaurante y su propio dato móvil falló).

### 5.4 Lo que NO se debe intentar llevar offline

- **Pagos con tarjeta/pasarela:** dependen de redes de pago externas por
  definición. Lo único viable es permitir "efectivo, pendiente de conciliar"
  cuando no hay conexión (el schema ya tiene `cashAmount`).
- **Facturación electrónica en tiempo real (FEL/SUNAT):** el pedido se puede
  tomar offline, pero el comprobante fiscal se emite/envía cuando vuelve la
  señal (mismo patrón que Restaurant.pe).
- **Reportes consolidados multi-sucursal, super admin, analítica:** no
  aportan nada en medio de un corte y pueden esperar sin costo.

---

## 6. Roadmap por fases

**Fase 1 (rápida — resiliencia a mala conexión intermitente):**
Service Worker + caché de menú/estáticos + banner de conectividad + cola de
reintento simple contra la nube (sin hub local todavía). Cubre bien el caso
de "WiFi inestable" que es el más común en el día a día.

**Fase 2 (mediana — corte total de internet):**
Evolucionar `LeoginAgent.exe` a hub local (servidor + SQLite + endpoint LAN)
+ ID idempotente en el flujo de pedidos + sincronización con reconciliación
visible en el admin. Cubre el corte real de internet mientras el WiFi local
del restaurante siga con vida.

**Fase 3 (infraestructura, no código):**
Recomendar un router con failover a datos móviles (4G/5G) en el restaurante.
Resuelve gran parte del problema con cero desarrollo, como complemento a las
fases anteriores (no como sustituto).

---

## 7. Riesgos y decisiones abiertas

- **Seguridad del hub local:** el endpoint LAN debe autenticarse igual de en
  serio que el agente de impresión actual (token), para que no cualquiera en
  el WiFi del restaurante pueda crear pedidos falsos.
- **Conflictos de sincronización:** ¿qué pasa si la misma mesa se reutiliza
  offline y después choca con un pedido creado en paralelo desde otro
  dispositivo? Definir reglas antes de construir (ej. namespacing de
  numeración offline vs. online, o resolución por timestamp + revisión
  manual).
- **Mantenimiento de dos "modos" de impresión/servidor:** el hub local duplica
  parcialmente lógica que hoy vive solo en Supabase (menú, mesas). Hay que
  decidir cómo se mantiene sincronizado ese snapshot local sin que se desfase.
- **Costo de hardware:** el modelo local-first requiere que cada restaurante
  tenga una PC/mini-PC dedicada corriendo el hub — ya existe para imprimir,
  pero vale la pena confirmarlo como requisito explícito con los restaurantes
  nuevos.
