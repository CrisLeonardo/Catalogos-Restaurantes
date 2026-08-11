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

**Fase 1 (rápida — resiliencia a mala conexión intermitente):** ✅ *Implementada
(2026-07-06).* Service Worker + caché de menú/estáticos + banner de conectividad
+ cola de reintento idempotente contra la nube (migración 061, `client_id`).
Cubre bien el caso de "WiFi inestable" que es el más común en el día a día.

**Fase 2 (mediana — corte total de internet):** ✅ *Implementada (2026-07-06,
alcance acotado: el hub toma pedidos y los imprime; cocina/mesero siguen con la
comanda impresa durante el corte).* `LeoginAgent.exe` evolucionado a hub local
(servidor LAN en :47100 + snapshot JSON + `POST /orders` con token, migraciones
062–063) + sincronización con re-validación de precios y reconciliación visible
(`synced_from_hub`). Fallback en cadena para checkout y mesero:
nube → hub → cola local. **Ver la evaluación §8: en producción el paso "hub"
está bloqueado por mixed content hasta darle HTTPS al hub.**

**Fase 3 (infraestructura, no código):** ❌ *Descartada por decisión de producto
(2026-07-07).* Se documentó una guía de hardware por restaurante (router con
failover 4G, UPS, reserva DHCP) y una tarjeta "Plan B" en el panel, pero se
eliminaron: recomendar hardware local por cliente no escala para un SaaS
multi-país. La resiliencia se resuelve completa en software (fases 1–2 + HTTPS
del hub + KDS local); el hardware de red queda como responsabilidad del
restaurante. Nota técnica que sobrevive de esa guía: la PC del hub conviene
tenerla por cable y con IP reservada en el DHCP para que `hub_url` no cambie
durante un corte.

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

---

## 8. Evaluación post-implementación (2026-07-06)

Auditoría del sistema ya construido (fases 1–3), con lo que hay que arreglar y
la comparación honesta contra arquitecturas alternativas.

### 8.1 CRÍTICO — Mixed content: el fallback al hub NO funciona en producción

`hub_url` es `http://<IP-LAN>:47100` (el agente no tiene TLS). En producción,
checkout y mesero se sirven por **HTTPS**, y todos los navegadores modernos
bloquean un `fetch()` desde una página HTTPS hacia `http://` (*active mixed
content*) — la única excepción es `localhost`/`127.0.0.1`. Por eso la
verificación end-to-end local pasó (origen `*.localhost:3000` en HTTP) pero en
producción **el paso "hub" de la cadena nube → hub → cola muere en silencio**:
el `fetch` falla al instante, `tryHubOrder` devuelve `null`, y el pedido cae a
la cola del dispositivo (Fase 1). No se pierden pedidos, pero el hub no recibe
pedidos de otros dispositivos, que era el corazón de la Fase 2.

**Solución recomendada (patrón Plex):** darle al hub un nombre público con
certificado real, que resuelve a su IP privada:

1. Un subdominio por agente: `<id-agente>.hub.leogin.app`.
2. La plataforma emite un certificado Let's Encrypt para ese nombre vía
   **desafío DNS-01** (el reto se responde en el DNS público; el hub no
   necesita ser alcanzable desde internet) y se lo entrega al agente por el
   canal autenticado que ya existe (`/api/agent/poll`), renovándolo igual.
3. Un registro DNS público `A` apunta ese subdominio a la **IP LAN** que el
   agente ya reporta en su heartbeat (actualizable vía API del proveedor DNS).
4. `hub_url` pasa a ser `https://<id>.hub.leogin.app:47100` — el navegador del
   comensal conecta feliz: hostname válido, cert válido, aunque la IP sea
   192.168.x.x. Es exactamente cómo Plex resolvió esto para millones de
   servidores caseros (`*.plex.direct`).

*Caveats a diseñar:* (a) algunos routers con protección *DNS rebinding*
bloquean respuestas DNS públicas que apuntan a IPs privadas — mitigación:
documentar la excepción del router como artículo de soporte y mantener la
cola Fase 1 como respaldo; (b) resolver el nombre DNS requiere
internet salvo que el dispositivo tenga la respuesta cacheada — mitigación:
TTL largo + el navegador suele tener el registro caliente porque el checkout
lo consulta al cargar; (c) **Local Network Access de Chrome — VERIFICADO
2026-07-07:** en Chrome 148, `navigator.permissions` reporta el permiso
`local-network-access` como `denied` por defecto en contextos automatizados y
el `fetch` a una IP privada falla con un genérico "Failed to fetch" (sin error
en consola), incluso desde un origen HTTP local; en un navegador normal Chrome
muestra un prompt de permiso una vez por origen. Es decir: además del HTTPS,
el comensal/mesero deberá aceptar UN prompt de "acceso a la red local" la
primera vez. `hub-fallback.ts` ya manda `targetAddressSpace: 'private'` en el
fetch (la forma correcta de declarar el destino y disparar el prompt; los
demás navegadores ignoran la opción). Si el permiso se niega, la cadena
degrada a la cola del dispositivo — verificado en vivo (el pedido se encoló y
se sincronizó solo al volver la señal).
Alternativas descartadas: certificado self-signed (el navegador lo rechaza sin
instalación manual en cada dispositivo) y WebRTC (complejidad enorme para el
caso de uso).

**Estado: ✅ implementado (2026-07-07, agente v0.4.0 + migración 064).**
- `lib/hub-tls/` (plataforma): emisión del wildcard `*.hub.<dominio>` con
  `acme-client` + DNS-01 respondido en Cloudflare; renovación automática a
  <30 días; hostname por agente asignado en el poll; registro A mantenido con
  la IP LAN del heartbeat (campo `lanIp` nuevo). **Un solo certificado
  compartido por todos los hubs** — deliberado: certificado por agente choca
  con el rate limit de Let's Encrypt (~50/semana por dominio); el riesgo del
  key compartido queda acotado por el token propio de cada hub y LANs
  físicamente separadas.
- Entrega: el poll anuncia `hubTls {hostname, certSha256}`; si difiere, el
  agente baja el certificado por `GET /api/agent/hub-cert` y (re)inicia su
  servidor HTTPS en :47443 en caliente.
- Consumo: `getAgentHubInfo` prefiere `https://<hostname>:47443` cuando hay
  certificado vigente; `warmUpHub()` en checkout/mesero precalienta la
  resolución DNS y el prompt de Local Network Access mientras hay señal.
  El KDS local sigue en el `http://IP:47100` a propósito (no depende de DNS
  durante el corte).
- Config de producción: `LEOGIN_HUB_DOMAIN=hub.leogin.online` +
  `CLOUDFLARE_API_TOKEN` (Zone→DNS→Edit); opcionales `LEOGIN_ACME_EMAIL` y
  `LEOGIN_ACME_DIRECTORY=staging` para pruebas. **Migración 064 pendiente de
  correr en producción.**

### 8.2 Corregido — Firewall de Windows bloqueaba el hub desde la LAN

Ni `setup.ts` ni `install.ps1` creaban regla de firewall para el puerto 47100;
Windows bloquea conexiones entrantes por defecto, así que en una instalación
real el hub era inalcanzable desde tablets/celulares (el E2E local fue en la
misma PC, que no pasa por el firewall). **Corregido (agente v0.2.0):** la
autoinstalación crea la regla `Leogin Hub (LAN 47100)` con un único aviso UAC
(si se cancela, la instalación sigue y solo se pierde el respaldo LAN);
`install.ps1`/`uninstall.ps1` la crean/eliminan también.

### 8.3 Corregido — `POST /print` del hub quedó sin token al abrirse a la LAN

`/print` nació bindado a 127.0.0.1; al pasar el bind a `0.0.0.0` (Fase 2) quedó
expuesto a la LAN **sin autenticación**: cualquiera en el WiFi podía mandar
bytes a las impresoras (spam de papel, tickets falsos). No tenía ningún caller
real todavía. **Corregido (v0.2.0):** exige `x-hub-token` igual que `/orders`.

### 8.4 Corregido — la cola del hub reintentaba para siempre los pedidos rechazados

Encontrado durante la verificación E2E (2026-07-07), en dos mitades:
(1) si un payload fallaba la validación estricta de `createOrderSchema` al
sincronizar, el resultado llegaba con `clientId: null` y el agente no podía
marcarlo como fallido — el pedido malformado se reenviaba cada 60s para
siempre (mensaje envenenado) y el comensal veía "Sincronizando…" eterno;
(2) aun cuando SÍ se marcaba `failed`, `getPendingOrders()` no filtraba por
estado, así que los fallidos se reenviaban igual — el estado era cosmético.
**Corregido en tres capas:** el endpoint `offline-orders` devuelve el
`clientId` crudo aunque el schema falle; el agente además resuelve el
`clientId` por posición del lote; `syncPendingOrders` filtra `status ===
'pending'`; y el intake del hub (`order-intake.ts`) ahora exige la misma
forma mínima que el schema de la nube (`name` y `price` por ítem) para no
aceptar de entrada lo que la nube va a rechazar. Verificado: payload inválido
→ 400 en el hub; pedido fallido sin un solo reintento en ~8 horas de agente
corriendo; pedido válido → impreso al instante y sincronizado con
`synced_from_hub=true` y precio re-validado.

### 8.5 Mejoras menores pendientes (en orden de valor)

- **Hora real del pedido offline:** al sincronizar, `place_order` usa `now()` —
  un pedido tomado a las 13:00 durante un corte de 2h queda registrado a las
  15:00. Afecta reportes/caja del período del corte. Fix: pasar la hora de
  captura del hub (`createdAt` ya viaja en la cola) como parámetro opcional del
  RPC y mostrarla en la reconciliación.
- **Cola del dispositivo en `localStorage`:** funciona, pero IndexedDB +
  Background Sync API (Android/Chrome) reintentaría incluso con la pestaña
  cerrada y aguanta payloads más grandes. iOS seguiría con el patrón actual.
- **El token del hub es una barrera, no un secreto:** viaja embebido en el HTML
  del checkout a todo comensal. Cumple su objetivo (impedir pedidos anónimos a
  ciegas desde la LAN), pero conviene sumarle rate-limit por IP en el hub.
- **Snapshot de menú cada 60s:** adecuado; el hub además re-valida contra la BD
  al sincronizar, así que el desfase máximo de 60s no compromete precios.

### 8.6 ¿Existe una arquitectura mejor? (alternativas evaluadas)

Se evaluó contra el estado del arte de sistemas *local-first*:

- **Sync engines (PowerSync, ElectricSQL, Replicache/Zero, RxDB):** replican
  Postgres↔SQLite/IndexedDB con resolución de conflictos; harían que cocina y
  mesero funcionen con pantalla completa durante un corte, sincronizando solos.
  PowerSync incluso tiene integración oficial con Supabase. **Veredicto:** es la
  evolución correcta *si* el KDS offline se vuelve requisito comercial, pero
  migrar implica rehacer la capa de datos del cliente (RLS → sync rules, estado
  local en todas las pantallas de Nivel 1) — meses de trabajo. No se justifica
  hoy.
- **El patrón actual (degradar a comanda impresa + hub que captura e imprime)**
  es el mismo que usan los POS líderes (Toast, Square y KwickPOS operan así en
  modo offline: capturar, imprimir, sincronizar después). La impresora térmica
  ES la pantalla de cocina de contingencia — barata, sin batería, sin sync.
- **KDS local — ✅ implementado (2026-07-07, agente v0.3.0):** el hub sirve
  `/kds?t=<token>` (ver `agente-impresion/src/kds.ts`), una pantalla de cocina
  autocontenida con los pedidos que él capturó: tiempos con colores, opciones y
  notas resueltas (snapshot `display` guardado al aceptar), badge de
  sincronización (por sincronizar / sincronizado ORD-x / rechazado) y botón
  LISTO (solo presentación — los pedidos sincronizados siguen visibles para
  cocina hasta marcarse). Punto clave: **no necesita el HTTPS de §8.1** — es
  una NAVEGACIÓN directa al hub y luego todo es mismo-origen, así que ni el
  mixed content ni el permiso Local Network Access aplican (solo restringen
  subrecursos pedidos desde otro origen). Funciona en producción hoy. El
  enlace listo (con token) vive en /admin/impresion → "Pantalla de cocina de
  respaldo". Verificado E2E en navegador real.

**Conclusión:** la arquitectura elegida es la correcta para esta escala y es el
estándar del rubro. El orden de inversión recomendado: (1) HTTPS del hub
(§8.1, desbloquea la Fase 2 en producción — sin esto el hub solo imprime, no
captura), (2) mejoras §8.5, (3) ✅ KDS local servido por el hub (implementado
2026-07-07), (4) reevaluar sync engine solo cuando haya demanda real de KDS
offline completo.

---

### 8.7 Corregido — el agente revocado seguía sirviendo su hub en la LAN (2026-08-10)

Auditoría de la pregunta "si dos PCs quedan activadas como principal, ¿se
duplican pedidos o impresiones?". **Duplicarse, no se duplican** — y no por
casualidad, hay cuatro candados independientes:

1. `print_agents.restaurant_id` es **unique**: un restaurante no puede tener dos
   agentes. Encender una segunda PC hace `upsert` sobre la misma fila con un
   token nuevo, así que la primera queda revocada en el mismo instante.
2. `claim_print_jobs` reclama con `for update skip locked`: aunque dos procesos
   pidieran trabajos a la vez, cada trabajo se entrega una sola vez.
3. `kitchenTicketAlreadyQueued` (lib/print-agent.ts) impide una segunda comanda
   del mismo pedido, y `/api/agent/offline-orders` **no** encola comanda al
   sincronizar (el hub ya imprimió) y entra como `PREP` para que nadie pulse
   "Confirmar" y la mande otra vez.
4. `client_id` con índice único + comprobación previa en `createOrder`,
   `createWaiterOrder` y la sincronización del hub: el mismo pedido reenviado
   no crea dos filas.

**Lo que sí estaba roto:** el agente revocado NO se enteraba. Seguía en su bucle
con un token muerto (401 cada 3 s) pero con el hub **abierto en la LAN**,
aceptando pedidos y **imprimiéndolos** — pedidos que ya no podía sincronizar
nunca, porque su token no vale. No es duplicación: es *pérdida*. Y pasaba
también al apagar la PC principal desde el celular, no solo al cambiar de PC.

Arreglo (agente 0.7.1 + `POST /api/agent/poll`):

- El poll distingue **revocado** (`401` con `{revoked:true}`) de **no se pudo
  comprobar** (`503`). La diferencia es la parte importante: si un fallo de base
  de datos contara como revocación, una caída de Supabase apagaría los hubs de
  todos los restaurantes a la vez, justo cuando más falta hacen
  (`authenticateAgentResult` en lib/print-agent.ts).
- Tras 5 polls revocados seguidos (~15 s) el agente **cierra el hub** (HTTP y
  HTTPS), avisa en el log cuántos pedidos quedaron sin sincronizar y sigue vivo
  y callado preguntando cada 60 s. No se mata: la tarea programada lo relanza
  cada 3 minutos y volvería a abrir el puerto unos segundos cada vez.
- El panel avisa además cuando la impresora guardada no está entre las que
  reporta la PC principal actual: al cambiar de computadora los destinos se
  conservan (mig. 094) pero son los de la anterior, y las comandas se encolaban
  contra una impresora que ya no existe.
