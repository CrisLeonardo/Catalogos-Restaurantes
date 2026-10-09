# AUDITORÍA PROFUNDA — 2026-07-03

> Auditoría integral (arquitectura, rendimiento/seguridad, lógica de negocio,
> manejo de errores) + trabajo ejecutado esta noche. Formato: **Diagnóstico
> breve → Plan** por área, como pide el flujo de trabajo del proyecto.
>
> **Ejecutado esta noche (ya en el código):** aislamiento de sesiones
> comensal/personal (§2.1) y panel admin con 2 temas fijos claro/oscuro (§4.1).
> **Diseñado para aprobar:** solución offline → `PLAN_OFFLINE.md`.

---

## 0. Veredicto general

La base es **mucho mejor que el promedio**: precios autoritativos en servidor,
RPCs atómicos (`place_order`), RLS con prueba repetible, rate-limiting,
`React.cache()` en la capa de datos, columnas públicas con allowlist (el menú
no filtra costos), CSP y saneo de `custom_css`. Los problemas grandes no eran
de descuido sino **dos decisiones de arquitectura que ya cobraron factura**:

1. **Una sola sesión de Supabase para dos identidades** (staff y comensal
   Google) compartida en `.leogin.online` → toda la familia de bugs de
   "sesión fantasma". **Corregido esta noche.**
2. **El panel admin acoplado al motor de personalización del menú** → estados
   visuales impredecibles por restaurante y ~1,000 líneas de deuda. **Corregido
   esta noche.**

---

## 1. ARQUITECTURA Y DEUDA TÉCNICA

### 1.1 Sesiones: una cookie, dos identidades — **CORREGIDO**
**Diagnóstico.** El login Google del comensal y el login del personal usaban el
mismo "slot" de sesión de Supabase (cookie por defecto, dominio
`.leogin.online`). Un navegador = una sesión: si el dueño probaba su menú y
entraba con Google, **pisaba su sesión del panel** (y al revés). El código ya
acumulaba parches que lo delataban: `resolveDinerAuthUserId` (filtra staff en
flujos de comensal), `prompt: 'select_account'`, comentarios sobre "cookie
fantasma" y cierres de sesión intermitentes, commit "bugs fix sesion".

**Qué se hizo.** Dos sesiones paralelas e independientes:
- Personal → cookie por defecto (`sb-<ref>-…`): **nadie del staff pierde su
  sesión al desplegar**.
- Comensal → cookie propia `sb-leogin-diner` (`lib/supabase/cookies.ts`),
  también en `.leogin.online` para que su identidad lo siga entre restaurantes.
- `createClient()` / `createDinerClient()` en servidor y navegador; el proxy
  refresca ambas (la del comensal solo fuera del área de personal); callback
  OAuth, lealtad, checkout, "mis pedidos" y los 3 componentes del menú migrados
  al cliente de comensal. `resolveDinerAuthUserId` se queda como defensa: si un
  dueño entra a Google con el MISMO correo de su cuenta staff, Supabase enlaza
  identidades por email y el filtro sigue siendo necesario.

**Efecto al desplegar.** Comensales con sesión Google previa la verán cerrada
una vez (re-login de un toque); sus puntos/enlaces no se pierden (viven en
`customers.auth_user_id`, no en la sesión).

### 1.2 Funciones/componentes "dios"
**Diagnóstico.** `createOrder` ≈ 400 líneas (validación + cobertura + precios +
promos + propina + lealtad + persistencia + push), `checkout-form.tsx` 1,160
líneas, `orders.ts` 1,127. Bien comentados, pero cualquier cambio toca un
monolito y es difícil de testear.

**Plan (no urgente, hacerlo al tocar cada área):**
1. Extraer de `createOrder` fases puras: `validateOperatingState()`,
   `priceCart()` (ya casi existe como `resolveItemOptions`), `resolveLoyalty()`,
   `persistOrder()`. Sin cambiar comportamiento; los tests unitarios de
   precios/promos se vuelven triviales.
2. `checkout-form`: separar en `useCheckoutState()` (hook con la lógica) +
   secciones presentacionales. Hacerlo junto con la Fase 1 offline (el outbox
   vive naturalmente en ese hook).

### 1.3 Config de negocio viviendo en el "tema"
**Diagnóstico.** `deliveryFee`, `tipEnabled`, `tipPercent` viven en
`ThemeConfig` (tabla `restaurant_themes`). Consecuencias: `createOrder` y
`createWaiterOrder` leen el **tema completo** (`select *` + `resolveTheme`)
solo para 3 números, y conceptualmente "apariencia" y "reglas de cobro" quedan
acopladas (mismo síntoma que tenía el panel admin).

**Plan:** migración que copie esas 3 columnas a `restaurants` (o
`restaurant_settings`), actualizar los 2 puntos de lectura, deprecar los campos
del tema. Riesgo bajo, quita una query pesada del camino del checkout.

### 1.4 Mesas identificadas por texto
**Diagnóstico.** `freeTable` y el flujo DINE_IN identifican la mesa con el
string `address = 'Mesa N'`. Funciona, pero es frágil (renombrar el formato
rompe liberar mesas) y choca con que ya existe un módulo de mesas formal.

**Plan:** columna `orders.table_number int` + backfill parseando `address`;
`freeTable` filtra por la columna. El texto se queda solo para mostrar.

### 1.5 Estructura general
Carpetas y capas están bien: `app/` (rutas) → `lib/actions` (server actions
con auth) → `lib/db` (queries cacheadas) → `lib/supabase` (clientes). Los
grupos `(protected)/(kitchen)/(waiter)` separan shells correctamente. No
recomiendo reorganizar nada.

---

## 2. RENDIMIENTO Y SEGURIDAD

### 2.1 Latencia del checkout (la mejora de rendimiento más valiosa)
**Diagnóstico.** `createOrder` hace ~10 viajes **secuenciales** a Supabase
antes de insertar: sesión → perfil (filtro staff) → cliente enlazado →
restaurante → productos → tema → promo (+3 más si hay recompensas). En una
conexión móvil mala, cada viaje suma; el comensal ve "Enviando…" segundos de
más — y ese es exactamente el momento donde la gente re-toca el botón.

**Plan:**
1. Paralelizar lo independiente con `Promise.all`: (restaurante + productos +
   tema + resolución de sesión/cliente) en un solo lote; promo y recompensas en
   un segundo lote. De ~10 viajes seriales a ~3 tandas → checkout ~2-3× más
   rápido sin cambiar lógica.
2. (Con §1.3) eliminar la lectura del tema por completo.

### 2.2 Consultas y N+1
- `getRestaurantBySlug`: 2 queries seriales → 1 con embed
  `restaurants.select('*, restaurant_themes(*)')` (patrón que ya usan en
  super-admin). Afecta a TODAS las páginas del tenant.
- Canje de recompensas: un RPC por recompensa en bucle — aceptable (n≤3
  típico); si crece, RPC batch.
- Índices: migración 036 ya cubre los caminos calientes. Al aplicar la
  idempotencia offline, el `unique (client_id)` trae su índice.
- `getLoyaltySummary` trae TODAS las transacciones REDEEM y filtra el mes en
  JS → mover el filtro de fecha a la query (`gte('created_at', monthStart)`).

### 2.3 Seguridad — estado
- **RLS**: al día, incluidas migraciones 043-060 (052/053 son aditivas sobre
  tablas ya protegidas). Mantener el hábito de correr
  `scripts/test-aislamiento.mjs` tras cada migración con policies.
- **Precios/promos/propina/puntos**: todos server-authoritative ✅.
- **Callback OAuth**: `next` saneado contra open-redirect ✅; origen desde
  `x-forwarded-*` ✅.
- **Rate-limit en memoria**: correcto hoy (1 instancia en Render). Si algún día
  hay 2+ instancias, moverlo a Postgres/Upstash. Documentado, no urgente.

### 2.4 Seguridad — hallazgo a corregir: enlace por teléfono sin verificación
**Diagnóstico.** `linkMyAccountByPhone`: cualquier persona con sesión Google
puede reclamar un número **no enlazado aún** y con ello ver el perfil de
checkout de ese cliente (nombre y **dirección guardada**) y cobrar su bono de
bienvenida. No cruza tenants y el 1:1 evita robar números ya enlazados, pero es
una fuga de datos personales real con solo adivinar/conocer un teléfono ajeno.

**Plan (elegir uno):**
1. *Barato:* solo permitir el enlace si en `localStorage` del dispositivo hay
   un pedido previo con ese teléfono (token de pedido como prueba de posesión).
2. *Robusto:* reto de verificación — "confirma los últimos 4 dígitos del total
   de tu último pedido" o un código por WhatsApp (el número de WhatsApp del
   restaurante ya existe en el flujo).
3. Mientras tanto, NO devolver la dirección en `getMyCheckoutProfile` hasta que
   la cuenta tenga un pedido hecho CON sesión (no solo enlazado manual).

### 2.5 Estados semánticos de pago/impago
El cobro automatizado (pg_cron) y suspensión ya están modelados en BD — bien.
Nada que objetar en esta pasada; revisar cuando se apliquen las migraciones
pendientes en nube (ver §5 checklist).

---

## 3. LÓGICA DE NEGOCIO Y UX GLOBAL

### 3.1 Flujo del comensal
**Diagnóstico.** El flujo invitado-primero es correcto (pedir sin cuenta,
perfil local por dispositivo, Google opcional para lealtad multi-dispositivo).
La confusión venía de los bugs de sesión (§1.1), no del diseño. La lealtad
"solo por cuenta Google, nunca por teléfono" es la decisión correcta contra
suplantación — mantenerla.

**Plan:** tras desplegar el aislamiento, probar el ciclo completo en un mismo
navegador: admin abierto + menú como comensal + Google + canje + logout de cada
lado sin afectar al otro (guion de prueba en §5).

### 3.2 Flujo del personal
- Mesero/cocina/pedidos bien separados por rol (`isMeseroOnly`, grupo kitchen
  sin shell). El "mesero puro" no ve el panel — correcto.
- El dolor operativo real es la dependencia total de internet →
  `PLAN_OFFLINE.md` (fases 1-2 son la respuesta).
- `RESTAURANT_WAITER` deprecado sigue vivo en 6+ sitios. **Plan:** migración de
  datos → convertir a `RESTAURANT_STAFF` + `permissions:['mesero']` y borrar el
  rol del código (reduce el `can()` y los checks de acciones).

### 3.3 Redundancias detectadas
- ~~Vista previa del panel admin del super admin~~ — eliminada esta noche
  (obsoleta con temas fijos): `/preview/admin/[id]`, `admin-preview-client`,
  selector en `preview-pane`, `getRestaurantMenuOverview`.
- Dos editores de tema (dueño y super admin) duplican ~70 % de controles.
  **Plan:** extraer controles compartidos (`ColorCtl`, `Slider`, `Segmented`…)
  a `components/theme-controls/` y que ambos editores los consuman. Menos
  código, mismos features.

---

## 4. MANEJO DE ERRORES, UI Y TEMA

### 4.1 Panel admin: 2 temas fijos — **CORREGIDO**
**Diagnóstico.** El panel heredaba el motor de personalización del tenant
(variables `--admin-panel-*` calculadas por restaurante + pestaña "Mi panel" +
sección en el editor del super admin + vista previa dedicada). Resultado:
paneles ilegibles según la paleta del menú, lógica de contraste "auto" de 90
líneas, y una superficie de bugs visuales por cada restaurante nuevo.

**Qué se hizo.**
- El proxy marca el área de personal (`x-admin-area`: `/admin`, `/central`,
  `/super` y sus subdominios). El layout raíz **no inyecta el tema del tenant**
  ahí (ni variables, ni fuentes de Google del tenant, ni fondo animado, ni
  `custom_css` → de paso, un CSS custom de un restaurante ya no puede tocar su
  panel) y pinta `data-scheme` desde la cookie `admin-theme` → **SSR sin flash**.
- 2 paletas fijas en `globals.css` (`html[data-admin-area]` oscura /
  `…[data-scheme="light"]` clara, coral -600 para AA en claro). Se conservan
  los NOMBRES de variables (`--u-*`, `--brand-*`, `--admin-panel-*`) →
  los ~50 componentes del admin no se tocaron.
- Switch sol/luna (`components/admin/theme-toggle.tsx`) en el topbar del admin
  y del panel de grupo; cookie compartida entre subdominios, 1 año.
- Eliminado: pestaña "Mi panel", sección "Panel de admin" del super editor,
  `buildAdminPanelVars` (~90 líneas), 12 campos `adminPanel*` de `ThemeConfig`,
  vista previa del panel, botón "ocultar fondo" (ya no hay fondo del tenant).
  Los valores `adminPanel*` guardados en BD quedan inertes (el resolver los
  ignora) — no hace falta migración.
- La personalización TOTAL del **menú digital** queda intacta (ahí sí es la
  esencia del producto).

### 4.2 Fallos silenciosos — inventario de los que importan
- Los `catch {}` de lealtad/impresión/push en el flujo de pedidos son
  **deliberados y correctos** (un fallo de lealtad no debe romper un pedido),
  pero hoy son invisibles. **Plan:** función `logSilentFailure(area, err)` que
  escriba en `activity_log` (ya existe `logActivity`); el super admin gana una
  vista "fallos de fondo" y deja de depender de que un cliente se queje de
  "no me llegaron los puntos".
- `getMyAccount` devuelve "invitado" ante CUALQUIER error — correcto para no
  romper el menú, mismo tratamiento: registrar el motivo.
- Realtime del panel ya tiene triple respaldo (socket + push + re-auth del
  socket) — bien resuelto.

### 4.3 Consistencia de UI
- El área admin ahora es determinista (2 temas) — la fuente nº1 de "se ve raro
  en el panel" desaparece.
- Quedan usos de colores hardcodeados en componentes viejos del admin
  (`rgba(255,255,255,…)` en `preview-pane`, botones sueltos). En tema claro se
  ven tenues pero no rompen. **Plan:** barrido mecánico a `--surface-*` /
  `--u-hair` la próxima vez que se toque cada archivo (no vale un big-bang).

---

## 5. CHECKLIST DE DESPLIEGUE Y PRUEBA (para mañana)

1. **Antes de desplegar:** nada que migrar en BD para lo de esta noche (ni
   sesiones ni temas tocan el esquema). Recordatorio pendiente de otras noches:
   migraciones **038-042, 049-060** siguen sin aplicarse en la nube.
2. **Prueba de humo de sesiones** (un solo navegador):
   - Login admin → abrir menú del mismo restaurante → "Continuar con Google"
     como comensal → volver al panel: **la sesión del panel sigue viva**.
   - Cerrar sesión Google en el menú → el panel sigue vivo. Y al revés.
   - Mesero en tablet + comensal Google en el mismo dispositivo (caso real de
     demos): ambos conviven.
   - Grupo: GROUP_OWNER entra a una sucursal sin re-login (cookie staff
     compartida intacta).
3. **Prueba de humo del tema:** alternar sol/luna en admin y en /central;
   recargar (sin flash); revisar cocina (KDS), mesero, login, y un `<select>`
   abierto en tema claro.
4. **Comunicar a los restaurantes:** "el panel ahora tiene modo claro y oscuro
   (botón arriba a la derecha); la personalización de su menú no cambia".

---

## 6. BACKLOG PRIORIZADO (lo que sigue)

| # | Qué | Pilar | Esfuerzo | Valor |
|---|---|---|---|---|
| 1 | Offline Fase 0 + 1 (PLAN_OFFLINE.md) | UX/negocio | M | ★★★★★ |
| 2 | Verificación al enlazar teléfono (§2.4) | Seguridad | S | ★★★★ |
| 3 | Paralelizar `createOrder` (§2.1) | Rendimiento | S | ★★★★ |
| 4 | Mover deliveryFee/tip a `restaurants` (§1.3) | Arquitectura | S | ★★★ |
| 5 | `logSilentFailure` + vista en super (§4.2) | Errores | S | ★★★ |
| 6 | Embed en `getRestaurantBySlug` (§2.2) | Rendimiento | XS | ★★★ |
| 7 | `orders.table_number` (§1.4) | Arquitectura | S | ★★ |
| 8 | Retirar rol `RESTAURANT_WAITER` (§3.2) | Deuda | M | ★★ |
| 9 | Controles de tema compartidos (§3.3) | Deuda | M | ★★ |
| 10 | Offline Fase 2 (hub Agente Leogin) | UX/negocio | L | ★★★★ |

S = horas · M = 1-3 días · L = 1-2 semanas
