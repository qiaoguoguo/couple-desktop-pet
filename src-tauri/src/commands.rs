use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, Size, WebviewWindow,
    WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";
const SETTINGS_FILE_NAME: &str = "settings.json";
const WINDOW_POSITION_FILE_NAME: &str = "window-position.json";
const DEFAULT_WINDOW_WIDTH_PX: u32 = 320;
const DEFAULT_WINDOW_HEIGHT_PX: u32 = 360;
const MESSAGE_COMPOSER_SURFACE_WIDTH_PX: u32 = 440;
const MESSAGE_COMPOSER_SURFACE_HEIGHT_PX: u32 = 260;
const SAFE_WINDOW_MARGIN_PX: i32 = 24;
const AUTO_MOVE_STEP_X_PX: i32 = 96;
const AUTO_MOVE_STEP_Y_PX: i32 = 48;
const EDGE_PEEK_TRIGGER_PX: i32 = 24;

static MESSAGE_COMPOSER_SURFACE_STATE: Mutex<Option<WindowGeometry>> = Mutex::new(None);

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
    let position = reset_window_to_safe_position(&window)?;
    save_window_position(&app, position)
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
        .map_err(|error| format!("failed to move main window for auto step: {error}"))?;
    save_window_position(&app, next_position)
}

#[tauri::command]
pub fn snap_window_to_edge_if_needed(app: AppHandle) -> Result<Option<EdgePeekSide>, String> {
    let window = main_window(&app)?;
    let (work_area, geometry) = read_current_window_geometry(&window, "edge peek")?;
    let Some(snap) = calculate_edge_peek_snap(work_area, geometry) else {
        return Ok(None);
    };

    window
        .set_position(snap.position)
        .map_err(|error| format!("failed to snap main window to edge: {error}"))?;
    save_window_position(&app, snap.position)?;

    Ok(Some(snap.side))
}

#[tauri::command]
pub fn restore_window_from_edge_peek(app: AppHandle, side: EdgePeekSide) -> Result<(), String> {
    let window = main_window(&app)?;
    let (work_area, geometry) = read_current_window_geometry(&window, "edge peek restore")?;
    let position = calculate_edge_peek_restore_position(side, work_area, geometry);

    window
        .set_position(position)
        .map_err(|error| format!("failed to restore main window from edge peek: {error}"))?;
    save_window_position(&app, position)
}

#[tauri::command]
pub fn open_message_composer_surface(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    if is_message_composer_surface_open() {
        return show_main_window(&app);
    }

    let (work_area, geometry) = read_current_window_geometry(&window, "message composer")?;
    let surface = calculate_message_composer_surface_geometry(work_area, geometry);

    if !save_message_composer_surface_if_absent(surface.saved_pet_window)? {
        return show_main_window(&app);
    }

    if let Err(error) = apply_window_geometry(&window, surface.window)
        .and_then(|_| show_main_window(&app))
    {
        let _ = set_saved_message_composer_surface(None);
        return Err(error);
    }

    Ok(())
}

#[tauri::command]
pub fn close_message_composer_surface(app: AppHandle) -> Result<(), String> {
    let close_result = (|| {
        let window = main_window(&app)?;
        let (work_area, geometry) =
            read_current_window_geometry(&window, "message composer restore")?;
        let saved_geometry = saved_message_composer_surface()?;
        let restore_geometry =
            calculate_message_composer_restore_geometry(work_area, geometry, saved_geometry);

        apply_window_geometry(&window, restore_geometry)?;
        save_window_position(
            &app,
            PhysicalPosition::new(restore_geometry.x, restore_geometry.y),
        )
    })();

    clear_message_composer_surface_after_close(close_result)
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

pub fn restore_saved_window_position<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let path = window_position_path(app)?;
    let Some(saved_position) = read_window_position_from_path(&path) else {
        return Ok(());
    };
    let window = main_window(app)?;
    let monitor = window
        .current_monitor()
        .map_err(|error| format!("failed to read current monitor: {error}"))?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "failed to find a visible monitor for saved window position".to_string())?;
    let work_area = monitor.work_area();
    let outer_size = window
        .outer_size()
        .map_err(|error| format!("failed to read main window size: {error}"))?;
    let position = clamp_saved_window_position(
        saved_position,
        WorkArea {
            x: work_area.position.x,
            y: work_area.position.y,
            width: work_area.size.width,
            height: work_area.size.height,
        },
        WindowGeometry {
            x: saved_position.x,
            y: saved_position.y,
            width: outer_size.width,
            height: outer_size.height,
        },
    );

    window
        .set_position(position)
        .map_err(|error| format!("failed to restore saved window position: {error}"))
}

pub fn track_window_position<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    let app_handle = app.clone();

    window.on_window_event(move |event| {
        if let WindowEvent::Moved(position) = event {
            if is_message_composer_surface_open() {
                return;
            }

            let position = PhysicalPosition::new(position.x, position.y);

            if let Err(error) = save_window_position(&app_handle, position) {
                eprintln!("{error}");
            }
        }
    });

    Ok(())
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("window `{MAIN_WINDOW_LABEL}` not found"))
}

fn apply_window_geometry<R: Runtime>(
    window: &WebviewWindow<R>,
    geometry: WindowGeometry,
) -> Result<(), String> {
    window
        .set_size(Size::Physical(PhysicalSize::new(
            geometry.width,
            geometry.height,
        )))
        .map_err(|error| format!("failed to resize main window: {error}"))?;
    window
        .set_position(PhysicalPosition::new(geometry.x, geometry.y))
        .map_err(|error| format!("failed to move main window: {error}"))
}

fn saved_message_composer_surface() -> Result<Option<WindowGeometry>, String> {
    MESSAGE_COMPOSER_SURFACE_STATE
        .lock()
        .map(|state| *state)
        .map_err(|_| "failed to lock message composer surface state".to_string())
}

fn set_saved_message_composer_surface(
    geometry: Option<WindowGeometry>,
) -> Result<(), String> {
    MESSAGE_COMPOSER_SURFACE_STATE
        .lock()
        .map(|mut state| {
            *state = geometry;
        })
        .map_err(|_| "failed to lock message composer surface state".to_string())
}

fn save_message_composer_surface_if_absent(
    geometry: WindowGeometry,
) -> Result<bool, String> {
    MESSAGE_COMPOSER_SURFACE_STATE
        .lock()
        .map(|mut state| {
            if state.is_some() {
                return false;
            }

            *state = Some(geometry);
            true
        })
        .map_err(|_| "failed to lock message composer surface state".to_string())
}

fn clear_message_composer_surface_after_close(
    close_result: Result<(), String>,
) -> Result<(), String> {
    let clear_result = set_saved_message_composer_surface(None);

    match (close_result, clear_result) {
        (Err(error), _) => Err(error),
        (Ok(()), Err(error)) => Err(error),
        (Ok(()), Ok(())) => Ok(()),
    }
}

fn is_message_composer_surface_open() -> bool {
    saved_message_composer_surface()
        .map(|geometry| geometry.is_some())
        .unwrap_or(false)
}

fn read_current_window_geometry<R: Runtime>(
    window: &WebviewWindow<R>,
    purpose: &str,
) -> Result<(WorkArea, WindowGeometry), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| format!("failed to read current monitor for {purpose}: {error}"))?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| format!("failed to find a visible monitor for {purpose}"))?;
    let work_area = monitor.work_area();
    let outer_position = window
        .outer_position()
        .map_err(|error| format!("failed to read main window position for {purpose}: {error}"))?;
    let outer_size = window
        .outer_size()
        .map_err(|error| format!("failed to read main window size for {purpose}: {error}"))?;

    Ok((
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
    ))
}

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(SETTINGS_FILE_NAME))
        .map_err(|error| format!("<app_data_dir>/{SETTINGS_FILE_NAME}: {error}"))
}

fn window_position_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(WINDOW_POSITION_FILE_NAME))
        .map_err(|error| format!("<app_data_dir>/{WINDOW_POSITION_FILE_NAME}: {error}"))
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

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
struct SavedWindowPosition {
    x: i32,
    y: i32,
}

fn read_window_position_from_path(path: &Path) -> Option<SavedWindowPosition> {
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
}

fn write_window_position_to_path(
    path: &Path,
    position: SavedWindowPosition,
) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| {
        format!(
            "failed to write window position {}: missing parent directory",
            path.display()
        )
    })?;
    let contents = serde_json::to_string_pretty(&position).map_err(|error| {
        format!(
            "failed to serialize window position {}: {error}",
            path.display()
        )
    })?;

    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "failed to create window position directory {}: {error}",
            parent.display()
        )
    })?;
    fs::write(path, contents).map_err(|error| {
        format!(
            "failed to write window position {}: {error}",
            path.display()
        )
    })
}

fn save_window_position<R: Runtime>(
    app: &AppHandle<R>,
    position: PhysicalPosition<i32>,
) -> Result<(), String> {
    let path = window_position_path(app)?;
    write_window_position_to_path(
        &path,
        SavedWindowPosition {
            x: position.x,
            y: position.y,
        },
    )
}

fn reset_window_to_safe_position<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<PhysicalPosition<i32>, String> {
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

    let position = PhysicalPosition::new(x, y);

    window
        .set_position(position)
        .map_err(|error| format!("failed to reset main window position: {error}"))?;
    Ok(position)
}

#[derive(Clone, Copy)]
struct WorkArea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct WindowGeometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct MessageComposerSurfaceGeometry {
    saved_pet_window: WindowGeometry,
    window: WindowGeometry,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum EdgePeekSide {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct EdgePeekSnap {
    side: EdgePeekSide,
    position: PhysicalPosition<i32>,
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

fn clamp_saved_window_position(
    saved_position: SavedWindowPosition,
    work_area: WorkArea,
    window: WindowGeometry,
) -> PhysicalPosition<i32> {
    PhysicalPosition::new(
        clamp_axis(
            saved_position.x,
            work_area.x,
            work_area.width,
            window.width,
        ),
        clamp_axis(
            saved_position.y,
            work_area.y,
            work_area.height,
            window.height,
        ),
    )
}

fn calculate_message_composer_surface_geometry(
    work_area: WorkArea,
    pet_window: WindowGeometry,
) -> MessageComposerSurfaceGeometry {
    MessageComposerSurfaceGeometry {
        saved_pet_window: pet_window,
        window: WindowGeometry {
            x: centered_axis(
                work_area.x,
                work_area.width,
                MESSAGE_COMPOSER_SURFACE_WIDTH_PX,
            ),
            y: centered_axis(
                work_area.y,
                work_area.height,
                MESSAGE_COMPOSER_SURFACE_HEIGHT_PX,
            ),
            width: MESSAGE_COMPOSER_SURFACE_WIDTH_PX,
            height: MESSAGE_COMPOSER_SURFACE_HEIGHT_PX,
        },
    }
}

fn calculate_message_composer_restore_geometry(
    work_area: WorkArea,
    current_window: WindowGeometry,
    saved_pet_window: Option<WindowGeometry>,
) -> WindowGeometry {
    saved_pet_window.unwrap_or_else(|| WindowGeometry {
        x: clamp_axis(
            current_window.x,
            work_area.x,
            work_area.width,
            DEFAULT_WINDOW_WIDTH_PX,
        ),
        y: clamp_axis(
            current_window.y,
            work_area.y,
            work_area.height,
            DEFAULT_WINDOW_HEIGHT_PX,
        ),
        width: DEFAULT_WINDOW_WIDTH_PX,
        height: DEFAULT_WINDOW_HEIGHT_PX,
    })
}

fn calculate_edge_peek_snap(
    work_area: WorkArea,
    window: WindowGeometry,
) -> Option<EdgePeekSnap> {
    let window_width = window.width as i32;
    let window_height = window.height as i32;
    let work_right = work_area.x + work_area.width as i32;
    let work_bottom = work_area.y + work_area.height as i32;
    let window_right = window.x + window_width;
    let window_bottom = window.y + window_height;

    if window.x - work_area.x <= EDGE_PEEK_TRIGGER_PX {
        return Some(EdgePeekSnap {
            side: EdgePeekSide::Left,
            position: PhysicalPosition::new(
                work_area.x,
                clamp_axis(window.y, work_area.y, work_area.height, window.height),
            ),
        });
    }

    if work_right - window_right <= EDGE_PEEK_TRIGGER_PX {
        return Some(EdgePeekSnap {
            side: EdgePeekSide::Right,
            position: PhysicalPosition::new(
                work_right - window_width,
                clamp_axis(window.y, work_area.y, work_area.height, window.height),
            ),
        });
    }

    if window.y - work_area.y <= EDGE_PEEK_TRIGGER_PX {
        return Some(EdgePeekSnap {
            side: EdgePeekSide::Top,
            position: PhysicalPosition::new(
                clamp_axis(window.x, work_area.x, work_area.width, window.width),
                work_area.y,
            ),
        });
    }

    if work_bottom - window_bottom <= EDGE_PEEK_TRIGGER_PX {
        return Some(EdgePeekSnap {
            side: EdgePeekSide::Bottom,
            position: PhysicalPosition::new(
                clamp_axis(window.x, work_area.x, work_area.width, window.width),
                work_bottom - window_height,
            ),
        });
    }

    None
}

fn calculate_edge_peek_restore_position(
    side: EdgePeekSide,
    work_area: WorkArea,
    window: WindowGeometry,
) -> PhysicalPosition<i32> {
    match side {
        EdgePeekSide::Left => PhysicalPosition::new(
            work_area.x + SAFE_WINDOW_MARGIN_PX,
            clamp_axis(window.y, work_area.y, work_area.height, window.height),
        ),
        EdgePeekSide::Right => PhysicalPosition::new(
            work_area.x + work_area.width as i32 - window.width as i32 - SAFE_WINDOW_MARGIN_PX,
            clamp_axis(window.y, work_area.y, work_area.height, window.height),
        ),
        EdgePeekSide::Top => PhysicalPosition::new(
            clamp_axis(window.x, work_area.x, work_area.width, window.width),
            work_area.y + SAFE_WINDOW_MARGIN_PX,
        ),
        EdgePeekSide::Bottom => PhysicalPosition::new(
            clamp_axis(window.x, work_area.x, work_area.width, window.width),
            work_area.y + work_area.height as i32 - window.height as i32 - SAFE_WINDOW_MARGIN_PX,
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
    fn read_window_position_from_path_returns_none_for_invalid_json() {
        let position_path = unique_settings_path("invalid-window-position");
        fs::create_dir_all(position_path.parent().unwrap()).unwrap();
        fs::write(&position_path, "{not valid json").unwrap();

        let position = read_window_position_from_path(&position_path);

        assert_eq!(position, None);
        let _ = fs::remove_dir_all(position_path.parent().unwrap());
    }

    #[test]
    fn clamp_saved_window_position_keeps_valid_position() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
        };
        let window = TestWindowGeometry {
            x: 0,
            y: 0,
            width: 100,
            height: 120,
        };
        let saved_position = SavedWindowPosition { x: 120, y: 220 };

        let position = clamp_saved_window_position(saved_position, work_area, window);

        assert_eq!(position, PhysicalPosition::new(120, 220));
    }

    #[test]
    fn clamp_saved_window_position_keeps_out_of_bounds_position_visible() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
        };
        let window = TestWindowGeometry {
            x: 0,
            y: 0,
            width: 100,
            height: 120,
        };
        let saved_position = SavedWindowPosition { x: 900, y: -50 };

        let position = clamp_saved_window_position(saved_position, work_area, window);

        assert_eq!(position, PhysicalPosition::new(676, 24));
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

    #[test]
    fn edge_peek_snaps_to_left_when_released_near_left_edge() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let window = TestWindowGeometry {
            x: 10,
            y: 240,
            width: 320,
            height: 360,
        };

        let snap = calculate_edge_peek_snap(work_area, window);

        assert_eq!(
            snap,
            Some(EdgePeekSnap {
                side: EdgePeekSide::Left,
                position: PhysicalPosition::new(0, 240),
            })
        );
    }

    #[test]
    fn edge_peek_snaps_to_right_when_released_near_right_edge() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let window = TestWindowGeometry {
            x: 872,
            y: 240,
            width: 320,
            height: 360,
        };

        let snap = calculate_edge_peek_snap(work_area, window);

        assert_eq!(
            snap,
            Some(EdgePeekSnap {
                side: EdgePeekSide::Right,
                position: PhysicalPosition::new(880, 240),
            })
        );
    }

    #[test]
    fn edge_peek_snaps_to_top_when_released_near_top_edge() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let window = TestWindowGeometry {
            x: 440,
            y: 12,
            width: 320,
            height: 360,
        };

        let snap = calculate_edge_peek_snap(work_area, window);

        assert_eq!(
            snap,
            Some(EdgePeekSnap {
                side: EdgePeekSide::Top,
                position: PhysicalPosition::new(440, 0),
            })
        );
    }

    #[test]
    fn edge_peek_snaps_to_bottom_when_released_near_bottom_edge() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let window = TestWindowGeometry {
            x: 440,
            y: 430,
            width: 320,
            height: 360,
        };

        let snap = calculate_edge_peek_snap(work_area, window);

        assert_eq!(
            snap,
            Some(EdgePeekSnap {
                side: EdgePeekSide::Bottom,
                position: PhysicalPosition::new(440, 440),
            })
        );
    }

    #[test]
    fn edge_peek_restores_bottom_to_safe_visible_position() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let window = TestWindowGeometry {
            x: 440,
            y: 440,
            width: 320,
            height: 360,
        };

        let position =
            calculate_edge_peek_restore_position(EdgePeekSide::Bottom, work_area, window);

        assert_eq!(position, PhysicalPosition::new(440, 416));
    }

    #[test]
    fn edge_peek_snap_keeps_window_inside_work_area_bounds() {
        let work_area = TestWorkArea {
            x: 100,
            y: 80,
            width: 1200,
            height: 800,
        };
        let left_window = TestWindowGeometry {
            x: 110,
            y: 240,
            width: 320,
            height: 360,
        };
        let right_window = TestWindowGeometry {
            x: 972,
            y: 240,
            width: 320,
            height: 360,
        };
        let top_window = TestWindowGeometry {
            x: 440,
            y: 90,
            width: 320,
            height: 360,
        };
        let bottom_window = TestWindowGeometry {
            x: 440,
            y: 512,
            width: 320,
            height: 360,
        };

        let left_snap = calculate_edge_peek_snap(work_area, left_window).unwrap();
        let right_snap = calculate_edge_peek_snap(work_area, right_window).unwrap();
        let top_snap = calculate_edge_peek_snap(work_area, top_window).unwrap();
        let bottom_snap = calculate_edge_peek_snap(work_area, bottom_window).unwrap();

        assert!(left_snap.position.x >= work_area.x);
        assert!(top_snap.position.y >= work_area.y);
        assert!(
            right_snap.position.x + right_window.width as i32
                <= work_area.x + work_area.width as i32
        );
        assert!(
            bottom_snap.position.y + bottom_window.height as i32
                <= work_area.y + work_area.height as i32
        );
    }

    #[test]
    fn edge_peek_keeps_centered_window_normal() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let window = TestWindowGeometry {
            x: 440,
            y: 220,
            width: 320,
            height: 360,
        };

        let snap = calculate_edge_peek_snap(work_area, window);

        assert_eq!(snap, None);
    }

    #[test]
    fn message_composer_surface_centers_main_window_and_saves_pet_geometry() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let pet_window = TestWindowGeometry {
            x: 860,
            y: 420,
            width: 320,
            height: 360,
        };

        let surface = calculate_message_composer_surface_geometry(work_area, pet_window);

        assert_eq!(surface.saved_pet_window, pet_window);
        assert_eq!(surface.window.x, 380);
        assert_eq!(surface.window.y, 270);
        assert_eq!(surface.window.width, 440);
        assert_eq!(surface.window.height, 260);
    }

    #[test]
    fn message_composer_surface_restore_uses_saved_pet_geometry_not_centered_geometry() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let saved_pet_window = TestWindowGeometry {
            x: 860,
            y: 420,
            width: 320,
            height: 360,
        };
        let current_composer_window = TestWindowGeometry {
            x: 380,
            y: 270,
            width: 440,
            height: 260,
        };

        let restored = calculate_message_composer_restore_geometry(
            work_area,
            current_composer_window,
            Some(saved_pet_window),
        );

        assert_eq!(restored, saved_pet_window);
    }

    #[test]
    fn message_composer_surface_repeated_open_does_not_overwrite_saved_pet_geometry() {
        let original_pet_window = TestWindowGeometry {
            x: 860,
            y: 420,
            width: 320,
            height: 360,
        };
        let current_composer_window = TestWindowGeometry {
            x: 380,
            y: 270,
            width: 440,
            height: 260,
        };

        set_saved_message_composer_surface(None).unwrap();
        assert!(save_message_composer_surface_if_absent(original_pet_window).unwrap());
        assert!(!save_message_composer_surface_if_absent(current_composer_window).unwrap());

        assert_eq!(
            saved_message_composer_surface().unwrap(),
            Some(original_pet_window),
        );
        set_saved_message_composer_surface(None).unwrap();
    }

    #[test]
    fn message_composer_surface_close_failure_clears_saved_geometry() {
        let original_pet_window = TestWindowGeometry {
            x: 860,
            y: 420,
            width: 320,
            height: 360,
        };

        set_saved_message_composer_surface(Some(original_pet_window)).unwrap();

        let result = clear_message_composer_surface_after_close(Err(
            "failed to move main window".to_string(),
        ));

        assert_eq!(result, Err("failed to move main window".to_string()));
        assert_eq!(saved_message_composer_surface().unwrap(), None);
    }

    #[test]
    fn edge_peek_keeps_non_edge_window_normal() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let window = TestWindowGeometry {
            x: 440,
            y: 220,
            width: 320,
            height: 360,
        };

        let snap = calculate_edge_peek_snap(work_area, window);

        assert_eq!(snap, None);
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
