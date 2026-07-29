// Leogin Desktop — el shell instalable de Leogin (Tauri v2).
//
// Reparto de responsabilidades (ver plataforma/docs/LEOGIN_DESKTOP.md):
//   - Este exe es SOLO ventana + bandeja + auto-update. El panel del
//     restaurante se carga ALOJADO (…/admin): cada deploy web llega al
//     instante sin publicar un exe nuevo (modelo Claude Desktop / Slack).
//   - La impresión y el modo offline son del servicio LeoginAgent
//     (agente-impresion/), que corre aunque esta app esté cerrada. Aquí solo
//     se OBSERVA su /health (127.0.0.1:47100) para pintar el estado.
//   - Cerrar la ventana la oculta: Leogin sigue vivo en la bandeja del
//     sistema. "Salir de Leogin" está en el menú de la bandeja.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::DownloadEvent,
    AppHandle, Emitter, Manager, State, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_notification::NotificationExt as _;
use tauri_plugin_updater::{Update, UpdaterExt};

const HUB_HEALTH: &str = "http://127.0.0.1:47100/health";
const HUB_HOME: &str = "http://127.0.0.1:47100/";
const TRAY_ID: &str = "leogin-tray";
const TOAST_W: f64 = 396.0;
const TOAST_H: f64 = 150.0;
/// Repo público de binarios (mismo del propio Leogin Desktop, ver README) —
/// de aquí se descarga el agente genérico para la vinculación por sesión.
const AGENT_RELEASES_API: &str =
    "https://api.github.com/repos/CrisLeonardo/leogin-agente-releases/releases";

/// El agente viaja DENTRO del instalador (scripts/fetch-agent.mjs lo baja
/// antes de `tauri build` y `bundle.resources` lo empaqueta). Así "instalar
/// Leogin" ya trae todo lo necesario para que esta PC pueda ser la principal
/// del local, sin una segunda descarga en el momento más inoportuno.
const BUNDLED_AGENT: &str = "resources/LeoginAgent.exe";
const BUNDLED_AGENT_VERSION: &str = "resources/agent-version.txt";

/// Login central (roadmap "reconocer el restaurante al iniciar sesión"): el
/// primer arranque, en vez de pedir la dirección del panel a mano, puede abrir
/// este login sin tenant — la propia web (login() en
/// plataforma/src/lib/actions/auth.ts) ya resuelve `profile.restaurant_id` y
/// redirige sola al subdominio correcto tras autenticar. Mismo dominio raíz
/// que NEXT_PUBLIC_ROOT_DOMAIN en producción.
const CENTRAL_LOGIN_URL: &str = "https://leogin.online/admin/login";

/// `CENTRAL_LOGIN_URL`, salvo que `LEOGIN_CENTRAL_LOGIN_URL` la sobreescriba
/// (mismo patrón que `LEOGIN_UPDATE_URL` para el updater) — SOLO para pruebas
/// locales: sin esto, "Iniciar sesión con tu cuenta de Leogin" en `tauri dev`
/// llevaba a la producción real y era imposible probar el login central
/// contra Supabase local (bug real encontrado 2026-07-10: una PC de prueba
/// quedó con `panelUrl: "http://localhost:3000"` — dominio raíz sin tenant,
/// tecleado a mano en el formulario manual porque el botón de login central
/// no servía en local). En producción no se define y aplica el valor de
/// arriba.
fn central_login_url() -> String {
    std::env::var("LEOGIN_CENTRAL_LOGIN_URL").unwrap_or_else(|_| CENTRAL_LOGIN_URL.to_string())
}

// Los enlaces target=_blank del panel (WhatsApp, comprobantes…) deben abrir
// en el navegador del sistema, no dentro del shell. Se inyecta en toda
// página que cargue la ventana principal (local o remota).
const EXTERNAL_LINKS_JS: &str = r#"
(function () {
  function ext(u) {
    try {
      var url = new URL(u, location.href);
      if (['http:', 'https:', 'mailto:', 'tel:'].indexOf(url.protocol) === -1) return;
      if (window.__TAURI__ && window.__TAURI__.core) {
        window.__TAURI__.core.invoke('plugin:opener|open_url', { url: url.href });
      }
    } catch (e) { /* enlace raro → se ignora */ }
  }
  var open0 = window.open;
  window.open = function (u) { if (u) { ext(String(u)); return null; } return open0.apply(window, arguments); };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
    if (a && a.href) { e.preventDefault(); e.stopPropagation(); ext(a.href); }
  }, true);
})();
"#;

/// Telemetría mínima (roadmap §8): reporta la versión del shell al panel
/// cuando la página cargada es el admin (no el hub local ni páginas propias).
/// Va como fetch normal DESDE la página del panel — usa su misma sesión
/// (cookie), sin pasar por IPC ni exponer un comando nuevo al contenido
/// remoto. `{VERSION}` se sustituye al construir la ventana.
///
/// OJO con la condición de "estoy en el panel": en producción el panel vive
/// en su PROPIO subdominio (`<slug>-admin.leogin.online`) y el proxy de la
/// web reescribe las rutas por dentro — el navegador ve `/menu`, `/pedidos`…
/// y NUNCA `/admin`. Chequear solo la ruta (la versión anterior) hacía que
/// la telemetría jamás se enviara en producción; se reconoce también el
/// hostname `*-admin.*`.
const SHELL_TELEMETRY_JS_TEMPLATE: &str = r#"
(function () {
  var isPanel = /\/admin(\/|$)/.test(location.pathname) || /-admin\./.test(location.hostname);
  if (!isPanel) return;
  function send() {
    try {
      fetch('/api/agent/shell-heartbeat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: '{VERSION}' }),
      }).catch(function () {});
    } catch (e) { /* best-effort */ }
  }
  send();
  setInterval(send, 30 * 60 * 1000);
})();
"#;

// ── Configuración persistida (%APPDATA%\com.leogin.desktop\config.json) ────

#[derive(Default, Serialize, Deserialize, Clone)]
struct AppConfig {
    /// Origen del panel del restaurante (ej. https://mirestaurante.midominio.com)
    #[serde(default, rename = "panelUrl")]
    panel_url: Option<String>,
}

fn config_path(app: &AppHandle) -> std::path::PathBuf {
    let dir = app.path().app_config_dir().expect("app_config_dir");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("config.json")
}

fn load_config(app: &AppHandle) -> AppConfig {
    std::fs::read_to_string(config_path(app))
        .ok()
        // Tolerar BOM UTF-8: editores de Windows (y PowerShell) lo agregan y
        // serde_json lo rechaza — sin esto la app "olvida" su configuración.
        .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_default()
}

fn save_config(app: &AppHandle, cfg: &AppConfig) {
    let _ = std::fs::write(
        config_path(app),
        serde_json::to_string_pretty(cfg).expect("config serializable"),
    );
}

/// Log mínimo de soporte (junto a config.json): arranque, transiciones de
/// estado y ciclo de update. Marca de tiempo en epoch segundos; sin datos
/// sensibles (nunca tokens ni sesión).
fn log_line(app: &AppHandle, msg: &str) {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("leogin-desktop.log"))
        {
            use std::io::Write as _;
            let _ = writeln!(f, "[{ts}] {msg}");
        }
    }
}

// ── Estado global ───────────────────────────────────────────────────────────

struct AppState {
    config: Mutex<AppConfig>,
    /// Ítem del menú de bandeja que muestra el estado (se actualiza en vivo).
    status_item: Mutex<Option<MenuItem<Wry>>>,
    /// Actualización descargada, esperando el "Reiniciar ahora" del toast.
    pending_update: Mutex<Option<(Update, Vec<u8>)>>,
    /// Última versión del AGENTE que este shell intentó instalar (ver
    /// `maybe_update_agent`) — evita relanzar el instalador cada hora si algo
    /// impide que el hub quede al día.
    agent_update_attempted: Mutex<Option<String>>,
    http: reqwest::Client,
}

// ── Utilidades de URL / navegación ─────────────────────────────────────────

/// Normaliza lo que escriba el usuario a un ORIGEN https válido.
fn normalize_panel_url(input: &str) -> Result<String, String> {
    let mut s = input.trim().to_string();
    if s.is_empty() {
        return Err("Escribe la dirección de tu panel.".into());
    }
    if !s.contains("://") {
        s = format!("https://{s}");
    }
    let url = Url::parse(&s).map_err(|_| "Esa dirección no es válida.".to_string())?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err("La dirección debe empezar con https://".into());
    }
    if url.host_str().is_none() {
        return Err("Esa dirección no es válida.".into());
    }
    Ok(url.origin().ascii_serialization())
}

fn admin_url(origin: &str) -> String {
    format!("{}/admin", origin.trim_end_matches('/'))
}

/// Origen de las páginas locales empaquetadas (Windows: http://tauri.localhost).
fn local_url(path_and_query: &str) -> Url {
    let base = if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" };
    Url::parse(&format!("{base}/{}", path_and_query.trim_start_matches('/'))).expect("url local")
}

/// Descargas de PDF/Excel del panel (`doc.save()` de jsPDF, blobs `xlsx` con
/// `<a download>`): sin registrar un handler propio, WebView2 no dispara su
/// UI de descargas por defecto en una ventana sin barra de navegación — el
/// clic simplemente no hacía nada (bug real reportado 2026-07-23, confirmado
/// contra el propio código de wry: `DownloadStarting` solo cancela o continúa
/// si Tauri lo maneja explícitamente). Se deja pasar la descarga tal cual
/// (misma carpeta de Descargas que ya trae `destination` por defecto) y se
/// avisa con una notificación nativa al terminar, ya que el WebView no va a
/// mostrar ningún indicio propio.
fn handle_download(app: &AppHandle, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, .. } => {
            log_line(app, &format!("descarga: solicitada {url}"));
            true
        }
        DownloadEvent::Finished { url, path, success } => {
            if success {
                let name = path
                    .as_ref()
                    .and_then(|p| p.file_name())
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "archivo".to_string());
                log_line(app, &format!("descarga: completa {name}"));
                let _ = app
                    .notification()
                    .builder()
                    .title("Descarga completa")
                    .body(&name)
                    .show();
            } else {
                log_line(app, &format!("descarga: falló {url}"));
            }
            true
        }
        _ => true,
    }
}

fn navigate_main(app: &AppHandle, url: Url) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.navigate(url);
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn info_dialog(app: &AppHandle, msg: &str) {
    app.dialog()
        .message(msg)
        .kind(MessageDialogKind::Info)
        .title("Leogin")
        .show(|_| {});
}

// ── Sondas de nube y hub ────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct HubStatus {
    ok: bool,
    version: Option<String>,
}

/// ¿Responde el hub local (LeoginAgent) en esta PC?
async fn fetch_hub(http: &reqwest::Client) -> HubStatus {
    let res = http
        .get(HUB_HEALTH)
        .timeout(Duration::from_secs(3))
        .send()
        .await;
    match res {
        Ok(r) => match r.json::<serde_json::Value>().await {
            Ok(v) if v["agent"] == "leogin" => HubStatus {
                ok: true,
                version: v["version"].as_str().map(String::from),
            },
            _ => HubStatus { ok: false, version: None },
        },
        Err(_) => HubStatus { ok: false, version: None },
    }
}

/// ¿Responde el panel alojado? Cualquier respuesta HTTP cuenta (solo se mide
/// alcanzabilidad); /favicon.ico para no pedir una página completa cada vez.
async fn cloud_reachable(http: &reqwest::Client, origin: &str) -> bool {
    http.get(format!("{}/favicon.ico", origin.trim_end_matches('/')))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .is_ok()
}

/// Extrae la ruta "/kds?t=…" de la página de estado del hub (ver
/// agente-impresion/src/local-server.ts statusPageHtml) sin depender de un
/// crate de regex — el formato del enlace es estable y propio. Respaldo
/// para agentes viejos que aún no traen `kdsPath` en /health (ver abajo).
fn extract_kds_path(html: &str) -> Option<String> {
    let needle = "href=\"/kds?t=";
    let start = html.find(needle)? + "href=\"".len();
    let rest = &html[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/// Resuelve la URL completa del KDS de respaldo — usado por el modo kiosco.
/// Camino principal: `kdsPath` en /health (agente ≥0.6.1, JSON, confiable).
/// Respaldo: scrapear la página de estado (GET /) — algunas versiones del
/// agente instaladas en el campo no la sirven (probado contra una real:
/// devuelve 404 mientras /health sí responde), por eso /health es la fuente
/// primaria y no al revés.
async fn fetch_kds_url(http: &reqwest::Client) -> Option<String> {
    if let Ok(res) = http.get(HUB_HEALTH).timeout(Duration::from_secs(3)).send().await {
        if let Ok(v) = res.json::<serde_json::Value>().await {
            if let Some(path) = v["kdsPath"].as_str() {
                return Some(format!("http://127.0.0.1:47100{path}"));
            }
        }
    }
    let html = http
        .get(HUB_HOME)
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;
    extract_kds_path(&html).map(|path| format!("http://127.0.0.1:47100{path}"))
}

// ── Ícono de bandeja con punto de estado ───────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
enum StatusColor {
    Plain,
    Green,
    Yellow,
    Red,
}

static BASE_ICON: OnceLock<(Vec<u8>, u32, u32)> = OnceLock::new();

fn base_icon() -> &'static (Vec<u8>, u32, u32) {
    BASE_ICON.get_or_init(|| {
        let img = Image::from_bytes(include_bytes!("../icons/32x32.png")).expect("icono base 32x32");
        (img.rgba().to_vec(), img.width(), img.height())
    })
}

fn tray_icon(color: StatusColor) -> Image<'static> {
    let (base, w, h) = base_icon();
    let mut rgba = base.clone();
    let dot: Option<(u8, u8, u8)> = match color {
        StatusColor::Plain => None,
        StatusColor::Green => Some((34, 197, 94)),
        StatusColor::Yellow => Some((234, 179, 8)),
        StatusColor::Red => Some((239, 68, 68)),
    };
    if let Some((r, g, b)) = dot {
        // Punto de estado abajo a la derecha, con borde oscuro para que se
        // lea sobre cualquier fondo de barra de tareas.
        let (cx, cy, rad) = (*w as i32 - 8, *h as i32 - 8, 7i32);
        for y in (cy - rad)..=(cy + rad) {
            for x in (cx - rad)..=(cx + rad) {
                if x < 0 || y < 0 || x >= *w as i32 || y >= *h as i32 {
                    continue;
                }
                let d2 = (x - cx).pow(2) + (y - cy).pow(2);
                if d2 > rad * rad {
                    continue;
                }
                let i = ((y as u32 * w + x as u32) * 4) as usize;
                let edge = d2 > (rad - 2) * (rad - 2);
                let (pr, pg, pb) = if edge { (13, 16, 23) } else { (r, g, b) };
                rgba[i] = pr;
                rgba[i + 1] = pg;
                rgba[i + 2] = pb;
                rgba[i + 3] = 255;
            }
        }
    }
    Image::new_owned(rgba, *w, *h)
}

// ── Estado en vivo (bandeja + tooltip + evento a las páginas locales) ──────

async fn compute_status(app: &AppHandle) -> (StatusColor, String) {
    let state = app.state::<AppState>();
    let origin = { state.config.lock().unwrap().panel_url.clone() };
    let hub = fetch_hub(&state.http).await;
    let hub_txt = if hub.ok {
        format!("Hub local: activo (v{})", hub.version.unwrap_or_default())
    } else {
        "Hub local: no detectado en esta PC".to_string()
    };
    match origin {
        None => (StatusColor::Plain, format!("Sin configurar · {hub_txt}")),
        Some(o) => {
            if cloud_reachable(&state.http, &o).await {
                (StatusColor::Green, format!("Nube: conectada · {hub_txt}"))
            } else if hub.ok {
                (StatusColor::Yellow, format!("Nube: SIN conexión · {hub_txt} — operando en modo local"))
            } else {
                (StatusColor::Red, format!("Nube: SIN conexión · {hub_txt}"))
            }
        }
    }
}

fn paint_status(app: &AppHandle, color: StatusColor, line: &str) {
    log_line(app, &format!("estado: {line}"));
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_icon(Some(tray_icon(color)));
        let _ = tray.set_tooltip(Some(format!("Leogin — {line}")));
    }
    let state = app.state::<AppState>();
    if let Some(item) = state.status_item.lock().unwrap().as_ref() {
        let _ = item.set_text(line);
    }
    let _ = app.emit("leogin-status", serde_json::json!({ "line": line }));
}

async fn status_loop(app: AppHandle) {
    let mut last: Option<(StatusColor, String)> = None;
    loop {
        let (color, line) = compute_status(&app).await;
        let current = Some((color, line.clone()));
        if current != last {
            paint_status(&app, color, &line);
            last = current;
        }
        tokio::time::sleep(Duration::from_secs(8)).await;
    }
}

// ── Auto-update con toast (modelo Claude Desktop) ──────────────────────────

fn show_toast(app: &AppHandle) {
    let Some(w) = app.get_webview_window("update-toast") else { return };
    // Esquina inferior IZQUIERDA del monitor principal, sobre la barra de tareas.
    if let Ok(Some(m)) = w.primary_monitor() {
        let scale = m.scale_factor();
        let th = TOAST_H * scale;
        let x = m.position().x as f64 + 16.0 * scale;
        let y = m.position().y as f64 + m.size().height as f64 - th - 56.0 * scale;
        let _ = w.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
    }
    let _ = w.show();
}

fn hide_toast(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("update-toast") {
        let _ = w.hide();
    }
}

/// Chequea, descarga en segundo plano y muestra el toast. Con
/// `interactive=true` (menú de bandeja) también avisa cuando NO hay nada.
async fn check_for_update(app: AppHandle, interactive: bool) {
    // ¿Ya hay una descargada esperando? Solo re-mostrar el aviso.
    {
        let state = app.state::<AppState>();
        let pending = state.pending_update.lock().unwrap().as_ref().map(|(u, _)| u.version.clone());
        if let Some(v) = pending {
            let _ = app.emit_to("update-toast", "update-ready", serde_json::json!({ "version": v }));
            show_toast(&app);
            return;
        }
    }

    // LEOGIN_UPDATE_URL: endpoint alterno SOLO para pruebas locales del ciclo
    // de update (los paquetes siguen exigiendo la firma minisign, así que no
    // debilita nada). En producción no se define y rige tauri.conf.json.
    let updater = match std::env::var("LEOGIN_UPDATE_URL").ok().and_then(|u| Url::parse(&u).ok()) {
        Some(url) => {
            // Nota: en release el plugin exige https para el endpoint; un
            // http:// de prueba requiere activar temporalmente
            // dangerousInsecureTransportProtocol en tauri.conf.json.
            let built = app
                .updater_builder()
                .endpoints(vec![url])
                .and_then(|b| b.build());
            match built {
                Ok(u) => u,
                Err(e) => {
                    log_line(&app, &format!("update: endpoint de prueba inválido: {e}"));
                    return;
                }
            }
        }
        None => match app.updater() {
            Ok(u) => u,
            Err(_) => return,
        },
    };
    match updater.check().await {
        Ok(Some(update)) => {
            log_line(&app, &format!("update: v{} disponible, descargando…", update.version));
            match update.download(|_, _| {}, || {}).await {
                Ok(bytes) => {
                    let version = update.version.clone();
                    app.state::<AppState>().pending_update.lock().unwrap().replace((update, bytes));
                    log_line(&app, &format!("update: v{version} descargada y verificada — toast visible"));
                    let _ = app.emit_to("update-toast", "update-ready", serde_json::json!({ "version": version }));
                    show_toast(&app);
                }
                Err(e) => {
                    log_line(&app, &format!("update: fallo la descarga: {e}"));
                    if interactive {
                        info_dialog(&app, &format!("No se pudo descargar la actualización: {e}"));
                    }
                }
            }
        }
        Ok(None) => {
            if interactive {
                info_dialog(&app, "Ya tienes la versión más reciente de Leogin.");
            }
        }
        Err(e) => {
            log_line(&app, &format!("update: chequeo sin éxito: {e}"));
            if interactive {
                info_dialog(&app, &format!("No se pudo buscar actualizaciones: {e}"));
            }
        }
    }
}

// ── Vinculación por sesión: instala el agente sin salir de Leogin ─────────
// Roadmap §8.1: "esta PC será el servidor del local" — el panel (ya logueado
// dentro de la app) le pasa apiUrl+token a este comando, que descarga el
// instalador GENÉRICO del agente (sin código en el nombre) y lo lanza con un
// config.local.json al lado (Plan B de agente-impresion/src/config.ts) — el
// propio agente hace el resto (runSetup(): copia a %LOCALAPPDATA%, tarea
// programada, firewall, registro de "Aplicaciones instaladas"), exactamente
// el mismo camino ya probado del instalador manual.

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    assets: Vec<GhAsset>,
}

/// Último release publicado del AGENTE (tag `agent-v*`, no `desktop-v*` —
/// mismo repo público de binarios). GitHub ya los devuelve más nuevo primero.
/// Devuelve `(versión, url del .exe)` — la versión sale del propio tag.
async fn latest_agent_release(http: &reqwest::Client) -> Result<(String, String), String> {
    let releases: Vec<GhRelease> = http
        .get(AGENT_RELEASES_API)
        .header("accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("No se pudo consultar los releases del agente: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Respuesta inesperada de GitHub: {e}"))?;

    releases
        .into_iter()
        .find(|r| !r.draft && r.tag_name.starts_with("agent-v"))
        .and_then(|r| {
            let version = r.tag_name.trim_start_matches("agent-v").to_string();
            r.assets
                .into_iter()
                .find(|a| a.name.to_lowercase().ends_with(".exe"))
                .map(|a| (version, a.browser_download_url))
        })
        .ok_or_else(|| "No se encontró un release publicado del agente.".to_string())
}

/// "x.y.z" → [x, y, z] para comparar versiones numéricamente (misma
/// semántica que `isNewerVersion` en agente-impresion/src/updater.ts).
fn parse_ver(v: &str) -> [u64; 3] {
    let mut out = [0u64; 3];
    for (i, part) in v.trim().trim_start_matches('v').split('.').take(3).enumerate() {
        out[i] = part
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse()
            .unwrap_or(0);
    }
    out
}

/// Carpeta de instalación del agente en esta PC — debe coincidir con
/// `installDir()` de agente-impresion/src/setup.ts.
fn agent_install_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .map(|base| std::path::PathBuf::from(base).join("Leogin").join("Agente"))
}

/// Ruta del agente EMPAQUETADO dentro de esta app, si el build lo incluyó
/// (`bundle.resources` en tauri.conf.json ← scripts/fetch-agent.mjs).
fn bundled_agent_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let path = app
        .path()
        .resolve(BUNDLED_AGENT, tauri::path::BaseDirectory::Resource)
        .ok()?;
    path.exists().then_some(path)
}

/// Bytes del agente empaquetado. `None` = este exe se construyó sin él (dev, o
/// un build donde la descarga del release falló) y hay que ir a GitHub.
fn bundled_agent_bytes(app: &AppHandle) -> Option<Vec<u8>> {
    std::fs::read(bundled_agent_path(app)?).ok()
}

/// Versión del agente empaquetado, declarada por el build en un archivo al
/// lado del exe. Sin ella no se puede comparar contra lo instalado.
fn bundled_agent_version(app: &AppHandle) -> Option<String> {
    let path = app
        .path()
        .resolve(BUNDLED_AGENT_VERSION, tauri::path::BaseDirectory::Resource)
        .ok()?;
    let raw = std::fs::read_to_string(path).ok()?;
    let v = raw.trim().trim_start_matches('v').to_string();
    (!v.is_empty()).then_some(v)
}

/// Mantiene el SERVICIO local al día junto con el desktop (pedido del usuario
/// 2026-07-10: "si se llegara a actualizar, se actualiza junto al desktop").
/// En el mismo ciclo horario en que el shell busca su propia actualización,
/// compara la versión del hub de ESTA PC contra el último release `agent-v*`
/// y, si está viejo, descarga el exe y lo lanza en modo `update`
/// (autoinstalación SILENCIOSA, agente ≥0.7.0 — a versiones anteriores no se
/// les dispara para no provocar sus cuadros de diálogo de "instalado
/// correctamente" en medio del servicio).
///
/// Es deliberadamente REDUNDANTE con el auto-update de nube del propio agente
/// (updater.ts, modelo Chrome): aquel canal depende de que la nube tenga el
/// release cargado (migración 065 + fila en BD); este solo necesita GitHub —
/// exactamente el mismo origen del que la vinculación por sesión ya instala.
/// La config actual (`config.local.json` de la carpeta instalada) viaja al
/// lado del instalador temporal (Plan B de config.ts): la reinstalación
/// conserva apiUrl+token, no se genera ningún token nuevo.
async fn maybe_update_agent(app: &AppHandle) {
    let state = app.state::<AppState>();
    let hub = fetch_hub(&state.http).await;
    if !hub.ok {
        return; // sin hub en esta PC no hay nada que mantener al día
    }
    let Some(hub_ver) = hub.version else { return };

    // Dos orígenes posibles, y gana el más nuevo: el agente EMPAQUETADO con
    // esta versión de Leogin Desktop (instalar el desktop actualiza también el
    // servicio, sin red) y el último release publicado en GitHub. Si el
    // empaquetado alcanza, ni se consulta GitHub.
    let bundled = bundled_agent_version(app);
    let remote = latest_agent_release(&state.http).await.ok();
    let (latest, url) = match (bundled, remote) {
        (Some(b), Some((r, u))) if parse_ver(&r) > parse_ver(&b) => (r, Some(u)),
        (Some(b), _) => (b, None),
        (None, Some((r, u))) => (r, Some(u)),
        (None, None) => return,
    };

    if parse_ver(&latest) < parse_ver("0.7.0") {
        return; // esa versión aún no trae el modo silencioso
    }
    if parse_ver(&latest) <= parse_ver(&hub_ver) {
        return; // ya está al día (o el propio auto-update del agente ganó)
    }
    // Una sola tentativa por versión por corrida del shell: si algo falla se
    // reintenta al reiniciar Leogin, no en bucle cada hora.
    {
        let mut attempted = state.agent_update_attempted.lock().unwrap();
        if attempted.as_deref() == Some(latest.as_str()) {
            return;
        }
        *attempted = Some(latest.clone());
    }
    let Some(dir) = agent_install_dir() else { return };
    let Ok(cfg_bytes) = std::fs::read(dir.join("config.local.json")) else {
        log_line(app, "agente: hub activo pero sin config.local.json legible — el shell no puede actualizarlo");
        return;
    };

    let bytes = match url {
        None => {
            log_line(app, &format!("agente: v{hub_ver} → v{latest} (copia incluida en la app)"));
            match bundled_agent_bytes(app) {
                Some(b) => b,
                None => return,
            }
        }
        Some(url) => {
            log_line(app, &format!("agente: v{hub_ver} → v{latest}, descargando actualización…"));
            match state
                .http
                .get(&url)
                .timeout(Duration::from_secs(180))
                .send()
                .await
                .and_then(|r| r.error_for_status())
            {
                Ok(res) => match res.bytes().await {
                    Ok(b) => b.to_vec(),
                    Err(e) => {
                        log_line(app, &format!("agente: descarga incompleta: {e}"));
                        return;
                    }
                },
                Err(e) => {
                    log_line(app, &format!("agente: no se pudo descargar: {e}"));
                    return;
                }
            }
        }
    };

    // Temp propia. El nombre empieza con "Leogin" (looksPackaged en index.ts)
    // pero NO es "LeoginAgent.exe": stopExisting() hace taskkill por nombre de
    // imagen y se mataría a sí mismo (bug real 2026-07-08, ver LEOGIN_DESKTOP.md §4.5).
    let tmp = std::env::temp_dir().join(format!("leogin-agent-update-{}", std::process::id()));
    if std::fs::create_dir_all(&tmp).is_err() {
        return;
    }
    let exe = tmp.join("LeoginAgent-update.exe");
    if std::fs::write(&exe, &bytes).is_err() || std::fs::write(tmp.join("config.local.json"), &cfg_bytes).is_err() {
        log_line(app, "agente: no se pudo preparar el instalador temporal");
        return;
    }

    let mut cmd = std::process::Command::new(&exe);
    cmd.arg("update");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    match cmd.spawn() {
        Ok(_) => log_line(app, &format!("agente: instalador v{latest} lanzado en modo silencioso")),
        Err(e) => log_line(app, &format!("agente: no se pudo lanzar el instalador: {e}")),
    }
}

// ── Comandos (los llaman las páginas locales de ui/) ───────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupInfo {
    panel_url: Option<String>,
    app_version: String,
}

#[tauri::command]
fn get_setup_info(app: AppHandle, state: State<AppState>) -> SetupInfo {
    SetupInfo {
        panel_url: state.config.lock().unwrap().panel_url.clone(),
        app_version: app.package_info().version.to_string(),
    }
}

/// Arranque con panel ya configurado: navega al panel si hay nube; si no,
/// la página de arranque salta a offline.html. La sonda se intenta DOS veces:
/// una sola de 5 s marcaba "sin conexión" en WiFi lentos reales justo al
/// encender la PC (falso negativo — el router aún negociaba), y el usuario
/// veía la pantalla offline teniendo internet.
#[tauri::command]
async fn boot(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let origin = { state.config.lock().unwrap().panel_url.clone() };
    let Some(origin) = origin else { return Ok("setup".into()) };
    if cloud_reachable(&state.http, &origin).await || cloud_reachable(&state.http, &origin).await {
        let url = Url::parse(&admin_url(&origin)).map_err(|e| e.to_string())?;
        log_line(&app, "boot → panel");
        navigate_main(&app, url);
        Ok("panel".into())
    } else {
        log_line(&app, "boot → offline (nube no responde)");
        Ok("offline".into())
    }
}

/// Prepara un re-enlace por cuenta y devuelve la URL del login central para
/// que la página solo tenga que navegar ahí, sin duplicar
/// `central_login_url()` en JS. Desde que `detect_resolved_panel` SIGUE los
/// cambios de panel (adopta el origen al que redirija cada login, ver arriba)
/// ya no hace falta olvidar nada: iniciar sesión con la cuenta nueva basta.
/// Se conserva como el punto único que conoce esa URL.
#[tauri::command]
fn begin_relink() -> String {
    central_login_url()
}

/// ¿Esta URL es el PANEL de un restaurante? Reconoce las DOS formas reales
/// que arma la web (`adminUrl()` en plataforma/src/lib/tenant.ts):
///   · producción: `https://<slug>-admin.<root>/…` — host dedicado. El proxy
///     reescribe las rutas POR DENTRO (`/menu` → `/admin/menu`), así que el
///     navegador nunca muestra `/admin` en la ruta.
///   · local / montaje por ruta: `http://<slug>.localhost:3000/admin/…`.
/// Nunca el propio login central, ni el hub local, ni las páginas
/// empaquetadas de esta app.
fn is_panel_location(url: &Url, central: &Url) -> bool {
    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }
    if url.origin() == central.origin() {
        return false;
    }
    let Some(host) = url.host_str() else { return false };
    if host == "127.0.0.1" || host == "localhost" || host == "tauri.localhost" {
        return false;
    }
    // Producción: subdominio dedicado <slug>-admin.<root del login central>.
    if let Some(root) = central.host_str().map(|h| h.trim_start_matches("www.")) {
        if let Some(sub) = host.strip_suffix(&format!(".{root}")) {
            if !sub.is_empty() && sub.ends_with("-admin") {
                return true;
            }
        }
    }
    // Genérico (local y cualquier montaje bajo ruta): el panel bajo /admin.
    url.path() == "/admin" || url.path().starts_with("/admin/")
}

/// Mantiene `panel_url` sincronizado con el panel que la ventana REALMENTE
/// usa (hook `on_navigation` de la ventana main, no un comando invocable).
///
/// Reemplaza (2026-07-10b) la detección anterior, que exigía que la RUTA
/// empezara con `/admin`. Eso solo es cierto en local
/// (`<slug>.localhost:3000/admin/…`): en producción el panel vive en su
/// propio subdominio (`<slug>-admin.leogin.online`) y el navegador ve
/// `/menu`, `/mesero`… nunca `/admin`. Resultado real del bug: el login
/// central funcionaba perfecto en `tauri dev` y NO ADOPTABA NADA en
/// producción — la PC "no reconocía" la cuenta al siguiente arranque y
/// volvía a pedir iniciar sesión, y "cambiar de cuenta" jamás persistía.
///
/// Regla nueva: si la navegación aterriza en una URL de panel
/// (`is_panel_location`) que NO es una página de login, ese origen SE ADOPTA
/// como `panel_url` — también cuando ya había otro guardado. Así "cambiar de
/// cuenta o restaurante" es simplemente iniciar sesión con la otra cuenta
/// desde donde sea: el backend redirige al panel correcto (fix cross-tenant
/// de auth.ts, v0.2.3) y esta PC lo sigue, en vez de quedarse clavada en el
/// restaurante anterior. Llegar a una página de login NO adopta nada: estar
/// frente a un formulario no prueba que la cuenta pertenezca a ese
/// restaurante.
fn detect_resolved_panel(app: &AppHandle, url: &Url) {
    let Ok(central) = Url::parse(&central_login_url()) else { return };
    if !is_panel_location(url, &central) {
        return;
    }
    if url.path().contains("/login") {
        return;
    }
    let state = app.state::<AppState>();
    let origin = url.origin().ascii_serialization();
    let cfg = {
        let mut cfg = state.config.lock().unwrap();
        if cfg.panel_url.as_deref() == Some(origin.as_str()) {
            return; // sin cambio — el caso común en cada navegación del panel
        }
        cfg.panel_url = Some(origin.clone());
        cfg.clone()
    };
    save_config(app, &cfg);
    let _ = app.autolaunch().enable();
    log_line(app, &format!("panel adoptado: {origin}"));
}

#[tauri::command]
fn open_panel(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let origin = state
        .config
        .lock()
        .unwrap()
        .panel_url
        .clone()
        .ok_or("Sin panel configurado.")?;
    navigate_main(&app, Url::parse(&admin_url(&origin)).map_err(|e| e.to_string())?);
    Ok(())
}

#[tauri::command]
async fn check_cloud(state: State<'_, AppState>) -> Result<bool, String> {
    let origin = { state.config.lock().unwrap().panel_url.clone() };
    match origin {
        Some(o) => Ok(cloud_reachable(&state.http, &o).await),
        None => Ok(false),
    }
}

#[tauri::command]
async fn hub_status(state: State<'_, AppState>) -> Result<HubStatus, String> {
    Ok(fetch_hub(&state.http).await)
}

#[tauri::command]
fn open_hub_page(app: AppHandle) {
    show_main(&app);
    navigate_main(&app, Url::parse(HUB_HOME).expect("url hub"));
}

#[tauri::command]
fn get_pending_update(state: State<AppState>) -> Option<String> {
    state.pending_update.lock().unwrap().as_ref().map(|(u, _)| u.version.clone())
}

#[tauri::command]
fn apply_update(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let pending = state.pending_update.lock().unwrap().take();
    let Some((update, bytes)) = pending else {
        return Err("No hay actualización pendiente.".into());
    };
    hide_toast(&app);
    log_line(&app, &format!("update: aplicando v{} (reinicio)", update.version));
    // En Windows esto lanza el instalador NSIS en modo pasivo y TERMINA este
    // proceso; el instalador relanza Leogin ya actualizado.
    update.install(bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn dismiss_update(app: AppHandle) {
    // "Después": el toast vuelve a aparecer en el próximo chequeo (~1 h).
    hide_toast(&app);
}

/// "Esta PC será el servidor del local" (panel remoto, botón de Impresión).
/// Solo el panel configurado como `panel_url` puede invocarlo: la ACL ya lo
/// restringe a contenido remoto (capabilities/remote-panel.json), y aquí se
/// exige además que la llamada venga REALMENTE de ese origen — no de
/// cualquier http(s) que la ventana "main" pudiera llegar a mostrar.
#[tauri::command]
async fn install_agent_as_server(
    app: AppHandle,
    state: State<'_, AppState>,
    webview: tauri::WebviewWindow<Wry>,
    api_url: String,
    token: String,
) -> Result<(), String> {
    let configured = state
        .config
        .lock()
        .unwrap()
        .panel_url
        .clone()
        .ok_or_else(|| "Configura primero la dirección del panel.".to_string())?;

    let caller_origin = webview
        .url()
        .map_err(|e| e.to_string())?
        .origin()
        .ascii_serialization();
    if caller_origin != configured {
        return Err("Origen no autorizado.".into());
    }
    if normalize_panel_url(&api_url)? != configured {
        return Err("La dirección no coincide con el panel configurado.".into());
    }
    if token.trim().is_empty() {
        return Err("Falta el token.".into());
    }

    // El agente viaja DENTRO del instalador de Leogin Desktop (ver
    // `bundle.resources` en tauri.conf.json y scripts/fetch-agent.mjs): "se
    // instala junto al desktop" sin depender de que GitHub responda ni de que
    // el WiFi del local aguante 87 MB en ese momento. La descarga queda como
    // respaldo para un exe construido sin el recurso (dev, o un build donde el
    // fetch falló) y para el caso de que el release publicado sea más nuevo.
    let bytes = match bundled_agent_bytes(&app) {
        Some(b) => {
            log_line(&app, "vinculación por sesión: usando el agente incluido en la app");
            b
        }
        None => {
            log_line(&app, "vinculación por sesión: sin agente incluido, buscando el último release…");
            let (_, download_url) = latest_agent_release(&state.http).await?;
            log_line(&app, "vinculación por sesión: descargando el agente…");
            state
                .http
                .get(&download_url)
                .timeout(Duration::from_secs(120))
                .send()
                .await
                .map_err(|e| format!("No se pudo descargar el agente: {e}"))?
                .bytes()
                .await
                .map_err(|e| format!("Descarga incompleta: {e}"))?
                .to_vec()
        }
    };

    // Carpeta TEMPORAL a propósito (no la de instalación): el agente, al
    // arrancar fuera de su carpeta instalada con este nombre, se autoinstala
    // solo — ver agente-impresion/src/index.ts (looksPackaged && !isInstalledLocation)
    // y src/config.ts (Plan B: config.local.json junto al exe).
    //
    // El nombre NO puede ser exactamente "LeoginAgent.exe": setup.ts::stopExisting()
    // hace `taskkill /im LeoginAgent.exe /f /t` para cerrar la instancia YA
    // instalada antes de sobrescribirla — si el propio instalador temporal se
    // llama igual, taskkill lo mata a SÍ MISMO a mitad de la instalación (visto
    // en pruebas: exit code 1, sin log, sin excepción — es TerminateProcess, no
    // un error de JS). El instalador manual nunca pisó este caso porque el
    // panel siempre le pone un nombre distinto (slug del restaurante + código).
    let dir = std::env::temp_dir().join(format!("leogin-agent-install-{}", std::process::id()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let exe_path = dir.join("LeoginAgent-installer.exe");
    std::fs::write(&exe_path, &bytes).map_err(|e| e.to_string())?;
    std::fs::write(
        dir.join("config.local.json"),
        serde_json::to_string_pretty(&serde_json::json!({ "apiUrl": configured, "token": token }))
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    log_line(&app, "vinculación por sesión: lanzando el instalador del agente…");
    let mut cmd = std::process::Command::new(&exe_path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn()
        .map_err(|e| format!("No se pudo iniciar el instalador: {e}"))?;

    Ok(())
}

/// "Esta PC ya no es la principal": desinstala el servicio local de ESTA
/// computadora. El corte de verdad lo da la nube (apagar el interruptor revoca
/// el token y el agente deja de autenticar, ver migración 094); esto además
/// quita la tarea programada, el autoarranque y la entrada de "Aplicaciones
/// instaladas", para no dejar un servicio muerto consumiendo memoria.
///
/// Mismas garantías de origen que `install_agent_as_server`. No falla si el
/// agente no está instalado: apagar una PC que nunca lo tuvo es un no-op.
#[tauri::command]
async fn uninstall_agent_server(
    app: AppHandle,
    state: State<'_, AppState>,
    webview: tauri::WebviewWindow<Wry>,
) -> Result<(), String> {
    let configured = state
        .config
        .lock()
        .unwrap()
        .panel_url
        .clone()
        .ok_or_else(|| "Configura primero la dirección del panel.".to_string())?;
    let caller_origin = webview
        .url()
        .map_err(|e| e.to_string())?
        .origin()
        .ascii_serialization();
    if caller_origin != configured {
        return Err("Origen no autorizado.".into());
    }

    let Some(exe) = agent_install_dir().map(|d| d.join("LeoginAgent.exe")) else {
        return Ok(());
    };
    if !exe.exists() {
        log_line(&app, "apagar PC principal: el servicio no está instalado en esta PC");
        return Ok(());
    }

    log_line(&app, "apagar PC principal: desinstalando el servicio local…");
    let mut cmd = std::process::Command::new(&exe);
    cmd.arg("uninstall");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn()
        .map_err(|e| format!("No se pudo desinstalar el servicio: {e}"))?;
    Ok(())
}

/// Modo kiosco (--kds): resuelve la URL del KDS de respaldo del hub local.
#[tauri::command]
async fn get_kds_url(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(fetch_kds_url(&state.http).await)
}

// ── Bandeja del sistema ─────────────────────────────────────────────────────

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItemBuilder::with_id("open", "Abrir Leogin").build(app)?;
    let status = MenuItemBuilder::with_id("status", "Comprobando estado…")
        .enabled(false)
        .build(app)?;
    let hub = MenuItemBuilder::with_id("hub", "Estado del modo local (impresión)").build(app)?;
    let update = MenuItemBuilder::with_id("update", "Buscar actualizaciones").build(app)?;
    let change = MenuItemBuilder::with_id("change", "Cambiar de cuenta o restaurante").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Salir de Leogin").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&open)
        .separator()
        .item(&status)
        .item(&hub)
        .separator()
        .item(&update)
        .item(&change)
        .separator()
        .item(&quit)
        .build()?;

    *app.state::<AppState>().status_item.lock().unwrap() = Some(status);

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon(StatusColor::Plain))
        .tooltip("Leogin")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "hub" => {
                // Comprobar ANTES de navegar: mandar la ventana a 127.0.0.1
                // sin hub instalado dejaba al usuario en la página de error
                // nativa del WebView (fea, en inglés y sin salida).
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let hub = fetch_hub(&app.state::<AppState>().http).await;
                    if hub.ok {
                        show_main(&app);
                        navigate_main(&app, Url::parse(HUB_HOME).expect("url hub"));
                    } else {
                        info_dialog(
                            &app,
                            "Esta PC no tiene el modo local instalado.\n\nEl modo local mantiene la impresión y los pedidos funcionando sin internet. Se activa desde tu panel: Impresión → \"Hacer de esta PC el servidor del local\" (solo se necesita en una PC del restaurante).",
                        );
                    }
                });
            }
            "update" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move { check_for_update(app, true).await });
            }
            "change" => {
                show_main(app);
                navigate_main(app, local_url("index.html?setup=1"));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

// ── Arranque ────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        // single-instance SIEMPRE primero: un segundo Leogin solo enfoca el existente.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show_main(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Notificaciones nativas: sin esto, Notification.requestPermission()/
        // new Notification() del panel remoto (notifications.tsx) dependen del
        // comportamiento por defecto del WebView2, que no está garantizado.
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .invoke_handler(tauri::generate_handler![
            get_setup_info,
            boot,
            begin_relink,
            open_panel,
            check_cloud,
            hub_status,
            open_hub_page,
            get_pending_update,
            apply_update,
            dismiss_update,
            install_agent_as_server,
            uninstall_agent_server,
            get_kds_url
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let hidden = args.iter().any(|a| a == "--hidden");
            let kiosk = args.iter().any(|a| a == "--kds");
            log_line(
                app.handle(),
                &format!(
                    "arranque v{}{}{}",
                    app.package_info().version,
                    if hidden { " (oculto)" } else { "" },
                    if kiosk { " (kiosco --kds)" } else { "" },
                ),
            );

            app.manage(AppState {
                config: Mutex::new(load_config(app.handle())),
                status_item: Mutex::new(None),
                pending_update: Mutex::new(None),
                agent_update_attempted: Mutex::new(None),
                http: reqwest::Client::builder()
                    .user_agent(format!("LeoginDesktop/{}", env!("CARGO_PKG_VERSION")))
                    .build()
                    .expect("cliente http"),
            });

            if kiosk {
                // Modo kiosco (roadmap §8.2): una sola ventana fullscreen apuntando
                // al KDS de respaldo del hub local de esta PC — sin bandeja, sin
                // toast de actualización, sin pantalla de setup. Pensado para la
                // pantalla dedicada de cocina (acceso directo con --kds).
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("kds.html".into()))
                    .title("Leogin — Cocina")
                    .fullscreen(true)
                    .decorations(false)
                    .initialization_script(EXTERNAL_LINKS_JS)
                    .build()?;
                return Ok(());
            }

            let version = app.package_info().version.to_string();
            let main_init = format!(
                "{EXTERNAL_LINKS_JS}\n{}",
                SHELL_TELEMETRY_JS_TEMPLATE.replace("{VERSION}", &version)
            );

            // Ventana principal: SIEMPRE arranca en la página local de arranque
            // (decide setup / panel / offline sin mostrar errores del WebView).
            let app_for_nav = app.handle().clone();
            let app_for_download = app.handle().clone();
            let main = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Leogin")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 620.0)
                .visible(false)
                // Ctrl +/− y Ctrl+rueda para acercar el panel — en las PCs de
                // caja con pantallas chicas o gente mayor es lo primero que
                // piden; cualquier navegador lo tiene y este shell no lo tenía.
                .zoom_hotkeys_enabled(true)
                .initialization_script(main_init)
                .on_navigation(move |url| {
                    detect_resolved_panel(&app_for_nav, url);
                    true
                })
                .on_download(move |_webview, event| handle_download(&app_for_download, event))
                .build()?;
            if !hidden {
                let _ = main.maximize();
                let _ = main.show();
            }

            // Toast de actualización (oculto hasta que haya una descargada).
            WebviewWindowBuilder::new(app, "update-toast", WebviewUrl::App("toast.html".into()))
                .title("Actualización de Leogin")
                .inner_size(TOAST_W, TOAST_H)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible(false)
                .transparent(true)
                .shadow(false)
                .build()?;

            build_tray(app)?;

            // SIN barra de menú nativa. Hubo una ("Cuenta → Cambiar de
            // cuenta…", 2026-07-10) y se retiró el mismo día: una barra de
            // menú de Windows con un único menú se veía rota, no parecía un
            // botón y nadie entendía qué hacía ahí (feedback directo del
            // usuario). Cambiar de cuenta ya no necesita puerta dedicada:
            // basta cerrar sesión en el panel y entrar con la otra cuenta —
            // `detect_resolved_panel` sigue el panel que resuelva el backend.
            // La bandeja conserva "Cambiar de cuenta o restaurante" como
            // atajo explícito.

            // Sonda de estado (bandeja) + chequeo de actualizaciones cada
            // hora — del SHELL y, en el mismo ciclo, del SERVICIO local de
            // esta PC (maybe_update_agent): la app y su motor de
            // impresión/offline se mantienen al día juntos.
            let h = app.handle().clone();
            tauri::async_runtime::spawn(async move { status_loop(h).await });
            let h2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(20)).await;
                loop {
                    check_for_update(h2.clone(), false).await;
                    maybe_update_agent(&h2).await;
                    tokio::time::sleep(Duration::from_secs(3600)).await;
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    // Cerrar = ocultar a la bandeja (patrón Claude/Slack);
                    // el hub sigue imprimiendo porque es un servicio aparte.
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("no se pudo arrancar Leogin");
}
