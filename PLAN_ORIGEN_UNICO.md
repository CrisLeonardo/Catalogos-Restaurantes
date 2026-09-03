# Plan — Un solo origen para toda la app de Leogin

> Redactado el 2026-09-02. Objetivo: que Leogin se sienta como **una** app en
> Android —sin barra de navegador encima— sin importar desde qué pantalla se
> agregó al inicio.
>
> **Revisión del mismo día, después de medir contra el código y el navegador.**
> El orden de las fases de la primera versión estaba mal: lo que creía una fase
> de limpieza al final resultó ser el requisito previo de todo lo demás. Ver §4.

---

## 1. Por qué existe el problema

El `scope` de una PWA es **por origen**, y hoy la operación de Leogin vive
repartida en dos:

| Qué | Dónde vive hoy |
|---|---|
| Mi cuenta (el centro de la persona) | `distleogin.com` |
| El panel de cada restaurante | `azucar-negra-demo-admin.distleogin.com` |

Cruzar de uno a otro es, para Android, **salir de la app instalada**: por eso
pinta la barra con el título, el dominio, la ✕ y los ⋮. No hay bandera que lo
evite — `scope_extensions`, la forma oficial de que una PWA abarque varios
orígenes, **no está soportada en Android** (solo Windows/macOS/Linux/ChromeOS).

La curita de hoy (`WrongScopeHint`) solo avisa, y solo sirve a quien tiene
*un* restaurante. Con dos o más no existe ningún origen "correcto" al que
mandarlo.

---

## 2. La forma nueva

| Hoy | Después |
|---|---|
| `distleogin.com/mi-cuenta` | igual |
| `<slug>-admin.distleogin.com/` | `distleogin.com/panel/<slug>` |
| `<slug>-admin.distleogin.com/menu` | `distleogin.com/panel/<slug>/menu` |
| `<slug>.distleogin.com` (menú del comensal) | **no se toca** |

**El menú del comensal se queda como está, a propósito.** Es otra app, de otro
público y con la marca del restaurante: el comensal instala "Azúcar Negra", no
"Leogin". Que viva en otro origen es lo correcto.

---

## 3. Lo que hace esto viable

- **54 archivos** necesitan saber en qué restaurante están… y **ninguno mira el
  host**. Todos leen la cabecera `x-tenant-slug`, que pone el proxy.
- **Solo 5 archivos** conocen el concepto "subdominio admin".
- El proxy **ya hacía esta misma reescritura** en §3 (subdominio admin) y §2b
  (link estable de mesa).

El árbol de rutas `/admin/*` **no se mueve de sitio**. Lo único que cambia es de
dónde saca el proxy el slug:

```
Hoy      host <slug>-admin.distleogin.com  +  /menu
         → rewrite a /admin/menu  ·  x-tenant-slug=<slug>

Después  host distleogin.com  +  /panel/<slug>/menu
         → rewrite a /admin/menu  ·  x-tenant-slug=<slug>
```

**Corrección sobre lo que dije al principio: esto no toca RLS ni la base de
datos.** El tenant siempre se resolvió por slug del lado de la app; Postgres
nunca vio el host.

---

## 4. La corrección importante: los enlaces internos

La primera versión de este plan daba la fase de `adminUrl()` por "9 archivos".
Eso medía los usos de `adminUrl()`, no los **enlaces internos del panel**, que
son el trabajo de verdad.

Medido con el panel abierto en `/panel/azucar-negra` (entorno local, DOM real):

> **20 de los 21 enlaces de la pantalla apuntan a `/admin/…`.**
> En el dominio raíz esa ruta no lleva restaurante → "Restaurante no
> encontrado". Comprobado pulsando uno.

Recuento sobre el código, separando lo que de verdad hay que tocar:

| Qué | Cuántos | ¿Cambia? |
|---|---:|---|
| `revalidatePath('/admin/…')` | 129 | **No.** La ruta interna sigue siendo `/admin/…` |
| Navegación a `/admin/login`, `logout-operator`, `recuperar`, `nueva-clave`, `auth` | 82 | **No.** No llevan restaurante; viven bien en el dominio raíz |
| **Navegación a secciones del panel** | **46** | **Sí** — necesitan el prefijo `/panel/<slug>` |

Los 46 están concentrados: `components/admin/shell.tsx` y `lib/admin-nav.ts`
generan la mayoría desde una configuración, así que se prefijan **donde se
renderizan**, no en cada entrada del config (el config debe seguir diciendo
`/admin/…`, que es la identidad real de la ruta y lo que usa `isActivePath`).

De dónde sale el prefijo:

- **Componentes de servidor**: `headers().get('x-tenant-slug')` → `panelPath(slug)`.
- **Componentes de cliente**: `usePathname()` ya devuelve `/panel/<slug>/…`
  (la barra del navegador), así que el slug se extrae de ahí.

**Consecuencia de orden:** esto es *anterior* a cambiar `adminUrl()` y al 308
del subdominio viejo. Cualquiera de esas dos, sola, mete a la gente en un panel
cuyos enlaces no funcionan.

---

## 5. Las fases, en el orden correcto

### ✅ Fase 0 — El bug de `localhost` · HECHA

Apareció investigando este tema. Detalle completo en §7.

### ✅ Fase 1 — El proxy entiende `/panel/<slug>` · HECHA Y VERIFICADA

`proxy.ts` §2a: `/panel/<slug>/…` → rewrite a `/admin/…` con `x-tenant-slug`.

- Verificado en el navegador: `/panel/azucar-negra` pinta el panel entero.
- 6 pruebas nuevas en `proxy.test.ts`, incluida la de seguridad (un
  `x-tenant-slug` mandado por el cliente no elige el restaurante).
- **Inerte a propósito**: nada enlaza ahí todavía, así que hoy no cambia nada
  para nadie.

### ✅ Fase 2 — El manifest · HECHA

`api/admin-manifest` decide el `scope` por el origen desde el que se sirve:

- Dominio raíz (el origen único) → `scope: '/'`. Un solo ícono que cubre Mi
  cuenta **y** el panel de cualquier restaurante. Es la razón de ser de todo esto.
- Subdominio del catálogo (`<slug>.<raíz>/admin`, que es como se sirve el panel
  en local) → `scope: '/admin/'`, porque ahí el `/` es del menú del comensal.
- Subdominio viejo `<slug>-admin.*` → `scope: '/'`, como siempre.

Hoy es **neutro**: mientras el panel se sirva del subdominio viejo, devuelve
exactamente lo mismo que antes.

### ✅ Fase 3 — Prefijar los destinos de navegación · HECHA Y VERIFICADA

Resultó ser más de 46 (el recuento inicial se quedó corto: había destinos que no
usan `href=` literal — `action={{href}}`, `configHref`, `url:`, y objetos de
configuración a nivel de módulo). La solución que lo cerró **no fue tocar cada
sitio**, sino tres piezas:

1. **`lib/panel-links.ts`** (+12 pruebas) — `panelBaseFrom`, `internalPanelPath`
   y `panelHref`. La propiedad que hace subible esta fase sola:
   **`panelHref('', x) === x`**, así que mientras el navegador no esté en
   `/panel/<slug>` todos los enlaces salen exactamente como antes.
2. **`components/admin/panel-link.tsx`** — un `<Link>` que resuelve el prefijo
   él solo. Es de CLIENTE, así que lo puede renderizar un componente de
   servidor. Enchufado en `ListLink` (ui/list.tsx) y en el `action` de `Section`
   (ui/section.tsx), cayeron decenas de sitios de golpe sin tocarlos.
   Donde quedaban `<Link>` sueltos, basta aliasar el import:
   `import Link from '@/components/admin/panel-link'`.
3. **`shell.tsx` y `section-tabs.tsx`** — `pathname` pasa a ser siempre la ruta
   INTERNA (`internalPanelPath`), así toda la lógica que compara contra
   `/admin/...` —pestaña activa, títulos, modo servicio— sigue valiendo sin
   tocarse.

Los 29 `redirect()` de guarda de las páginas van por `panelLink()`
(`lib/panel-links-server.ts`), que saca el prefijo de `x-pathname` — la ruta del
navegador, que el proxy ya propaga.

**Verificado en vivo, en los dos sentidos** (16 secciones del panel):

| | Enlaces a `/admin/…` | Fugas |
|---|---|---|
| `distleogin.com/panel/<slug>/…` | **0** | — |
| Ruta vieja `/admin/…` | intactos (10-22 por pantalla) | **0** a `/panel` |

TRAMPAS de esta fase, por si vuelven:
- `off-menu-widget.tsx` es componente de SERVIDOR y le metí un `usePathname()`.
  El síntoma no fue un error legible: **Turbopack se cae con un panic de Rust**
  (`char boundary`) al intentar pintar el diagnóstico, porque el archivo tiene
  guiones `──` en un comentario. Si Turbopack revienta sin explicación, buscar
  un hook en un componente de servidor.
- El compilador de React (`react-hooks/preserve-manual-memoization`) no perdona
  un binding nuevo en medio del cuerpo si hay `useCallback` alrededor: en
  `new-orders-alert.tsx` hubo que dejar el grafo de hooks EXACTAMENTE igual y
  cambiar solo la comparación.
- Dos `next dev` sobre la misma carpeta corrompen la caché de Turbopack
  (`build-manifest.json` no encontrado). Matar todo, borrar `.next`, arrancar uno.

### ✅ Fase 4 — `adminUrl()` devuelve la ruta · HECHA Y VERIFICADA

```
adminUrl('azucar-negra')  →  /panel/azucar-negra
```

**La pregunta abierta quedó resuelta, y a favor:** se midió con una página
desechable que un `redirect()` de Server Action hacia `/panel/<slug>/menu`
**sí pasa por el proxy**. En el log: `POST … 303` seguido de
`GET /panel/azucar-negra/menu 200 (proxy.ts: 94ms)`, y la pantalla que llegó fue
el Catálogo de verdad. La trampa del 2026-08-26 era de URLs **absolutas** que
Next convierte a relativas de app; una ruta relativa normal no la sufre. Así que
los 7 `redirect()` de `products.ts` y `restaurant.ts` se prefijaron sin más.

**Dos curitas que había que borrar con esta fase, no en la 7**: existían solo
por el problema de dos orígenes, y con la fase 4 encendida pasaban a MENTIR.

- `WrongScopeHint` (Mi cuenta) le decía a todo dueño de un restaurante, en modo
  standalone, que su acceso directo estaba mal puesto y que lo borrara — cuando
  con el origen único ese acceso es justo el correcto. Eliminado.
- El modo `redirectUrl` de `LeoginInstallBanner`, que en vez de instalar mandaba
  al subdominio del panel. Eliminado (y con él `RedirectCard`).

**Verificado en el navegador, el flujo entero:** Mi cuenta → pulsar el
restaurante → `enterRestaurant` → `/panel/azucar-negra` con el panel pintado,
**sin cambiar de origen ni una vez**. Que es el objetivo de todo esto.

De los 21 enlaces del panel, **uno solo cruza de origen**: "Ver mi menú", que
va al menú del comensal. Es correcto que viva aparte, y ya llevaba
`target="_blank"`, así que no arrastra la app instalada fuera de su scope.

### ✅ Fase 5 — El subdominio viejo sigue funcionando (308) · HECHA

`<slug>-admin.distleogin.com/<ruta>` → **308** → `distleogin.com/panel/<slug>/<ruta>`

`proxy.ts` §1d, con 11 pruebas. Las tres exclusiones, todas a propósito:

- **Solo GET.** Un salto de origen sobre un POST llega con el `Origin` del host
  viejo y Next rechaza la Server Action. Una pestaña que ya estaba abierta sigue
  trabajando por §3 hasta que la persona navegue.
- **`/api/*` no**: el agente de impresión y los webhooks pueden tener esa URL
  fija y muchos clientes no siguen redirects.
- **`/auth/*` no**: el canje del `code` de Google costó dos sesiones afinarlo.

`/mi-cuenta` y `/preview/<id>` conservan su ruta y solo cambian de origen: son
de la PERSONA, no de un restaurante.

#### El bucle infinito que apareció al probarlo

Vale la pena dejarlo escrito porque no se ve en las pruebas unitarias, solo con
`curl -L`:

```
/menu → /panel/demo/menu → /panel/demo/panel/demo/menu → …
```

**Causa:** `NextResponse.redirect` **acorta el `Location` a ruta relativa**
cuando el destino le parece del mismo origen que la petición. Un `Location`
relativo aquí se resuelve contra el subdominio VIEJO, así que la petición
vuelve a caer en §1d y el prefijo se apila. El objetivo entero de este redirect
es CAMBIAR de origen, así que la URL tiene que ir absoluta sí o sí.

**Arreglado con tres cosas**, cinturón y tirantes:
1. `Response` cruda en vez de `NextResponse.redirect`.
2. `rutaEnOrigenUnico` es idempotente: una ruta que ya viene en forma
   `/panel/<slug>` no se vuelve a prefijar.
3. Guarda por HOST (no por ruta): no se redirige a uno mismo. Tiene que ser por
   host porque `/mi-cuenta` conserva la ruta y aun así debe cambiar de origen —
   una guarda por ruta lo habría suprimido, y de hecho lo hizo en el primer
   intento (lo cazaron las pruebas).

#### Por qué en local se ve relativo, y no es un problema

Con el entorno local (`NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000`), el destino y el
servidor comparten `localhost:3000`, así que Next acorta el `Location` igual y
el bucle reaparece. **Es un artefacto del entorno**: el `Host` falso que se manda
con curl no cambia el origen de la conexión que ve Next.

Comprobado con un dominio raíz distinto, comparando contra el redirect de §1 que
**ya funciona en producción**:

```
§1  (dominio anterior)  → location: https://nuevo.test/planes            ← absoluto
§1d (este)              → location: https://nuevo.test:3000/panel/demo/…  ← absoluto
```

En producción `<slug>-admin.distleogin.com` y `distleogin.com` son hosts
distintos de verdad, así que sale absoluto. Local nunca usó `-admin` (ahí el
panel se servía en `<slug>.localhost:3000/admin`), o sea que el caso no se da.

### ⛔ Fase 6 — Cookies · BLOQUEADA, no es cuestión de prioridad

Se intentó abrir el 2026-09-02 y **no se ejecutó**. No es que sea "para más
adelante": hoy es incorrecta. Tres razones concretas, medidas sobre el código:

**1. No es una cookie, son seis.** El dominio ancho `.distleogin.com` lo usan
la sesión de Supabase del personal, `leogin_entry`, `leogin_op_seen`,
`leogin_seen`, el pase de recuperación y el `device-id`. Cambiarlas es seis
migraciones, no una.

**2. La cookie fantasma.** Una cookie con `domain=.distleogin.com` y otra
host-only del mismo NOMBRE son cookies DISTINTAS: el navegador manda las dos, el
servidor arma la sesión con trozos de ambas y la da por muerta. Eso ya pasó en
producción y está documentado con ~40 líneas en `proxy.ts` — y su peor
propiedad es que **no se cura sola**: el borrado sale con `Domain=` y no toca a
la host-only, así que el `refresh_token_not_found` se repite en cada petición y
para siempre. Provocarlo a propósito, hoy, es sacar a todo el mundo de su
sesión.

**3. El subdominio viejo TODAVÍA sirve rutas que necesitan la sesión.** La fase
5 excluye `/api/*` y `/auth/*` del 308 a propósito, así que siguen atendiéndose
en `<slug>-admin.<raíz>`. Con una cookie host-only del dominio raíz, esas
peticiones llegarían SIN sesión: `/api/agent/shell-heartbeat` (el latido de
Leogin Desktop) usa `getAdminContext`. Se rompería.

Y por encima de todo: **nada de esto está desplegado**. El 308 no ha atendido ni
una petición en producción, así que la condición de "que lleve meses sin
tráfico" no está a medias, está en cero.

**Cuándo se puede abrir:** cuando los logs muestren que `<slug>-admin.*` ya no
recibe tráfico (incluido `/api/*` de agentes de impresión viejos). Entonces:
primero quitar las exclusiones de §1d, luego migrar las seis cookies escribiendo
la nueva y expirando la ancha en la MISMA respuesta, y apoyarse en el bloque de
cookie fantasma que ya existe en `proxy.ts`.

### ⬜ Fase 7 — Limpieza

- `window.location.assign` → navegación normal de Next. **Beneficio de paso**:
  hoy cada salto entre Mi cuenta y un panel es una recarga completa de
  documento; con rutas relativas vuelve a ser navegación de cliente.
- Quitar la rama `isAdminSubdomain` del proxy §3 cuando ya no llegue tráfico.
- ~~Borrar `WrongScopeHint`~~ — hecho ya en la fase 4: con el origen único
  el aviso pasaba a mentir, no podía esperar.
- Simplificar `form-action` en la CSP.

### ✅ Fase 8 — Leogin Desktop · HECHA (y estaba mal colocada en este plan)

**No era cola larga: era una rotura directa de las fases 4 y 5.** Se descubrió
al ir a abrir la fase 6.

`is_panel_location()` en `main.rs` reconocía el panel por el subdominio
`<slug>-admin.<raíz>` o por la ruta `/admin/…` — y, sobre todo, **rechazaba de
entrada cualquier URL del mismo origen que el login central**:

```rust
if url.origin() == central.origin() { return false; }
```

Con el origen único el panel vive EXACTAMENTE en ese origen, así que la app de
escritorio habría dejado de reconocer el panel: `detect_resolved_panel()` solo
adopta lo que reconoce, o sea que la PC "no reconocería" la cuenta al arrancar y
volvería a pedir login en cada inicio. **Es el mismo fallo que ya se sufrió al
migrar a distleogin.com**, y está documentado en la nota de `CENTRAL_LOGIN_URL`.
Habría vuelto en espejo.

Corregido reconociendo `/panel/<slug>` **antes** del rechazo por origen (la ruta
no es ambigua, no hace falta esa protección para descartar el login), y lo mismo
en el `isPanel` de la telemetría del shell, que si no dejaba de mandar el latido.

`main.rs` **no tenía ninguna prueba**. Ahora tiene 6, cubriendo las tres formas
de URL que ha tenido el panel y lo que NO debe adoptar (login central, Mi
cuenta, `/panel` a secas, el hub local, las páginas de la app). `cargo test`
en verde.

⚠️ **Necesita instalador nuevo**: el arreglo vive en el binario, así que las PCs
ya instaladas siguen con la versión vieja hasta que se publique la actualización.

### ⬜ Fase 9 — Supabase Auth

La lista de Redirect URLs es **manual** (ya rompió el login con Google al migrar
de dominio). Hoy necesita `https://*-admin.distleogin.com/**`; después basta el
dominio raíz. **No quitar el viejo** hasta que el 308 lleve meses sin tráfico.

### ⬜ Fase 10 — Avisar a los dueños

Quien tenga el ícono instalado desde `-admin` seguirá funcionando por el 308,
pero **seguirá viendo la barra**, porque un 308 cruza origen igual. Hay que
pedirle que borre el acceso y lo agregue de nuevo. Se reusa
`LeoginInstallBanner`, que ya existe y ya sabe hacerlo.

---

## 6. Lo que no cambia

- El menú público del comensal (`<slug>.distleogin.com`) y su PWA con la marca
  del restaurante.
- El link estable de mesa `/m/<id>/` — los QR y NFC ya impresos siguen válidos.
- El DNS: el wildcard `*` ya está y sigue haciendo falta.
- **RLS y la base de datos: nada.**

---

## 7. Fase 0, cerrada — el bug de `localhost`

Reportado como: *"le doy en Continuar como y abre localhost"*. Reproducido
contra producción **antes** de tocar código:

```
GET https://distleogin.com/admin/logout-operator
→ 307  location: https://localhost:10000/admin/login
```

**Causa.** `request.url` y `request.nextUrl.origin` no sirven detrás del proxy
de Render: ahí Next ve la petición ya reenviada al puerto interno del contenedor
(10000 es el puerto por defecto de Render). Cuatro rutas los usaban para armar
un `Location:` absoluto.

**Por qué se veía justo al pulsar "Continuar como".** La sesión de Supabase
puede seguir viva días, pero los layouts aplican su propia ventana de 30 minutos
de inactividad. Al volver después de un rato: Continuar como → `/mi-cuenta` → el
candado rebota a `/admin/logout-operator` → `localhost:10000`. Volver atrás y
escribir la contraseña "lo arreglaba" solo porque un login nuevo reinicia ese
reloj. De ahí el *"solo la primera vez"*.

**Corregido:**

- `lib/public-origin.ts` (nuevo) — única fuente de verdad del origen público,
  con el dominio configurado como red de seguridad. 7 pruebas.
- `admin/logout-operator` — el del reporte.
- `admin/auth/verificar` y `admin/auth/recuperar` — los enlaces del correo.
- `api/icon/[slug]` — el ícono de la PWA quedaba roto cuando el restaurante no
  tenía uno propio.
- Los dos callbacks de Google, que ya lo hacían bien a mano, ahora usan el mismo
  ayudante para que no se separen con el tiempo.

**Y el defecto de fondo:** "Continuar como {nombre}" se ofrecía para una sesión
que la pantalla siguiente iba a rechazar por inactividad. Ahora
`getResumeSession()` mira el mismo reloj que los layouts.

---

## 8. Estado

| Fase | Estado |
|---|---|
| 0 · Bug de `localhost` | ✅ hecha |
| 1 · Proxy entiende `/panel/<slug>` | ✅ hecha y verificada |
| 2 · Manifest | ✅ hecha (ya activa) |
| 3 · Prefijar los enlaces del panel | ✅ hecha y verificada |
| 4 · `adminUrl()` → ruta | ✅ hecha y verificada |
| 5 · 308 del subdominio viejo | ✅ hecha |
| 6 · Cookies | ⛔ **bloqueada** — ver §5, no es prioridad sino corrección |
| 7 · Limpieza | ⬜ cola larga |
| 8 · Leogin Desktop | ✅ hecha · **necesita instalador nuevo** |
| 9-10 · Supabase Auth, aviso a dueños | ⬜ antes/después de desplegar |

Nada committeado todavía. 569 pruebas del web + 6 de Rust, typecheck y lint en verde.

**El origen único está completo y es seguro desplegar**: entrar a un
restaurante desde Mi cuenta no cambia de origen, y el subdominio viejo —con los
íconos ya instalados en él— sigue funcionando por el 308.

Lo que queda son fases de cola larga. La 6 (cookies) es la única peligrosa y
**no se toca hasta que el 308 lleve meses sin tráfico**.
