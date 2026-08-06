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
const OFFLINE_NEST_GAP_X: i32 = 42;
const OFFLINE_NEST_OFFSET_Y: i32 = 204;
const FULL_LAYOUT_SIDE_SPACE: i32 = 214;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
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
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompanionSide {
    Left,
    Right,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompanionLayout {
    pub side: CompanionSide,
    pub compact: bool,
    pub presence: Rect,
    pub link: Option<Rect>,
    pub offline_nest: Option<Rect>,
}

pub fn calculate_layout(work_area: Rect, main: Rect, scene_scale: f64) -> CompanionLayout {
    let scale = scene_scale.clamp(MIN_SCENE_SCALE, MAX_SCENE_SCALE);
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
    let presence = build_presence_rect(work_area, main, side, presence_size, scale);

    CompanionLayout {
        side,
        compact,
        presence,
        link: (!compact).then(|| build_link_rect(work_area, main, side, link_size, scale)),
        offline_nest: (!compact)
            .then(|| build_offline_nest_rect(work_area, main, side, nest_size, scale)),
    }
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
    use super::{calculate_layout, CompanionSide, Rect};

    #[test]
    fn places_companion_windows_to_the_right_when_space_allows() {
        let layout = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            1.0,
        );

        assert_eq!(layout.side, CompanionSide::Right);
        assert!(!layout.compact);
        assert_eq!(layout.presence.x, 740);
        assert_eq!(layout.presence.y, 452);
        assert_eq!(layout.presence.width, 168);
        assert_eq!(layout.presence.height, 176);
        assert!(layout.link.is_some());
        assert!(layout.offline_nest.is_some());
    }

    #[test]
    fn mirrors_to_the_left_near_the_right_edge() {
        let layout = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(1600, 560, 320, 360),
            1.0,
        );

        assert_eq!(layout.side, CompanionSide::Left);
        assert!(!layout.compact);
        assert!(layout.presence.right() <= 1600);
        assert!(layout.link.is_some());
        assert!(layout.offline_nest.is_some());
    }

    #[test]
    fn uses_compact_layout_when_neither_side_has_enough_space() {
        let layout = calculate_layout(Rect::new(0, 0, 500, 720), Rect::new(90, 260, 320, 360), 1.0);

        assert!(layout.compact);
        assert!(layout.presence.x >= 0);
        assert!(layout.presence.right() <= 500);
        assert!(layout.link.is_none());
        assert!(layout.offline_nest.is_none());
    }

    #[test]
    fn clamps_vertical_edges_inside_the_work_area() {
        let top = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 8, 320, 360),
            1.0,
        );
        let bottom = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 900, 320, 360),
            1.0,
        );

        assert!(top.presence.y >= 0);
        assert!(bottom.presence.bottom() <= 1080);
    }

    #[test]
    fn scales_window_sizes_for_high_dpi_layout() {
        let layout = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            1.25,
        );

        assert_eq!(layout.presence.width, 210);
        assert_eq!(layout.presence.height, 220);
        assert_eq!(layout.link.map(|rect| rect.width), Some(245));
    }

    #[test]
    fn clamps_scene_scale_to_supported_range() {
        let low = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            0.25,
        );
        let high = calculate_layout(
            Rect::new(0, 0, 1920, 1080),
            Rect::new(400, 500, 320, 360),
            3.0,
        );

        assert_eq!(low.presence.width, 143);
        assert_eq!(high.presence.width, 210);
    }
}
