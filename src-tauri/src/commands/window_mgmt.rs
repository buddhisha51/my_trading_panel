use crate::docking::edge_detector::{compute_dock_geometry, find_nearest_dock_target};
use crate::docking::multi_monitor::{enumerate_monitors, resolve_monitor};
use crate::docking::win32_styles;
use crate::docking::{DockEdge, DockGeometry, DockSnapResult, MonitorInfo};
use serde::Serialize;
use tauri::{AppHandle, Emitter, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockAppliedResponse {
    pub monitor_id: String,
    pub edge: DockEdge,
    pub geometry: DockGeometry,
    pub fell_back_to_primary: bool,
}

fn hwnd_of(window: &WebviewWindow) -> Result<isize, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        Ok(hwnd.0 as isize)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        Ok(0)
    }
}

fn resolve_monitor_with_fallback(
    app: &AppHandle,
    monitor_id: Option<&str>,
) -> Result<(MonitorInfo, bool), String> {
    let monitors = enumerate_monitors(app);
    let resolved = resolve_monitor(&monitors, monitor_id)
        .ok_or_else(|| "No monitors detected by OS".to_string())?;
    let fell_back = monitor_id
        .map(|id| !id.is_empty() && id != resolved.id)
        .unwrap_or(false);
    Ok((resolved, fell_back))
}

#[tauri::command]
pub fn get_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    enumerate_monitors(&app)
}

#[tauri::command]
pub fn apply_dock_bounds(
    window: WebviewWindow,
    app: AppHandle,
    edge: DockEdge,
    monitor_id: Option<String>,
    collapsed_thickness: u32,
    expanded_size: u32,
    expanded: bool,
    allow_focus: Option<bool>,
) -> Result<DockAppliedResponse, String> {
    let (monitor, fell_back) = resolve_monitor_with_fallback(&app, monitor_id.as_deref())?;
    let geom = compute_dock_geometry(edge, &monitor, collapsed_thickness, expanded_size);
    let target_rect = if expanded { geom.expanded } else { geom.collapsed };

    let hwnd = hwnd_of(&window)?;
    let no_activate = !expanded || !allow_focus.unwrap_or(false);
    win32_styles::apply_docked_styles(hwnd, no_activate, true);
    win32_styles::set_bounds_atomic(hwnd, target_rect, true, no_activate);
    let _ = window.show();

    Ok(DockAppliedResponse {
        monitor_id: monitor.id,
        edge,
        geometry: geom,
        fell_back_to_primary: fell_back,
    })
}

/// Resizes the transparent native window ONCE to `expanded` dimensions before the CSS
/// transform slide-in begins, keeping `WS_EX_NOACTIVATE` active so hovering never steals focus.
#[tauri::command]
pub fn prepare_expand_bounds(
    window: WebviewWindow,
    app: AppHandle,
    edge: DockEdge,
    monitor_id: Option<String>,
    collapsed_thickness: u32,
    expanded_size: u32,
) -> Result<DockAppliedResponse, String> {
    apply_dock_bounds(
        window,
        app,
        edge,
        monitor_id,
        collapsed_thickness,
        expanded_size,
        true,
        Some(false),
    )
}

/// Shrinks the transparent native window back down to `collapsed_thickness` after CSS slide-out
/// completes so background windows (MT5/TradingView) receive clicks normally.
#[tauri::command]
pub fn commit_collapse_bounds(
    window: WebviewWindow,
    app: AppHandle,
    edge: DockEdge,
    monitor_id: Option<String>,
    collapsed_thickness: u32,
    expanded_size: u32,
) -> Result<DockAppliedResponse, String> {
    apply_dock_bounds(
        window,
        app,
        edge,
        monitor_id,
        collapsed_thickness,
        expanded_size,
        false,
        Some(false),
    )
}

/// Updates expanded panel size atomically while keeping the outer docked edge anchored
/// (required for `right` and `bottom` docks where x/y shifts with width/height).
#[tauri::command]
pub fn resize_docked_panel(
    window: WebviewWindow,
    app: AppHandle,
    edge: DockEdge,
    monitor_id: Option<String>,
    collapsed_thickness: u32,
    new_size: u32,
) -> Result<DockAppliedResponse, String> {
    apply_dock_bounds(
        window,
        app,
        edge,
        monitor_id,
        collapsed_thickness,
        new_size,
        true,
        Some(false),
    )
}

/// Dynamically toggles `WS_EX_NOACTIVATE`. When false (`focusable = true`), the panel
/// can receive keyboard focus for TipTap, inputs, and Konva. When true, it leaves MT5/TV undisturbed.
#[tauri::command]
pub fn set_focusable(
    window: WebviewWindow,
    focusable: bool,
    focus_now: Option<bool>,
) -> Result<(), String> {
    let hwnd = hwnd_of(&window)?;
    win32_styles::apply_docked_styles(hwnd, !focusable, true);
    win32_styles::enforce_topmost(hwnd);
    if focusable && focus_now.unwrap_or(false) {
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn start_dock_drag(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    let hwnd = hwnd_of(&window)?;
    win32_styles::apply_docked_styles(hwnd, false, true);
    window.start_dragging().map_err(|e| e.to_string())?;

    // On Windows, native SC_MOVE / HTCAPTION drag loops swallow WebView2 `pointerup` events.
    // Watch `VK_LBUTTON` asynchronously and emit `dock-drag-released` as soon as the user drops.
    #[cfg(target_os = "windows")]
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        for _ in 0..1875 {
            if !win32_styles::is_left_mouse_down() {
                tokio::time::sleep(std::time::Duration::from_millis(16)).await;
                let _ = app.emit("dock-drag-released", ());
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(16)).await;
        }
    });
    #[cfg(not(target_os = "windows"))]
    let _ = app;

    Ok(())
}

/// Resolves the drop target across all connected displays and snaps the panel to the nearest
/// edge of that monitor's `work_area`.
#[tauri::command]
pub fn resolve_drag_snap(
    window: WebviewWindow,
    app: AppHandle,
    collapsed_thickness: u32,
    expanded_size: u32,
    keep_expanded: bool,
) -> Result<DockSnapResult, String> {
    let monitors = enumerate_monitors(&app);
    if monitors.is_empty() {
        return Err("No monitors available".to_string());
    }

    let (px, py) = win32_styles::get_cursor_pos().unwrap_or_else(|| {
        let pos = window.outer_position().unwrap_or_default();
        let size = window.outer_size().unwrap_or_default();
        (
            pos.x + (size.width as i32 / 2),
            pos.y + (size.height as i32 / 2),
        )
    });

    let (target_monitor, edge) = find_nearest_dock_target(&monitors, px, py)
        .ok_or_else(|| "Unable to determine target monitor".to_string())?;

    let geom = compute_dock_geometry(edge, target_monitor, collapsed_thickness, expanded_size);
    let target_rect = if keep_expanded {
        geom.expanded
    } else {
        geom.collapsed
    };

    let hwnd = hwnd_of(&window)?;
    win32_styles::apply_docked_styles(hwnd, !keep_expanded, true);
    win32_styles::set_bounds_atomic(hwnd, target_rect, true, !keep_expanded);

    Ok(DockSnapResult {
        monitor_id: target_monitor.id.clone(),
        edge,
        geometry: geom,
    })
}

/// Switches seamlessly between docked edge mode and full-screen dashboard mode.
#[tauri::command]
pub fn set_panel_fullscreen(
    window: WebviewWindow,
    app: AppHandle,
    fullscreen: bool,
    edge: DockEdge,
    monitor_id: Option<String>,
    collapsed_thickness: u32,
    expanded_size: u32,
    restore_expanded: bool,
) -> Result<Option<DockAppliedResponse>, String> {
    let hwnd = hwnd_of(&window)?;

    if fullscreen {
        // Move to target monitor work area before entering fullscreen so Windows expands
        // onto the correct display on multi-monitor setups.
        if let Ok((monitor, _)) = resolve_monitor_with_fallback(&app, monitor_id.as_deref()) {
            let geom = compute_dock_geometry(edge, &monitor, collapsed_thickness, expanded_size);
            win32_styles::set_bounds_atomic(hwnd, geom.expanded, false, false);
        }
        win32_styles::apply_docked_styles(hwnd, false, false);
        let _ = window.set_always_on_top(false);
        let _ = window.set_skip_taskbar(false);
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        let _ = window.set_focus();
        Ok(None)
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_always_on_top(true);
        let res = apply_dock_bounds(
            window,
            app,
            edge,
            monitor_id,
            collapsed_thickness,
            expanded_size,
            restore_expanded,
            Some(restore_expanded),
        )?;
        Ok(Some(res))
    }
}

#[tauri::command]
pub fn enforce_always_on_top(window: WebviewWindow) -> Result<(), String> {
    let hwnd = hwnd_of(&window)?;
    win32_styles::enforce_topmost(hwnd);
    Ok(())
}

/// Launches the Windows native Snipping Tool (`ms-screenclip:`) reliably across mixed-DPI
/// multi-monitor setups via `tauri-plugin-opener`.
#[tauri::command]
pub fn launch_screen_snip(app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url("ms-screenclip:", None::<&str>)
        .map_err(|e| e.to_string())
}

/// Exits the entire desktop application process cleanly (used by titlebar Quit button).
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
