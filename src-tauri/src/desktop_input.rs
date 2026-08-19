use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

#[cfg(not(target_os = "linux"))]
use std::{sync::Arc, thread, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, PhysicalPosition, Runtime, WebviewWindow};

#[cfg(not(target_os = "linux"))]
use tauri::{Manager, WindowEvent};

#[cfg(not(target_os = "linux"))]
const MAIN_WINDOW_LABEL: &str = "main";
#[cfg(not(target_os = "linux"))]
const HIT_TEST_INTERVAL_MS: u64 = 16;

static INPUT_STATE: Mutex<DesktopInputState> = Mutex::new(DesktopInputState {
    full_click_through: false,
    regions: Vec::new(),
    device_scale_factor: 1.0,
    applied_ignore_cursor_events: None,
});
#[cfg(not(target_os = "linux"))]
static POINTER_MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug)]
struct DesktopInputState {
    full_click_through: bool,
    regions: Vec<InteractiveRegion>,
    device_scale_factor: f64,
    applied_ignore_cursor_events: Option<bool>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractiveRegion {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Point {
    pub x: f64,
    pub y: f64,
}

#[cfg(any(target_os = "linux", test))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct InputShapeRectangle {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[cfg(any(target_os = "linux", test))]
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum LinuxInputShapePlan {
    Interactive(Vec<InputShapeRectangle>),
    FullWindow,
    Empty,
}

#[cfg(target_os = "linux")]
pub fn start_pointer_passthrough_monitor<R: Runtime + 'static>(
    _app: &AppHandle<R>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn start_pointer_passthrough_monitor<R: Runtime + 'static>(
    app: &AppHandle<R>,
) -> Result<(), String> {
    if !try_claim_monitor_start(&POINTER_MONITOR_RUNNING) {
        return Ok(());
    }

    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        release_monitor_start(&POINTER_MONITOR_RUNNING);
        return Err("failed to find main window for desktop input monitor".to_string());
    };
    let stop_requested = Arc::new(AtomicBool::new(false));
    let stop_on_destroy = Arc::clone(&stop_requested);

    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            stop_on_destroy.store(true, Ordering::SeqCst);
        }
    });

    let spawn_result = thread::Builder::new()
        .name("desktop-input-hit-test".to_string())
        .spawn(move || {
            while !stop_requested.load(Ordering::SeqCst) {
                if let Err(error) = update_ignore_cursor_events_for_current_cursor(&window) {
                    eprintln!("{error}");
                }

                thread::sleep(Duration::from_millis(HIT_TEST_INTERVAL_MS));
            }

            release_monitor_start(&POINTER_MONITOR_RUNNING);
        });

    if let Err(error) = spawn_result {
        release_monitor_start(&POINTER_MONITOR_RUNNING);
        return Err(format!("failed to start desktop input monitor: {error}"));
    }

    Ok(())
}

pub fn set_full_click_through<R: Runtime>(
    window: &WebviewWindow<R>,
    enabled: bool,
) -> Result<(), String> {
    update_input_state(|state| {
        state.full_click_through = enabled;
    })?;

    apply_current_input_policy(window)
}

pub fn set_interactive_regions<R: Runtime>(
    window: &WebviewWindow<R>,
    regions: Vec<InteractiveRegion>,
    device_scale_factor: f64,
) -> Result<(), String> {
    let normalized_scale = normalize_device_scale_factor(device_scale_factor);
    let regions = regions
        .into_iter()
        .filter(|region| is_valid_interactive_region(*region))
        .collect::<Vec<_>>();

    update_input_state(|state| {
        state.regions = regions;
        state.device_scale_factor = normalized_scale;
    })?;

    apply_current_input_policy(window)
}

pub fn move_window_for_pointer_drag<R: Runtime>(
    window: &WebviewWindow<R>,
    delta_x: f64,
    delta_y: f64,
) -> Result<(), String> {
    if !delta_x.is_finite() || !delta_y.is_finite() {
        return Err("pointer drag delta must be finite".to_string());
    }

    let current_scale_factor = window
        .scale_factor()
        .map_err(|error| format!("failed to read main window scale for pointer drag: {error}"))?;
    let current_position = window.outer_position().map_err(|error| {
        format!("failed to read main window position for pointer drag: {error}")
    })?;
    let next_position =
        calculate_pointer_drag_position(current_position, delta_x, delta_y, current_scale_factor);

    if next_position == current_position {
        return Ok(());
    }

    window
        .set_position(next_position)
        .map_err(|error| format!("failed to move main window for pointer drag: {error}"))
}

pub(crate) fn calculate_pointer_drag_position(
    current_position: PhysicalPosition<i32>,
    delta_x: f64,
    delta_y: f64,
    current_window_scale_factor: f64,
) -> PhysicalPosition<i32> {
    let (physical_delta_x, physical_delta_y) =
        scale_pointer_delta(delta_x, delta_y, current_window_scale_factor);

    PhysicalPosition::new(
        current_position.x + physical_delta_x,
        current_position.y + physical_delta_y,
    )
}

fn apply_current_input_policy<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let state = read_input_state()?;
        return linux_input_shape_backend::apply(
            window,
            linux_input_shape_plan(state.full_click_through, &state.regions),
        );
    }

    #[cfg(not(target_os = "linux"))]
    update_ignore_cursor_events_for_current_cursor(window)
}

#[cfg(target_os = "linux")]
mod linux_input_shape_backend {
    use super::{LinuxInputShapePlan, Runtime, WebviewWindow};
    use gtk::{
        cairo::{RectangleInt, Region},
        prelude::WidgetExt,
    };

    pub(super) fn apply<R: Runtime>(
        window: &WebviewWindow<R>,
        plan: LinuxInputShapePlan,
    ) -> Result<(), String> {
        let gtk_window = window
            .gtk_window()
            .map_err(|error| format!("failed to access GTK main window: {error}"))?;

        if plan == LinuxInputShapePlan::FullWindow {
            gtk_window.input_shape_combine_region(None);
            return Ok(());
        }

        let rectangles = match plan {
            LinuxInputShapePlan::Interactive(rectangles) => rectangles,
            LinuxInputShapePlan::Empty => Vec::new(),
            LinuxInputShapePlan::FullWindow => unreachable!(),
        };
        let cairo_rectangles = rectangles
            .into_iter()
            .map(|rectangle| {
                RectangleInt::new(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
            })
            .collect::<Vec<_>>();
        let input_shape = Region::create_rectangles(&cairo_rectangles);
        let gdk_window = gtk_window
            .window()
            .ok_or_else(|| "failed to access realized GDK main window".to_string())?;

        gdk_window.input_shape_combine_region(&input_shape, 0, 0);
        Ok(())
    }
}

#[cfg(not(target_os = "linux"))]
fn update_ignore_cursor_events_for_current_cursor<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(), String> {
    let state = read_input_state()?;
    let has_interactive_regions = !state.regions.is_empty();
    let cursor_hits_interactive_region = if has_interactive_regions {
        let cursor_client_physical = cursor_client_physical(window)?;
        client_physical_cursor_hits_region(
            cursor_client_physical,
            state.device_scale_factor,
            &state.regions,
        )
    } else {
        false
    };
    let should_ignore = resolve_ignore_cursor_events(
        state.full_click_through,
        has_interactive_regions,
        cursor_hits_interactive_region,
    );

    apply_ignore_cursor_events(window, should_ignore)
}

#[cfg(not(target_os = "linux"))]
fn cursor_client_physical<R: Runtime>(window: &WebviewWindow<R>) -> Result<Point, String> {
    let cursor = window
        .cursor_position()
        .map_err(|error| format!("failed to read cursor position for hit testing: {error}"))?;
    let client_origin = window
        .inner_position()
        .map_err(|error| format!("failed to read main window client origin: {error}"))?;

    Ok(screen_physical_to_client_physical(
        Point {
            x: cursor.x,
            y: cursor.y,
        },
        Point {
            x: client_origin.x as f64,
            y: client_origin.y as f64,
        },
    ))
}

pub(crate) fn resolve_ignore_cursor_events(
    full_click_through: bool,
    has_interactive_regions: bool,
    cursor_hits_interactive_region: bool,
) -> bool {
    if has_interactive_regions {
        !cursor_hits_interactive_region
    } else {
        full_click_through
    }
}

pub(crate) fn screen_physical_to_client_physical(
    cursor_screen_physical: Point,
    client_origin_screen_physical: Point,
) -> Point {
    Point {
        x: cursor_screen_physical.x - client_origin_screen_physical.x,
        y: cursor_screen_physical.y - client_origin_screen_physical.y,
    }
}

fn is_valid_interactive_region(region: InteractiveRegion) -> bool {
    region.x.is_finite()
        && region.y.is_finite()
        && region.width.is_finite()
        && region.height.is_finite()
        && region.width > 0.0
        && region.height > 0.0
        && (region.x + region.width).is_finite()
        && (region.y + region.height).is_finite()
}

#[cfg(any(target_os = "linux", test))]
pub(crate) fn logical_region_to_input_shape_rectangle(
    region: InteractiveRegion,
) -> Option<InputShapeRectangle> {
    if !is_valid_interactive_region(region) {
        return None;
    }

    let right = region.x + region.width;
    let bottom = region.y + region.height;

    let left = clamp_input_shape_edge(region.x.floor());
    let top = clamp_input_shape_edge(region.y.floor());
    let right = clamp_input_shape_edge(right.ceil());
    let bottom = clamp_input_shape_edge(bottom.ceil());
    let width = i64::from(right) - i64::from(left);
    let height = i64::from(bottom) - i64::from(top);
    if width <= 0 || height <= 0 {
        return None;
    }

    Some(InputShapeRectangle {
        x: left,
        y: top,
        width: width.min(i64::from(i32::MAX)) as i32,
        height: height.min(i64::from(i32::MAX)) as i32,
    })
}

#[cfg(any(target_os = "linux", test))]
fn clamp_input_shape_edge(value: f64) -> i32 {
    value.clamp(i32::MIN as f64, i32::MAX as f64) as i32
}

#[cfg(any(target_os = "linux", test))]
pub(crate) fn linux_input_shape_plan(
    full_click_through: bool,
    regions: &[InteractiveRegion],
) -> LinuxInputShapePlan {
    let rectangles = regions
        .iter()
        .filter_map(|region| logical_region_to_input_shape_rectangle(*region))
        .collect::<Vec<_>>();

    if !rectangles.is_empty() {
        LinuxInputShapePlan::Interactive(rectangles)
    } else if full_click_through {
        LinuxInputShapePlan::Empty
    } else {
        LinuxInputShapePlan::FullWindow
    }
}

#[cfg(not(target_os = "linux"))]
fn apply_ignore_cursor_events<R: Runtime>(
    window: &WebviewWindow<R>,
    should_ignore: bool,
) -> Result<(), String> {
    let should_apply = should_apply_ignore_cursor_events(
        read_input_state()?.applied_ignore_cursor_events,
        should_ignore,
    );

    if !should_apply {
        return Ok(());
    }

    window
        .set_ignore_cursor_events(should_ignore)
        .map_err(|error| format!("failed to set click-through: {error}"))?;

    update_input_state(|state| {
        record_ignore_cursor_events_success(&mut state.applied_ignore_cursor_events, should_ignore);
    })
}

pub(crate) fn should_apply_ignore_cursor_events(
    cached_ignore_cursor_events: Option<bool>,
    should_ignore: bool,
) -> bool {
    cached_ignore_cursor_events != Some(should_ignore)
}

pub(crate) fn record_ignore_cursor_events_success(
    cached_ignore_cursor_events: &mut Option<bool>,
    should_ignore: bool,
) {
    *cached_ignore_cursor_events = Some(should_ignore);
}

pub(crate) fn try_claim_monitor_start(running: &AtomicBool) -> bool {
    running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
}

pub(crate) fn release_monitor_start(running: &AtomicBool) {
    running.store(false, Ordering::SeqCst);
}

pub(crate) fn client_physical_cursor_hits_region(
    cursor_client_physical: Point,
    device_scale_factor: f64,
    regions: &[InteractiveRegion],
) -> bool {
    let scale = normalize_device_scale_factor(device_scale_factor);
    let local_x = cursor_client_physical.x / scale;
    let local_y = cursor_client_physical.y / scale;

    regions.iter().any(|region| {
        local_x >= region.x
            && local_x <= region.x + region.width
            && local_y >= region.y
            && local_y <= region.y + region.height
    })
}

pub(crate) fn scale_pointer_delta(
    delta_x: f64,
    delta_y: f64,
    device_scale_factor: f64,
) -> (i32, i32) {
    let scale = normalize_device_scale_factor(device_scale_factor);

    (
        (delta_x * scale).round() as i32,
        (delta_y * scale).round() as i32,
    )
}

fn normalize_device_scale_factor(device_scale_factor: f64) -> f64 {
    if device_scale_factor.is_finite() && device_scale_factor > 0.0 {
        device_scale_factor
    } else {
        1.0
    }
}

fn read_input_state() -> Result<DesktopInputState, String> {
    INPUT_STATE
        .lock()
        .map(|state| state.clone())
        .map_err(|_| "failed to lock desktop input state".to_string())
}

fn update_input_state<T>(update: impl FnOnce(&mut DesktopInputState) -> T) -> Result<T, String> {
    INPUT_STATE
        .lock()
        .map(|mut state| update(&mut state))
        .map_err(|_| "failed to lock desktop input state".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn client_physical_hit_testing_converts_to_css_logical_coordinates() {
        let regions = [InteractiveRegion {
            x: 140.0,
            y: 160.0,
            width: 40.0,
            height: 40.0,
        }];

        assert!(client_physical_cursor_hits_region(
            Point { x: 240.0, y: 270.0 },
            1.5,
            &regions,
        ));
        assert!(!client_physical_cursor_hits_region(
            Point { x: 360.0, y: 270.0 },
            1.5,
            &regions,
        ));
    }

    #[test]
    fn client_physical_hit_testing_never_subtracts_a_screen_origin() {
        let regions = [InteractiveRegion {
            x: 150.0,
            y: 170.0,
            width: 20.0,
            height: 20.0,
        }];

        assert!(client_physical_cursor_hits_region(
            Point { x: 240.0, y: 270.0 },
            1.5,
            &regions,
        ));
    }

    #[test]
    fn client_physical_hit_testing_normalizes_bad_device_scale() {
        let regions = [InteractiveRegion {
            x: 10.0,
            y: 10.0,
            width: 20.0,
            height: 20.0,
        }];

        assert!(client_physical_cursor_hits_region(
            Point { x: 20.0, y: 20.0 },
            0.0,
            &regions,
        ));
    }

    #[test]
    fn interactive_regions_override_persisted_full_click_through() {
        assert!(!resolve_ignore_cursor_events(true, true, true));
        assert!(resolve_ignore_cursor_events(true, true, false));
    }

    #[test]
    fn empty_regions_follow_the_persisted_click_through_preference() {
        assert!(resolve_ignore_cursor_events(true, false, false));
        assert!(!resolve_ignore_cursor_events(false, false, false));
    }

    #[test]
    fn screen_cursor_coordinates_are_converted_to_window_client_coordinates() {
        assert_eq!(
            screen_physical_to_client_physical(
                Point { x: 840.0, y: 470.0 },
                Point { x: 800.0, y: 400.0 },
            ),
            Point { x: 40.0, y: 70.0 },
        );
    }

    #[test]
    fn linux_shape_rectangles_keep_logical_coordinates_and_cover_fractional_edges() {
        assert_eq!(
            logical_region_to_input_shape_rectangle(InteractiveRegion {
                x: 18.25,
                y: 19.75,
                width: 423.5,
                height: 465.5,
            }),
            Some(InputShapeRectangle {
                x: 18,
                y: 19,
                width: 424,
                height: 467,
            })
        );
    }

    #[test]
    fn linux_shape_plan_unions_each_valid_logical_rectangle() {
        let regions = [
            InteractiveRegion {
                x: 18.0,
                y: 19.0,
                width: 424.0,
                height: 466.0,
            },
            InteractiveRegion {
                x: 400.5,
                y: 450.5,
                width: 40.0,
                height: 40.0,
            },
            InteractiveRegion {
                x: f64::NAN,
                y: 0.0,
                width: 10.0,
                height: 10.0,
            },
        ];

        assert_eq!(
            linux_input_shape_plan(false, &regions),
            LinuxInputShapePlan::Interactive(vec![
                InputShapeRectangle {
                    x: 18,
                    y: 19,
                    width: 424,
                    height: 466,
                },
                InputShapeRectangle {
                    x: 400,
                    y: 450,
                    width: 41,
                    height: 41,
                },
            ])
        );
    }

    #[test]
    fn linux_shape_plan_restores_persisted_empty_region_policy() {
        assert_eq!(
            linux_input_shape_plan(false, &[]),
            LinuxInputShapePlan::FullWindow
        );
        assert_eq!(
            linux_input_shape_plan(true, &[]),
            LinuxInputShapePlan::Empty
        );

        let invalid_regions = [InteractiveRegion {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 20.0,
        }];
        assert_eq!(
            linux_input_shape_plan(true, &invalid_regions),
            LinuxInputShapePlan::Empty
        );
    }

    #[test]
    fn pointer_drag_delta_is_scaled_to_physical_pixels() {
        assert_eq!(scale_pointer_delta(8.0, -3.0, 1.5), (12, -5));
        assert_eq!(scale_pointer_delta(8.0, -3.0, f64::NAN), (8, -3));
    }

    #[test]
    fn pointer_drag_uses_current_window_scale_after_dpi_change() {
        let current_position = PhysicalPosition::new(100, 100);
        let cached_region_scale = 1.0;

        assert_eq!(
            calculate_pointer_drag_position(current_position, 8.0, -4.0, cached_region_scale),
            PhysicalPosition::new(108, 96)
        );

        let current_window_scale = 1.5;
        assert_eq!(
            calculate_pointer_drag_position(current_position, 8.0, -4.0, current_window_scale),
            PhysicalPosition::new(112, 94)
        );
    }

    #[test]
    fn ignore_cursor_event_cache_only_skips_after_success() {
        let mut cached = None;

        assert!(should_apply_ignore_cursor_events(cached, true));
        assert!(
            should_apply_ignore_cursor_events(cached, true),
            "a failed native call must leave the cache unchanged so the same state retries",
        );

        record_ignore_cursor_events_success(&mut cached, true);
        assert!(!should_apply_ignore_cursor_events(cached, true));
        assert!(should_apply_ignore_cursor_events(cached, false));
    }

    #[test]
    fn monitor_start_claim_rejects_duplicates_until_released() {
        let running = AtomicBool::new(false);

        assert!(try_claim_monitor_start(&running));
        assert!(!try_claim_monitor_start(&running));

        release_monitor_start(&running);
        assert!(try_claim_monitor_start(&running));
    }
}
