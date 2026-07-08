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
    AppHandle, Emitter, Manager, State, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

const HUB_HEALTH: &str = "http://127.0.0.1:47100/health";
const HUB_HOME: &str = "http://127.0.0.1:47100/";
const TRAY_ID: &str = "leogin-tray";
const TOAST_W: f64 = 396.0;
const TOAST_H: f64 = 150.0;

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
/// la página de arranque salta a offline.html.
#[tauri::command]
async fn boot(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let origin = { state.config.lock().unwrap().panel_url.clone() };
    let Some(origin) = origin else { return Ok("setup".into()) };
    if cloud_reachable(&state.http, &origin).await {
        let url = Url::parse(&admin_url(&origin)).map_err(|e| e.to_string())?;
        log_line(&app, "boot → panel");
        navigate_main(&app, url);
        Ok("panel".into())
    } else {
        log_line(&app, "boot → offline (nube no responde)");
        Ok("offline".into())
    }
}

#[tauri::command]
async fn save_panel_url(app: AppHandle, state: State<'_, AppState>, url: String) -> Result<(), String> {
    let origin = normalize_panel_url(&url)?;
    if !cloud_reachable(&state.http, &origin).await {
        return Err(
            "No se pudo conectar con esa dirección. Revisa que sea la misma que usas en el navegador y que haya internet.".into(),
        );
    }
    let cfg = {
        let mut cfg = state.config.lock().unwrap();
        cfg.panel_url = Some(origin.clone());
        cfg.clone()
    };
    save_config(&app, &cfg);
    log_line(&app, &format!("panel configurado: {origin}"));
    // Desde ahora Leogin arranca con Windows, oculto en la bandeja (--hidden).
    let _ = app.autolaunch().enable();
    let dest = Url::parse(&admin_url(&origin)).map_err(|e| e.to_string())?;
    navigate_main(&app, dest);
    Ok(())
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

// ── Bandeja del sistema ─────────────────────────────────────────────────────

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItemBuilder::with_id("open", "Abrir Leogin").build(app)?;
    let status = MenuItemBuilder::with_id("status", "Comprobando estado…")
        .enabled(false)
        .build(app)?;
    let hub = MenuItemBuilder::with_id("hub", "Estado del hub local").build(app)?;
    let update = MenuItemBuilder::with_id("update", "Buscar actualizaciones").build(app)?;
    let change = MenuItemBuilder::with_id("change", "Cambiar dirección del panel").build(app)?;
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
                show_main(app);
                navigate_main(app, Url::parse(HUB_HOME).expect("url hub"));
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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .invoke_handler(tauri::generate_handler![
            get_setup_info,
            boot,
            save_panel_url,
            open_panel,
            check_cloud,
            hub_status,
            open_hub_page,
            get_pending_update,
            apply_update,
            dismiss_update
        ])
        .setup(|app| {
            let hidden = std::env::args().any(|a| a == "--hidden");
            log_line(
                app.handle(),
                &format!("arranque v{}{}", app.package_info().version, if hidden { " (oculto)" } else { "" }),
            );

            app.manage(AppState {
                config: Mutex::new(load_config(app.handle())),
                status_item: Mutex::new(None),
                pending_update: Mutex::new(None),
                http: reqwest::Client::builder()
                    .user_agent(format!("LeoginDesktop/{}", env!("CARGO_PKG_VERSION")))
                    .build()
                    .expect("cliente http"),
            });

            // Ventana principal: SIEMPRE arranca en la página local de arranque
            // (decide setup / panel / offline sin mostrar errores del WebView).
            let main = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Leogin")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 620.0)
                .visible(false)
                .initialization_script(EXTERNAL_LINKS_JS)
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

            // Sonda de estado (bandeja) + chequeo de actualizaciones cada hora.
            let h = app.handle().clone();
            tauri::async_runtime::spawn(async move { status_loop(h).await });
            let h2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(20)).await;
                loop {
                    check_for_update(h2.clone(), false).await;
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
