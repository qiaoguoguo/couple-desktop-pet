use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, Runtime};
use zip::{write::SimpleFileOptions, ZipWriter};

use crate::commands::{self, ClickThroughRecoveryReason, EdgePeekSide};

const PET_PACKAGES_DIR: &str = "pet-packages";
const PNG_FIXTURE_BYTES: [u8; 68] = [
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0,
    0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0,
    239, 191, 167, 219, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

#[derive(Serialize)]
pub struct E2ePoint {
    x: i32,
    y: i32,
}

#[derive(Serialize)]
pub struct E2eSize {
    width: u32,
    height: u32,
}

#[derive(Serialize)]
pub struct E2eRect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
pub struct E2eWindowState {
    visible: bool,
    focused: bool,
    decorated: bool,
    resizable: bool,
    always_on_top: bool,
    tray_exists: bool,
    scale_factor: f64,
    position: E2ePoint,
    size: E2eSize,
    work_area: Option<E2eRect>,
}

#[derive(Serialize)]
pub struct E2eAppDataPaths {
    app_data_dir: String,
    settings_path: String,
    window_position_path: String,
    pet_packages_dir: String,
}

#[derive(Deserialize, Serialize)]
pub struct E2eSavedWindowPosition {
    x: i32,
    y: i32,
}

#[derive(Serialize)]
pub struct E2ePetPackageFixture {
    source_path: String,
    package_id: String,
    name: String,
}

#[tauri::command]
pub fn e2e_window_state(app: AppHandle) -> Result<E2eWindowState, String> {
    read_window_state(&app)
}

#[tauri::command]
pub fn e2e_app_data_paths(app: AppHandle) -> Result<E2eAppDataPaths, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to read app data dir: {error}"))?;
    let window_position_path = commands::window_position_path(&app)?;

    Ok(E2eAppDataPaths {
        settings_path: app_data_dir.join("settings.json").display().to_string(),
        window_position_path: window_position_path.display().to_string(),
        pet_packages_dir: app_data_dir.join(PET_PACKAGES_DIR).display().to_string(),
        app_data_dir: app_data_dir.display().to_string(),
    })
}

#[tauri::command]
pub fn e2e_trigger_tray_show(app: AppHandle) -> Result<(), String> {
    commands::recover_click_through_and_show_main_window(&app, ClickThroughRecoveryReason::Show)
}

#[tauri::command]
pub fn e2e_trigger_tray_hide(app: AppHandle) -> Result<(), String> {
    commands::hide_main_window(&app)
}

#[tauri::command]
pub fn e2e_trigger_tray_settings(app: AppHandle) -> Result<(), String> {
    commands::recover_click_through_and_show_main_window(&app, ClickThroughRecoveryReason::Settings)
}

#[tauri::command]
pub fn e2e_trigger_tray_quit(app: AppHandle) -> Result<(), String> {
    crate::request_app_exit(&app, 0);
    Ok(())
}

#[tauri::command]
pub fn e2e_close_main_window(app: AppHandle) -> Result<(), String> {
    commands::main_window(&app)?
        .close()
        .map_err(|error| format!("failed to close main window in e2e: {error}"))
}

#[tauri::command]
pub fn e2e_move_window(app: AppHandle, x: i32, y: i32) -> Result<E2eWindowState, String> {
    let window = commands::main_window(&app)?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to move main window in e2e: {error}"))?;
    read_window_state(&app)
}

#[tauri::command]
pub fn e2e_read_window_position(app: AppHandle) -> Result<Option<E2eSavedWindowPosition>, String> {
    let path = commands::window_position_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(&path)
        .map_err(|error| format!("failed to read window position {}: {error}", path.display()))
        .and_then(|contents| {
            serde_json::from_str::<E2eSavedWindowPosition>(&contents).map_err(|error| {
                format!(
                    "failed to parse window position {}: {error}",
                    path.display()
                )
            })
        })
        .map(Some)
}

#[tauri::command]
pub fn e2e_move_near_edge(app: AppHandle, side: EdgePeekSide) -> Result<E2eWindowState, String> {
    let window = commands::main_window(&app)?;
    let monitor = window
        .current_monitor()
        .map_err(|error| format!("failed to read current monitor for e2e edge move: {error}"))?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "failed to find monitor for e2e edge move".to_string())?;
    let work_area = monitor.work_area();
    let size = window
        .outer_size()
        .map_err(|error| format!("failed to read main window size for e2e edge move: {error}"))?;
    let work_right = work_area.position.x + work_area.size.width as i32;
    let work_bottom = work_area.position.y + work_area.size.height as i32;
    let centered_x =
        work_area.position.x + ((work_area.size.width as i32 - size.width as i32) / 2).max(0);
    let centered_y =
        work_area.position.y + ((work_area.size.height as i32 - size.height as i32) / 2).max(0);
    let trigger_offset = 8;
    let position = match side {
        EdgePeekSide::Left => {
            PhysicalPosition::new(work_area.position.x + trigger_offset, centered_y)
        }
        EdgePeekSide::Right => {
            PhysicalPosition::new(work_right - size.width as i32 - trigger_offset, centered_y)
        }
        EdgePeekSide::Top => {
            PhysicalPosition::new(centered_x, work_area.position.y + trigger_offset)
        }
        EdgePeekSide::Bottom => PhysicalPosition::new(
            centered_x,
            work_bottom - size.height as i32 - trigger_offset,
        ),
    };

    window
        .set_position(position)
        .map_err(|error| format!("failed to move main window near edge in e2e: {error}"))?;
    read_window_state(&app)
}

#[tauri::command]
pub fn e2e_trigger_edge_snap(app: AppHandle) -> Result<Option<EdgePeekSide>, String> {
    commands::snap_window_to_edge_if_needed(app)
}

#[tauri::command]
pub fn e2e_restore_edge(app: AppHandle, side: EdgePeekSide) -> Result<E2eWindowState, String> {
    commands::restore_window_from_edge_peek(app.clone(), side)?;
    read_window_state(&app)
}

#[tauri::command]
pub fn e2e_trigger_auto_move(
    app: AppHandle,
    movement_range: String,
) -> Result<E2eWindowState, String> {
    commands::move_window_for_auto_step(app.clone(), movement_range)?;
    read_window_state(&app)
}

#[tauri::command]
pub fn e2e_create_pet_package_fixture(app: AppHandle) -> Result<E2ePetPackageFixture, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to read app data dir for e2e fixture: {error}"))?;
    let fixture_dir = fixed_fixture_dir(&app_data_dir);
    fs::create_dir_all(&fixture_dir).map_err(|error| {
        format!(
            "failed to create e2e fixture dir {}: {error}",
            fixture_dir.display()
        )
    })?;

    let source_path = fixed_fixture_source_path(&app_data_dir);
    write_pet_package_fixture(&source_path)?;

    Ok(E2ePetPackageFixture {
        source_path: source_path.display().to_string(),
        package_id: "imported:e2e-native-parity".to_string(),
        name: "E2E Native Parity".to_string(),
    })
}

#[tauri::command]
pub fn e2e_remove_pet_package_fixture(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to read app data dir for e2e fixture cleanup: {error}"))?;
    let path = fixed_fixture_source_path(&app_data_dir);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("failed to remove e2e fixture {}: {error}", path.display()))?;
    }
    Ok(())
}

fn read_window_state<R: Runtime>(app: &AppHandle<R>) -> Result<E2eWindowState, String> {
    let window = commands::main_window(app)?;
    let position = window
        .outer_position()
        .map_err(|error| format!("failed to read main window position: {error}"))?;
    let size = window
        .outer_size()
        .map_err(|error| format!("failed to read main window size: {error}"))?;
    let work_area = window
        .current_monitor()
        .map_err(|error| format!("failed to read current monitor: {error}"))?
        .or_else(|| window.primary_monitor().ok().flatten())
        .map(|monitor| {
            let area = monitor.work_area();
            E2eRect {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
            }
        });

    Ok(E2eWindowState {
        visible: window
            .is_visible()
            .map_err(|error| format!("failed to read main window visibility: {error}"))?,
        focused: window
            .is_focused()
            .map_err(|error| format!("failed to read main window focus: {error}"))?,
        decorated: window
            .is_decorated()
            .map_err(|error| format!("failed to read main window decorations: {error}"))?,
        resizable: window
            .is_resizable()
            .map_err(|error| format!("failed to read main window resizable state: {error}"))?,
        always_on_top: window
            .is_always_on_top()
            .map_err(|error| format!("failed to read main window z-order state: {error}"))?,
        tray_exists: app.tray_by_id("main").is_some(),
        scale_factor: window
            .scale_factor()
            .map_err(|error| format!("failed to read main window scale factor: {error}"))?,
        position: E2ePoint {
            x: position.x,
            y: position.y,
        },
        size: E2eSize {
            width: size.width,
            height: size.height,
        },
        work_area,
    })
}

fn fixed_fixture_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("e2e-fixtures")
}

fn fixed_fixture_source_path(app_data_dir: &Path) -> PathBuf {
    fixed_fixture_dir(app_data_dir).join("native-parity-fixture.cdpet")
}

fn write_pet_package_fixture(path: &Path) -> Result<(), String> {
    let file = fs::File::create(path).map_err(|error| {
        format!(
            "failed to create e2e package fixture {}: {error}",
            path.display()
        )
    })?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let manifest = format!(
        r#"{{
  "formatVersion": 3,
  "renderer": "motion-pool",
  "id": "e2e-native-parity",
  "name": "E2E Native Parity",
  "baseSize": {{ "width": 256, "height": 320 }},
  "frameSize": {{ "width": 768, "height": 960 }},
  "defaultMotion": "motion-001",
  "motions": {{
    "motion-001": {{ "fps": 5, "loop": true, "frameCount": 2, "durationMs": 3000, "frames": "motions/motion-001/", "weight": 1, "tags": ["idle", "e2e-{timestamp}"] }}
  }}
}}"#
    );

    zip.start_file("pet.json", options)
        .map_err(|error| format!("failed to write e2e fixture manifest: {error}"))?;
    zip.write_all(manifest.as_bytes())
        .map_err(|error| format!("failed to write e2e fixture manifest bytes: {error}"))?;
    zip.start_file("preview.png", options)
        .map_err(|error| format!("failed to write e2e fixture preview: {error}"))?;
    zip.write_all(&PNG_FIXTURE_BYTES)
        .map_err(|error| format!("failed to write e2e fixture preview bytes: {error}"))?;
    for index in 1..=2 {
        zip.start_file(format!("motions/motion-001/{index:04}.png"), options)
            .map_err(|error| format!("failed to write e2e fixture frame {index}: {error}"))?;
        zip.write_all(&PNG_FIXTURE_BYTES)
            .map_err(|error| format!("failed to write e2e fixture frame bytes {index}: {error}"))?;
    }
    zip.finish()
        .map_err(|error| format!("failed to finish e2e fixture zip: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{fixed_fixture_dir, fixed_fixture_source_path};
    use std::path::Path;

    #[test]
    fn fixed_fixture_source_path_stays_inside_app_data_e2e_fixtures() {
        let app_data = Path::new("/tmp/couple-pet-e2e");

        assert_eq!(
            fixed_fixture_source_path(app_data),
            app_data
                .join("e2e-fixtures")
                .join("native-parity-fixture.cdpet")
        );
        assert_eq!(fixed_fixture_dir(app_data), app_data.join("e2e-fixtures"));
    }

    #[test]
    fn fixed_fixture_source_path_does_not_accept_external_input() {
        let app_data = Path::new("/tmp/couple-pet-e2e");
        let fixed = fixed_fixture_source_path(app_data);

        assert_ne!(fixed, Path::new("/tmp/escape.cdpet"));
        assert_ne!(fixed, app_data.join("..").join("escape.cdpet"));
    }
}
