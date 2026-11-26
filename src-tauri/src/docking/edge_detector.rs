use super::{DockEdge, DockGeometry, MonitorInfo, Rect};

pub const MIN_COLLAPSED_THICKNESS: u32 = 2;
pub const MAX_COLLAPSED_THICKNESS: u32 = 24;
pub const MIN_EXPANDED_SIZE: u32 = 260;
pub const MAX_EXPANDED_RATIO: f64 = 0.60;

/// Clamps edge strip thickness to sensible physical bounds.
pub fn clamp_collapsed_thickness(thickness: u32) -> u32 {
    thickness.clamp(MIN_COLLAPSED_THICKNESS, MAX_COLLAPSED_THICKNESS)
}

/// Computes `(clamped_size, min_size, max_size)` along the dock axis for the given monitor work area.
pub fn clamp_expanded_size(edge: DockEdge, monitor: &MonitorInfo, requested: u32) -> (u32, u32, u32) {
    let axis_length = match edge {
        DockEdge::Left | DockEdge::Right => monitor.width,
        DockEdge::Top | DockEdge::Bottom => monitor.height,
    };

    let max_size = ((axis_length as f64) * MAX_EXPANDED_RATIO)
        .round()
        .max(1.0) as u32;
    let min_size = MIN_EXPANDED_SIZE.min(max_size);
    let clamped = requested.clamp(min_size, max_size);

    (clamped, min_size, max_size)
}

/// Given a dock edge and target monitor work area (`rcWork`), compute exact physical pixel
/// positions and sizes for both collapsed strip and expanded panel states.
pub fn compute_dock_geometry(
    edge: DockEdge,
    monitor: &MonitorInfo,
    collapsed_thickness: u32,
    expanded_size: u32,
) -> DockGeometry {
    let strip = clamp_collapsed_thickness(collapsed_thickness).min(monitor.width).min(monitor.height);
    let (clamped_expanded, min_expanded_size, max_expanded_size) =
        clamp_expanded_size(edge, monitor, expanded_size);

    let (collapsed, expanded) = match edge {
        DockEdge::Left => (
            Rect {
                x: monitor.x,
                y: monitor.y,
                width: strip,
                height: monitor.height,
            },
            Rect {
                x: monitor.x,
                y: monitor.y,
                width: clamped_expanded,
                height: monitor.height,
            },
        ),
        DockEdge::Right => (
            Rect {
                x: monitor.x + monitor.width as i32 - strip as i32,
                y: monitor.y,
                width: strip,
                height: monitor.height,
            },
            Rect {
                x: monitor.x + monitor.width as i32 - clamped_expanded as i32,
                y: monitor.y,
                width: clamped_expanded,
                height: monitor.height,
            },
        ),
        DockEdge::Top => (
            Rect {
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: strip,
            },
            Rect {
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: clamped_expanded,
            },
        ),
        DockEdge::Bottom => (
            Rect {
                x: monitor.x,
                y: monitor.y + monitor.height as i32 - strip as i32,
                width: monitor.width,
                height: strip,
            },
            Rect {
                x: monitor.x,
                y: monitor.y + monitor.height as i32 - clamped_expanded as i32,
                width: monitor.width,
                height: clamped_expanded,
            },
        ),
    };

    DockGeometry {
        collapsed,
        expanded,
        clamped_expanded_size: clamped_expanded,
        min_expanded_size,
        max_expanded_size,
    }
}

/// Finds the monitor containing `(px, py)` (or closest monitor) and returns the nearest edge.
pub fn find_nearest_dock_target(
    monitors: &[MonitorInfo],
    px: i32,
    py: i32,
) -> Option<(&MonitorInfo, DockEdge)> {
    if monitors.is_empty() {
        return None;
    }

    // Prefer the monitor directly containing the cursor/point.
    let target_monitor = monitors
        .iter()
        .find(|m| {
            px >= m.x
                && px < m.x + m.width as i32
                && py >= m.y
                && py < m.y + m.height as i32
        })
        .or_else(|| {
            monitors.iter().min_by_key(|m| {
                let cx = px.clamp(m.x, m.x + m.width as i32);
                let cy = py.clamp(m.y, m.y + m.height as i32);
                let dx = (px - cx) as i64;
                let dy = (py - cy) as i64;
                dx * dx + dy * dy
            })
        })?;

    // Compare normalized distance to each of the 4 edges so ultra-wide monitors still
    // feel natural when snapping top/bottom vs left/right.
    let rel_x = ((px - target_monitor.x) as f64 / target_monitor.width.max(1) as f64).clamp(0.0, 1.0);
    let rel_y = ((py - target_monitor.y) as f64 / target_monitor.height.max(1) as f64).clamp(0.0, 1.0);

    let edge_distances = [
        (DockEdge::Left, rel_x),
        (DockEdge::Right, 1.0 - rel_x),
        (DockEdge::Top, rel_y),
        (DockEdge::Bottom, 1.0 - rel_y),
    ];

    let nearest_edge = edge_distances
        .into_iter()
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(edge, _)| edge)
        .unwrap_or(DockEdge::Left);

    Some((target_monitor, nearest_edge))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_monitors() -> Vec<MonitorInfo> {
        vec![
            MonitorInfo {
                id: "PRIMARY".into(),
                friendly_name: "Primary 1440p".into(),
                x: 0,
                y: 0,
                width: 2560,
                height: 1392, // 1440 minus 48px taskbar
                scale_factor: 1.0,
                is_primary: true,
            },
            MonitorInfo {
                id: "SECONDARY_LEFT".into(),
                friendly_name: "Left 1080p".into(),
                x: -1920,
                y: 120,
                width: 1920,
                height: 1032,
                scale_factor: 1.25,
                is_primary: false,
            },
        ]
    }

    #[test]
    fn computes_left_and_right_work_area_bounds() {
        let primary = &sample_monitors()[0];
        let left = compute_dock_geometry(DockEdge::Left, primary, 6, 380);
        assert_eq!(left.collapsed, Rect { x: 0, y: 0, width: 6, height: 1392 });
        assert_eq!(left.expanded, Rect { x: 0, y: 0, width: 380, height: 1392 });

        let right = compute_dock_geometry(DockEdge::Right, primary, 6, 380);
        assert_eq!(right.collapsed, Rect { x: 2554, y: 0, width: 6, height: 1392 });
        assert_eq!(right.expanded, Rect { x: 2180, y: 0, width: 380, height: 1392 });
    }

    #[test]
    fn computes_top_and_bottom_bounds_on_offset_secondary_monitor() {
        let secondary = &sample_monitors()[1];
        let top = compute_dock_geometry(DockEdge::Top, secondary, 8, 320);
        assert_eq!(top.collapsed, Rect { x: -1920, y: 120, width: 1920, height: 8 });
        assert_eq!(top.expanded, Rect { x: -1920, y: 120, width: 1920, height: 320 });

        let bottom = compute_dock_geometry(DockEdge::Bottom, secondary, 8, 320);
        assert_eq!(bottom.collapsed, Rect { x: -1920, y: 120 + 1032 - 8, width: 1920, height: 8 });
        assert_eq!(bottom.expanded, Rect { x: -1920, y: 120 + 1032 - 320, width: 1920, height: 320 });
    }

    #[test]
    fn clamps_expanded_size_to_min_and_60_percent() {
        let primary = &sample_monitors()[0];
        let too_small = compute_dock_geometry(DockEdge::Left, primary, 6, 80);
        assert_eq!(too_small.clamped_expanded_size, 260);

        let too_large = compute_dock_geometry(DockEdge::Left, primary, 6, 2400);
        assert_eq!(too_large.clamped_expanded_size, 1536); // 60% of 2560
    }

    #[test]
    fn finds_nearest_monitor_and_edge() {
        let monitors = sample_monitors();
        let (m1, edge1) = find_nearest_dock_target(&monitors, -1890, 500).unwrap();
        assert_eq!(m1.id, "SECONDARY_LEFT");
        assert_eq!(edge1, DockEdge::Left);

        let (m2, edge2) = find_nearest_dock_target(&monitors, 1280, 1360).unwrap();
        assert_eq!(m2.id, "PRIMARY");
        assert_eq!(edge2, DockEdge::Bottom);
    }
}
