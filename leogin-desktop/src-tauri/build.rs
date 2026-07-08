fn main() {
    // AppManifest: genera los permisos allow-<comando>/deny-<comando> para los
    // comandos propios del shell (no de plugins) — sin esto, Tauri bloquea
    // cualquier invoke() hecho desde contenido REMOTO (ver
    // capabilities/remote-panel.json) aunque el comando esté registrado; es
    // el mecanismo que permite exponer install_agent_as_server al panel sin
    // abrirle el resto (apply_update, save_panel_url…) — ver LEOGIN_DESKTOP.md §6.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "get_setup_info",
            "boot",
            "save_panel_url",
            "open_panel",
            "check_cloud",
            "hub_status",
            "open_hub_page",
            "get_pending_update",
            "apply_update",
            "dismiss_update",
            "install_agent_as_server",
            "get_kds_url",
        ])),
    )
    .expect("failed to run tauri-build");
}
