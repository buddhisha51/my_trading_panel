use super::MonitorInfo;
use tauri::AppHandle;

/// Enumerates all connected displays using each monitor's `work_area()` (`rcWork`)
/// so the Windows taskbar is never overlapped by the docked panel.
pub fn enumerate_monitors(app: &AppHandle) -> Vec<MonitorInfo> {
    let primary_name = app
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().cloned());

    let monitors = app.available_monitors().unwrap_or_default();

    monitors
        .into_iter()
        .enumerate()
        .map(|(idx, m)| {
            let work = m.work_area();
            let raw_name = m
                .name()
                .cloned()
                .unwrap_or_else(|| format!("DISPLAY_{}", idx + 1));
            let is_primary = primary_name
                .as_ref()
                .map(|p| p == &raw_name)
                .unwrap_or(idx == 0);

            let friendly_name = if is_primary {
                format!("Primary ({}) — {}×{}", raw_name, work.size.width, work.size.height)
            } else {
                format!("Display {} ({}) — {}×{}", idx + 1, raw_name, work.size.width, work.size.height)
            };

            MonitorInfo {
                id: raw_name,
                friendly_name,
                x: work.position.x,
                y: work.position.y,
                width: work.size.width,
                height: work.size.height,
                scale_factor: m.scale_factor(),
                is_primary,
            }
        })
        .collect()
}

/// Finds the requested monitor by ID, falling back gracefully to the primary display
/// if the previously saved monitor was disconnected.
pub fn resolve_monitor(monitors: &[MonitorInfo], monitor_id: Option<&str>) -> Option<MonitorInfo> {
    if let Some(id) = monitor_id {
        if let Some(found) = monitors.iter().find(|m| m.id == id) {
            return Some(found.clone());
        }
    }

    monitors
        .iter()
        .find(|m| m.is_primary)
        .or_else(|| monitors.first())
        .cloned()
}
