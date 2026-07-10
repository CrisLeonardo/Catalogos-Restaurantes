# Leogin Desktop

La **app instalable de Leogin** para la PC del restaurante (Windows). Shell
ligero en Tauri v2: el admin abre "Leogin" desde el menú Inicio, inicia sesión
y trabaja **igual que en la web** — porque ES la web, cargada alojada dentro de
la ventana.

> Documento de arquitectura y decisiones:
> [plataforma/docs/LEOGIN_DESKTOP.md](../plataforma/docs/LEOGIN_DESKTOP.md)

## Qué hace

- **Ventana → panel alojado.** La ventana carga `https://<tu-panel>/admin`
  directo de la nube. Cada deploy web llega al instante; el exe casi nunca
  necesita actualizarse (modelo Claude Desktop / Slack).
- **Bandeja del sistema.** Ícono con punto de estado en vivo:
  🟢 nube conectada · 🟡 sin nube pero hub local activo (modo local) ·
  🔴 sin nube y sin hub. Menú: Abrir, Estado del hub, Buscar actualizaciones,
  Cambiar dirección del panel, Salir.
- **Cerrar ≠ salir.** Cerrar la ventana la oculta a la bandeja; Leogin sigue
  vivo (y arranca con Windows, oculto, tras la primera configuración).
- **Auto-update con toast.** Chequea GitHub Releases cada hora, descarga en
  segundo plano y muestra un toast en la esquina inferior izquierda:
  "Actualización lista — Reiniciar ahora / Después". Nada se instala sin ese
  clic.
- **Respaldo sin nube.** Si el panel no responde, la ventana cae a una página
  local que muestra el estado del hub (LeoginAgent) y regresa sola al panel
  cuando vuelve el internet.
- **"Esta PC será el servidor del local", un clic.** Desde el panel (sección
  Impresión), con la sesión ya iniciada dentro de la app, instala el servicio
  de impresión/offline sin descargar nada a mano.
- **Modo kiosco para cocina.** `leogin-desktop.exe --kds` abre fullscreen
  directo al KDS de respaldo del hub local — sin bandeja, sin setup.

## Qué NO hace (a propósito)

- **No imprime ni captura pedidos offline.** Eso es del **servicio**
  [LeoginAgent](../agente-impresion/) — corre aunque esta app esté cerrada,
  tiene su propio watchdog y su propio auto-update silencioso. Esta app solo
  lo observa por `http://127.0.0.1:47100/health`.
- **No empaqueta la UI del panel.** Cero lógica de negocio en el shell: si el
  panel cambia, no hay exe que publicar.

## Desarrollo

Requisitos: Node ≥ 20, Rust (stable-msvc) y VS Build Tools 2022 con el
workload de C++. WebView2 ya viene con Windows 11.

```powershell
cd leogin-desktop
npm install
npm run dev      # ventana con hot reload de las páginas locales (ui/)
```

Para probar el botón **"Iniciar sesión con tu cuenta de Leogin"** contra tu
Supabase local (en vez de la producción real, a la que apunta por defecto):

```powershell
$env:LEOGIN_CENTRAL_LOGIN_URL = "http://localhost:3000/admin/login"
npm run dev
```

Sin esto, `tauri dev` sigue apuntando a `https://leogin.online/admin/login`
(bug real encontrado 2026-07-10: una PC de prueba quedó con
`panelUrl: "http://localhost:3000"` — el botón de login central era
inútil en local, así que se había tecleado a mano la URL raíz sin el
subdominio del restaurante, y la app nunca reconocía ningún restaurante).

Estructura:

```
leogin-desktop/
├── ui/                    # páginas locales (sin framework, withGlobalTauri)
│   ├── index.html         # arranque: setup 1ª vez / conectando / decide destino
│   ├── offline.html       # respaldo sin nube (estado del hub + auto-retorno)
│   └── toast.html         # toast de actualización (ventana propia sin bordes)
├── src-tauri/
│   ├── src/main.rs        # TODO el shell: bandeja, estado, updater, comandos
│   ├── tauri.conf.json    # identidad, NSIS, endpoint + pubkey del updater
│   └── capabilities/      # ACL: locales (default) + panel remoto (solo opener)
└── scripts/
    └── publish-release.mjs
```

## Compilar el instalador

```powershell
# La CLI exige el CONTENIDO de la llave (la variante _PATH no la lee), y la
# contraseña NO puede ser vacía (Windows borra las variables de entorno
# vacías) — por eso la llave se generó con contraseña, guardada en .key.pass:
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\leogin-desktop.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content "$env:USERPROFILE\.tauri\leogin-desktop.key.pass" -Raw
npm run build
# → src-tauri/target/release/bundle/nsis/Leogin_<version>_x64-setup.exe (+ .sig)
```

La llave firma los PAQUETES DE UPDATE (minisign del updater de Tauri — gratis).
**Respalda `leogin-desktop.key` y `leogin-desktop.key.pass` juntos** (ej. en tu
gestor de contraseñas): si se pierden, las apps ya instaladas no aceptarán más
updates. Es independiente de la firma Authenticode/SmartScreen (pendiente hasta
el primer cliente — ver ESTRATEGIA_INSTALABLE.md §3.1).

## Publicar una versión

1. Sube `version` en `src-tauri/tauri.conf.json` (única fuente de versión).
2. `npm run build` (con las variables de la llave, ver arriba).
3. `npm run release -- --notes "qué cambió"`

El script publica en el repo público de binarios
(`CrisLeonardo/leogin-agente-releases`):

- `desktop-v<version>` → `Leogin_<v>_x64-setup.exe` (+ `.sig`)
- `desktop-latest` → `latest.json` **rodante** (el endpoint fijo que consulta
  el updater; por eso no se usa el "latest" nativo de GitHub, que se mezclaría
  con los releases `agent-v*` del agente).

Las apps instaladas ven la versión nueva en su próximo chequeo (~1 h), la
descargan en silencio y muestran el toast. **Rollback:** re-publicar la versión
anterior (regenera `latest.json` apuntando a ella).

Para probar el ciclo de update SIN publicar: define `LEOGIN_UPDATE_URL` con un
`latest.json` servido en local antes de lanzar la app (los paquetes igual deben
venir firmados con la llave minisign).

## Instalación en un restaurante

1. Descargar desde **leogin.online/descargas** (página pública, sin sesión —
   o desde `Leogin_<v>_x64-setup.exe` directo) e instalar (doble clic, sin
   admin — NSIS `perUser`, mismo modelo Spotify/Slack).
2. Abrir Leogin → **"Iniciar sesión con tu cuenta de Leogin"** (correo y
   contraseña de siempre, el único botón) → la app reconoce sola a qué
   restaurante perteneces y te deja en tu panel. No hay ninguna dirección que
   escribir a mano — se quitó esa opción (2026-07-10): sin dominios propios
   soportados hoy, no resolvía ningún caso real y solo confundía.
3. Si esa PC va a imprimir / operar sin internet: en el panel, sección
   **Impresión**, botón **"Hacer de esta PC el servidor del local"** — solo
   una PC por local.
4. ¿Necesitas conectar esta PC con otra cuenta o restaurante después? Menú
   **Cuenta → Cambiar de cuenta o restaurante** en la barra de la ventana (o
   el ícono de la bandeja del sistema si la ventana está minimizada).

SmartScreen avisará la primera vez ("Más información → Ejecutar de todos
modos") mientras no haya certificado de firma de código (pendiente a
propósito, ver ESTRATEGIA_INSTALABLE.md §3.1 — decisión reafirmada
2026-07-10: se prioriza la descarga pública primero).

## Publicar desde GitHub Actions (recomendado — evita compilar en local)

`.github/workflows/release-desktop.yml` (en la raíz del monorepo) hace lo
mismo que "Compilar el instalador" + "Publicar una versión" de arriba, pero
en un runner de GitHub (soluciona los crashes de `rustc` por RAM limitada en
PCs de desarrollo con poca memoria):

1. Sube `version` en `src-tauri/tauri.conf.json` y haz commit/push.
2. Una sola vez: configura 3 secrets del repo (**Settings → Secrets and
   variables → Actions**) — nunca pegues su valor en un chat, usa tu propia
   terminal:
   ```powershell
   gh secret set TAURI_SIGNING_PRIVATE_KEY --body (Get-Content "$env:USERPROFILE\.tauri\leogin-desktop.key" -Raw)
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body (Get-Content "$env:USERPROFILE\.tauri\leogin-desktop.key.pass" -Raw)
   gh secret set RELEASES_REPO_TOKEN --body "<personal access token con escritura sobre CrisLeonardo/leogin-agente-releases>"
   ```
3. **Actions → "Release Leogin Desktop" → Run workflow** (opcionalmente con
   notas de la versión). Publica igual que `npm run release` local: sube
   `desktop-v<version>` y actualiza el tag rodante `desktop-latest`.

El build también queda como artefacto descargable del run (respaldo si la
publicación falla y no quieres recompilar).
