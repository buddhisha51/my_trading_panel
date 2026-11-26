use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

pub struct DbState {
    pub pool: SqlitePool,
    pub db_path: PathBuf,
    pub app_data_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingInput {
    pub key: String,
    pub value_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetLayoutRecord {
    pub widget_id: String,
    pub is_visible: bool,
    pub is_collapsed: bool,
    pub sort_order: i64,
    pub custom_height: Option<i64>,
    #[serde(default)]
    pub custom_width: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStatus {
    pub db_path: String,
    pub app_data_dir: String,
    pub journal_mode: String,
    pub schema_version: i64,
}

#[tauri::command]
pub async fn get_all_settings(state: State<'_, DbState>) -> Result<HashMap<String, String>, String> {
    let rows = sqlx::query("SELECT key, value_json FROM settings")
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::with_capacity(rows.len());
    for row in rows {
        let key: String = row.try_get("key").map_err(|e| e.to_string())?;
        let val: String = row.try_get("value_json").map_err(|e| e.to_string())?;
        map.insert(key, val);
    }
    Ok(map)
}

#[tauri::command]
pub async fn set_setting(
    state: State<'_, DbState>,
    key: String,
    value_json: String,
) -> Result<(), String> {
    sqlx::query(
        r#"
        INSERT INTO settings (key, value_json, updated_at)
        VALUES (?1, ?2, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = datetime('now')
        "#,
    )
    .bind(key)
    .bind(value_json)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_settings_batch(
    state: State<'_, DbState>,
    entries: Vec<SettingInput>,
) -> Result<(), String> {
    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;
    for entry in entries {
        sqlx::query(
            r#"
            INSERT INTO settings (key, value_json, updated_at)
            VALUES (?1, ?2, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = datetime('now')
            "#,
        )
        .bind(entry.key)
        .bind(entry.value_json)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_widget_layout(state: State<'_, DbState>) -> Result<Vec<WidgetLayoutRecord>, String> {
    let rows = sqlx::query(
        "SELECT widget_id, is_visible, is_collapsed, sort_order, custom_height, custom_width FROM widget_layout ORDER BY sort_order ASC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            Ok(WidgetLayoutRecord {
                widget_id: row.try_get("widget_id").map_err(|e| e.to_string())?,
                is_visible: row.try_get::<i64, _>("is_visible").map_err(|e| e.to_string())? != 0,
                is_collapsed: row.try_get::<i64, _>("is_collapsed").map_err(|e| e.to_string())? != 0,
                sort_order: row.try_get("sort_order").map_err(|e| e.to_string())?,
                custom_height: row.try_get("custom_height").map_err(|e| e.to_string())?,
                custom_width: row.try_get("custom_width").map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn save_widget_layout(
    state: State<'_, DbState>,
    items: Vec<WidgetLayoutRecord>,
) -> Result<(), String> {
    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;
    for item in items {
        sqlx::query(
            r#"
            INSERT INTO widget_layout (widget_id, is_visible, is_collapsed, sort_order, custom_height, custom_width)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(widget_id) DO UPDATE SET
                is_visible    = excluded.is_visible,
                is_collapsed  = excluded.is_collapsed,
                sort_order    = excluded.sort_order,
                custom_height = excluded.custom_height,
                custom_width  = excluded.custom_width
            "#,
        )
        .bind(item.widget_id)
        .bind(if item.is_visible { 1 } else { 0 })
        .bind(if item.is_collapsed { 1 } else { 0 })
        .bind(item.sort_order)
        .bind(item.custom_height)
        .bind(item.custom_width)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_db_status(state: State<'_, DbState>) -> Result<DbStatus, String> {
    let mode: String = sqlx::query_scalar("PRAGMA journal_mode;")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let version: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM schema_migrations")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(DbStatus {
        db_path: state.db_path.to_string_lossy().to_string(),
        app_data_dir: state.app_data_dir.to_string_lossy().to_string(),
        journal_mode: mode,
        schema_version: version,
    })
}

#[tauri::command]
pub fn get_app_paths(app: AppHandle) -> Result<HashMap<String, String>, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut paths = HashMap::new();
    paths.insert("appDataDir".into(), app_data.to_string_lossy().to_string());
    paths.insert(
        "attachmentsDir".into(),
        app_data.join("attachments").to_string_lossy().to_string(),
    );
    paths.insert(
        "backupsDir".into(),
        app_data.join("backups").to_string_lossy().to_string(),
    );
    Ok(paths)
}
