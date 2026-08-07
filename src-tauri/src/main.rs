#![cfg_attr(windows, windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};

mod commands;
mod pet_packages;
mod platform;

static EXPLICIT_APP_QUIT_REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MainWindowCloseAction {
    Hide,
    AllowClose,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            platform::configure_platform_shell(app)?;
            setup_tray(app)?;
            if let Err(error) = commands::install_main_window_close_to_hide(app.handle()) {
                eprintln!("failed to install main window close handler: {error}");
            }
            if let Err(error) = commands::restore_saved_window_position(app.handle()) {
                eprintln!("failed to restore saved window position: {error}");
            }
            if let Err(error) = commands::track_window_position(app.handle()) {
                eprintln!("failed to track window position: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::read_settings,
            commands::write_settings,
            commands::set_always_on_top,
            commands::set_click_through,
            commands::reset_window_position,
            commands::move_window_for_auto_step,
            commands::snap_window_to_edge_if_needed,
            commands::restore_window_from_edge_peek,
            commands::open_message_composer_surface,
            commands::close_message_composer_surface,
            commands::show_window,
            commands::hide_window,
            commands::quit_app,
            pet_packages::list_pet_packages,
            pet_packages::import_pet_package,
            pet_packages::delete_pet_package,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}

pub(crate) fn request_app_exit<R: tauri::Runtime>(app: &tauri::AppHandle<R>, code: i32) {
    EXPLICIT_APP_QUIT_REQUESTED.store(true, Ordering::SeqCst);
    app.exit(code);
}

pub(crate) fn is_explicit_app_quit_requested() -> bool {
    EXPLICIT_APP_QUIT_REQUESTED.load(Ordering::SeqCst)
}

pub(crate) fn main_window_close_action(explicit_quit: bool) -> MainWindowCloseAction {
    if explicit_quit {
        MainWindowCloseAction::AllowClose
    } else {
        MainWindowCloseAction::Hide
    }
}

pub(crate) fn handle_main_window_close_request<PreventClose, HideWindow>(
    explicit_quit: bool,
    mut prevent_close: PreventClose,
    mut hide_window: HideWindow,
) -> Result<(), String>
where
    PreventClose: FnMut(),
    HideWindow: FnMut() -> Result<(), String>,
{
    match main_window_close_action(explicit_quit) {
        MainWindowCloseAction::Hide => {
            prevent_close();
            hide_window()
        }
        MainWindowCloseAction::AllowClose => Ok(()),
    }
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
                    request_app_exit(app, 0);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_window_close_policy_hides_ordinary_close_and_allows_explicit_quit() {
        assert_eq!(main_window_close_action(false), MainWindowCloseAction::Hide);
        assert_eq!(
            main_window_close_action(true),
            MainWindowCloseAction::AllowClose
        );
    }

    #[test]
    fn main_window_close_handler_hides_ordinary_close_and_leaves_explicit_quit_alone() {
        let mut hide_count = 0;
        let mut prevent_count = 0;
        let ordinary = handle_main_window_close_request(
            false,
            || {
                prevent_count += 1;
            },
            || {
                hide_count += 1;
                Ok(())
            },
        );

        assert_eq!(ordinary, Ok(()));
        assert_eq!(prevent_count, 1);
        assert_eq!(hide_count, 1);

        let explicit = handle_main_window_close_request(
            true,
            || {
                prevent_count += 1;
            },
            || {
                hide_count += 1;
                Ok(())
            },
        );

        assert_eq!(explicit, Ok(()));
        assert_eq!(prevent_count, 1);
        assert_eq!(hide_count, 1);
    }
}
