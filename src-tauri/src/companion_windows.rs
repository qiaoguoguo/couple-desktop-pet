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

    pub fn overlaps(&self, other: &Rect) -> bool {
        self.x < other.right()
            && self.right() > other.x
            && self.y < other.bottom()
            && self.bottom() > other.y
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
    pub presence: Option<Rect>,
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
    use super::{calculate_layout, CompanionSide, Rect};

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
}
