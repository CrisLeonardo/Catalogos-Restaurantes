# Agente de impresión Leogin

Software puente local, 100% de marca Leogin, que reemplaza a QZ Tray. Recibe
trabajos de impresión desde la nube y los envía a impresoras térmicas (USB, red
o Bluetooth) **sin diálogos del navegador** y funcionando igual desde celular,
tablet o PC.

> El navegador (mesero/cajero) solo manda un JSON a la API. El backend genera los
> bytes ESC/POS y los publica; este agente, corriendo en **una** PC del local,
> los imprime. Por eso funciona idéntico en iOS, Android y Windows.

## Requisitos

- **Node.js ≥ 22** (probado en 24.16). No requiere `npm install` para la fase de
  pruebas: el agente corre TypeScript directo con el *type-stripping* de Node.
- **Windows** (usa el spooler vía PowerShell para impresión RAW). Soporte
  macOS/Linux es un objetivo posterior.

## Probar el hardware (fase actual — MVP)

Antes de conectar la nube, valida que tu impresora imprime:

```powershell
# 1. Ver las impresoras instaladas en esta PC
node src/cli.ts list
#   (o)  npm run list

# 2. Imprimir un ticket de prueba a una impresora del listado
node src/cli.ts test "windows:NOMBRE EXACTO DE LA IMPRESORA"

# 3. Impresora de red por IP (sin driver instalado)
node src/cli.ts test tcp://192.168.1.50:9100
```

Si sale el ticket con el logo "LEOGIN", el corte de papel y los acentos
correctos, esa impresora queda lista para producción.

### Destinos soportados

| Formato                     | Cubre                                              |
| --------------------------- | -------------------------------------------------- |
| `windows:NOMBRE`            | USB, Bluetooth emparejada, red con driver instalado |
| `tcp://IP:9100`             | Impresora de red por IP (RAW / JetDirect)          |
| `preview:`                  | **Simulador en pantalla** — ve el ticket sin impresora térmica |
| `doc:NOMBRE`                | Imprime como documento normal (ej. probar en una inyección) |

> **¿No tienes impresora térmica para probar?** Usa `preview:` — decodifica el
> ESC/POS y te muestra el ticket exactamente como saldría (80mm, cortes,
> acentos). Una impresora de inyección (que no entiende ESC/POS) puede usarse
> con `doc:` para una salida física aproximada en papel A4.

## Arquitectura

```
Navegador (cel/tablet/PC) ──JSON──▶ API Next.js ──genera ESC/POS──▶ tabla print_jobs
                                                                         │
                                                              Supabase Realtime
                                                                         ▼
                                                            Agente local (esta PC)
                                                                         │
                                              ┌──────────────────────────┴───────────┐
                                              ▼                                       ▼
                                   Impresora COCINA (red/USB)            Impresora CAJA (USB/red)
```

- **Servidor "listo", agente "tonto":** los bytes ESC/POS se generan en el
  backend (reutilizando `plataforma/src/lib/escpos.ts`). El agente solo recibe
  bytes y los manda a la impresora → cambiar el formato del ticket no obliga a
  re-desplegar el agente en cada restaurante.
- **Entrega garantizada:** los trabajos viven en la tabla `print_jobs`
  (`pending → printing → done/failed`). Realtime es solo la notificación rápida;
  al reconectar, el agente recupera los pendientes. Una comanda nunca se "pierde".

## Conectar a la nube (Fase 2 — relay)

El agente consulta tu API (`/api/agent/poll`) cada ~3s, imprime los trabajos y
confirma (`/api/agent/ack`). **Ninguna llave de base de datos vive en el agente:**
solo la URL de tu API y un token por restaurante.

```powershell
# 1. Aplica la migración 033 en Supabase (tablas print_agents y print_jobs)

# 2. Genera el token del agente (con sesión de admin en el panel):
#    POST /api/agent/register  →  { "token": "abc123..." }

# 3. Configura el agente — crea agente-impresion/config.local.json:
#    { "apiUrl": "http://localhost:3000", "token": "abc123..." }
#    (o variables de entorno LEOGIN_API_URL / LEOGIN_AGENT_TOKEN)

# 4. Arranca el agente
npm start

# 5. Encola un ticket de prueba (con sesión de admin), forzando el simulador:
#    POST /api/agent/test  body: { "role": "kitchen", "target": "preview:" }
#    → el agente lo imprime en segundos
```

Para producción se asignan los destinos reales (`kitchen_target` / `receipt_target`
en `print_agents`) y `/api/agent/test` o el flujo de pedidos encola sin `target`.

## Empaquetar e instalar (Fase 4)

Genera un ejecutable autónomo (el restaurante NO necesita instalar Node):

```powershell
npm install            # esbuild + postject (una vez)
npm run build:exe      # → dist/LeoginAgent.exe (autocontenido)
```

### Instalación del cliente: UN solo archivo, doble clic

El `LeoginAgent.exe` es **autocontenido** (lleva los scripts `.ps1` incrustados)
y **se autoinstala**. El cliente NO necesita PowerShell, ni permisos de
administrador, ni copiar/pegar nada:

1. En el panel (Perfil → Agente Leogin) pulsa **Descargar instalador**. El panel
   sirve el exe con el token embebido en el nombre
   (`LeoginAgent~LG1~<token>~.exe`).
2. En la PC del local: **doble clic** en el archivo descargado.
3. El exe se copia a `%LOCALAPPDATA%\Leogin\Agente`, escribe su config, se
   registra para arrancar solo (carpeta Inicio + Tarea Programada) y se lanza.
   Muestra un aviso «Instalado correctamente».

> **No le cambies el nombre al archivo:** el token viaja en él. Si Windows
> SmartScreen advierte la 1ª vez ("Windows protegió tu PC"), pulsa
> **Más información → Ejecutar de todos modos**. Se elimina comprando un
> certificado de firma de código (Fase 5).

### Instalación avanzada (línea de comandos)

Equivalente manual, desde la carpeta `dist/` (PowerShell como Administrador):

```powershell
.\LeoginAgent.exe setup            # autoinstala usando el token del nombre / env / config.local.json
# o el instalador clásico:
.\installer\install.ps1 -ApiUrl "https://tudominio.com" -Token "EL_TOKEN_DEL_PANEL"
.\installer\uninstall.ps1          # para quitarlo
```

## Estructura

```
agente-impresion/
├── build-exe.mjs         # empaqueta el .exe (esbuild + Node SEA + postject)
├── installer/
│   ├── install.ps1       # copia el exe + tarea programada (arranque oculto)
│   └── uninstall.ps1
├── scripts/
│   ├── raw-print.ps1      # winspool.drv RAW (USB/BT/red-con-driver)
│   ├── list-printers.ps1  # Get-Printer → JSON
│   └── print-doc.ps1      # documento normal (impresoras NO térmicas)
└── src/
    ├── index.ts          # entry único: despacha CLI o modo servicio
    ├── agent.ts          # daemon: loop poll → imprimir → ack
    ├── cli.ts            # comandos list / test / send
    ├── config.ts         # carga apiUrl + token (env o config.local.json)
    ├── escpos.ts         # ticket de prueba (los reales vienen del servidor)
    ├── logger.ts
    └── printer/
        ├── index.ts      # parseTarget + printRaw (despachador)
        ├── types.ts
        ├── ps.ts         # runner de PowerShell
        ├── discover.ts   # detección de impresoras
        ├── tcp.ts        # transporte TCP (puerto 9100)
        ├── windowsRaw.ts # transporte spooler RAW
        ├── preview.ts    # simulador térmico en pantalla
        └── doc.ts        # transporte "documento" (no térmico)
```

## Roadmap

- [x] **Fase 1 — Núcleo de impresión (MVP):** detección + transportes (Windows
      RAW, TCP, preview y doc) + CLI de pruebas. _Verificado en hardware real._
- [x] **Fase 2 — Relay:** tablas `print_agents`/`print_jobs` (migración 033) +
      API `/api/agent/{register,poll,ack,test}` (reutiliza `escpos.ts` del
      servidor) + demonio que consulta, imprime y confirma. _Verificado con mock._
- [x] **Fase 3 — Configuración en el panel + pedidos reales:** UI en Perfil
      (`PrintAgentSettings`) para generar token, ver impresoras y asignar
      Cocina/Caja; server actions (`lib/actions/print-agent.ts`); la comanda de
      cocina se encola sola al confirmar (NEW→PREP) y el recibo al pedir la
      cuenta, reutilizando `buildKitchenEscPos`/`buildReceiptEscPos`. Anti-doble
      impresión: el navegador no imprime si el agente ya cubre ese rol.
      _Verificado E2E (cocina y recibo) con pedidos reales._
- [x] **Fase 4 — Empaquetado:** `LeoginAgent.exe` autónomo (Node SEA, ~88 MB, sin
      instalar Node) vía `npm run build:exe`; instalador `installer/install.ps1`
      que copia el exe, escribe la config y registra una Tarea Programada (arranca
      oculto al iniciar sesión) + `uninstall.ps1`. _exe verificado en Windows._
      Pendiente: **firma de código** (sin cert, SmartScreen advierte la 1ª vez) y
      auto-reinicio si el proceso cae (Fase 5).
- [x] **Fase 5 (parcial) — Robustez:** impresión en **impresora normal** para
      pruebas sin térmica (`doc:` con fuente monoespaciada, expuesto en el panel);
      **instancia única** + servidor local `127.0.0.1:47100` con `GET /health` y
      `POST /print` (impresión directa sin nube — base para LAN); **auto-reinicio**
      (la Tarea Programada reintenta cada 3 min, sin duplicar gracias al candado);
      el agente **reporta su versión** (visible en el panel); `installer/sign.ps1`
      listo para firmar. `/print` y `/orders` expuestos a la LAN (bind 0.0.0.0)
      con auth por `x-hub-token`, y el instalador crea la regla de firewall del
      puerto 47100 (v0.2.0 — un aviso de UAC; si se cancela, el respaldo LAN
      queda limitado a esta PC). Pendiente solo lo que requiere recursos
      externos: comprar el **certificado** de firma y auto-update binario
      (necesita hosting de releases) — plan completo en
      `plataforma/docs/ESTRATEGIA_INSTALABLE.md`.
- [x] **KDS local de respaldo (v0.3.0):** el hub sirve `/kds?t=<token>` en la
      LAN — pantalla de cocina autocontenida con los pedidos capturados sin
      nube (badge de sincronización, botón LISTO local, poda a 48h). El panel
      (sección Impresión) muestra el enlace listo. Los pedidos sincronizados
      se conservan (estado `synced`) hasta que cocina los marca. _Verificado
      E2E en navegador real._
- [x] **HTTPS del hub (v0.4.0):** certificado wildcard entregado por la nube
      (`/api/agent/hub-cert`, patrón Plex — ver
      `plataforma/docs/ARQUITECTURA_OFFLINE.md` §8.1); servidor HTTPS en
      `:47443` con rotación en caliente; firewall con ambos puertos.
- [x] **Auto-update (v0.5.0):** chequeo cada 1h contra `/api/agent/latest`
      (canal stable/beta por restaurante, migración 065), descarga + sha256 +
      intercambio del exe en caliente + relanzamiento por el watchdog; el
      `.old` queda para rollback manual y se borra al arrancar la versión
      nueva. Publicar release: `npm run build:exe && npm run release`
      (sube a Supabase Storage e inserta en `agent_releases`; kill switch con
      `enabled=false`). El build usa **runtime pineado** (Node 22 LTS oficial,
      cacheado en `.node-base/`). _Verificado E2E: v0.5.0 → v0.5.1 real._
- [ ] **Retiro de QZ** (cuando el agente esté validado en térmica real): eliminar
      `qz-tray`, `qz-cert.ts`, `/api/print/sign` y las secciones QZ de la UI.
