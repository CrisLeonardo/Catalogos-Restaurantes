# Estrategia del instalable — cómo se ve "nivel Spotify" para un SaaS de restaurantes

> Documento de estrategia (2026-07-06). Responde: ¿cómo distribuiría una empresa
> de clase mundial el componente instalado de este SaaS (el Agente/Hub Leogin),
> y qué nos falta para sentirnos así? Complementa
> [ARQUITECTURA_OFFLINE.md](./ARQUITECTURA_OFFLINE.md) (la capa de datos) — este
> documento es la capa de **distribución, actualización y confianza**.

---

## 1. El principio rector (lo que los grandes hacen igual)

Netflix, Spotify, Chrome, Steam y los POS serios (Toast, Square) comparten un
mismo contrato con el usuario, y ninguno lo logra "siendo una app bonita":

1. **Instalar es un gesto, no un procedimiento.** Un clic, cero configuración,
   cero preguntas técnicas.
2. **El software nunca pide ser actualizado.** Se actualiza solo, en silencio,
   con posibilidad de revertir. El usuario jamás ve un número de versión.
3. **El sistema operativo confía en el binario.** Firmado, con identidad de
   editor verificada — nunca una pantalla azul de SmartScreen.
4. **La flota se observa desde el centro.** El vendedor sabe qué versión corre
   cada instalación, su salud, y puede desplegar/revertir por etapas.
5. **La falla se degrada, no se nota.** (Esto ya lo cubre la arquitectura
   offline.)

Los puntos 2 y 4 son los que separan un producto de un proyecto. Chrome ganó el
mercado en gran parte por su updater silencioso; Spotify instala sin UAC en
`%LOCALAPPDATA%` — exactamente donde ya instala el Agente Leogin.

## 2. Inventario honesto: qué ya está a nivel de industria

| Pieza actual | Veredicto |
|---|---|
| Token embebido en el nombre del archivo (`LeoginAgent~LG1~…~.exe`) | ✅ Patrón real de la industria (TeamViewer QuickSupport, ConnectWise, Datto RMM provisionan igual). Y clave: **renombrar un exe NO invalida la firma Authenticode**, así que sobrevive a la fase de firma. |
| Instalación por doble clic a `%LOCALAPPDATA%`, sin admin | ✅ Mismo modelo que Spotify/Slack/Zoom. |
| Exe autocontenido (Node SEA, sin instalar Node) | ✅ Correcto para un daemon sin UI. |
| Tarea Programada con auto-reinicio c/3 min + candado de instancia única | ✅ Supervivencia básica resuelta. |
| Heartbeat con versión visible en el panel | ✅ La semilla del dashboard de flota ya existe. |
| Descarga vía proxy del panel (`LEOGIN_AGENT_DOWNLOAD_URL`) | ✅ Listo para apuntar a GitHub Releases/CDN. |

Lo construido no hay que tirarlo: hay que completarlo. Tres huecos lo separan
de la sensación "big tech": **firma de código, auto-update y presencia visible.**

## 3. Horizonte 1 (semanas) — confianza y auto-update, sin reescribir nada

### 3.1 Firma de código (elimina la pantalla azul de SmartScreen)

| Opción | Costo aprox. | Reputación SmartScreen | Nota |
|---|---|---|---|
| **Azure Trusted Signing** | ~US$10/mes | Inmediata | La mejor relación costo/beneficio; requiere entidad legal verificable (para org: 3+ años de historial; hay tier individual). Se integra a CI con `signtool`. |
| Certificado OV (Certum/Sectigo) | ~US$250–400/año | Gradual (semanas de descargas) | Entrada barata clásica; la reputación se construye por editor+hash. |
| Certificado EV | ~US$300–500/año | Inmediata | Requiere hardware token o firma en nube; más fricción operativa. |

Recomendación: **Trusted Signing si la entidad califica; si no, OV** y aceptar
2–3 semanas de reputación. Firmar en CI en cada release (el paso `sign.ps1` ya
existe). Con esto muere el párrafo "si Windows muestra una pantalla azul…" del
panel — que hoy es la parte menos profesional de todo el flujo.

### 3.2 Auto-update silencioso (la mejora #1 de todo este documento)

Para un SaaS, un agente sin auto-update es deuda que crece con cada cliente:
cada mejora del hub (¡como el HTTPS de la Fase 2!) exigiría reinstalación
manual en cada restaurante. Diseño concreto, sin frameworks nuevos:

1. **`GET /api/agent/latest?channel=stable`** en la plataforma → `{ version,
   url, sha256 }`. Canales `stable`/`beta` por restaurante (columna en
   `print_agents`) = despliegue por etapas y rollback instantáneo (apuntar el
   manifest a la versión anterior).
2. El agente compara con `AGENT_VERSION` en su ciclo de 60s. Si hay nueva:
   descarga a `LeoginAgent.new.exe`, verifica **sha256 + firma Authenticode**,
   y hace el swap: renombra el exe corriendo a `.old` (Windows permite
   renombrar un exe en ejecución), mueve `.new` al nombre real, y sale — la
   Tarea Programada lo relevanta en ≤3 min con la versión nueva. Si el arranque
   nuevo falla, el watchdog restaura `.old` (rollback automático).
3. El panel de super admin ya recibe la versión por heartbeat → tabla de flota:
   versión, última conexión, canal. Con eso se ve un rollout en vivo.

Esto es, a escala pequeña, exactamente el modelo Chrome/Squirrel. Son ~200
líneas en el agente + un endpoint + subir releases firmados al CDN.

### 3.3 Pulido de instalación (días)

- Acceso directo "Agente Leogin" en el menú Inicio (hoy el software es
  invisible tras instalarse) apuntando a una página de estado local.
- Al terminar la instalación, abrir el panel en el paso "verificar conexión"
  en lugar de solo un MessageBox.
- Registrar la instalación en "Aplicaciones instaladas" de Windows (clave
  `HKCU\...\Uninstall`) con el uninstaller — hoy no aparece, y "no se puede
  desinstalar desde Configuración" resta seriedad.

## 4. Horizonte 2 (1–2 meses) — identidad visible: de daemon a producto

El agente hoy es un proceso fantasma. Los productos que se sienten "de alto
nivel" tienen presencia mínima pero permanente:

- **Ícono en la bandeja del sistema** con estado en vivo: 🟢 conectado /
  🟡 sin nube, operando en modo local / 🔴 impresora con problema. Menú:
  "Abrir panel", "Imprimir prueba", "Ver estado".
- **Mini ventana de estado** (no un dashboard: estado de nube, impresoras,
  pedidos en cola local, botón de diagnóstico).

**Vehículo recomendado: Tauri v2** como shell, manteniendo el motor Node actual
como *sidecar* (Tauri lo soporta de fábrica) o portando gradualmente:

| | Node SEA (hoy) | **Tauri v2** | Electron |
|---|---|---|---|
| Tamaño | ~88 MB | ~10–15 MB (+ sidecar) | ~150 MB |
| RAM | baja | muy baja (WebView2 del sistema) | alta |
| Bandeja + ventana | manual/difícil | ✅ nativo | ✅ nativo |
| Auto-update firmado | manual (§3.2) | ✅ plugin oficial | ✅ (Squirrel) |
| Instalador MSI/NSIS | manual | ✅ bundler oficial | ✅ |
| Riesgo de migración | — | bajo (sidecar) | reescritura + peso |

Electron se descarta: paga 150 MB por un ecosistema que aquí no se necesita.
Si el Horizonte 1 ya entregó auto-update casero y la bandeja se resuelve con
una lib ligera, Tauri puede esperar — es identidad, no función.

## 5. Horizonte 3 (trimestre) — el hub como producto y ventaja competitiva

1. **HTTPS del hub (patrón Plex)** — ✅ *implementado (2026-07-07, agente
   v0.4.0 + migración 064)*: wildcard Let's Encrypt vía Cloudflare DNS-01,
   hostname por agente, servidor HTTPS :47443 con rotación en caliente.
   Detalle en ARQUITECTURA_OFFLINE.md §8.1.
2. **KDS local** — ✅ *implementado (2026-07-07, agente v0.3.0)*: el hub sirve
   `/kds` en la LAN con los pedidos que capturó durante el corte
   (ARQUITECTURA_OFFLINE.md §8.6). No requiere el HTTPS del punto 1: la
   navegación directa al hub no sufre mixed content ni Local Network Access.
3. **Código de vinculación de 6 dígitos** como alternativa al token-en-nombre:
   instalador genérico (distribuible por `winget`, descarga directa, incluso
   preinstalado por un técnico) que al primer arranque pide un código que el
   panel muestra durante 10 minutos (patrón Tailscale/apps de TV). El
   token-en-nombre se queda como camino rápido; el pairing code habilita
   distribución masiva sin personalizar binarios.
4. **Telemetría de flota**: crash reporting del agente (el log ya existe;
   subirlo bajo demanda desde el panel), métricas de impresión (jobs/día,
   fallas por impresora), y alertas ("el agente de X lleva 24h desconectado")
   — para soporte proactivo, que es lo que de verdad diferencia a un SaaS B2B.

## 6. Móvil y tablets: el PWA ya es la respuesta correcta

Square y Toast usan apps nativas porque manejan hardware de pago certificado
(EMV). Aquí no aplica: el PWA instalable (que ya existe, con manifest separado
para admin) cubre offline, push y pantalla completa. Opcional y barato para
"presencia de tienda": empaquetar el PWA como **TWA** en Play Store
(Bubblewrap) — mismo código, cero mantenimiento extra. iOS: seguir con
"Agregar a pantalla de inicio".

## 7. El diferenciador único: vender la resiliencia, no esconderla

Todos los competidores tratan el modo offline como una nota al pie de soporte.
La oportunidad es convertir la arquitectura ya construida en una **garantía
visible** — algo que ningún POS de la región muestra:

**"Modo Resguardo Leogin"** — un panel de estado en el admin que muestra la
cadena de resiliencia EN VIVO, con datos que ya existen:

- 🟢 Nube (heartbeat) · 🟢 Hub local (`/health` + versión) · 🟢 Cola del
  dispositivo (SW registrado). *(La versión inicial de esta cadena ya vive en
  /admin/impresion.)*
- Botón **"Simular un corte"**: guía un simulacro en la app paso a paso
  (pedido de prueba con la nube "apagada" → comanda impresa por el hub →
  sincronización) y registra la fecha del último ensayo.
- Tras un corte real: reporte automático "El [fecha] operaste 47 min sin
  internet: 12 pedidos capturados por el hub, 12 sincronizados, Q1,240 que no
  se perdieron."

Ese reporte es el argumento de venta más fuerte posible: convierte una falla de
infraestructura en una demostración del producto. Es marketing que se
construye con piezas que ya están en la base de datos.

## 8. Orden de ejecución recomendado

| # | Qué | Por qué primero |
|---|---|---|
| 1 | Firma de código (§3.1) | Elimina la peor impresión del onboarding; barato |
| 2 | Auto-update + canales (§3.2) | Sin esto, todo lo demás no se puede desplegar a la flota |
| 3 | ✅ HTTPS del hub, patrón Plex *(hecho 2026-07-07)* | Desbloquea la Fase 2 offline en producción |
| 4 | Pulido instalación + registro en "Apps instaladas" (§3.3) | Días de trabajo, sube mucho la percepción |
| 5 | Bandeja del sistema / Tauri (§4) | Identidad visible |
| 6 | Modo Resguardo (§7) | El diferenciador comercial |
| 7 | KDS local + pairing code + telemetría (§5) | El hub como producto completo |
