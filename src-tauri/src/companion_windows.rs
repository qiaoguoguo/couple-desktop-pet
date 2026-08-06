use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

const MIN_SCENE_SCALE: f64 = 0.85;
const MAX_SCENE_SCALE: f64 = 1.25;
const PRESENCE_WIDTH: u32 = 168;
const PRESENCE_HEIGHT: u32 = 176;
const LINK_WIDTH: u32 = 196;
const LINK_HEIGHT: u32 = 112;
const OFFLINE_NEST_WIDTH: u32 = 138;
const OFFLINE_NEST_HEIGHT: u32 = 116;
const PRESENCE_GAP_X: i32 = 20;
const PRESENCE_OFFSET_Y: i32 = -48;
const COMPACT_PRESENCE_GAP_Y: i32 = 12;
const OFFLINE_NEST_GAP_X: i32 = 42;
const OFFLINE_NEST_OFFSET_Y: i32 = 204;
const FULL_LAYOUT_SIDE_SPACE: i32 = 214;
const MAIN_WINDOW_LABEL: &str = "main";
pub const PEER_PRESENCE_WINDOW_LABEL: &str = "peer-presence";
pub const PEER_LINK_WINDOW_LABEL: &str = "peer-link";
pub const OFFLINE_NEST_WINDOW_LABEL: &str = "offline-nest";
pub const COMPANION_SCENE_UPDATED_EVENT: &str = "companion-scene-updated";
const PEER_PRESENCE_WINDOW_ROUTE: &str = "index.html";
const PEER_LINK_WINDOW_ROUTE: &str = "index.html";
const OFFLINE_NEST_WINDOW_ROUTE: &str = "index.html";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CompanionLayoutInput {
    pub work_area: Rect,
    pub main: Rect,
    pub monitor_scale_factor: f64,
}

impl Rect {
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    pub fn right(&self) -> i32 {
        self.x + self.width as i32
    }

    pub fn bottom(&self) -> i32 {
        self.y + self.height as i32
    }

    pub fn overlaps(&self, other: &Rect) -> bool {
        self.x < other.right()
            && self.right() > other.x
            && self.y < other.bottom()
            && self.bottom() > other.y
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompanionSide {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompanionPresence {
    Hidden,
    Online,
    Offline,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionSceneContentState {
    pub presence: CompanionPresence,
    #[serde(default)]
    pub portrait_url: Option<String>,
    #[serde(default)]
    pub offline_portrait_url: Option<String>,
    pub scene_scale: f64,
    pub suspended: bool,
}

impl Default for CompanionSceneContentState {
    fn default() -> Self {
        Self {
            presence: CompanionPresence::Hidden,
            portrait_url: None,
            offline_portrait_url: None,
            scene_scale: 1.0,
            suspended: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionSceneViewState {
    pub presence: CompanionPresence,
    pub portrait_url: Option<String>,
    pub offline_portrait_url: Option<String>,
    pub scene_scale: f64,
    pub suspended: bool,
    pub side: CompanionSide,
    pub compact: bool,
    pub revision: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CompanionWindowVisibility {
    pub peer_presence: bool,
    pub peer_link: bool,
    pub offline_nest: bool,
}

#[derive(Debug)]
pub struct CompanionWindowCoordinator {
    state: Mutex<CompanionWindowState>,
}

impl Default for CompanionWindowCoordinator {
    fn default() -> Self {
        Self {
            state: Mutex::new(CompanionWindowState::default()),
        }
    }
}

#[derive(Clone, Debug)]
struct CompanionWindowState {
    content: CompanionSceneContentState,
    view: CompanionSceneViewState,
}

impl Default for CompanionWindowState {
    fn default() -> Self {
        Self {
            content: CompanionSceneContentState::default(),
            view: default_view_state(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CompanionLayout {
    pub side: CompanionSide,
    pub compact: bool,
    pub monitor_scale_factor: f64,
    pub presence: Option<Rect>,
    pub link: Option<Rect>,
    pub offline_nest: Option<Rect>,
}

#[cfg(test)]
pub fn calculate_layout(work_area: Rect, main: Rect, scene_scale: f64) -> CompanionLayout {
    calculate_layout_for_monitor(work_area, main, 1.0, scene_scale)
}

pub fn calculate_layout_for_monitor(
    work_area: Rect,
    main: Rect,
    monitor_scale_factor: f64,
    scene_scale: f64,
) -> CompanionLayout {
    let monitor_scale_factor = normalize_monitor_scale_factor(monitor_scale_factor);
    let scale = monitor_scale_factor * clamp_user_scene_scale(scene_scale);
    let presence_size = scaled_size(PRESENCE_WIDTH, PRESENCE_HEIGHT, scale);
    let link_size = scaled_size(LINK_WIDTH, LINK_HEIGHT, scale);
    let nest_size = scaled_size(OFFLINE_NEST_WIDTH, OFFLINE_NEST_HEIGHT, scale);
    let full_side_space = scale_i32(FULL_LAYOUT_SIDE_SPACE, scale);
    let right_space = work_area.right() - main.right();
    let left_space = main.x - work_area.x;
    let side = if right_space >= full_side_space || right_space >= left_space {
        CompanionSide::Right
    } else {
        CompanionSide::Left
    };
    let compact = right_space.max(left_space) < full_side_space;
    let presence = if compact {
        build_compact_presence_rect(work_area, main, side, presence_size, scale)
    } else {
        Some(build_presence_rect(
            work_area,
            main,
            side,
            presence_size,
            scale,
        ))
    };

    CompanionLayout {
        side,
        compact,
        monitor_scale_factor,
        presence,
        link: (!compact).then(|| build_link_rect(work_area, main, side, link_size, scale)),
        offline_nest: (!compact)
            .then(|| build_offline_nest_rect(work_area, main, side, nest_size, scale)),
    }
}

pub fn update_scene<R: Runtime>(
    app: &AppHandle<R>,
    coordinator: &CompanionWindowCoordinator,
    content: CompanionSceneContentState,
) -> Result<CompanionSceneViewState, String> {
    let layout_input = read_main_window_layout(app)?;
    let previous_revision = coordinator.view()?.revision;
    let view = reduce_scene_state(content.clone(), layout_input, previous_revision);
    let layout = calculate_layout_for_input(layout_input, view.scene_scale);

    coordinator.replace(content, view.clone())?;
    apply_companion_windows(app, &view, &layout)?;

    Ok(view)
}

pub fn read_scene(coordinator: &CompanionWindowCoordinator) -> CompanionSceneViewState {
    coordinator.view().unwrap_or_else(|_| default_view_state())
}

pub fn hide_scene<R: Runtime>(
    app: &AppHandle<R>,
    coordinator: &CompanionWindowCoordinator,
) -> Result<(), String> {
    let previous_revision = coordinator.view()?.revision;
    let content = CompanionSceneContentState::default();
    let mut view = default_view_state();

    view.revision = previous_revision.saturating_add(1);
    coordinator.replace(content, view.clone())?;
    hide_companion_windows(app)?;
    emit_scene_update(app, &view)
}

pub fn sync_companion_windows<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let Some(coordinator) = app.try_state::<CompanionWindowCoordinator>() else {
        return Ok(());
    };
    let content = coordinator.content()?;
    let layout_input = read_main_window_layout(app)?;
    let view = reduce_scene_state(content.clone(), layout_input, coordinator.view()?.revision);
    let layout = calculate_layout_for_input(layout_input, view.scene_scale);

    coordinator.replace(content, view.clone())?;
    apply_companion_windows(app, &view, &layout)
}

pub fn hide_companion_windows<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    for label in [
        PEER_PRESENCE_WINDOW_LABEL,
        PEER_LINK_WINDOW_LABEL,
        OFFLINE_NEST_WINDOW_LABEL,
    ] {
        if let Some(window) = app.get_webview_window(label) {
            window
                .hide()
                .map_err(|error| format!("failed to hide companion window `{label}`: {error}"))?;
        }
    }

    Ok(())
}

pub fn reduce_scene_state(
    content: CompanionSceneContentState,
    layout_input: CompanionLayoutInput,
    previous_revision: u64,
) -> CompanionSceneViewState {
    let scene_scale = clamp_user_scene_scale(content.scene_scale);
    let layout = calculate_layout_for_input(layout_input, scene_scale);
    let presence = if layout.presence.is_some() {
        content.presence
    } else {
        CompanionPresence::Hidden
    };

    CompanionSceneViewState {
        presence,
        portrait_url: normalize_url(content.portrait_url),
        offline_portrait_url: normalize_url(content.offline_portrait_url),
        scene_scale,
        suspended: content.suspended,
        side: layout.side,
        compact: layout.compact,
        revision: previous_revision.saturating_add(1),
    }
}

pub fn visible_windows(view: &CompanionSceneViewState) -> CompanionWindowVisibility {
    if view.suspended || view.presence == CompanionPresence::Hidden {
        return CompanionWindowVisibility {
            peer_presence: false,
            peer_link: false,
            offline_nest: false,
        };
    }

    CompanionWindowVisibility {
        peer_presence: true,
        peer_link: !view.compact,
        offline_nest: !view.compact && view.presence == CompanionPresence::Offline,
    }
}

fn normalize_url(value: Option<String>) -> Option<String> {
    value.and_then(|url| {
        let trimmed = url.trim();

        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn calculate_layout_for_input(input: CompanionLayoutInput, scene_scale: f64) -> CompanionLayout {
    calculate_layout_for_monitor(
        input.work_area,
        input.main,
        input.monitor_scale_factor,
        scene_scale,
    )
}

fn clamp_user_scene_scale(scene_scale: f64) -> f64 {
    scene_scale.clamp(MIN_SCENE_SCALE, MAX_SCENE_SCALE)
}

fn normalize_monitor_scale_factor(monitor_scale_factor: f64) -> f64 {
    if monitor_scale_factor.is_finite() && monitor_scale_factor > 0.0 {
        monitor_scale_factor
    } else {
        1.0
    }
}

impl CompanionWindowCoordinator {
    fn content(&self) -> Result<CompanionSceneContentState, String> {
        self.state
            .lock()
            .map(|state| state.content.clone())
            .map_err(|_| "failed to lock companion window state".to_string())
    }

    fn view(&self) -> Result<CompanionSceneViewState, String> {
        self.state
            .lock()
            .map(|state| state.view.clone())
            .map_err(|_| "failed to lock companion window state".to_string())
    }

    fn replace(
        &self,
        content: CompanionSceneContentState,
        view: CompanionSceneViewState,
    ) -> Result<(), String> {
        self.state
            .lock()
            .map(|mut state| {
                state.content = content;
                state.view = view;
            })
            .map_err(|_| "failed to lock companion window state".to_string())
    }
}

fn default_view_state() -> CompanionSceneViewState {
    CompanionSceneViewState {
        presence: CompanionPresence::Hidden,
        portrait_url: None,
        offline_portrait_url: None,
        scene_scale: 1.0,
        suspended: false,
        side: CompanionSide::Right,
        compact: false,
        revision: 0,
    }
}

fn apply_companion_windows<R: Runtime>(
    app: &AppHandle<R>,
    view: &CompanionSceneViewState,
    layout: &CompanionLayout,
) -> Result<(), String> {
    let visibility = visible_windows(view);

    if visibility.peer_presence {
        if let Some(rect) = layout.presence {
            show_companion_window(
                app,
                PEER_PRESENCE_WINDOW_LABEL,
                PEER_PRESENCE_WINDOW_ROUTE,
                rect,
                layout.monitor_scale_factor,
                false,
            )?;
        } else {
            hide_companion_window(app, PEER_PRESENCE_WINDOW_LABEL)?;
        }
    } else {
        hide_companion_window(app, PEER_PRESENCE_WINDOW_LABEL)?;
    }

    if visibility.peer_link {
        if let Some(rect) = layout.link {
            show_companion_window(
                app,
                PEER_LINK_WINDOW_LABEL,
                PEER_LINK_WINDOW_ROUTE,
                rect,
                layout.monitor_scale_factor,
                true,
            )?;
        } else {
            hide_companion_window(app, PEER_LINK_WINDOW_LABEL)?;
        }
    } else {
        hide_companion_window(app, PEER_LINK_WINDOW_LABEL)?;
    }

    if visibility.offline_nest {
        if let Some(rect) = layout.offline_nest {
            show_companion_window(
                app,
                OFFLINE_NEST_WINDOW_LABEL,
                OFFLINE_NEST_WINDOW_ROUTE,
                rect,
                layout.monitor_scale_factor,
                true,
            )?;
        } else {
            hide_companion_window(app, OFFLINE_NEST_WINDOW_LABEL)?;
        }
    } else {
        hide_companion_window(app, OFFLINE_NEST_WINDOW_LABEL)?;
    }

    emit_scene_update(app, view)
}

fn show_companion_window<R: Runtime>(
    app: &AppHandle<R>,
    label: &'static str,
    route: &'static str,
    rect: Rect,
    monitor_scale_factor: f64,
    click_through: bool,
) -> Result<(), String> {
    let window =
        ensure_companion_window(app, label, route, rect, monitor_scale_factor, click_through)?;

    window
        .set_size(Size::Physical(PhysicalSize::new(rect.width, rect.height)))
        .map_err(|error| format!("failed to resize companion window `{label}`: {error}"))?;
    window
        .set_position(PhysicalPosition::new(rect.x, rect.y))
        .map_err(|error| format!("failed to move companion window `{label}`: {error}"))?;
    window
        .show()
        .map_err(|error| format!("failed to show companion window `{label}`: {error}"))?;
    Ok(())
}

fn ensure_companion_window<R: Runtime>(
    app: &AppHandle<R>,
    label: &'static str,
    route: &'static str,
    rect: Rect,
    monitor_scale_factor: f64,
    click_through: bool,
) -> Result<WebviewWindow<R>, String> {
    if let Some(window) = app.get_webview_window(label) {
        return Ok(window);
    }
    let (logical_width, logical_height) =
        physical_rect_to_logical_inner_size(rect, monitor_scale_factor);
    let scale = normalize_monitor_scale_factor(monitor_scale_factor);
    let logical_x = f64::from(rect.x) / scale;
    let logical_y = f64::from(rect.y) / scale;

    // Tauri builders take logical dimensions. The final set_size call uses
    // Physical pixels as the source of truth, so the WebView CSS viewport stays
    // at the designed logical size on high-DPI monitors.
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(route.into()))
        .inner_size(logical_width, logical_height)
        .position(logical_x, logical_y)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .build()
        .map_err(|error| format!("failed to create companion window `{label}`: {error}"))?;

    if click_through {
        set_window_click_through(&window, true)?;
    }

    Ok(window)
}

fn hide_companion_window<R: Runtime>(app: &AppHandle<R>, label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        window
            .close()
            .map_err(|error| format!("failed to close companion window `{label}`: {error}"))?;
    }

    Ok(())
}

fn emit_scene_update<R: Runtime>(
    app: &AppHandle<R>,
    view: &CompanionSceneViewState,
) -> Result<(), String> {
    for label in [
        PEER_PRESENCE_WINDOW_LABEL,
        PEER_LINK_WINDOW_LABEL,
        OFFLINE_NEST_WINDOW_LABEL,
    ] {
        if app.get_webview_window(label).is_some() {
            app.emit_to(label, COMPANION_SCENE_UPDATED_EVENT, view)
                .map_err(|error| {
                    format!("failed to emit companion scene update to `{label}`: {error}")
                })?;
        }
    }

    Ok(())
}

fn read_main_window_layout<R: Runtime>(app: &AppHandle<R>) -> Result<CompanionLayoutInput, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("window `{MAIN_WINDOW_LABEL}` not found"))?;
    let monitor = window
        .current_monitor()
        .map_err(|error| format!("failed to read current monitor for companion scene: {error}"))?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "failed to find a visible monitor for companion scene".to_string())?;
    let work_area = monitor.work_area();
    let outer_position = window.outer_position().map_err(|error| {
        format!("failed to read main window position for companion scene: {error}")
    })?;
    let outer_size = window
        .outer_size()
        .map_err(|error| format!("failed to read main window size for companion scene: {error}"))?;

    Ok(CompanionLayoutInput {
        work_area: Rect::new(
            work_area.position.x,
            work_area.position.y,
            work_area.size.width,
            work_area.size.height,
        ),
        main: Rect::new(
            outer_position.x,
            outer_position.y,
            outer_size.width,
            outer_size.height,
        ),
        monitor_scale_factor: monitor.scale_factor(),
    })
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn set_window_click_through<R: Runtime>(
    window: &WebviewWindow<R>,
    enabled: bool,
) -> Result<(), String> {
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| format!("failed to set companion click-through: {error}"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn set_window_click_through<R: Runtime>(
    _window: &WebviewWindow<R>,
    enabled: bool,
) -> Result<(), String> {
    eprintln!("companion click-through unsupported on this platform; requested enabled={enabled}");
    Ok(())
}

fn build_presence_rect(
    work_area: Rect,
    main: Rect,
    side: CompanionSide,
    size: (u32, u32),
    scale: f64,
) -> Rect {
    let x = match side {
        CompanionSide::Right => main.right() + scale_i32(PRESENCE_GAP_X, scale),
        CompanionSide::Left => main.x - scale_i32(PRESENCE_GAP_X, scale) - size.0 as i32,
    };
    let y = main.y + scale_i32(PRESENCE_OFFSET_Y, scale);

    Rect::new(
        clamp_axis(x, work_area.x, work_area.right() - size.0 as i32),
        clamp_axis(y, work_area.y, work_area.bottom() - size.1 as i32),
        size.0,
        size.1,
    )
}

fn physical_rect_to_logical_inner_size(rect: Rect, monitor_scale_factor: f64) -> (f64, f64) {
    let scale = normalize_monitor_scale_factor(monitor_scale_factor);

    (rect.width as f64 / scale, rect.height as f64 / scale)
}

fn build_compact_presence_rect(
    work_area: Rect,
    main: Rect,
    preferred_side: CompanionSide,
    size: (u32, u32),
    scale: f64,
) -> Option<Rect> {
    let fallback_side = match preferred_side {
        CompanionSide::Left => CompanionSide::Right,
        CompanionSide::Right => CompanionSide::Left,
    };

    build_side_presence_if_safe(work_area, main, preferred_side, size, scale)
        .or_else(|| build_side_presence_if_safe(work_area, main, fallback_side, size, scale))
        .or_else(|| build_vertical_compact_presence_rect(work_area, main, size, scale))
}

fn build_side_presence_if_safe(
    work_area: Rect,
    main: Rect,
    side: CompanionSide,
    size: (u32, u32),
    scale: f64,
) -> Option<Rect> {
    let gap = scale_i32(PRESENCE_GAP_X, scale);
    let x = match side {
        CompanionSide::Right if work_area.right() - main.right() >= gap + size.0 as i32 => {
            main.right() + gap
        }
        CompanionSide::Left if main.x - work_area.x >= gap + size.0 as i32 => {
            main.x - gap - size.0 as i32
        }
        _ => return None,
    };
    let y = clamp_axis(
        main.y + scale_i32(PRESENCE_OFFSET_Y, scale),
        work_area.y,
        work_area.bottom() - size.1 as i32,
    );
    let rect = Rect::new(x, y, size.0, size.1);

    (!rect.overlaps(&main)).then_some(rect)
}

fn build_vertical_compact_presence_rect(
    work_area: Rect,
    main: Rect,
    size: (u32, u32),
    scale: f64,
) -> Option<Rect> {
    let gap = scale_i32(COMPACT_PRESENCE_GAP_Y, scale);
    let x = clamp_axis(
        main.x + (main.width as i32 - size.0 as i32) / 2,
        work_area.x,
        work_area.right() - size.0 as i32,
    );
    let top = Rect::new(x, main.y - gap - size.1 as i32, size.0, size.1);

    if top.y >= work_area.y && !top.overlaps(&main) {
        return Some(top);
    }

    let bottom = Rect::new(x, main.bottom() + gap, size.0, size.1);

    if bottom.bottom() <= work_area.bottom() && !bottom.overlaps(&main) {
        return Some(bottom);
    }

    None
}

fn build_link_rect(
    work_area: Rect,
    main: Rect,
    side: CompanionSide,
    size: (u32, u32),
    scale: f64,
) -> Rect {
    let x = match side {
        CompanionSide::Right => main.right() - scale_i32(10, scale),
        CompanionSide::Left => main.x - size.0 as i32 + scale_i32(10, scale),
    };
    let y = main.y + scale_i32(76, scale);

    Rect::new(
        clamp_axis(x, work_area.x, work_area.right() - size.0 as i32),
        clamp_axis(y, work_area.y, work_area.bottom() - size.1 as i32),
        size.0,
        size.1,
    )
}

fn build_offline_nest_rect(
    work_area: Rect,
    main: Rect,
    side: CompanionSide,
    size: (u32, u32),
    scale: f64,
) -> Rect {
    let x = match side {
        CompanionSide::Right => main.right() + scale_i32(OFFLINE_NEST_GAP_X, scale),
        CompanionSide::Left => main.x - scale_i32(OFFLINE_NEST_GAP_X, scale) - size.0 as i32,
    };
    let y = main.y + scale_i32(OFFLINE_NEST_OFFSET_Y, scale);

    Rect::new(
        clamp_axis(x, work_area.x, work_area.right() - size.0 as i32),
        clamp_axis(y, work_area.y, work_area.bottom() - size.1 as i32),
        size.0,
        size.1,
    )
}

fn scaled_size(width: u32, height: u32, scale: f64) -> (u32, u32) {
    (scale_u32(width, scale), scale_u32(height, scale))
}

fn scale_u32(value: u32, scale: f64) -> u32 {
    (value as f64 * scale).round() as u32
}

fn scale_i32(value: i32, scale: f64) -> i32 {
    (value as f64 * scale).round() as i32
}

fn clamp_axis(value: i32, min: i32, max: i32) -> i32 {
    if min > max {
        return min;
    }

    value.clamp(min, max)
}

#[cfg(test)]
mod tests {
    use super::{
        calculate_layout, calculate_layout_for_monitor, physical_rect_to_logical_inner_size,
        reduce_scene_state, visible_windows, CompanionLayoutInput, CompanionPresence,
        CompanionSceneContentState, CompanionSide, Rect, OFFLINE_NEST_WINDOW_ROUTE,
        PEER_LINK_WINDOW_ROUTE, PEER_PRESENCE_WINDOW_ROUTE,
    };

    #[test]
    fn companion_window_routes_use_plain_index_path() {
        for route in [
            PEER_PRESENCE_WINDOW_ROUTE,
            PEER_LINK_WINDOW_ROUTE,
            OFFLINE_NEST_WINDOW_ROUTE,
        ] {
            assert_eq!(route, "index.html");
            assert!(!route.contains('?'));
            assert!(!route.contains('#'));
        }
    }

    #[test]
    fn detects_rect_overlap_without_counting_touching_edges() {
        assert!(Rect::new(0, 0, 100, 100).overlaps(&Rect::new(99, 10, 40, 40)));
        assert!(!Rect::new(0, 0, 100, 100).overlaps(&Rect::new(100, 10, 40, 40)));
    }

    #[test]
    fn places_companion_windows_to_the_right_when_space_allows() {
        let layout = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            1.0,
        );
        let presence = layout.presence.expect("presence should be visible");

        assert_eq!(layout.side, CompanionSide::Right);
        assert!(!layout.compact);
        assert_eq!(presence.x, 740);
        assert_eq!(presence.y, 452);
        assert_eq!(presence.width, 168);
        assert_eq!(presence.height, 176);
        assert!(layout.link.is_some());
        assert!(layout.offline_nest.is_some());
    }

    #[test]
    fn mirrors_to_the_left_near_the_right_edge() {
        let main = Rect::new(1600, 560, 320, 360);
        let layout = calculate_layout(Rect::new(0, 0, 1920, 1080), main, 1.0);
        let presence = layout.presence.expect("presence should be visible");

        assert_eq!(layout.side, CompanionSide::Left);
        assert!(!layout.compact);
        assert!(presence.right() <= main.x);
        assert!(!presence.overlaps(&main));
        assert!(layout.link.is_some());
        assert!(layout.offline_nest.is_some());
    }

    #[test]
    fn uses_compact_layout_above_main_when_neither_side_can_hold_presence() {
        let work_area = Rect::new(0, 0, 500, 720);
        let main = Rect::new(90, 260, 320, 360);
        let layout = calculate_layout(work_area, main, 1.0);
        let presence = layout
            .presence
            .expect("presence should use vertical fallback");

        assert!(layout.compact);
        assert_eq!(presence.y, 72);
        assert!(presence.x >= work_area.x);
        assert!(presence.right() <= work_area.right());
        assert!(!presence.overlaps(&main));
        assert!(layout.link.is_none());
        assert!(layout.offline_nest.is_none());
    }

    #[test]
    fn uses_compact_layout_below_main_when_top_space_is_not_available() {
        let work_area = Rect::new(0, 0, 500, 720);
        let main = Rect::new(90, 0, 320, 360);
        let layout = calculate_layout(work_area, main, 1.0);
        let presence = layout
            .presence
            .expect("presence should use bottom fallback");

        assert!(layout.compact);
        assert_eq!(presence.y, 372);
        assert!(presence.bottom() <= work_area.bottom());
        assert!(!presence.overlaps(&main));
    }

    #[test]
    fn hides_presence_when_compact_layout_has_no_safe_space() {
        let layout = calculate_layout(Rect::new(0, 0, 500, 360), Rect::new(90, 0, 320, 360), 1.0);

        assert!(layout.compact);
        assert!(layout.presence.is_none());
        assert!(layout.link.is_none());
        assert!(layout.offline_nest.is_none());
    }

    #[test]
    fn clamps_vertical_edges_inside_the_work_area() {
        let top = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 8, 320, 360),
            1.0,
        )
        .presence
        .expect("top presence should be visible");
        let bottom = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 900, 320, 360),
            1.0,
        )
        .presence
        .expect("bottom presence should be visible");

        assert!(top.y >= 0);
        assert!(bottom.bottom() <= 1080);
    }

    #[test]
    fn scales_window_sizes_for_high_dpi_layout() {
        let layout = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            1.25,
        );
        let presence = layout.presence.expect("presence should be visible");

        assert_eq!(presence.width, 210);
        assert_eq!(presence.height, 220);
        assert_eq!(layout.link.map(|rect| rect.width), Some(245));
    }

    #[test]
    fn combines_monitor_dpi_and_user_scene_scale_for_physical_window_sizes() {
        let dpi_only = calculate_layout_for_monitor(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            1.25,
            1.0,
        );
        let dpi_and_user = calculate_layout_for_monitor(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            1.25,
            1.1,
        );

        assert_eq!(dpi_only.presence.unwrap().width, 210);
        assert_eq!(dpi_only.presence.unwrap().height, 220);
        assert_eq!(dpi_and_user.presence.unwrap().width, 231);
        assert_eq!(dpi_and_user.presence.unwrap().height, 242);
    }

    #[test]
    fn converts_physical_rect_to_logical_builder_size_for_high_dpi() {
        let (width, height) = physical_rect_to_logical_inner_size(Rect::new(0, 0, 210, 220), 1.25);

        assert_eq!(width, 168.0);
        assert_eq!(height, 176.0);
    }

    #[test]
    fn clamps_scene_scale_to_supported_range() {
        let low = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            0.25,
        )
        .presence
        .expect("low-scale presence should be visible");
        let high = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            3.0,
        )
        .presence
        .expect("high-scale presence should be visible");

        assert_eq!(low.width, 143);
        assert_eq!(high.width, 210);
    }

    #[test]
    fn reducer_hides_all_windows_while_suspended() {
        let view = reduce_scene_state(
            default_content(CompanionPresence::Online, true),
            layout_input(
                Rect::new(0, 0, 1920, 1080),
                Rect::new(400, 500, 320, 360),
                1.0,
            ),
            4,
        );
        let visibility = visible_windows(&view);

        assert_eq!(view.revision, 5);
        assert!(!visibility.peer_presence);
        assert!(!visibility.peer_link);
        assert!(!visibility.offline_nest);
    }

    #[test]
    fn reducer_shows_expected_windows_for_presence_states() {
        let online = reduce_scene_state(
            default_content(CompanionPresence::Online, false),
            layout_input(
                Rect::new(0, 0, 1920, 1080),
                Rect::new(400, 500, 320, 360),
                1.0,
            ),
            0,
        );
        let offline = reduce_scene_state(
            default_content(CompanionPresence::Offline, false),
            layout_input(
                Rect::new(0, 0, 1920, 1080),
                Rect::new(400, 500, 320, 360),
                1.0,
            ),
            1,
        );

        assert_eq!(visible_windows(&online).peer_presence, true);
        assert_eq!(visible_windows(&online).peer_link, true);
        assert_eq!(visible_windows(&online).offline_nest, false);
        assert_eq!(visible_windows(&offline).peer_presence, true);
        assert_eq!(visible_windows(&offline).peer_link, true);
        assert_eq!(visible_windows(&offline).offline_nest, true);
        assert_eq!(offline.revision, 2);
    }

    #[test]
    fn reducer_compact_layout_only_keeps_presence_window() {
        let view = reduce_scene_state(
            default_content(CompanionPresence::Online, false),
            layout_input(Rect::new(0, 0, 500, 720), Rect::new(90, 260, 320, 360), 1.0),
            0,
        );
        let visibility = visible_windows(&view);

        assert!(view.compact);
        assert!(visibility.peer_presence);
        assert!(!visibility.peer_link);
        assert!(!visibility.offline_nest);
    }

    #[test]
    fn reducer_hides_presence_when_compact_layout_has_no_safe_space() {
        let view = reduce_scene_state(
            default_content(CompanionPresence::Online, false),
            layout_input(Rect::new(0, 0, 500, 360), Rect::new(90, 0, 320, 360), 1.0),
            0,
        );
        let visibility = visible_windows(&view);

        assert_eq!(view.presence, CompanionPresence::Hidden);
        assert!(!visibility.peer_presence);
        assert!(!visibility.peer_link);
        assert!(!visibility.offline_nest);
    }

    #[test]
    fn reducer_preserves_user_scene_scale_in_view_when_dpi_scales_physical_layout() {
        let mut content = default_content(CompanionPresence::Online, false);
        content.scene_scale = 1.1;
        let view = reduce_scene_state(
            content,
            layout_input(
                Rect::new(0, 0, 1920, 1080),
                Rect::new(400, 500, 320, 360),
                1.25,
            ),
            0,
        );

        assert_eq!(view.scene_scale, 1.1);
        assert_eq!(view.presence, CompanionPresence::Online);
    }

    fn default_content(presence: CompanionPresence, suspended: bool) -> CompanionSceneContentState {
        CompanionSceneContentState {
            presence,
            portrait_url: Some("asset://portrait.png".to_string()),
            offline_portrait_url: Some("asset://offline.png".to_string()),
            scene_scale: 1.0,
            suspended,
        }
    }

    fn layout_input(
        work_area: Rect,
        main: Rect,
        monitor_scale_factor: f64,
    ) -> CompanionLayoutInput {
        CompanionLayoutInput {
            work_area,
            main,
            monitor_scale_factor,
        }
    }
}
