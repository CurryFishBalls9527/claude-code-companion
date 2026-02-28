use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Spawn the Node.js backend as a child process
            spawn_backend(app.handle().clone());

            // Build system tray menu
            let show = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Claude Dashboard")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimise to tray instead of closing
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn spawn_backend<R: Runtime>(app: tauri::AppHandle<R>) {
    // Only auto-spawn in debug / dev mode
    if !cfg!(debug_assertions) {
        return;
    }

    use tauri_plugin_shell::ShellExt;

    // Find node binary – convert to owned String immediately so it is 'static
    let node_bin: Option<String> = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ]
    .iter()
    .find(|p| std::path::Path::new(*p).exists())
    .map(|s| s.to_string());

    let Some(node_bin) = node_bin else {
        log::warn!("Node.js not found in known paths; backend will not start automatically.");
        return;
    };

    // tsx runner path and entry script – both owned Strings
    let tsx_path = std::env::current_dir()
        .unwrap_or_default()
        .join("node_modules/.bin/tsx")
        .to_string_lossy()
        .to_string();

    let server_script = "src/backend/server.ts".to_string();

    tauri::async_runtime::spawn(async move {
        let shell = app.shell();
        match shell
            .command(&node_bin)
            .args([&tsx_path, &server_script])
            .spawn()
        {
            Ok(_) => log::info!("Backend started via {} {}", node_bin, tsx_path),
            Err(e) => log::error!("Failed to start backend: {}", e),
        }
    });
}
