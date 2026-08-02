use std::{
    fs,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Runtime, WebviewWindow};

const MAIN_WINDOW_LABEL: &str = "main";
const SETTINGS_FILE_NAME: &str = "settings.json";
const SAFE_WINDOW_MARGIN_PX: i32 = 24;
const AUTO_MOVE_STEP_X_PX: i32 = 96;
const AUTO_MOVE_STEP_Y_PX: i32 = 48;

#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

#[tauri::command]
pub fn read_settings(app: AppHandle) -> serde_json::Value {
    match settings_path(&app) {
        Ok(path) => read_settings_from_path(&path),
        Err(error) => {
            eprintln!("{error}");
            serde_json::json!({})
        }
    }
}

#[tauri::command]
pub fn write_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    write_settings_to_path(&path, &settings)
}

#[tauri::command]
pub fn set_always_on_top(app: AppHandle, enabled: bool) -> Result<(), String> {
    main_window(&app)?
        .set_always_on_top(enabled)
        .map_err(|error| format!("failed to set always-on-top: {error}"))
}

#[tauri::command]
pub fn set_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = main_window(&app)?;
    set_window_click_through(&window, enabled)
}

#[tauri::command]
pub fn reset_window_position(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    reset_window_to_safe_position(&window)
}

#[tauri::command]
pub fn move_window_for_auto_step(app: AppHandle, movement_range: String) -> Result<(), String> {
    let window = main_window(&app)?;
    let monitor = window
        .current_monitor()
        .map_err(|error| format!("failed to read current monitor: {error}"))?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "failed to find a visible monitor for auto movement".to_string())?;
    let work_area = monitor.work_area();
    let outer_position = window
        .outer_position()
        .map_err(|error| format!("failed to read main window position: {error}"))?;
    let outer_size = window
        .outer_size()
        .map_err(|error| format!("failed to read main window size: {error}"))?;
    let next_position = calculate_auto_move_position(
        MovementRangeMode::from_value(&movement_range),
        WorkArea {
            x: work_area.position.x,
            y: work_area.position.y,
            width: work_area.size.width,
            height: work_area.size.height,
        },
        WindowGeometry {
            x: outer_position.x,
            y: outer_position.y,
            width: outer_size.width,
            height: outer_size.height,
        },
    );

    window
        .set_position(next_position)
        .map_err(|error| format!("failed to move main window for auto step: {error}"))
}

#[tauri::command]
pub fn show_window(app: AppHandle) -> Result<(), String> {
    show_main_window(&app)
}

#[tauri::command]
pub fn hide_window(app: AppHandle) -> Result<(), String> {
    hide_main_window(&app)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    window
        .show()
        .map_err(|error| format!("failed to show main window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("failed to focus main window: {error}"))
}

pub fn hide_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    main_window(app)?
        .hide()
        .map_err(|error| format!("failed to hide main window: {error}"))
}

pub fn emit_open_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    set_window_click_through(&window, false)?;
    window
        .show()
        .map_err(|error| format!("failed to show main window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("failed to focus main window: {error}"))?;
    app.emit("open-settings", ())
        .map_err(|error| format!("failed to emit open-settings: {error}"))
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("window `{MAIN_WINDOW_LABEL}` not found"))
}

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(SETTINGS_FILE_NAME))
        .map_err(|error| format!("<app_data_dir>/{SETTINGS_FILE_NAME}: {error}"))
}

fn read_settings_from_path(path: &Path) -> serde_json::Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn write_settings_to_path(path: &Path, settings: &serde_json::Value) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| {
        format!(
            "failed to write settings {}: missing parent directory",
            path.display()
        )
    })?;
    let contents = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("failed to serialize settings {}: {error}", path.display()))?;

    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "failed to create settings directory {}: {error}",
            parent.display()
        )
    })?;
    fs::write(path, contents)
        .map_err(|error| format!("failed to write settings {}: {error}", path.display()))
}

fn reset_window_to_safe_position<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    let outer_size = window
        .outer_size()
        .map_err(|error| format!("failed to read main window size: {error}"))?;
    let monitor = window
        .primary_monitor()
        .map_err(|error| format!("failed to read primary monitor: {error}"))?
        .or_else(|| window.current_monitor().ok().flatten())
        .ok_or_else(|| "failed to find a visible monitor for window reset".to_string())?;
    let work_area = monitor.work_area();
    let work_position = work_area.position;
    let work_size = work_area.size;
    let window_width = outer_size.width as i32;
    let window_height = outer_size.height as i32;

    let min_x = work_position.x + SAFE_WINDOW_MARGIN_PX;
    let min_y = work_position.y + SAFE_WINDOW_MARGIN_PX;
    let max_x = work_position.x + work_size.width as i32 - window_width - SAFE_WINDOW_MARGIN_PX;
    let max_y = work_position.y + work_size.height as i32 - window_height - SAFE_WINDOW_MARGIN_PX;
    let fallback_x = work_position.x + ((work_size.width as i32 - window_width) / 2).max(0);
    let fallback_y = work_position.y + ((work_size.height as i32 - window_height) / 2).max(0);
    let x = if max_x >= min_x { max_x } else { fallback_x };
    let y = if max_y >= min_y { max_y } else { fallback_y };

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to reset main window position: {error}"))
}

#[derive(Clone, Copy)]
struct WorkArea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy)]
struct WindowGeometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[cfg(test)]
type TestWorkArea = WorkArea;

#[cfg(test)]
type TestWindowGeometry = WindowGeometry;

#[derive(Clone, Copy)]
enum MovementRangeMode {
    Bottom,
    ActiveScreen,
    Free,
}

impl MovementRangeMode {
    fn from_value(value: &str) -> Self {
        match value {
            "active-screen" => Self::ActiveScreen,
            "free" => Self::Free,
            _ => Self::Bottom,
        }
    }
}

fn calculate_auto_move_position(
    mode: MovementRangeMode,
    work_area: WorkArea,
    window: WindowGeometry,
) -> PhysicalPosition<i32> {
    let next_x = step_axis(
        window.x,
        work_area.x,
        work_area.width,
        window.width,
        AUTO_MOVE_STEP_X_PX,
    );

    match mode {
        MovementRangeMode::Bottom => PhysicalPosition::new(
            next_x,
            bottom_axis(work_area.y, work_area.height, window.height),
        ),
        MovementRangeMode::ActiveScreen => PhysicalPosition::new(
            next_x,
            clamp_axis(window.y, work_area.y, work_area.height, window.height),
        ),
        MovementRangeMode::Free => PhysicalPosition::new(
            next_x,
            step_axis(
                window.y,
                work_area.y,
                work_area.height,
                window.height,
                AUTO_MOVE_STEP_Y_PX,
            ),
        ),
    }
}

fn step_axis(
    current: i32,
    area_start: i32,
    area_size: u32,
    window_size: u32,
    step: i32,
) -> i32 {
    let (min, max) = safe_axis_bounds(area_start, area_size, window_size);

    if max < min {
        return centered_axis(area_start, area_size, window_size);
    }

    let next = current + step;
    if next > max || next < min {
        min
    } else {
        next
    }
}

fn clamp_axis(current: i32, area_start: i32, area_size: u32, window_size: u32) -> i32 {
    let (min, max) = safe_axis_bounds(area_start, area_size, window_size);

    if max < min {
        return centered_axis(area_start, area_size, window_size);
    }

    current.clamp(min, max)
}

fn bottom_axis(area_start: i32, area_size: u32, window_size: u32) -> i32 {
    let (min, max) = safe_axis_bounds(area_start, area_size, window_size);

    if max < min {
        return centered_axis(area_start, area_size, window_size);
    }

    max
}

fn safe_axis_bounds(area_start: i32, area_size: u32, window_size: u32) -> (i32, i32) {
    let area_size = area_size as i32;
    let window_size = window_size as i32;

    (
        area_start + SAFE_WINDOW_MARGIN_PX,
        area_start + area_size - window_size - SAFE_WINDOW_MARGIN_PX,
    )
}

fn centered_axis(area_start: i32, area_size: u32, window_size: u32) -> i32 {
    area_start + ((area_size as i32 - window_size as i32) / 2).max(0)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn set_window_click_through<R: Runtime>(
    window: &WebviewWindow<R>,
    enabled: bool,
) -> Result<(), String> {
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| format!("failed to set click-through: {error}"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn set_window_click_through<R: Runtime>(
    _window: &WebviewWindow<R>,
    enabled: bool,
) -> Result<(), String> {
    eprintln!("click-through unsupported on this platform; requested enabled={enabled}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn read_settings_from_path_returns_empty_object_for_invalid_json() {
        let settings_path = unique_settings_path("invalid-json");
        fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
        fs::write(&settings_path, "{not valid json").unwrap();

        let settings = read_settings_from_path(&settings_path);

        assert_eq!(settings, serde_json::json!({}));
        let _ = fs::remove_dir_all(settings_path.parent().unwrap());
    }

    #[test]
    fn write_settings_to_path_creates_parent_directory_and_writes_json() {
        let settings_path = unique_settings_path("write-json");
        let settings = serde_json::json!({ "scale": 1.4, "alwaysOnTop": false });

        write_settings_to_path(&settings_path, &settings).unwrap();

        let stored_settings: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&settings_path).unwrap()).unwrap();
        assert_eq!(stored_settings, settings);
        let _ = fs::remove_dir_all(settings_path.parent().unwrap());
    }

    #[test]
    fn bottom_auto_move_wraps_to_left_and_stays_near_bottom() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
        };
        let window = TestWindowGeometry {
            x: 700,
            y: 120,
            width: 100,
            height: 120,
        };

        let position = calculate_auto_move_position(MovementRangeMode::Bottom, work_area, window);

        assert_eq!(position, PhysicalPosition::new(24, 456));
    }

    #[test]
    fn active_screen_auto_move_steps_x_and_keeps_current_y() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
        };
        let window = TestWindowGeometry {
            x: 100,
            y: 222,
            width: 100,
            height: 120,
        };

        let position =
            calculate_auto_move_position(MovementRangeMode::ActiveScreen, work_area, window);

        assert_eq!(position, PhysicalPosition::new(196, 222));
    }

    #[test]
    fn free_auto_move_steps_x_and_y_with_safe_wrap() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
        };
        let window = TestWindowGeometry {
            x: 630,
            y: 440,
            width: 100,
            height: 120,
        };

        let position = calculate_auto_move_position(MovementRangeMode::Free, work_area, window);

        assert_eq!(position, PhysicalPosition::new(24, 24));
    }

    fn unique_settings_path(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        std::env::temp_dir()
            .join(format!("couple-desktop-pet-{label}-{suffix}"))
            .join("settings.json")
    }
}
