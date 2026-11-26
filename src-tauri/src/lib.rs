mod commands;
mod db;
mod docking;
mod fetchers;

use commands::db_ops::DbState;
use docking::edge_detector::compute_dock_geometry;
use docking::multi_monitor::{enumerate_monitors, resolve_monitor};
use docking::{win32_styles, DockEdge};
use sqlx::{Row, SqlitePool};
use tauri::{Emitter, Manager, WindowEvent};

async fn load_initial_dock_prefs(pool: &SqlitePool) -> (DockEdge, Option<String>, u32, u32) {
    let mut edge = DockEdge::Left;
    let mut monitor_id: Option<String> = None;
    let mut collapsed_thickness: u32 = 10;
    let mut expanded_size: u32 = 380;

    if let Ok(rows) = sqlx::query(
        "SELECT key, value_json FROM settings WHERE key IN ('edge', 'monitorId', 'collapsedThickness', 'expandedSize')",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let key: String = row.try_get("key").unwrap_or_default();
            let val: String = row.try_get("value_json").unwrap_or_default();
            match key.as_str() {
                "edge" => {
                    if let Ok(parsed) = serde_json::from_str::<DockEdge>(&val) {
                        edge = parsed;
                    }
                }
                "monitorId" => {
                    if let Ok(parsed) = serde_json::from_str::<Option<String>>(&val) {
                        monitor_id = parsed;
                    }
                }
                "collapsedThickness" => {
                    if let Ok(parsed) = serde_json::from_str::<u32>(&val) {
                        collapsed_thickness = parsed;
                    }
                }
                "expandedSize" => {
                    if let Ok(parsed) = serde_json::from_str::<u32>(&val) {
                        expanded_size = parsed;
                    }
                }
                _ => {}
            }
        }
    }

    (edge, monitor_id, collapsed_thickness, expanded_size)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(app_data_dir.join("attachments"))?;
            std::fs::create_dir_all(app_data_dir.join("backups"))?;
            let db_path = app_data_dir.join("app.db");

            let pool = tauri::async_runtime::block_on(db::init_pool(&db_path))
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

            let (initial_edge, initial_monitor_id, initial_strip, initial_expanded) =
                tauri::async_runtime::block_on(load_initial_dock_prefs(&pool));

            fetchers::spawn_background_scheduler(pool.clone(), app.handle().clone());

            app.manage(DbState {
                pool,
                db_path,
                app_data_dir,
            });

            // Position collapsed edge strip cleanly on the persisted monitor work_area before showing,
            // preventing a startup center-screen or wrong-monitor flash.
            if let Some(window) = app.get_webview_window("main") {
                let monitors = enumerate_monitors(app.handle());
                if let Some(target) = resolve_monitor(&monitors, initial_monitor_id.as_deref()) {
                    let geom = compute_dock_geometry(
                        initial_edge,
                        &target,
                        initial_strip,
                        initial_expanded,
                    );
                    #[cfg(target_os = "windows")]
                    if let Ok(hwnd) = window.hwnd() {
                        let raw = hwnd.0 as isize;
                        win32_styles::apply_docked_styles(raw, true, true);
                        win32_styles::set_bounds_atomic(raw, geom.collapsed, true, true);
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        let _ = window.set_position(tauri::PhysicalPosition::new(
                            geom.collapsed.x,
                            geom.collapsed.y,
                        ));
                        let _ = window.set_size(tauri::PhysicalSize::new(
                            geom.collapsed.width,
                            geom.collapsed.height,
                        ));
                    }
                }
                let _ = window.show();
                #[cfg(target_os = "windows")]
                if let Ok(hwnd) = window.hwnd() {
                    win32_styles::enforce_topmost(hwnd.0 as isize);
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::ScaleFactorChanged { .. } = event {
                let _ = window.emit("display-metrics-changed", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::window_mgmt::get_monitors,
            commands::window_mgmt::apply_dock_bounds,
            commands::window_mgmt::prepare_expand_bounds,
            commands::window_mgmt::commit_collapse_bounds,
            commands::window_mgmt::resize_docked_panel,
            commands::window_mgmt::set_focusable,
            commands::window_mgmt::start_dock_drag,
            commands::window_mgmt::resolve_drag_snap,
            commands::window_mgmt::set_panel_fullscreen,
            commands::window_mgmt::enforce_always_on_top,
            commands::window_mgmt::launch_screen_snip,
            commands::db_ops::get_all_settings,
            commands::db_ops::set_setting,
            commands::db_ops::set_settings_batch,
            commands::db_ops::get_widget_layout,
            commands::db_ops::save_widget_layout,
            commands::db_ops::get_db_status,
            commands::db_ops::get_app_paths,
            commands::daily_bias::get_daily_biases,
            commands::daily_bias::list_recent_daily_bias,
            commands::daily_bias::upsert_daily_bias,
            commands::daily_bias::delete_daily_bias,
            commands::notes::list_notes,
            commands::notes::upsert_note,
            commands::notes::delete_note,
            commands::strategies::list_strategies,
            commands::strategies::upsert_strategy,
            commands::strategies::delete_strategy,
            commands::attachments::save_attachment,
            commands::attachments::list_attachments,
            commands::attachments::delete_attachment,
            commands::trades::get_account_profile,
            commands::trades::update_account_profile,
            commands::trades::list_trades,
            commands::trades::upsert_trade,
            commands::trades::delete_trade,
            commands::trades::list_ongoing_trades,
            commands::trades::upsert_ongoing_trade,
            commands::trades::delete_ongoing_trade,
            commands::trades::close_ongoing_to_journal,
            commands::trades::list_equity_snapshots,
            commands::trades::upsert_equity_snapshot,
            commands::market_data::get_economic_events,
            commands::market_data::add_manual_economic_event,
            commands::market_data::delete_economic_event,
            commands::market_data::get_news_items,
            commands::market_data::list_rss_feeds,
            commands::market_data::upsert_rss_feed,
            commands::market_data::delete_rss_feed,
            commands::market_data::get_fetch_metadata,
            commands::market_data::trigger_market_sync,
            commands::backup::export_backup_zip,
            commands::backup::import_backup_zip,
            commands::backup::open_backups_folder,
            commands::secrets::set_secret,
            commands::secrets::has_secret,
            commands::secrets::delete_secret,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ICT / SMC Trading Panel");
}
