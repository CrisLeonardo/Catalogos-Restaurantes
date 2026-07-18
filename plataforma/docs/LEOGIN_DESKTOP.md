# Leogin Desktop — la app instalable del restaurante

> Documento de arquitectura (2026-07-08). Código en [`leogin-desktop/`](../../leogin-desktop/).
> Complementa [ESTRATEGIA_INSTALABLE.md](./ESTRATEGIA_INSTALABLE.md) (§4 "de
> daemon a producto" — este es ese horizonte, ejecutado) y
> [ARQUITECTURA_OFFLINE.md](./ARQUITECTURA_OFFLINE.md) (la capa de datos).

## 1. Qué es y por qué existe

Antes de esto, el componente instalado de Leogin era el **Agente de impresión**
(`agente-impresion/`): un daemon invisible, técnico, que el cliente percibía
como "un programa raro que hay que instalar". Funcionaba, pero no *parecía* un
producto.

**Leogin Desktop** invierte la percepción: lo que el restaurante instala es
**Leogin** — un ícono en el menú Inicio, una ventana con su panel, presencia en
la bandeja del sistema y actualizaciones con un toast elegante (modelo Claude
Desktop). El agente pasa a ser lo que siempre debió ser: un servicio interno
del que nadie tiene que acordarse.

## 2. La regla de oro: ventana ≠ servicio

La decisión de diseño más importante de todo el proyecto:

| | Leogin Desktop (este repo) | LeoginAgent (`agente-impresion/`) |
|---|---|---|
| Naturaleza | **Cliente** con ventana | **Servicio** sin UI |
| Vive | Mientras el usuario lo quiera abierto (bandeja) | SIEMPRE (Tarea Programada + watchdog) |
| Si se cierra | No pasa nada: solo se oculta la ventana | El restaurante pierde impresión y modo offline |
| Se actualiza | Toast visible "Reiniciar ahora" (opt-in) | Silencioso (nadie debe operarlo) |
| Contiene | CERO lógica de negocio | Impresión ESC/POS, cola offline, KDS local |

Fusionarlos habría significado que cerrar la ventana matara la impresión del
local. Por eso la app **solo observa** al agente por su
`http://127.0.0.1:47100/health` y jamás lo reemplaza. Instalación: la app se
instala en todas las PCs que se quiera; el agente **solo en una** por local.

## 3. La ventana carga la web alojada (no una copia empaquetada)

La ventana principal navega a `https://<panel-del-restaurante>/admin` — la
misma web de siempre, con su sesión, su service worker y su PWA offline. En
consecuencia:

- **Cada deploy web llega al instante** a todas las apps instaladas. No hay
  "versión vieja del panel dentro del exe", no hay matriz de compatibilidad.
- El exe solo se actualiza cuando cambia el *shell* (ventana/bandeja/updater),
  o sea, pocas veces — por eso el toast de actualización no es molesto.
- El shell queda tan tonto que auditar su seguridad es trivial (ver §6).

## 4. Componentes

```
leogin-desktop/
├── ui/                       ← páginas locales (HTML/CSS/JS puro, withGlobalTauri)
│   ├── index.html            arranque: ¿hay panel configurado? ¿hay nube?
│   ├── offline.html          respaldo sin nube (estado del hub + auto-retorno)
│   └── toast.html            toast de actualización (ventana propia)
├── src-tauri/src/main.rs     ← todo el shell (un solo archivo, ~600 líneas)
├── src-tauri/tauri.conf.json identidad, NSIS, endpoint+pubkey del updater
├── src-tauri/capabilities/   ACL (ver §6)
└── scripts/publish-release.mjs
```

### 4.1 Flujo de arranque

1. La ventana `main` SIEMPRE abre `index.html` (local) — así nunca se ve el
   error feo del WebView si no hay internet.
2. `index.html` pregunta a Rust (`get_setup_info`):
   - **Sin configurar** → pantalla con un solo botón: "Iniciar sesión con tu
     cuenta de Leogin" (navega a `CENTRAL_LOGIN_URL`,
     `https://leogin.online/admin/login` — sin tenant). No hay alternativa de
     URL manual (se quitó 2026-07-10, ver §8 ítem 8 — sin dominios propios
     soportados hoy, esa opción no resolvía ningún caso real y solo
     confundía).
     - **Login central (por defecto, 2026-07-09):** la propia web ya resuelve
       sola el restaurante — `login()` en `plataforma/src/lib/actions/auth.ts`
       busca `profile.restaurant_id` y redirige a `<slug>-admin.<root>` tras
       autenticar SIEMPRE que ese slug no sea ya el del subdominio actual
       (fix 2026-07-10, ítem 10 — antes solo redirigía si el login se hacía en
       la raíz, así que loguearse con la cuenta de un restaurante B mientras
       la ventana estaba en el subdominio de un restaurante A se quedaba en A;
       misma cookie de sesión compartida en todo el dominio raíz, ver
       `proxy.ts`). Rust nunca ve ni pide esa dirección: el hook
       `on_navigation` de la ventana `main` (`detect_resolved_panel` en
       `main.rs`) **sigue el panel que la ventana realmente usa** (regla
       v0.3.0, ítem 11 de §8 — reemplaza la detección por ruta `/admin`,
       que solo era cierta en local): si la navegación aterriza en una URL
       de panel según `is_panel_location` — subdominio `<slug>-admin.<root
       del login central>` con CUALQUIER ruta (producción: el proxy
       reescribe `/menu` → `/admin/menu` POR DENTRO y el navegador nunca
       muestra `/admin`), o ruta `/admin` (local / montaje por ruta) — y
       no es una página de login, ese origen se adopta como `panel_url`
       (persiste, autoarranque), TAMBIÉN cuando ya había otro guardado.
       "Cambiar de cuenta" deja de ser un flujo especial: inicias sesión
       con la otra cuenta desde donde sea, el backend redirige a su panel
       (fix cross-tenant v0.2.3) y la PC lo sigue. El login central es
       `CENTRAL_LOGIN_URL` salvo que `LEOGIN_CENTRAL_LOGIN_URL` lo
       sobreescriba (mismo patrón que `LEOGIN_UPDATE_URL`). Además la web
       ofrece **"Continuar como {nombre}"** en el login cuando ya hay
       sesión de personal viva en el dominio (`getResumeSession()` en
       `src/lib/auth/resume.ts`) — abrir el login central con la cookie
       compartida ya iniciada no vuelve a pedir la contraseña.
       Para probarlo en local:
       ```powershell
       cd leogin-desktop
       $env:LEOGIN_CENTRAL_LOGIN_URL = "http://localhost:3000/admin/login"
       npm run dev
       ```
   - **Configurado** → `boot`: ¿responde la nube? (DOS sondas de 5 s — una
     sola daba falsos "sin conexión" en WiFi lentos recién encendida la PC)
     → navega a `…/admin`; si no → `offline.html`.
3. El login es el del panel web de siempre (correo/contraseña del staff). La
   sesión persiste en el perfil del WebView2 igual que en un navegador.

### 4.2 Bandeja del sistema

- Ícono Leogin con **punto de estado** dibujado en runtime (overlay RGBA):
  🟢 nube conectada · 🟡 sin nube pero hub activo (modo local) · 🔴 sin nube y
  sin hub · sin punto = sin configurar.
- Sonda cada 8 s: `GET <panel>/favicon.ico` (alcanzabilidad de nube, cualquier
  respuesta HTTP cuenta) + `GET 127.0.0.1:47100/health` (hub).
- Menú: Abrir Leogin · [línea de estado en vivo] · Estado del modo local
  (con guarda: sin hub instalado muestra un diálogo explicativo en vez de
  navegar a una página de error) · Buscar actualizaciones · Cambiar de
  cuenta o restaurante · Salir de Leogin.
- **Cerrar la ventana la oculta** (`prevent_close + hide`); salir de verdad
  solo desde la bandeja. Instancia única: relanzar el exe enfoca la existente.

### 4.3 Auto-update con toast (modelo Claude Desktop)

1. Cada hora (y a los 20 s del arranque) el shell consulta el endpoint fijo
   `…/releases/download/desktop-latest/latest.json` (GitHub Releases, repo
   público de binarios — el mismo del agente).
2. Si hay versión nueva: **descarga y verifica la firma minisign en segundo
   plano** (llave del updater de Tauri, gratis e independiente de
   Authenticode), y solo entonces muestra el toast — ventana propia sin
   bordes, siempre visible, esquina inferior izquierda:
   *"Actualización lista (vX.Y.Z) — Reiniciar ahora / Después"*.
3. "Reiniciar ahora" ejecuta el NSIS en modo pasivo y relanza. "Después" lo
   oculta; reaparece en el próximo chequeo (~1 h), como hace Claude.
4. El manifest rodante se regenera con `npm run release` (ver README). No usa
   el "latest" nativo de GitHub porque el repo mezcla tags `agent-v*` y
   `desktop-v*`.

Contraste deliberado con el agente: el **servicio** se actualiza en silencio
(su operador es nadie); la **app** pide permiso con el toast (su operador está
enfrente y puede estar a media comanda).

**El mismo ciclo horario también mantiene al día el SERVICIO local**
(`maybe_update_agent`, 2026-07-10, pedido del usuario: "si se actualiza, se
actualiza junto al desktop"): si el hub de esta PC responde y su versión es
menor que el último release `agent-v*` de GitHub, el shell descarga el exe,
le pone al lado el `config.local.json` de la instalación actual (misma
config, ningún token nuevo) y lo lanza con el comando `update`
(autoinstalación silenciosa, agente ≥0.7.0 — a versiones anteriores no se
les dispara para no provocar sus MessageBox en medio del servicio). Es
deliberadamente redundante con el auto-update de nube del propio agente
(updater.ts): aquel depende de que la nube tenga el release cargado
(migración 065); este solo necesita GitHub — el mismo origen del que la
vinculación por sesión ya instala. Una tentativa por versión por corrida del
shell.

### 4.4 Respaldo sin nube

Si el panel no responde, la ventana cae a `offline.html`, que:

- muestra si el **modo local** (hub) está activo — recordando que los
  pedidos y la impresión siguen andando solos;
- con hub activo, el CTA principal es **"Continuar en modo local — pantalla
  de cocina"**: navega DIRECTO al KDS de respaldo con su token
  (`get_kds_url`), sin pasar por la página técnica de estado (que queda como
  botón secundario);
- permite "intentar abrir el panel de todos modos" (el service worker del PWA
  puede tener el admin cacheado);
- reintenta la nube cada 5 s y **regresa sola al panel** cuando vuelve; el
  hub se resondea también cada 5 s;
- enlaza "Cambiar de cuenta o restaurante" (`index.html?setup=1`) como
  salida de rescate.

### 4.5 Vinculación por sesión ("esta PC será el servidor")

Roadmap §8.1, ejecutado 2026-07-08. Dentro del panel (sección Impresión), si
`window.__TAURI__` existe (o sea, se está viendo la página DENTRO de Leogin
Desktop) aparece un botón que hace en un clic lo que antes eran 3 pasos
manuales de `agente-impresion/`:

1. El panel genera un token de instalación con la sesión ya autenticada
   (`regenerateAgentToken`, la misma server action del flujo manual).
2. Invoca `install_agent_as_server(apiUrl, token)` — comando expuesto al
   panel remoto vía ACL (ver §6). El comando revalida que la llamada venga
   REALMENTE del origen configurado como `panel_url` (no de cualquier
   http(s) que la ventana pudiera llegar a mostrar) antes de continuar.
3. Rust busca el último release público del AGENTE (`agent-v*`,
   `CrisLeonardo/leogin-agente-releases`, API pública de GitHub — incluso
   sin firma Authenticode), lo descarga a una carpeta TEMPORAL (no la de
   instalación) junto a un `config.local.json` con `{apiUrl, token}` — el
   "Plan B" que `agente-impresion/src/config.ts` ya sabía leer — y lo lanza
   con el nombre `LeoginAgent-installer.exe` (**no** `LeoginAgent.exe` —
   ver bug abajo).
4. El propio agente, al arrancar fuera de su carpeta instalada, se
   autoinstala solo (`runSetup()`: copia a `%LOCALAPPDATA%`, tarea
   programada, firewall, "Aplicaciones instaladas") — el MISMO camino ya
   probado del instalador manual, cero código nuevo de instalación.

No reemplaza el instalador manual (`~LG2~<dominio>~<código>~.exe` desde el
navegador, migración 066) — sigue siendo necesario para quien instala desde
un navegador normal, no desde la app. Los dos conviven en
`print-agent-settings.tsx`.

**Bug encontrado y corregido en verificación (2026-07-08): auto-eliminación
del instalador.** `setup.ts::stopExisting()` cierra la instancia YA instalada
con `taskkill /im LeoginAgent.exe /f /t` — coincide por NOMBRE DE IMAGEN, no
por PID. Si el instalador temporal se llama exactamente igual
(`LeoginAgent.exe`), taskkill lo mata a **sí mismo** a mitad de la
instalación: salida silenciosa con código 1, sin excepción de JS que
capturar (es `TerminateProcess`, no un error de Node) — costó una ronda de
diagnóstico porque ni `uncaughtException` ni `unhandledRejection` lo
detectan. El instalador manual nunca pisó este caso porque el panel siempre
le pone al descargable un nombre distinto (slug + código, migración 066).
Fix: el archivo temporal se llama `LeoginAgent-installer.exe` (sigue
cumpliendo `looksPackaged` en `index.ts` porque empieza con "leogin"). De
paso se agregaron manejadores globales `uncaughtException`/
`unhandledRejection` en `agente-impresion/src/index.ts` — un SEA empaquetado
no debe poder morir en silencio.

**Verificación real (2026-07-08, contra Supabase local + `azucar-negra`
demo):** con el fix, el ciclo completo (botón → token → descarga real desde
GitHub → instalador lanzado → `stopExisting` ya no se autoelimina) se
confirmó por log, sin el error de ACL ni el crash silencioso. La última
milla — que el agente reinstalado reporte `● Conectado` — no se pudo cerrar
en esta sesión: la verificación local usó `http://localhost:3000` como
`panel_url` (Rust/reqwest no resuelve subdominios `*.localhost` en esta
PC — confirmado con `nslookup`, es una limitación del resolver de Windows,
no de la app), pero tras iniciar sesión el panel redirige a
`azucar-negra.localhost:3000`; la verificación de origen del comando
(`caller_origin != configured`, ver arriba) correctamente lo rechazó
("Origen no autorizado") por ser un origen distinto al configurado — el
chequeo hizo exactamente lo que debía. En producción no aplica: el
`panel_url` que un restaurante configura YA es su dominio real, sin ese
salto demo→subdominio. Pendiente si se quiere cerrar el 100 %: repetir la
prueba con `panel_url` apuntando directo al subdominio del tenant (requiere
resolver ese dominio también desde Rust, p. ej. una entrada en el hosts de
Windows — cambio de sistema que no se hizo sin pedirlo explícitamente).

### 4.6 Modo kiosco (`--kds`)

Roadmap §8.2, ejecutado 2026-07-08. Un acceso directo con el argumento
`--kds` arranca una ÚNICA ventana fullscreen sin bandeja ni toast de
actualización, pensada para la pantalla dedicada de cocina:

1. `kds.html` (local) pregunta a Rust `get_kds_url` cada 2.5 s hasta obtener
   respuesta.
2. Rust pide `GET 127.0.0.1:47100/` (la página de estado del hub, ya
   pública en la LAN) y extrae la ruta `/kds?t=…` de su HTML — sin depender
   de ningún endpoint nuevo del agente ni de un crate de regex.
3. En cuanto responde, `kds.html` navega de lleno a
   `http://127.0.0.1:47100/kds?t=…` — a partir de ahí es la propia pantalla
   de cocina del hub (`agente-impresion/src/kds.ts`), con su propio
   polling/reconexión ya probados en la Fase 2 offline.

No necesita `panel_url` configurado: el modo kiosco es puramente sobre el
hub de ESTA PC, no sobre la nube.

### 4.7 Telemetría mínima del shell

Roadmap §8.5, ejecutado 2026-07-08 (migración 067). Antes solo el AGENTE
reportaba su versión (`print_agents.agent_version`, vía su propio
heartbeat). El shell reporta la SUYA por separado
(`print_agents.shell_version` + `shell_last_seen_at`), visible en
`print-agent-settings.tsx` junto al estado de conexión.

El mecanismo es deliberadamente simple: al construir la ventana `main`,
Rust inyecta la versión como literal dentro de un script de inicialización
(`SHELL_TELEMETRY_JS_TEMPLATE`) que — solo cuando la página cargada es
`/admin/…` — hace `fetch('/api/agent/shell-heartbeat', {credentials:
'include'})` cada 30 min. Es un fetch normal de la propia página del panel,
autenticado por su cookie de sesión: sin IPC, sin ACL nueva (ver §6). La
ruta hace `UPDATE` (nunca `INSERT`): si el restaurante nunca vinculó el
agente de impresión no hay fila `print_agents` (su `token_hash` es
`NOT NULL`) y no hay dónde reportar todavía — comportamiento esperado, no
un error.

## 5. Distribución e instalación

- `Leogin_<v>_x64-setup.exe` — NSIS `perUser` (`%LOCALAPPDATA%`, sin UAC,
  modelo Spotify/Slack), acceso en menú Inicio, entrada en "Aplicaciones
  instaladas", desinstalador real. Instalador con marca propia: header/sidebar
  del wizard NSIS generados con el mark de Leogin (`leogin-desktop/scripts/
  generate-installer-art.mjs`, `npm run art` — sin dependencias, dibuja el
  mismo gradiente y path que `leogin-logo.tsx` y escribe BMP 24-bit crudo,
  el único formato que acepta `MUI_HEADERIMAGE_BITMAP`/
  `MUI_WELCOMEFINISHPAGE_BITMAP`).
- **Descarga pública (2026-07-10): `leogin.online/descargas`.** Antes el
  único punto de entrada era el botón dentro de `/admin/escritorio`, detrás
  de sesión — un problema de huevo y gallina para alguien que todavía no
  tiene cuenta abierta en esa PC. `GET /api/desktop/download-exe` dejó de
  exigir `getAdminContext()`: el release de GitHub del que sale el binario
  YA es público, así que el gate no protegía nada, solo agregaba fricción.
  Ambos puntos de entrada (`/admin/escritorio` con sesión, `/descargas` sin
  sesión) pegan al mismo endpoint — una sola fuente de verdad de versión.
- Releases: `npm run release` publica en `CrisLeonardo/leogin-agente-releases`
  (tags `desktop-v*` + rodante `desktop-latest`). Mismo flujo `gh` que el
  agente. **Alternativa (2026-07-10): `.github/workflows/release-desktop.yml`**
  corre exactamente ese mismo flujo (build + firma minisign + publish) en un
  runner de GitHub Actions en vez de la PC local — evita los crashes de
  `rustc` por RAM limitada al compilar Tauri localmente. Manual
  (`workflow_dispatch`), requiere 3 secrets del repo (llave del updater +
  contraseña + un PAT con escritura sobre el repo de releases). Detalle y
  comandos exactos en `leogin-desktop/README.md`.
- **Firma de código: pendiente a propósito** hasta el primer cliente de pago
  (decisión 2026-07-08, reafirmada 2026-07-10 al replantear el instalador:
  se priorizó la descarga pública + CI antes que el gasto recurrente).
  Mientras tanto SmartScreen avisa la primera vez; el camino sigue siendo
  ESTRATEGIA_INSTALABLE.md §3.1 (Azure Trusted Signing). OJO: la llave del
  **updater** (minisign) es otra cosa, ya existe y vive en
  `%USERPROFILE%\.tauri\leogin-desktop.key` — si se pierde, las apps
  instaladas no aceptan más updates.

## 6. Seguridad del shell

- **ACL de Tauri, por comando** (no solo por plugin): `src-tauri/build.rs`
  declara un `AppManifest` con la lista explícita de comandos propios del
  shell — esto genera un permiso `allow-<comando>` por cada uno y activa la
  verificación de ACL de Tauri también para comandos NO-plugin (sin esto,
  Tauri v2 solo audita plugins como `dialog`/`updater`/`opener`; los
  comandos que uno mismo escribe en `main.rs` quedan alcanzables desde
  CUALQUIER contenido, local o remoto — confirmado leyendo el propio código
  fuente de `tauri` en `~/.cargo/registry`, no por documentación).
  - `capabilities/default.json` (páginas locales: `main` + `update-toast`)
    tiene `core:default` + `opener:default` + `allow-*` de los 10 comandos
    que esas páginas realmente usan (`boot`, `save_panel_url`,
    `apply_update`, `get_kds_url`, …).
  - `capabilities/remote-panel.json` (el panel alojado y el hub local, ambos
    `http(s)://*` en la ventana `main`) solo tiene `opener:default` +
    `allow-install-agent-as-server` — es decir, sigue siendo cierto que el
    contenido remoto no puede tocar `apply_update`, `save_panel_url`, etc.
    La ÚNICA función nueva expuesta a remoto además revalida en Rust que la
    llamada venga del origen configurado como `panel_url` (ver §4.5) —
    defensa en profundidad por si algún día la capability se vuelve más
    laxa por error.
- Un script de inicialización intercepta `target=_blank` / `window.open` y
  manda esos enlaces (WhatsApp, comprobantes…) al navegador del sistema — la
  ventana nunca "se escapa" del panel.
- El shell no guarda credenciales: la sesión es la cookie del panel dentro del
  perfil WebView2 del usuario de Windows.
- La telemetría del shell (§4.7) NO usa IPC ni un comando nuevo: es un
  `fetch` normal hecho DESDE la propia página del panel (mismo origen, misma
  cookie de sesión) — cero superficie nueva de ACL.

## 7. Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Tauri v2 (~10 MB, WebView2 del sistema) | Electron (~150 MB + RAM alta) | Ya evaluado en ESTRATEGIA_INSTALABLE.md §4; en una PC de caja con 8 GB importa |
| Shell aparte del agente | Fusionar agente dentro de la app | Cerrar la ventana no puede matar la impresión (§2) |
| Cargar panel alojado | Empaquetar la UI en el exe | Cero desfase de versiones; deploys web instantáneos (§3) |
| Toast opt-in para la app | Update silencioso también en la app | El cajero puede estar a media comanda; el servicio sí es silencioso |
| Tag rodante `desktop-latest` | `releases/latest` nativo de GitHub | El repo de binarios mezcla `agent-v*` y `desktop-v*` |
| Config "dirección del panel" a mano | Instalador con dominio en el nombre (LG2) | La app es genérica y multi-restaurante; el pairing fino vendrá con la sesión (§8) |

## 8. Hoja de ruta

1. ~~**Vinculación por sesión**~~ — ✅ 2026-07-08, ver §4.5.
2. ~~**Modo kiosco KDS**~~ — ✅ 2026-07-08, ver §4.6.
3. ~~**Retiro de la marca "Agente"**~~ — ✅ 2026-07-08: el panel habla de
   "Leogin en tu PC" / "el servicio de Leogin"; la sección Impresión
   promueve "Descargar Leogin para tu PC" como CTA principal. El daemon
   (`agente-impresion/`) mantiene su nombre técnico internamente — sus
   propios diálogos nativos (`«Agente instalado correctamente»`) no se
   tocaron en este pase (requeriría republicar el agente; queda para
   cuando se retoque ese componente por otra razón).
4. **Firma Authenticode** al primer cliente (§3.1 de la estrategia) — firma
   el NSIS y el exe del agente con el mismo certificado. Único pendiente.
5. ~~**Telemetría mínima**~~ — ✅ 2026-07-08, ver §4.7 (migración 067).
6. ~~**Descarga pública + instalador con marca + CI**~~ — ✅ 2026-07-10:
   `leogin.online/descargas` (sin sesión), endpoint de descarga público,
   header/sidebar del NSIS con el mark de Leogin, pipeline en GitHub Actions
   (`release-desktop.yml`) como alternativa al build local. Ver §5.
   `/admin/escritorio` (Paso 2) y el README tenían copia desactualizada que
   describía solo el flujo manual de dirección de panel — corregida para
   reflejar que "Iniciar sesión con tu cuenta de Leogin" ya es (y era desde
   2026-07-09) el flujo primario. La firma de código se evaluó de nuevo y se
   decidió mantenerla pendiente (ver §5).
7. ~~**"Cambiar dirección del panel" ofrecía SOLO la URL manual**~~ — ✅
   2026-07-10 (bug real, reportado por el usuario con el ejemplo de Netflix:
   "yo solo quiero entrar con correo y contraseña, nunca pedirle una URL").
   El menú de la bandeja (`?setup=1`) saltaba directo al formulario de
   dirección, sin mostrar nunca el botón de login central — la ÚNICA forma
   de reconectar una PC ya configurada era copiar una URL a mano, aunque el
   primer arranque sí ofreciera la cuenta. Requirió un comando nuevo,
   `begin_relink` (olvida el `panel_url` viejo SOLO EN MEMORIA antes de
   mandar al login central, para que `detect_resolved_panel` no lo encuentre
   `already_set` y sí adopte el restaurante nuevo) — sin esto, re-loguearse
   con otra cuenta habría funcionado visualmente una vez pero la PC habría
   seguido arrancando al restaurante viejo en el siguiente inicio. Verificado
   end-to-end: PC con `panel_url` apuntando al restaurante equivocado →
   "Cambiar dirección del panel" → login con cuenta → `panel_url` quedó
   correctamente sobrescrito.
8. ~~**La URL manual "confunde más de lo que ayuda"**~~ — ✅ 2026-07-10,
   segunda vuelta a pedido explícito del usuario: sin ningún dominio propio
   soportado hoy (`adminUrl()` en `tenant.ts` siempre arma
   `<slug>-admin.leogin.online`, nunca un dominio arbitrario), la opción
   "ingresar la dirección manualmente" no resolvía ningún caso real — solo
   agregaba una segunda forma de hacer lo mismo que ya hacía el login,
   invitando a confusión ("¿cuál uso?"). Se quitó por completo: comando
   `save_panel_url`, su capability y el formulario/link en `ui/index.html`.
   `normalize_panel_url()` se conserva porque también valida el origen del
   caller en `install_agent_as_server` — no es exclusiva del formulario que
   se quitó.
9. ~~**Única forma de "cambiar de cuenta" era clic derecho en icono oculto de
   la bandeja**~~ — ✅ 2026-07-10. Se agregó un menú nativo de ventana
   ("Cuenta → Cambiar de cuenta o restaurante", `app.set_menu` +
   `app.on_menu_event` en `main.rs`) que dispara el mismo flujo que la
   bandeja — visible en la barra de la ventana, no escondido.
10. ~~**Cuenta nueva de OTRO restaurante "no reconocida" en el desktop
    (sí en la web)**~~ — ✅ 2026-07-10, bug real en `auth.ts::login()`: la
    redirección al subdominio correcto solo se disparaba cuando
    `isRootDomain` (login hecho en `leogin.online`, sin subdominio). Si el
    login se hacía ya posicionado en el subdominio de OTRO restaurante —
    justo el caso común en desktop, donde `boot()` deja la ventana en el
    último `panel_url` guardado — el redirect quedaba relativo
    (`/admin/menu` en el host equivocado), y el candado de tenant de
    `(protected)/layout.tsx` mandaba al menú PÚBLICO del restaurante viejo en
    vez de al panel del nuevo. Cambiado a comparar el slug real del perfil
    contra el `tenantSlug` actual (sin importar si es la raíz o el
    subdominio de un tercero) — mismo código sirve web y desktop por igual.
11. ~~**La adopción del panel NUNCA disparaba en producción**~~ — ✅
    2026-07-10 (v0.3.0), el otro pedazo del mismo reporte del usuario:
    `detect_resolved_panel` exigía que la RUTA empezara con `/admin`, cierto
    solo en local (`<slug>.localhost:3000/admin/…`). En producción el panel
    vive en `<slug>-admin.leogin.online` y el proxy reescribe `/menu` →
    `/admin/menu` POR DENTRO — el navegador nunca muestra `/admin`, así que
    tras el login central la PC no guardaba nada y al siguiente arranque
    volvía a pedir sesión ("no me reconoce"). La MISMA condición rota estaba
    en `SHELL_TELEMETRY_JS_TEMPLATE` (la telemetría del shell jamás se envió
    en producción). Fix: `is_panel_location()` reconoce el subdominio
    `*-admin` del dominio raíz del login central (cualquier ruta) además de
    la ruta `/admin`, y la adopción ahora SIGUE los cambios de panel (ver
    §4.1) — `begin_relink` quedó solo como fuente de la URL del login
    central.
12. ~~**Barra de menú nativa "Cuenta"**~~ — ✅ retirada 2026-07-10, el mismo
    día que se agregó (ítem 9): feedback directo del usuario — "se ve mal,
    uno no sabe que es un botón ni por qué está ahí". Con la adopción que
    sigue al login (ítem 11) ya no hace falta puerta dedicada; la bandeja
    conserva "Cambiar de cuenta o restaurante" (antes "Cambiar dirección del
    panel" — también renombrada) y `?setup=1` ganó un botón "Volver a mi
    panel" para no ser un callejón sin salida.
13. ~~**"Continuar como {nombre}" en el login**~~ — ✅ 2026-07-10: con la
    cookie de personal compartida en el dominio raíz, abrir el login central
    con sesión viva pedía la contraseña otra vez. `getResumeSession()`
    (`src/lib/auth/resume.ts`) resuelve el mismo destino que `login()` sin
    credenciales y ambas páginas de login lo ofrecen como botón primario.
    Complemento web: el candado de tenant de `(protected)/layout.tsx` ahora
    redirige al panel PROPIO del usuario (antes al menú público del
    restaurante equivocado, que se leía como "tu cuenta no existe").
14. ~~**Pulido del respaldo offline y la bandeja**~~ — ✅ 2026-07-10:
    `offline.html` salta DIRECTO al KDS local en un clic (ver §4.4); "Estado
    del modo local" en la bandeja comprueba el hub ANTES de navegar (sin hub
    mostraba la página de error nativa del WebView); `boot()` sondea dos
    veces antes de declarar sin nube; Ctrl +/− y Ctrl+rueda para zoom del
    panel (`zoom_hotkeys_enabled`); versiones de Cargo.toml/package.json
    sincronizadas con tauri.conf.json (el user-agent reportaba 0.2.0).
15. ~~**Servicio local acoplado al desktop (instalación y updates)**~~ — ✅
    2026-07-10, a pedido explícito del usuario ("se instala a la vez que el
    desktop y se actualiza junto a él"). Dos piezas, respetando la regla de
    oro de §2 (ventana ≠ servicio — fusionarlos haría que cerrar la ventana
    matara la impresión, y el servicio necesita cuenta+token que no existen
    durante el NSIS, además de que solo UNA PC por local debe correrlo o se
    imprime doble):
    · **Instalación**: tras iniciar sesión dentro de la app, si el
      restaurante NO tiene servidor vinculado (lo decide la NUBE — la única
      que ve todo el local, no solo esta PC), el dueño ve el banner "¿Esta
      PC será el servidor del local?" (`desktop-server-nudge.tsx`, rendido
      por `(protected)/layout.tsx`, visible solo con `window.__TAURI__`) →
      un clic a `/admin/impresion` donde vive la vinculación por sesión de
      §4.5. Una segunda PC del mismo restaurante nunca recibe la invitación.
    · **Updates**: el ciclo horario del shell también actualiza el servicio
      (ver §4.3, `maybe_update_agent`); requirió el comando `update` del
      agente (autoinstalación silenciosa, `runSetup({silent})`, agente
      v0.7.0).

## 9. Cómo probar en local

```powershell
cd leogin-desktop
npm install
npm run dev
# Dirección del panel en el setup: http://<tenant>.localhost:3000
# (el hub real instalado en esta PC responde en 127.0.0.1:47100 → punto 🟢/🟡)
```

Modo kiosco (requiere el instalador NSIS — `--kds` no tiene sentido con
`tauri dev`, que ya abre su propia ventana de desarrollo):

```powershell
& "$env:LOCALAPPDATA\Leogin\leogin-desktop.exe" --kds
```

Vinculación por sesión: abre `/admin/impresion` dentro de la app (`tauri
dev` sirve, el ACL se compila igual) con un restaurante de prueba — el
botón "Hacer de esta PC el servidor del local" solo aparece cuando
`window.__TAURI__` existe.
