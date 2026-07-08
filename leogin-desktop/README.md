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

1. Descargar `Leogin_<v>_x64-setup.exe` e instalar (doble clic, sin admin —
   NSIS `perUser`, mismo modelo Spotify/Slack).
2. Abrir Leogin → escribir la dirección del panel (la misma del navegador) →
   iniciar sesión como siempre.
3. Si esa PC va a imprimir / operar sin internet: instalar el servicio desde
   el panel (**Impresión → Agente Leogin**) — solo una PC por local.

SmartScreen avisará la primera vez ("Más información → Ejecutar de todos
modos") mientras no haya certificado de firma de código.
