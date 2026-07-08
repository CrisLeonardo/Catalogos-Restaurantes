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
   - **Sin configurar** → formulario: "Dirección de tu panel" (la misma URL
     del navegador). `save_panel_url` la valida contra la red, la persiste en
     `%APPDATA%\com.leogin.desktop\config.json`, activa el autoarranque con
     Windows (oculto, `--hidden`) y navega al panel.
   - **Configurado** → `boot`: ¿responde la nube? → navega a `…/admin`; si no
     → `offline.html`.
3. El login es el del panel web de siempre (correo/contraseña del staff). La
   sesión persiste en el perfil del WebView2 igual que en un navegador.

### 4.2 Bandeja del sistema

- Ícono Leogin con **punto de estado** dibujado en runtime (overlay RGBA):
  🟢 nube conectada · 🟡 sin nube pero hub activo (modo local) · 🔴 sin nube y
  sin hub · sin punto = sin configurar.
- Sonda cada 8 s: `GET <panel>/favicon.ico` (alcanzabilidad de nube, cualquier
  respuesta HTTP cuenta) + `GET 127.0.0.1:47100/health` (hub).
- Menú: Abrir Leogin · [línea de estado en vivo] · Estado del hub local ·
  Buscar actualizaciones · Cambiar dirección del panel · Salir de Leogin.
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

### 4.4 Respaldo sin nube

Si el panel no responde, la ventana cae a `offline.html`, que:

- muestra si el **hub local** está activo (y su versión) — recordando que los
  pedidos y la impresión siguen andando solos;
- da acceso a la página de estado del hub (`127.0.0.1:47100/`), que ya enlaza
  al **KDS de respaldo** con su token;
- permite "intentar abrir el panel de todos modos" (el service worker del PWA
  puede tener el admin cacheado);
- reintenta la nube cada 6 s y **regresa sola al panel** cuando vuelve.

## 5. Distribución e instalación

- `Leogin_<v>_x64-setup.exe` — NSIS `perUser` (`%LOCALAPPDATA%`, sin UAC,
  modelo Spotify/Slack), acceso en menú Inicio, entrada en "Aplicaciones
  instaladas", desinstalador real.
- Releases: `npm run release` publica en `CrisLeonardo/leogin-agente-releases`
  (tags `desktop-v*` + rodante `desktop-latest`). Mismo flujo `gh` que el
  agente.
- **Firma de código: pendiente a propósito** hasta el primer cliente de pago
  (decisión 2026-07-08). Mientras tanto SmartScreen avisa la primera vez; el
  camino sigue siendo ESTRATEGIA_INSTALABLE.md §3.1 (Azure Trusted Signing).
  OJO: la llave del **updater** (minisign) es otra cosa, ya existe y vive en
  `%USERPROFILE%\.tauri\leogin-desktop.key` — si se pierde, las apps
  instaladas no aceptan más updates.

## 6. Seguridad del shell

- **ACL de Tauri**: las páginas locales (`main` en páginas propias,
  `update-toast`) tienen `core:default` + `opener:default`. El **panel
  remoto** solo puede invocar UNA cosa por IPC (`capabilities/remote-panel.json`):
  `opener` — abrir enlaces externos en el navegador del sistema. Ni archivos,
  ni shell, ni updater quedan expuestos a contenido remoto.
- Un script de inicialización intercepta `target=_blank` / `window.open` y
  manda esos enlaces (WhatsApp, comprobantes…) al navegador del sistema — la
  ventana nunca "se escapa" del panel.
- Los comandos propios (`save_panel_url`, `apply_update`, …) los usan solo las
  páginas locales empaquetadas.
- El shell no guarda credenciales: la sesión es la cookie del panel dentro del
  perfil WebView2 del usuario de Windows.

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

1. **Vinculación por sesión** (sustituye al código en el nombre del archivo
   para el AGENTE): con el admin ya logueado dentro de la app, un botón
   "Esta PC será el servidor del local" que descargue e instale el agente con
   token provisionado por la sesión — un instalador genérico para todo.
2. **Modo kiosco KDS**: `leogin.exe --kds` para la pantalla de cocina
   (fullscreen, sin bandeja, apuntando al KDS local del hub).
3. **Retiro de la marca "Agente"** en el panel: la sección Impresión hablará
   de "el servicio de Leogin" y ofrecerá "Descargar Leogin para PC" como
   camino principal.
4. **Firma Authenticode** al primer cliente (§3.1 de la estrategia) — firma
   el NSIS y el exe del agente con el mismo certificado.
5. **Telemetría mínima**: versión del shell en el heartbeat del panel (hoy
   solo el agente reporta versión).

## 9. Cómo probar en local

```powershell
cd leogin-desktop
npm install
npm run dev
# Dirección del panel en el setup: http://<tenant>.localhost:3000
# (el hub real instalado en esta PC responde en 127.0.0.1:47100 → punto 🟢/🟡)
```
