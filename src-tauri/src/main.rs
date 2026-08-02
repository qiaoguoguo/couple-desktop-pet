mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::read_settings,
            commands::write_settings,
            commands::set_always_on_top,
            commands::set_click_through,
            commands::reset_window_position,
            commands::show_window,
            commands::hide_window,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}

#[cfg(desktop)]
fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    use tauri::{menu::MenuBuilder, tray::TrayIconBuilder};

    let menu = MenuBuilder::new(app)
        .text("show", "显示")
        .text("hide", "隐藏")
        .text("settings", "设置")
        .text("quit", "退出")
        .build()?;
    let mut tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("情侣桌宠")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let result = match event.id().as_ref() {
                "show" => commands::show_main_window(app),
                "hide" => commands::hide_main_window(app),
                "settings" => commands::emit_open_settings(app),
                "quit" => {
                    app.exit(0);
                    Ok(())
                }
                _ => Ok(()),
            };

            if let Err(error) = result {
                eprintln!("tray menu `{}` failed: {error}", event.id().as_ref());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

#[cfg(not(desktop))]
fn setup_tray(_app: &mut tauri::App) -> tauri::Result<()> {
    Ok(())
}
