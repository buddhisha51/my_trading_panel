use crate::commands::backup::maybe_run_auto_backup_on_quit;
use crate::commands::db_ops::DbState;
use crate::docking::edge_detector::{compute_dock_geometry, find_nearest_dock_target};
use crate::docking::multi_monitor::{enumerate_monitors, resolve_monitor};
use crate::docking::win32_styles;
use crate::docking::{DockEdge, DockGeometry, DockSnapResult, MonitorInfo};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// Holds the current Note/Strategy detail payload, pin state, and drag/blur guards for `"detail-viewer"`.
#[derive(Default)]
pub struct ViewerState {
    pub payload_json: Mutex<Option<String>>,
    pub armed: AtomicBool,
    pub pinned: AtomicBool,
    pub dragging: AtomicBool,
    pub opened_at: Mutex<Option<Instant>>,
}

impl ViewerState {
    pub fn mark_focused(&self) {
        self.armed.store(true, Ordering::SeqCst);
    }

    pub fn is_pinned(&self) -> bool {
        self.pinned.load(Ordering::SeqCst)
    }

    pub fn reset_window_flags(&self) {
        self.armed.store(false, Ordering::SeqCst);
        self.pinned.store(false, Ordering::SeqCst);
        self.dragging.store(false, Ordering::SeqCst);
    }

    pub fn should_close_on_blur(&self) -> bool {
        if self.pinned.load(Ordering::SeqCst) || self.dragging.load(Ordering::SeqCst) {
            return false;
        }
        let elapsed_ok = self
            .opened_at
            .lock()
            .ok()
            .and_then(|g| *g)
            .map(|t| t.elapsed() >= Duration::from_millis(160))
            .unwrap_or(true);
        self.armed.load(Ordering::SeqCst) && elapsed_ok
    }
}

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

/// Exits the entire desktop application process cleanly after optional dirty-checked auto-backup.
#[tauri::command]
pub async fn quit_app(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    maybe_run_auto_backup_on_quit(&state.pool, &state.app_data_dir).await;
    app.exit(0);
    Ok(())
}

/// Opens or updates a separate always-on-top floating detail viewer window (`detail-viewer`)
/// sized comfortably outside the docked sliding panel, closing automatically when focus is lost.
#[tauri::command]
pub async fn open_floating_viewer(
    app: AppHandle,
    state: State<'_, ViewerState>,
    payload_json: String,
) -> Result<(), String> {
    if let Ok(mut guard) = state.payload_json.lock() {
        *guard = Some(payload_json.clone());
    }
    state.armed.store(false, Ordering::SeqCst);
    if let Ok(mut ts) = state.opened_at.lock() {
        *ts = Some(Instant::now());
    }

    let monitors = enumerate_monitors(&app);
    let target_monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .and_then(|cm| {
            let pos = cm.position();
            monitors.iter().find(|m| {
                pos.x >= m.x
                    && pos.x < m.x + m.width as i32
                    && pos.y >= m.y
                    && pos.y < m.y + m.height as i32
            })
        })
        .or_else(|| monitors.iter().find(|m| m.is_primary))
        .or_else(|| monitors.first());

    let (logical_w, logical_h, logical_x, logical_y) = if let Some(m) = target_monitor {
        let scale = if m.scale_factor > 0.1 { m.scale_factor } else { 1.0 };
        let work_w = m.width as f64 / scale;
        let work_h = m.height as f64 / scale;
        let work_x = m.x as f64 / scale;
        let work_y = m.y as f64 / scale;
        let w = (work_w * 0.85).min(760.0).max(460.0);
        let h = (work_h * 0.85).min(640.0).max(420.0);
        let x = work_x + (work_w - w) / 2.0;
        let y = work_y + (work_h - h) / 2.0;
        (w, h, x, y)
    } else {
        (720.0, 600.0, 120.0, 80.0)
    };

    if let Some(existing) = app.get_webview_window("detail-viewer") {
        let _ = existing.emit("viewer-payload-updated", payload_json);
        if !state.is_pinned() {
            let _ = existing.set_size(tauri::LogicalSize::new(logical_w, logical_h));
            let _ = existing.set_position(tauri::LogicalPosition::new(logical_x, logical_y));
        }
        let _ = existing.show();
        let _ = existing.set_focus();
        state.mark_focused();
        return Ok(());
    }

    state.pinned.store(false, Ordering::SeqCst);
    state.dragging.store(false, Ordering::SeqCst);

    let viewer = WebviewWindowBuilder::new(
        &app,
        "detail-viewer",
        WebviewUrl::App("index.html".into()),
    )
    .initialization_script("window.__ICT_VIEWER_WINDOW__ = true;")
    .additional_browser_args("--autoplay-policy=no-user-gesture-required")
    .title("Detail View — ICT Trading Panel")
    .inner_size(logical_w, logical_h)
    .position(logical_x, logical_y)
    .min_inner_size(420.0, 320.0)
    .decorations(false)
    .transparent(false)
    .shadow(true)
    .background_color(tauri::window::Color(2, 6, 23, 255))
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .focused(true)
    .build()
    .map_err(|e| e.to_string())?;

    let _ = viewer.set_focus();
    Ok(())
}

#[tauri::command]
pub fn get_floating_viewer_payload(state: State<'_, ViewerState>) -> Option<String> {
    state.payload_json.lock().ok().and_then(|g| g.clone())
}

#[tauri::command]
pub fn get_floating_viewer_pinned(state: State<'_, ViewerState>) -> bool {
    state.is_pinned()
}

#[tauri::command]
pub fn set_floating_viewer_pinned(state: State<'_, ViewerState>, pinned: bool) -> bool {
    state.pinned.store(pinned, Ordering::SeqCst);
    pinned
}

#[tauri::command]
pub fn start_floating_viewer_drag(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, ViewerState>,
) -> Result<(), String> {
    state.dragging.store(true, Ordering::SeqCst);
    if let Err(err) = window.start_dragging() {
        state.dragging.store(false, Ordering::SeqCst);
        return Err(err.to_string());
    }

    #[cfg(target_os = "windows")]
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(25)).await;
        for _ in 0..1875 {
            if !win32_styles::is_left_mouse_down() {
                tokio::time::sleep(Duration::from_millis(80)).await;
                break;
            }
            tokio::time::sleep(Duration::from_millis(16)).await;
        }
        let st = app.state::<ViewerState>();
        st.dragging.store(false, Ordering::SeqCst);
        st.mark_focused();
    });
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        state.dragging.store(false, Ordering::SeqCst);
    }

    Ok(())
}

#[tauri::command]
pub fn close_floating_viewer(app: AppHandle, state: State<'_, ViewerState>) {
    state.reset_window_flags();
    if let Some(w) = app.get_webview_window("detail-viewer") {
        let _ = w.close();
    }
}

#[tauri::command]
pub fn request_viewer_edit(app: AppHandle, state: State<'_, ViewerState>, kind: String, id: String) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit(
            "viewer-request-edit",
            serde_json::json!({ "kind": kind, "id": id }),
        );
    }
    state.reset_window_flags();
    if let Some(w) = app.get_webview_window("detail-viewer") {
        let _ = w.close();
    }
}

#[tauri::command]
pub fn request_viewer_navigate(app: AppHandle, kind: String, id: String) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit(
            "viewer-request-navigate",
            serde_json::json!({ "kind": kind, "id": id }),
        );
    }
}

const GITHUB_REPO_SLUG: &str = "buddhisha51/my_trading_panel";
const RELEASE_CACHE_TTL_SECS: i64 = 12 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub installer_url: Option<String>,
    pub checksums_url: Option<String>,
    pub release_notes: String,
    pub published_at: Option<String>,
    pub checked_at: String,
    pub from_cache: bool,
}

#[derive(Debug, Deserialize)]
struct GithubAssetDto {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubReleaseDto {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GithubAssetDto>,
}

pub fn parse_semver_tuple(raw: &str) -> Option<(u64, u64, u64)> {
    let trimmed = raw.trim().trim_start_matches(['v', 'V']);
    let core = trimmed.split('-').next()?.split('+').next()?;
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    let patch = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    Some((major, minor, patch))
}

pub fn is_semver_newer(latest: &str, current: &str) -> bool {
    match (parse_semver_tuple(latest), parse_semver_tuple(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

#[tauri::command]
pub async fn check_github_release(
    state: State<'_, DbState>,
    force: Option<bool>,
) -> Result<ReleaseCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let cache_path = state.app_data_dir.join("release_cache.json");

    if !force.unwrap_or(false) {
        if let Ok(raw) = std::fs::read_to_string(&cache_path) {
            if let Ok(mut cached) = serde_json::from_str::<ReleaseCheckResult>(&raw) {
                if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(&cached.checked_at) {
                    let age_secs = (Utc::now() - ts.with_timezone(&Utc)).num_seconds();
                    if age_secs >= 0 && age_secs < RELEASE_CACHE_TTL_SECS {
                        cached.current_version = current_version.clone();
                        cached.update_available =
                            is_semver_newer(&cached.latest_version, &current_version);
                        cached.from_cache = true;
                        return Ok(cached);
                    }
                }
            }
        }
    }

    let url = format!("https://api.github.com/repos/{GITHUB_REPO_SLUG}/releases/latest");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .header("User-Agent", format!("ict-smc-trading-panel/{current_version}"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed checking GitHub Releases: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", resp.status()));
    }

    let dto: GithubReleaseDto = resp
        .json()
        .await
        .map_err(|e| format!("Invalid GitHub release payload: {e}"))?;

    if dto.draft || dto.prerelease {
        return Ok(ReleaseCheckResult {
            current_version: current_version.clone(),
            latest_version: current_version,
            update_available: false,
            release_url: format!("https://github.com/{GITHUB_REPO_SLUG}/releases"),
            installer_url: None,
            checksums_url: None,
            release_notes: String::new(),
            published_at: dto.published_at,
            checked_at: Utc::now().to_rfc3339(),
            from_cache: false,
        });
    }

    let latest_version = dto.tag_name.trim().trim_start_matches(['v', 'V']).to_string();
    let installer_url = dto
        .assets
        .iter()
        .find(|a| a.name.to_lowercase().ends_with("-setup.exe"))
        .map(|a| a.browser_download_url.clone());
    let checksums_url = dto
        .assets
        .iter()
        .find(|a| a.name.to_uppercase().contains("SHA256SUMS"))
        .map(|a| a.browser_download_url.clone());

    let result = ReleaseCheckResult {
        current_version: current_version.clone(),
        latest_version: latest_version.clone(),
        update_available: is_semver_newer(&latest_version, &current_version),
        release_url: dto.html_url,
        installer_url,
        checksums_url,
        release_notes: dto.body.unwrap_or_default(),
        published_at: dto.published_at,
        checked_at: Utc::now().to_rfc3339(),
        from_cache: false,
    };

    if let Ok(json_bytes) = serde_json::to_vec_pretty(&result) {
        let _ = std::fs::write(&cache_path, json_bytes);
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_comparison_handles_multi_digit_and_equal_versions() {
        assert!(is_semver_newer("0.1.3", "0.1.2"));
        assert!(is_semver_newer("v0.1.10", "0.1.2"));
        assert!(is_semver_newer("0.2.0", "0.1.99"));
        assert!(!is_semver_newer("v0.1.2", "0.1.2"));
        assert!(!is_semver_newer("0.1.1", "0.1.2"));
    }
}
