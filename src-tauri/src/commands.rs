use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Runtime, Size,
    WebviewWindow, WindowEvent,
};

use crate::desktop_input::InteractiveRegion;

const MAIN_WINDOW_LABEL: &str = "main";
const SETTINGS_FILE_NAME: &str = "settings.json";
const FOCUS_TIMER_FILE_NAME: &str = "focus-timer.json";
const WINDOW_POSITION_FILE_NAME: &str = "window-position.json";
const DEFAULT_WINDOW_WIDTH_PX: u32 = 320;
const DEFAULT_WINDOW_HEIGHT_PX: u32 = 360;
const MESSAGE_COMPOSER_SURFACE_WIDTH_LOGICAL_PX: f64 = 440.0;
const MESSAGE_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX: f64 = 260.0;
const SURPRISE_COMPOSER_SURFACE_WIDTH_LOGICAL_PX: f64 = 440.0;
const SURPRISE_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX: f64 = 460.0;
const FOCUS_COMPOSER_SURFACE_WIDTH_LOGICAL_PX: f64 = 440.0;
const FOCUS_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX: f64 = 320.0;
const WEATHER_COMPOSER_SURFACE_WIDTH_LOGICAL_PX: f64 = 460.0;
const WEATHER_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX: f64 = 504.0;
const SPARK_COMPOSER_SURFACE_WIDTH_LOGICAL_PX: f64 = 460.0;
const SPARK_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX: f64 = 638.0;
const SAFE_WINDOW_MARGIN_PX: i32 = 24;
const AUTO_MOVE_STEP_X_PX: i32 = 96;
const AUTO_MOVE_STEP_Y_PX: i32 = 48;
const EDGE_PEEK_TRIGGER_PX: i32 = 24;
const CLICK_THROUGH_RECOVERED_EVENT: &str = "click-through-recovered";
const OPEN_SETTINGS_EVENT: &str = "open-settings";
pub(crate) const WINDOW_HIDDEN_EVENT: &str = "window-hidden";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WindowHideStep {
    EmitWindowHidden,
    HideWindow,
}

pub(crate) fn window_hide_plan() -> [WindowHideStep; 2] {
    [WindowHideStep::EmitWindowHidden, WindowHideStep::HideWindow]
}

fn execute_window_hide_actions<EmitHidden, HideWindow>(
    mut emit_hidden: EmitHidden,
    mut hide_window: HideWindow,
) -> Result<(), String>
where
    EmitHidden: FnMut() -> Result<(), String>,
    HideWindow: FnMut() -> Result<(), String>,
{
    let mut emit_result = Ok(());
    let mut hide_result = Ok(());

    for step in window_hide_plan() {
        match step {
            WindowHideStep::EmitWindowHidden => emit_result = emit_hidden(),
            WindowHideStep::HideWindow => hide_result = hide_window(),
        }
    }

    match (emit_result, hide_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(emit_error), Ok(())) => Err(emit_error),
        (Ok(()), Err(hide_error)) => Err(hide_error),
        (Err(emit_error), Err(hide_error)) => Err(format!("{emit_error}; {hide_error}")),
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct MessageComposerSurfaceState {
    saved_pet_window: WindowGeometry,
    is_open: bool,
}

static MESSAGE_COMPOSER_SURFACE_STATE: Mutex<Option<MessageComposerSurfaceState>> =
    Mutex::new(None);
static EDGE_PEEK_HIDDEN_STATE: Mutex<Option<EdgePeekSide>> = Mutex::new(None);

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
pub fn read_focus_timer(app: AppHandle) -> serde_json::Value {
    match focus_timer_path(&app) {
        Ok(path) => read_focus_timer_from_path(&path),
        Err(error) => {
            eprintln!("{error}");
            serde_json::Value::Null
        }
    }
}

#[tauri::command]
pub fn write_focus_timer(app: AppHandle, timer: serde_json::Value) -> Result<(), String> {
    let path = focus_timer_path(&app)?;
    write_focus_timer_to_path(&path, &timer)
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
pub fn set_interactive_regions(
    app: AppHandle,
    regions: Vec<InteractiveRegion>,
    device_scale_factor: f64,
) -> Result<(), String> {
    let window = main_window(&app)?;
    crate::desktop_input::set_interactive_regions(&window, regions, device_scale_factor)
}

#[tauri::command]
pub fn move_window_for_pointer_drag(
    app: AppHandle,
    delta_x: f64,
    delta_y: f64,
) -> Result<(), String> {
    let window = main_window(&app)?;
    crate::desktop_input::move_window_for_pointer_drag(&window, delta_x, delta_y)
}

#[tauri::command]
pub fn reset_window_position(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    let position = reset_window_to_safe_position(&window)?;
    save_window_position(&app, position)
}

#[tauri::command]
pub fn move_window_for_auto_step(app: AppHandle, movement_range: String) -> Result<(), String> {
    if is_edge_peek_hidden() {
        return Ok(());
    }

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
    let Some(next_position) = calculate_auto_move_position_if_allowed(
        false,
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
    ) else {
        return Ok(());
    };

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

    set_edge_peek_hidden_side(Some(snap.side))?;
    if let Err(error) = window.set_position(snap.position) {
        let _ = set_edge_peek_hidden_side(None);
        return Err(format!("failed to snap main window to edge: {error}"));
    }

    Ok(Some(snap.side))
}

#[tauri::command]
pub fn dock_window_at_edge(app: AppHandle, side: EdgePeekSide) -> Result<(), String> {
    let window = main_window(&app)?;
    let (work_area, geometry) = read_current_window_geometry(&window, "edge dock")?;
    let position = calculate_edge_dock_position(side, work_area, geometry);

    set_edge_peek_hidden_side(Some(side))?;
    if let Err(error) = window.set_position(position) {
        let _ = set_edge_peek_hidden_side(None);
        return Err(format!("failed to dock main window at edge: {error}"));
    }

    Ok(())
}

#[tauri::command]
pub fn restore_window_from_edge_peek(app: AppHandle, side: EdgePeekSide) -> Result<(), String> {
    let window = main_window(&app)?;
    let (work_area, geometry) = read_current_window_geometry(&window, "edge peek restore")?;
    let position = calculate_edge_peek_restore_position(side, work_area, geometry);

    window
        .set_position(position)
        .map_err(|error| format!("failed to restore main window from edge peek: {error}"))?;
    set_edge_peek_hidden_side(None)?;
    save_window_position(&app, position)
}

#[tauri::command]
pub fn open_message_composer_surface(
    app: AppHandle,
    surface: ComposerSurface,
) -> Result<(), String> {
    let window = main_window(&app)?;
    if is_message_composer_surface_open() {
        return show_main_window(&app);
    }

    if let Some(saved_geometry) = pending_message_composer_restore()? {
        apply_window_geometry(&window, saved_geometry)?;
        set_saved_message_composer_surface(None)?;
    }

    let (work_area, geometry) = read_current_window_geometry(&window, "message composer")?;
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("failed to read main window scale factor: {error}"))?;
    let surface_geometry =
        calculate_message_composer_surface_geometry(surface, scale_factor, work_area, geometry);

    if !save_message_composer_surface_if_absent(surface_geometry.saved_pet_window)? {
        return show_main_window(&app);
    }

    execute_message_composer_open_actions(
        surface,
        surface_geometry,
        |size| {
            window
                .set_size(size)
                .map_err(|error| format!("failed to resize main window: {error}"))
        },
        || {
            window
                .set_position(PhysicalPosition::new(
                    surface_geometry.window.x,
                    surface_geometry.window.y,
                ))
                .map_err(|error| format!("failed to move main window: {error}"))
        },
        || show_and_focus_main_window(&window),
        || apply_window_geometry(&window, surface_geometry.saved_pet_window),
    )?;

    if let Err(error) = mark_message_composer_surface_open() {
        return match apply_window_geometry(&window, surface_geometry.saved_pet_window) {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!("{error}; rollback failed: {rollback_error}")),
        };
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
    recover_click_through_and_show_main_window(&app, ClickThroughRecoveryReason::Show)
}

#[tauri::command]
pub fn hide_window(app: AppHandle) -> Result<(), String> {
    hide_main_window(&app)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    crate::request_app_exit(&app, 0);
    Ok(())
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    show_and_focus_main_window(&window)
}

pub fn recover_click_through_and_show_main_window<R: Runtime>(
    app: &AppHandle<R>,
    reason: ClickThroughRecoveryReason,
) -> Result<(), String> {
    let window = main_window(app)?;

    for step in click_through_recovery_plan(reason) {
        match step {
            ClickThroughRecoveryStep::ClearClickThrough => {
                set_window_click_through(&window, false)?;
            }
            ClickThroughRecoveryStep::ShowWindow => {
                window
                    .show()
                    .map_err(|error| format!("failed to show main window: {error}"))?;
            }
            ClickThroughRecoveryStep::FocusWindow => {
                window
                    .set_focus()
                    .map_err(|error| format!("failed to focus main window: {error}"))?;
            }
            ClickThroughRecoveryStep::EmitRecovered(recovered_reason) => {
                app.emit(
                    CLICK_THROUGH_RECOVERED_EVENT,
                    serde_json::json!({ "reason": recovered_reason.as_payload() }),
                )
                .map_err(|error| format!("failed to emit click-through recovery: {error}"))?;
            }
            ClickThroughRecoveryStep::EmitOpenSettings => {
                app.emit(OPEN_SETTINGS_EVENT, ())
                    .map_err(|error| format!("failed to emit open-settings: {error}"))?;
            }
        }
    }

    Ok(())
}

fn show_and_focus_main_window<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    window
        .show()
        .map_err(|error| format!("failed to show main window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("failed to focus main window: {error}"))
}

pub fn hide_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;

    execute_window_hide_actions(
        || {
            app.emit(WINDOW_HIDDEN_EVENT, ())
                .map_err(|error| format!("failed to emit window-hidden: {error}"))
        },
        || {
            window
                .hide()
                .map_err(|error| format!("failed to hide main window: {error}"))
        },
    )
}

pub fn emit_open_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    recover_click_through_and_show_main_window(app, ClickThroughRecoveryReason::Settings)
}

pub fn install_main_window_close_to_hide<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    let app_handle = app.clone();

    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if let Err(error) = crate::handle_main_window_close_request(
                crate::is_explicit_app_quit_requested(),
                || api.prevent_close(),
                || hide_main_window(&app_handle),
            ) {
                eprintln!("failed to hide main window on close request: {error}");
            }
        }
    });

    Ok(())
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

            if is_edge_peek_hidden() {
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

pub(crate) fn main_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("window `{MAIN_WINDOW_LABEL}` not found"))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClickThroughRecoveryReason {
    Show,
    Settings,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ComposerSurface {
    Message,
    Surprise,
    Focus,
    Weather,
    Spark,
}

impl ComposerSurface {
    fn logical_size(self) -> LogicalSize<f64> {
        match self {
            Self::Message => LogicalSize::new(
                MESSAGE_COMPOSER_SURFACE_WIDTH_LOGICAL_PX,
                MESSAGE_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX,
            ),
            Self::Surprise => LogicalSize::new(
                SURPRISE_COMPOSER_SURFACE_WIDTH_LOGICAL_PX,
                SURPRISE_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX,
            ),
            Self::Focus => LogicalSize::new(
                FOCUS_COMPOSER_SURFACE_WIDTH_LOGICAL_PX,
                FOCUS_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX,
            ),
            Self::Weather => LogicalSize::new(
                WEATHER_COMPOSER_SURFACE_WIDTH_LOGICAL_PX,
                WEATHER_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX,
            ),
            Self::Spark => LogicalSize::new(
                SPARK_COMPOSER_SURFACE_WIDTH_LOGICAL_PX,
                SPARK_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX,
            ),
        }
    }

    fn physical_size(self, scale_factor: f64) -> PhysicalSize<u32> {
        self.logical_size().to_physical(scale_factor)
    }
}

impl ClickThroughRecoveryReason {
    fn as_payload(self) -> &'static str {
        match self {
            Self::Show => "show",
            Self::Settings => "settings",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ClickThroughRecoveryStep {
    ClearClickThrough,
    ShowWindow,
    FocusWindow,
    EmitRecovered(ClickThroughRecoveryReason),
    EmitOpenSettings,
}

fn click_through_recovery_plan(
    reason: ClickThroughRecoveryReason,
) -> Vec<ClickThroughRecoveryStep> {
    match reason {
        ClickThroughRecoveryReason::Show => vec![
            ClickThroughRecoveryStep::ShowWindow,
            ClickThroughRecoveryStep::FocusWindow,
            ClickThroughRecoveryStep::EmitRecovered(reason),
        ],
        ClickThroughRecoveryReason::Settings => vec![
            ClickThroughRecoveryStep::ClearClickThrough,
            ClickThroughRecoveryStep::ShowWindow,
            ClickThroughRecoveryStep::FocusWindow,
            ClickThroughRecoveryStep::EmitRecovered(reason),
            ClickThroughRecoveryStep::EmitOpenSettings,
        ],
    }
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

fn execute_message_composer_open_actions<Resize, Move, Show, Rollback>(
    surface: ComposerSurface,
    geometry: MessageComposerSurfaceGeometry,
    mut resize: Resize,
    mut move_window: Move,
    mut show: Show,
    mut rollback: Rollback,
) -> Result<(), String>
where
    Resize: FnMut(Size) -> Result<(), String>,
    Move: FnMut() -> Result<(), String>,
    Show: FnMut() -> Result<(), String>,
    Rollback: FnMut() -> Result<(), String>,
{
    let resize_size = if surface == ComposerSurface::Spark {
        Size::Physical(PhysicalSize::new(
            geometry.window.width,
            geometry.window.height,
        ))
    } else {
        Size::Logical(geometry.logical_size)
    };
    if let Err(error) = resize(resize_size) {
        return rollback_message_composer_open(error, &mut rollback);
    }
    if let Err(error) = move_window() {
        return rollback_message_composer_open(error, &mut rollback);
    }
    if let Err(error) = show() {
        return rollback_message_composer_open(error, &mut rollback);
    }

    Ok(())
}

fn rollback_message_composer_open<Rollback>(
    error: String,
    rollback: &mut Rollback,
) -> Result<(), String>
where
    Rollback: FnMut() -> Result<(), String>,
{
    match rollback() {
        Ok(()) => Err(error),
        Err(rollback_error) => Err(format!("{error}; rollback failed: {rollback_error}")),
    }
}

fn saved_message_composer_surface() -> Result<Option<WindowGeometry>, String> {
    MESSAGE_COMPOSER_SURFACE_STATE
        .lock()
        .map(|state| state.map(|surface| surface.saved_pet_window))
        .map_err(|_| "failed to lock message composer surface state".to_string())
}

fn set_saved_message_composer_surface(geometry: Option<WindowGeometry>) -> Result<(), String> {
    MESSAGE_COMPOSER_SURFACE_STATE
        .lock()
        .map(|mut state| {
            *state = geometry.map(|saved_pet_window| MessageComposerSurfaceState {
                saved_pet_window,
                is_open: true,
            });
        })
        .map_err(|_| "failed to lock message composer surface state".to_string())
}

fn save_message_composer_surface_if_absent(geometry: WindowGeometry) -> Result<bool, String> {
    MESSAGE_COMPOSER_SURFACE_STATE
        .lock()
        .map(|mut state| {
            if state.is_some() {
                return false;
            }

            *state = Some(MessageComposerSurfaceState {
                saved_pet_window: geometry,
                is_open: false,
            });
            true
        })
        .map_err(|_| "failed to lock message composer surface state".to_string())
}

fn mark_message_composer_surface_open() -> Result<(), String> {
    MESSAGE_COMPOSER_SURFACE_STATE
        .lock()
        .map_err(|_| "failed to lock message composer surface state".to_string())?
        .as_mut()
        .ok_or_else(|| "message composer restore state is unavailable".to_string())
        .map(|state| {
            state.is_open = true;
        })
}

fn pending_message_composer_restore() -> Result<Option<WindowGeometry>, String> {
    MESSAGE_COMPOSER_SURFACE_STATE
        .lock()
        .map(|state| {
            state
                .filter(|surface| !surface.is_open)
                .map(|surface| surface.saved_pet_window)
        })
        .map_err(|_| "failed to lock message composer surface state".to_string())
}

fn clear_message_composer_surface_after_close(
    close_result: Result<(), String>,
) -> Result<(), String> {
    close_result?;
    set_saved_message_composer_surface(None)
}

fn is_message_composer_surface_open() -> bool {
    MESSAGE_COMPOSER_SURFACE_STATE
        .lock()
        .map(|state| state.is_some_and(|surface| surface.is_open))
        .unwrap_or(false)
}

fn set_edge_peek_hidden_side(side: Option<EdgePeekSide>) -> Result<(), String> {
    EDGE_PEEK_HIDDEN_STATE
        .lock()
        .map(|mut state| {
            *state = side;
        })
        .map_err(|_| "failed to lock edge peek hidden state".to_string())
}

fn is_edge_peek_hidden() -> bool {
    EDGE_PEEK_HIDDEN_STATE
        .lock()
        .map(|state| state.is_some())
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

fn focus_timer_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| focus_timer_path_from_app_data_dir(&dir))
        .map_err(|error| format!("<app_data_dir>/{FOCUS_TIMER_FILE_NAME}: {error}"))
}

fn focus_timer_path_from_app_data_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(FOCUS_TIMER_FILE_NAME)
}

pub(crate) fn window_position_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
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

fn read_focus_timer_from_path(path: &Path) -> serde_json::Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or(serde_json::Value::Null)
}

fn write_focus_timer_to_path(path: &Path, timer: &serde_json::Value) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| {
        format!(
            "failed to write focus timer {}: missing parent directory",
            path.display()
        )
    })?;
    let contents = serde_json::to_string_pretty(timer).map_err(|error| {
        format!(
            "failed to serialize focus timer {}: {error}",
            path.display()
        )
    })?;

    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "failed to create focus timer directory {}: {error}",
            parent.display()
        )
    })?;
    fs::write(path, contents)
        .map_err(|error| format!("failed to write focus timer {}: {error}", path.display()))
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

fn write_window_position_to_path(path: &Path, position: SavedWindowPosition) -> Result<(), String> {
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
    logical_size: LogicalSize<f64>,
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

fn calculate_auto_move_position_if_allowed(
    edge_peek_hidden: bool,
    mode: MovementRangeMode,
    work_area: WorkArea,
    window: WindowGeometry,
) -> Option<PhysicalPosition<i32>> {
    if edge_peek_hidden {
        return None;
    }

    Some(calculate_auto_move_position(mode, work_area, window))
}

fn clamp_saved_window_position(
    saved_position: SavedWindowPosition,
    work_area: WorkArea,
    window: WindowGeometry,
) -> PhysicalPosition<i32> {
    PhysicalPosition::new(
        clamp_axis(saved_position.x, work_area.x, work_area.width, window.width),
        clamp_axis(
            saved_position.y,
            work_area.y,
            work_area.height,
            window.height,
        ),
    )
}

fn calculate_message_composer_surface_geometry(
    surface: ComposerSurface,
    scale_factor: f64,
    work_area: WorkArea,
    pet_window: WindowGeometry,
) -> MessageComposerSurfaceGeometry {
    let logical_size = surface.logical_size();
    let requested_physical_size = surface.physical_size(scale_factor);
    let physical_size = if surface == ComposerSurface::Spark {
        PhysicalSize::new(
            requested_physical_size.width,
            requested_physical_size.height.min(work_area.height),
        )
    } else {
        requested_physical_size
    };

    MessageComposerSurfaceGeometry {
        saved_pet_window: pet_window,
        window: WindowGeometry {
            x: centered_axis(work_area.x, work_area.width, physical_size.width),
            y: centered_axis(work_area.y, work_area.height, physical_size.height),
            width: physical_size.width,
            height: physical_size.height,
        },
        logical_size,
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

fn calculate_edge_peek_snap(work_area: WorkArea, window: WindowGeometry) -> Option<EdgePeekSnap> {
    let work_right = work_area.x + work_area.width as i32;
    let work_bottom = work_area.y + work_area.height as i32;
    let window_right = window.x + window.width as i32;
    let window_bottom = window.y + window.height as i32;
    let candidates = [
        (EdgePeekSide::Left, (window.x - work_area.x).max(0), 0),
        (EdgePeekSide::Right, (work_right - window_right).max(0), 1),
        (EdgePeekSide::Top, (window.y - work_area.y).max(0), 2),
        (
            EdgePeekSide::Bottom,
            (work_bottom - window_bottom).max(0),
            3,
        ),
    ];

    candidates
        .into_iter()
        .filter(|(_, distance, _)| *distance <= EDGE_PEEK_TRIGGER_PX)
        .min_by_key(|(_, distance, priority)| (*distance, *priority))
        .map(|(side, _, _)| EdgePeekSnap {
            side,
            position: calculate_edge_dock_position(side, work_area, window),
        })
}

fn calculate_edge_dock_position(
    side: EdgePeekSide,
    work_area: WorkArea,
    window: WindowGeometry,
) -> PhysicalPosition<i32> {
    let work_right = work_area.x + work_area.width as i32;
    let work_bottom = work_area.y + work_area.height as i32;
    let clamped_x = clamp_edge_dock_axis(window.x, work_area.x, work_area.width, window.width);
    let clamped_y = clamp_edge_dock_axis(window.y, work_area.y, work_area.height, window.height);

    match side {
        EdgePeekSide::Left => PhysicalPosition::new(work_area.x, clamped_y),
        EdgePeekSide::Right => PhysicalPosition::new(work_right - window.width as i32, clamped_y),
        EdgePeekSide::Top => PhysicalPosition::new(clamped_x, work_area.y),
        EdgePeekSide::Bottom => {
            PhysicalPosition::new(clamped_x, work_bottom - window.height as i32)
        }
    }
}

fn clamp_edge_dock_axis(current: i32, area_start: i32, area_size: u32, window_size: u32) -> i32 {
    let max = area_start + area_size as i32 - window_size as i32;

    if max < area_start {
        return area_start;
    }

    current.clamp(area_start, max)
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

fn step_axis(current: i32, area_start: i32, area_size: u32, window_size: u32, step: i32) -> i32 {
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

fn set_window_click_through<R: Runtime>(
    window: &WebviewWindow<R>,
    enabled: bool,
) -> Result<(), String> {
    crate::desktop_input::set_full_click_through(window, enabled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_hide_plan_emits_hidden_before_hiding_without_show_or_focus() {
        assert_eq!(
            window_hide_plan(),
            [WindowHideStep::EmitWindowHidden, WindowHideStep::HideWindow]
        );
        assert_eq!(WINDOW_HIDDEN_EVENT, "window-hidden");
    }

    #[test]
    fn window_hide_still_hides_when_hidden_event_emit_fails() {
        let mut hide_count = 0;

        let result = execute_window_hide_actions(
            || Err("failed to emit window-hidden".to_string()),
            || {
                hide_count += 1;
                Ok(())
            },
        );

        assert_eq!(hide_count, 1);
        assert_eq!(result, Err("failed to emit window-hidden".to_string()));
    }

    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    static MESSAGE_COMPOSER_SURFACE_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn lock_message_composer_surface_state_for_test() -> std::sync::MutexGuard<'static, ()> {
        MESSAGE_COMPOSER_SURFACE_TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn sample_message_composer_surface_geometry() -> MessageComposerSurfaceGeometry {
        calculate_message_composer_surface_geometry(
            ComposerSurface::Message,
            1.0,
            TestWorkArea {
                x: 0,
                y: 0,
                width: 1200,
                height: 800,
            },
            TestWindowGeometry {
                x: 860,
                y: 420,
                width: 320,
                height: 360,
            },
        )
    }

    #[test]
    fn click_through_recovery_plan_shows_without_clearing_full_click_through() {
        assert_eq!(
            click_through_recovery_plan(ClickThroughRecoveryReason::Show),
            [
                ClickThroughRecoveryStep::ShowWindow,
                ClickThroughRecoveryStep::FocusWindow,
                ClickThroughRecoveryStep::EmitRecovered(ClickThroughRecoveryReason::Show),
            ],
        );
        assert_eq!(ClickThroughRecoveryReason::Show.as_payload(), "show");
    }

    #[test]
    fn click_through_recovery_plan_recovers_settings_then_opens_settings() {
        assert_eq!(
            click_through_recovery_plan(ClickThroughRecoveryReason::Settings),
            [
                ClickThroughRecoveryStep::ClearClickThrough,
                ClickThroughRecoveryStep::ShowWindow,
                ClickThroughRecoveryStep::FocusWindow,
                ClickThroughRecoveryStep::EmitRecovered(ClickThroughRecoveryReason::Settings),
                ClickThroughRecoveryStep::EmitOpenSettings,
            ],
        );
        assert_eq!(
            ClickThroughRecoveryReason::Settings.as_payload(),
            "settings"
        );
    }

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
    fn focus_timer_path_is_a_settings_sibling_json_file() {
        let app_data_dir = unique_settings_path("focus-timer-sibling")
            .parent()
            .unwrap()
            .to_path_buf();

        assert_eq!(
            focus_timer_path_from_app_data_dir(&app_data_dir),
            app_data_dir.join("focus-timer.json")
        );
    }

    #[test]
    fn read_focus_timer_from_path_returns_null_for_invalid_json() {
        let timer_path =
            unique_settings_path("focus-timer-invalid").with_file_name("focus-timer.json");
        fs::create_dir_all(timer_path.parent().unwrap()).unwrap();
        fs::write(&timer_path, "{not valid json").unwrap();

        let timer = read_focus_timer_from_path(&timer_path);

        assert_eq!(timer, serde_json::Value::Null);
        let _ = fs::remove_dir_all(timer_path.parent().unwrap());
    }

    #[test]
    fn write_focus_timer_to_path_creates_parent_directory_and_writes_json() {
        let timer_path =
            unique_settings_path("focus-timer-write").with_file_name("focus-timer.json");
        let timer = serde_json::json!({
            "status": "running",
            "durationMinutes": 25,
            "startedAt": 1_000,
            "endsAt": 1_501_000
        });

        write_focus_timer_to_path(&timer_path, &timer).unwrap();

        let stored_timer: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&timer_path).unwrap()).unwrap();
        assert_eq!(stored_timer, timer);
        let _ = fs::remove_dir_all(timer_path.parent().unwrap());
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
    fn clamp_saved_window_position_uses_macos_menu_bar_work_area_on_negative_monitor() {
        let work_area = TestWorkArea {
            x: -1512,
            y: 25,
            width: 1512,
            height: 919,
        };
        let window = TestWindowGeometry {
            x: -1900,
            y: -40,
            width: 480,
            height: 540,
        };
        let saved_position = SavedWindowPosition { x: -1900, y: -40 };

        let position = clamp_saved_window_position(saved_position, work_area, window);

        assert_eq!(position, PhysicalPosition::new(-1488, 49));
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
    fn auto_move_is_noop_while_edge_peek_is_hidden() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
        };
        let window = TestWindowGeometry {
            x: 100,
            y: 120,
            width: 320,
            height: 360,
        };

        assert_eq!(
            calculate_auto_move_position_if_allowed(
                true,
                MovementRangeMode::Free,
                work_area,
                window,
            ),
            None,
        );
        assert_eq!(
            calculate_auto_move_position_if_allowed(
                false,
                MovementRangeMode::Free,
                work_area,
                window,
            ),
            Some(PhysicalPosition::new(196, 168)),
        );
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
    fn edge_peek_snap_keeps_hidpi_window_sizes_inside_the_work_area() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let left_window = TestWindowGeometry {
            x: 10,
            y: 180,
            width: 400,
            height: 450,
        };
        let right_window = TestWindowGeometry {
            x: 790,
            y: 180,
            width: 400,
            height: 450,
        };
        let top_window = TestWindowGeometry {
            x: 400,
            y: 12,
            width: 400,
            height: 450,
        };
        let bottom_window = TestWindowGeometry {
            x: 400,
            y: 340,
            width: 400,
            height: 450,
        };

        assert_eq!(
            calculate_edge_peek_snap(work_area, left_window),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Left,
                position: PhysicalPosition::new(0, 180),
            })
        );
        assert_eq!(
            calculate_edge_peek_snap(work_area, right_window),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Right,
                position: PhysicalPosition::new(800, 180),
            })
        );
        assert_eq!(
            calculate_edge_peek_snap(work_area, top_window),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Top,
                position: PhysicalPosition::new(400, 0),
            })
        );
        assert_eq!(
            calculate_edge_peek_snap(work_area, bottom_window),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Bottom,
                position: PhysicalPosition::new(400, 350),
            })
        );
    }

    #[test]
    fn edge_dock_keeps_the_complete_window_inside_a_negative_taskbar_work_area() {
        let work_area = TestWorkArea {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1040,
        };
        let window = TestWindowGeometry {
            x: -2500,
            y: 900,
            width: 320,
            height: 360,
        };

        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Left, work_area, window),
            PhysicalPosition::new(-1920, 680),
        );
        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Right, work_area, window),
            PhysicalPosition::new(-320, 680),
        );
        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Top, work_area, window),
            PhysicalPosition::new(-1920, 0),
        );
        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Bottom, work_area, window),
            PhysicalPosition::new(-1920, 680),
        );
    }

    #[test]
    fn edge_dock_clamps_each_orthogonal_axis_to_the_same_work_area() {
        let work_area = TestWorkArea {
            x: 100,
            y: 50,
            width: 800,
            height: 600,
        };
        let window = TestWindowGeometry {
            x: 999,
            y: 999,
            width: 320,
            height: 360,
        };

        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Left, work_area, window),
            PhysicalPosition::new(100, 290),
        );
        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Right, work_area, window),
            PhysicalPosition::new(580, 290),
        );
        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Top, work_area, window),
            PhysicalPosition::new(580, 50),
        );
        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Bottom, work_area, window),
            PhysicalPosition::new(580, 290),
        );
    }

    #[test]
    fn edge_dock_pins_an_oversized_orthogonal_axis_to_the_work_area_origin() {
        let work_area = TestWorkArea {
            x: -1280,
            y: 40,
            width: 240,
            height: 220,
        };
        let window = TestWindowGeometry {
            x: 500,
            y: 500,
            width: 320,
            height: 360,
        };

        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Left, work_area, window),
            PhysicalPosition::new(-1280, 40),
        );
        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Right, work_area, window),
            PhysicalPosition::new(-1360, 40),
        );
        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Top, work_area, window),
            PhysicalPosition::new(-1280, 40),
        );
        assert_eq!(
            calculate_edge_dock_position(EdgePeekSide::Bottom, work_area, window),
            PhysicalPosition::new(-1280, -100),
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
    fn edge_peek_snap_keeps_the_window_inside_a_negative_origin_work_area() {
        let work_area = TestWorkArea {
            x: -1440,
            y: -120,
            width: 1440,
            height: 900,
        };
        let left_window = TestWindowGeometry {
            x: -1430,
            y: 100,
            width: 320,
            height: 360,
        };
        let right_window = TestWindowGeometry {
            x: -328,
            y: 100,
            width: 320,
            height: 360,
        };
        let top_window = TestWindowGeometry {
            x: -880,
            y: -110,
            width: 320,
            height: 360,
        };
        let bottom_window = TestWindowGeometry {
            x: -880,
            y: 408,
            width: 320,
            height: 360,
        };

        assert_eq!(
            calculate_edge_peek_snap(work_area, left_window),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Left,
                position: PhysicalPosition::new(-1440, 100),
            })
        );
        assert_eq!(
            calculate_edge_peek_snap(work_area, right_window),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Right,
                position: PhysicalPosition::new(-320, 100),
            })
        );
        assert_eq!(
            calculate_edge_peek_snap(work_area, top_window),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Top,
                position: PhysicalPosition::new(-880, -120),
            })
        );
        assert_eq!(
            calculate_edge_peek_snap(work_area, bottom_window),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Bottom,
                position: PhysicalPosition::new(-880, 420),
            })
        );
    }

    #[test]
    fn edge_peek_chooses_nearest_edge_in_corners() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let top_closer = TestWindowGeometry {
            x: 20,
            y: 8,
            width: 320,
            height: 360,
        };
        let left_closer = TestWindowGeometry {
            x: 8,
            y: 20,
            width: 320,
            height: 360,
        };

        assert_eq!(
            calculate_edge_peek_snap(work_area, top_closer),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Top,
                position: PhysicalPosition::new(20, 0),
            })
        );
        assert_eq!(
            calculate_edge_peek_snap(work_area, left_closer),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Left,
                position: PhysicalPosition::new(0, 20),
            })
        );
    }

    #[test]
    fn edge_peek_uses_horizontal_side_when_corner_distance_ties() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
        };
        let top_left_tie = TestWindowGeometry {
            x: 10,
            y: 10,
            width: 320,
            height: 360,
        };
        let top_right_tie = TestWindowGeometry {
            x: 870,
            y: 10,
            width: 320,
            height: 360,
        };

        assert_eq!(
            calculate_edge_peek_snap(work_area, top_left_tie),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Left,
                position: PhysicalPosition::new(0, 10),
            })
        );
        assert_eq!(
            calculate_edge_peek_snap(work_area, top_right_tie),
            Some(EdgePeekSnap {
                side: EdgePeekSide::Right,
                position: PhysicalPosition::new(880, 10),
            })
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

        let surface = calculate_message_composer_surface_geometry(
            ComposerSurface::Message,
            1.0,
            work_area,
            pet_window,
        );

        assert_eq!(surface.saved_pet_window, pet_window);
        assert_eq!(surface.window.x, 380);
        assert_eq!(surface.window.y, 270);
        assert_eq!(surface.window.width, 440);
        assert_eq!(surface.window.height, 260);
    }

    #[test]
    fn composer_surfaces_scale_logical_sizes_for_physical_centering() {
        let cases = [
            (ComposerSurface::Message, 1.0, 440, 260),
            (ComposerSurface::Message, 1.25, 550, 325),
            (ComposerSurface::Message, 1.5, 660, 390),
            (ComposerSurface::Surprise, 1.0, 440, 460),
            (ComposerSurface::Surprise, 1.25, 550, 575),
            (ComposerSurface::Surprise, 1.5, 660, 690),
            (ComposerSurface::Focus, 1.0, 440, 320),
            (ComposerSurface::Focus, 1.25, 550, 400),
            (ComposerSurface::Focus, 1.5, 660, 480),
            (ComposerSurface::Weather, 1.0, 460, 504),
            (ComposerSurface::Weather, 1.25, 575, 630),
            (ComposerSurface::Weather, 1.5, 690, 756),
            (ComposerSurface::Spark, 1.0, 460, 638),
            (ComposerSurface::Spark, 1.25, 575, 798),
            (ComposerSurface::Spark, 1.5, 690, 957),
        ];

        for (surface, scale_factor, expected_width, expected_height) in cases {
            let physical_size = surface.physical_size(scale_factor);

            assert_eq!(physical_size.width, expected_width);
            assert_eq!(physical_size.height, expected_height);
        }
    }

    #[test]
    fn spark_composer_clamps_only_its_height_to_a_short_work_area() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 580,
        };
        let pet_window = TestWindowGeometry {
            x: 860,
            y: 220,
            width: 320,
            height: 360,
        };

        let spark = calculate_message_composer_surface_geometry(
            ComposerSurface::Spark,
            1.0,
            work_area,
            pet_window,
        );
        let weather = calculate_message_composer_surface_geometry(
            ComposerSurface::Weather,
            1.0,
            work_area,
            pet_window,
        );
        let message = calculate_message_composer_surface_geometry(
            ComposerSurface::Message,
            1.0,
            work_area,
            pet_window,
        );

        assert_eq!(spark.window.width, 460);
        assert_eq!(spark.window.height, 580);
        assert_eq!(spark.window.y, 0);
        assert_eq!(weather.window.height, 504);
        assert_eq!(message.window.height, 260);
    }

    #[test]
    fn spark_composer_resize_action_receives_the_clamped_physical_size() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1200,
            height: 580,
        };
        let pet_window = TestWindowGeometry {
            x: 860,
            y: 220,
            width: 320,
            height: 360,
        };
        let geometry = calculate_message_composer_surface_geometry(
            ComposerSurface::Spark,
            1.0,
            work_area,
            pet_window,
        );
        let received_size = std::cell::RefCell::new(None);

        execute_message_composer_open_actions(
            ComposerSurface::Spark,
            geometry,
            |size| {
                received_size.replace(Some(size));
                Ok(())
            },
            || Ok(()),
            || Ok(()),
            || Ok(()),
        )
        .unwrap();

        assert_eq!(
            *received_size.borrow(),
            Some(Size::Physical(PhysicalSize::new(460, 580)))
        );
    }

    #[test]
    fn surprise_composer_centers_scaled_physical_geometry_from_logical_size() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let pet_window = TestWindowGeometry {
            x: 1480,
            y: 680,
            width: 320,
            height: 360,
        };

        let surface = calculate_message_composer_surface_geometry(
            ComposerSurface::Surprise,
            1.5,
            work_area,
            pet_window,
        );

        assert_eq!(surface.saved_pet_window, pet_window);
        assert_eq!(surface.logical_size.width, 440.0);
        assert_eq!(surface.logical_size.height, 460.0);
        assert_eq!(surface.window.x, 630);
        assert_eq!(surface.window.y, 195);
        assert_eq!(surface.window.width, 660);
        assert_eq!(surface.window.height, 690);
    }

    #[test]
    fn message_composer_surface_uses_controlled_message_size() {
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

        let surface = calculate_message_composer_surface_geometry(
            ComposerSurface::Message,
            1.0,
            work_area,
            pet_window,
        );

        assert_eq!(surface.saved_pet_window, pet_window);
        assert_eq!(surface.window.x, 380);
        assert_eq!(surface.window.y, 270);
        assert_eq!(surface.window.width, 440);
        assert_eq!(surface.window.height, 260);
    }

    #[test]
    fn message_composer_surface_uses_controlled_surprise_size() {
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

        let surface = calculate_message_composer_surface_geometry(
            ComposerSurface::Surprise,
            1.0,
            work_area,
            pet_window,
        );

        assert_eq!(surface.saved_pet_window, pet_window);
        assert_eq!(surface.window.x, 380);
        assert_eq!(surface.window.y, 170);
        assert_eq!(surface.window.width, 440);
        assert_eq!(surface.window.height, 460);
    }

    #[test]
    fn message_composer_surface_centers_within_macos_menu_bar_work_area() {
        let work_area = TestWorkArea {
            x: -1512,
            y: 25,
            width: 1512,
            height: 919,
        };
        let pet_window = TestWindowGeometry {
            x: -430,
            y: 520,
            width: 320,
            height: 360,
        };

        let surface = calculate_message_composer_surface_geometry(
            ComposerSurface::Message,
            1.0,
            work_area,
            pet_window,
        );

        assert_eq!(surface.saved_pet_window, pet_window);
        assert_eq!(surface.window.x, -976);
        assert_eq!(surface.window.y, 354);
        assert_eq!(surface.window.width, 440);
        assert_eq!(surface.window.height, 260);
    }

    #[test]
    fn message_composer_surface_centers_surprise_within_negative_work_area() {
        let work_area = TestWorkArea {
            x: -1512,
            y: 25,
            width: 1512,
            height: 919,
        };
        let pet_window = TestWindowGeometry {
            x: -430,
            y: 520,
            width: 320,
            height: 360,
        };

        let surface = calculate_message_composer_surface_geometry(
            ComposerSurface::Surprise,
            1.0,
            work_area,
            pet_window,
        );

        assert_eq!(surface.saved_pet_window, pet_window);
        assert_eq!(surface.window.x, -976);
        assert_eq!(surface.window.y, 254);
        assert_eq!(surface.window.width, 440);
        assert_eq!(surface.window.height, 460);
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
    fn weather_composer_surface_restore_uses_saved_pet_geometry() {
        let work_area = TestWorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let saved_pet_window = TestWindowGeometry {
            x: 1460,
            y: 680,
            width: 320,
            height: 360,
        };
        let weather_surface = calculate_message_composer_surface_geometry(
            ComposerSurface::Weather,
            1.25,
            work_area,
            saved_pet_window,
        );

        let restored = calculate_message_composer_restore_geometry(
            work_area,
            weather_surface.window,
            Some(weather_surface.saved_pet_window),
        );

        assert_eq!(restored, saved_pet_window);
    }

    #[test]
    fn message_composer_surface_repeated_open_does_not_overwrite_saved_pet_geometry() {
        let _guard = lock_message_composer_surface_state_for_test();
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
    fn message_composer_saved_geometry_is_pending_until_open_succeeds() {
        let _guard = lock_message_composer_surface_state_for_test();
        let original_pet_window = TestWindowGeometry {
            x: 860,
            y: 420,
            width: 320,
            height: 360,
        };

        set_saved_message_composer_surface(None).unwrap();
        assert!(save_message_composer_surface_if_absent(original_pet_window).unwrap());
        assert!(!is_message_composer_surface_open());

        mark_message_composer_surface_open().unwrap();
        assert!(is_message_composer_surface_open());
        assert_eq!(
            saved_message_composer_surface().unwrap(),
            Some(original_pet_window)
        );
        set_saved_message_composer_surface(None).unwrap();
    }

    #[test]
    fn message_composer_resize_failure_attempts_safe_rollback() {
        let actions = std::cell::RefCell::new(Vec::new());
        let surface = sample_message_composer_surface_geometry();

        let result = execute_message_composer_open_actions(
            ComposerSurface::Message,
            surface,
            |_| {
                actions.borrow_mut().push("resize");
                Err("resize failed".to_string())
            },
            || {
                actions.borrow_mut().push("move");
                Ok(())
            },
            || {
                actions.borrow_mut().push("show");
                Ok(())
            },
            || {
                actions.borrow_mut().push("rollback");
                Ok(())
            },
        );

        assert_eq!(result, Err("resize failed".to_string()));
        assert_eq!(*actions.borrow(), vec!["resize", "rollback"]);
    }

    #[test]
    fn message_composer_move_failure_rolls_back_applied_geometry() {
        let actions = std::cell::RefCell::new(Vec::new());
        let surface = sample_message_composer_surface_geometry();

        let result = execute_message_composer_open_actions(
            ComposerSurface::Message,
            surface,
            |_| {
                actions.borrow_mut().push("resize");
                Ok(())
            },
            || {
                actions.borrow_mut().push("move");
                Err("move failed".to_string())
            },
            || {
                actions.borrow_mut().push("show");
                Ok(())
            },
            || {
                actions.borrow_mut().push("rollback");
                Ok(())
            },
        );

        assert_eq!(result, Err("move failed".to_string()));
        assert_eq!(*actions.borrow(), vec!["resize", "move", "rollback"]);
    }

    #[test]
    fn message_composer_show_failure_rolls_back_size_and_position() {
        let actions = std::cell::RefCell::new(Vec::new());
        let surface = sample_message_composer_surface_geometry();

        let result = execute_message_composer_open_actions(
            ComposerSurface::Message,
            surface,
            |_| {
                actions.borrow_mut().push("resize");
                Ok(())
            },
            || {
                actions.borrow_mut().push("move");
                Ok(())
            },
            || {
                actions.borrow_mut().push("show");
                Err("show failed".to_string())
            },
            || {
                actions.borrow_mut().push("rollback");
                Ok(())
            },
        );

        assert_eq!(result, Err("show failed".to_string()));
        assert_eq!(
            *actions.borrow(),
            vec!["resize", "move", "show", "rollback"]
        );
    }

    #[test]
    fn message_composer_surface_close_failure_preserves_saved_geometry_for_retry() {
        let _guard = lock_message_composer_surface_state_for_test();
        let original_pet_window = TestWindowGeometry {
            x: 860,
            y: 420,
            width: 320,
            height: 360,
        };

        set_saved_message_composer_surface(Some(original_pet_window)).unwrap();

        let result = clear_message_composer_surface_after_close(Err(
            "failed to move main window".to_string()
        ));

        assert_eq!(result, Err("failed to move main window".to_string()));
        assert_eq!(
            saved_message_composer_surface().unwrap(),
            Some(original_pet_window)
        );
        set_saved_message_composer_surface(None).unwrap();
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
