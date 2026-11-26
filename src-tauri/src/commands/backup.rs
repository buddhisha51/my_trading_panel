use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::{Column, Row, SqlitePool};
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use super::db_ops::DbState;

const BACKUP_TABLES: &[&str] = &[
    "settings",
    "widget_layout",
    "daily_bias",
    "notes",
    "note_attachments",
    "strategies",
    "checklist_templates",
    "strategy_attachments",
    "account_profile",
    "trades",
    "ongoing_trades",
    "equity_snapshots",
    "rss_feeds",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub app_identifier: String,
    pub app_version: String,
    pub schema_version: i64,
    pub exported_at: String,
    pub table_counts: Map<String, Value>,
    pub attachment_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResponse {
    pub file_path: String,
    pub filename: String,
    pub bytes: Vec<u8>,
    pub manifest: BackupManifest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportSummary {
    pub mode: String,
    pub tables_restored: usize,
    pub rows_restored: usize,
    pub attachments_restored: usize,
}

fn row_to_json(row: sqlx::sqlite::SqliteRow) -> Value {
    let mut map = Map::new();
    for col in row.columns() {
        let name = col.name().to_string();
        if let Ok(v) = row.try_get::<Option<i64>, _>(col.ordinal()) {
            map.insert(name, v.map(Value::from).unwrap_or(Value::Null));
        } else if let Ok(v) = row.try_get::<Option<f64>, _>(col.ordinal()) {
            map.insert(
                name,
                v.and_then(|n| serde_json::Number::from_f64(n).map(Value::Number))
                    .unwrap_or(Value::Null),
            );
        } else if let Ok(v) = row.try_get::<Option<String>, _>(col.ordinal()) {
            map.insert(name, v.map(Value::String).unwrap_or(Value::Null));
        } else {
            map.insert(name, Value::Null);
        }
    }
    Value::Object(map)
}

async fn dump_table_rows(pool: &SqlitePool, table: &str) -> Result<Vec<Value>, String> {
    let sql = format!("SELECT * FROM {table}");
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed exporting table {table}: {e}"))?;
    Ok(rows.into_iter().map(row_to_json).collect())
}

fn collect_attachment_files(root: &Path, current: &Path, out: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(current) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_attachment_files(root, &path, out);
        } else if path.is_file() {
            if let Ok(rel) = path.strip_prefix(root) {
                let norm = rel.to_string_lossy().replace('\\', "/");
                out.push((norm, path));
            }
        }
    }
}

fn sanitize_relative_attachment_path(rel: &str) -> Option<PathBuf> {
    let p = Path::new(rel);
    let mut clean = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::Normal(s) => clean.push(s),
            _ => return None,
        }
    }
    if clean.as_os_str().is_empty() {
        None
    } else {
        Some(clean)
    }
}

#[tauri::command]
pub async fn export_backup_zip(
    state: State<'_, DbState>,
) -> Result<BackupExportResponse, String> {
    let mut db_dump = Map::new();
    let mut counts = Map::new();

    for &table in BACKUP_TABLES {
        let rows = dump_table_rows(&state.pool, table).await?;
        counts.insert(table.to_string(), Value::from(rows.len() as u64));
        db_dump.insert(table.to_string(), Value::Array(rows));
    }

    let attach_root = state.app_data_dir.join("attachments");
    let mut attachment_files = Vec::new();
    collect_attachment_files(&attach_root, &attach_root, &mut attachment_files);

    let now = Utc::now();
    let manifest = BackupManifest {
        app_identifier: "com.icttrading.panel".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        schema_version: 1,
        exported_at: now.to_rfc3339(),
        table_counts: counts,
        attachment_count: attachment_files.len(),
    };

    let mut buffer = Cursor::new(Vec::new());
    {
        let mut zip = ZipWriter::new(&mut buffer);
        let opts =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        let manifest_json =
            serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
        zip.start_file("manifest.json", opts)
            .map_err(|e| e.to_string())?;
        zip.write_all(&manifest_json).map_err(|e| e.to_string())?;

        let db_json = serde_json::to_vec_pretty(&Value::Object(db_dump))
            .map_err(|e| e.to_string())?;
        zip.start_file("database.json", opts)
            .map_err(|e| e.to_string())?;
        zip.write_all(&db_json).map_err(|e| e.to_string())?;

        for (rel, full_path) in &attachment_files {
            if let Ok(bytes) = std::fs::read(full_path) {
                zip.start_file(format!("attachments/{rel}"), opts)
                    .map_err(|e| e.to_string())?;
                zip.write_all(&bytes).map_err(|e| e.to_string())?;
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
    }

    let zip_bytes = buffer.into_inner();
    let backups_dir = state.app_data_dir.join("backups");
    std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    let filename = format!("ict_panel_backup_{}.zip", now.format("%Y-%m-%d_%H-%M-%S"));
    let dest_path = backups_dir.join(&filename);
    std::fs::write(&dest_path, &zip_bytes).map_err(|e| e.to_string())?;

    Ok(BackupExportResponse {
        file_path: dest_path.to_string_lossy().to_string(),
        filename,
        bytes: zip_bytes,
        manifest,
    })
}

fn bind_json_val<'q>(
    q: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    val: &'q Value,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match val {
        Value::Null => q.bind(Option::<String>::None),
        Value::Bool(b) => q.bind(if *b { 1i64 } else { 0i64 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                q.bind(i)
            } else if let Some(f) = n.as_f64() {
                q.bind(f)
            } else {
                q.bind(n.to_string())
            }
        }
        Value::String(s) => q.bind(s.as_str()),
        other => q.bind(other.to_string()),
    }
}

#[tauri::command]
pub async fn import_backup_zip(
    state: State<'_, DbState>,
    bytes: Vec<u8>,
    mode: String,
) -> Result<BackupImportSummary, String> {
    if mode != "replace" && mode != "merge" {
        return Err(format!("Invalid restore mode: {mode}"));
    }

    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| format!("Invalid ZIP archive: {e}"))?;

    let manifest: BackupManifest = {
        let mut f = archive
            .by_name("manifest.json")
            .map_err(|_| "Backup missing manifest.json".to_string())?;
        let mut raw = String::new();
        f.read_to_string(&mut raw).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| format!("Invalid manifest.json: {e}"))?
    };

    if manifest.schema_version != 1 {
        return Err(format!(
            "Unsupported backup schema version: v{}",
            manifest.schema_version
        ));
    }

    let db_obj: Map<String, Value> = {
        let mut f = archive
            .by_name("database.json")
            .map_err(|_| "Backup missing database.json".to_string())?;
        let mut raw = String::new();
        f.read_to_string(&mut raw).map_err(|e| e.to_string())?;
        let parsed: Value =
            serde_json::from_str(&raw).map_err(|e| format!("Invalid database.json: {e}"))?;
        parsed
            .as_object()
            .cloned()
            .ok_or_else(|| "database.json must be a JSON object".to_string())?
    };

    // Collect binary attachments from ZIP before SQL transaction
    let mut extracted_attachments: Vec<(PathBuf, Vec<u8>)> = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if let Some(rel_raw) = name.strip_prefix("attachments/") {
            if !entry.is_dir() {
                if let Some(clean_rel) = sanitize_relative_attachment_path(rel_raw) {
                    let mut buf = Vec::new();
                    entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                    extracted_attachments.push((clean_rel, buf));
                }
            }
        }
    }

    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;

    if mode == "replace" {
        // Delete child tables before parent tables to keep foreign keys happy
        for &table in BACKUP_TABLES.iter().rev() {
            let del_sql = format!("DELETE FROM {table}");
            sqlx::query(&del_sql)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed clearing {table}: {e}"))?;
        }
    }

    let mut tables_restored = 0usize;
    let mut rows_restored = 0usize;

    for &table in BACKUP_TABLES {
        let Some(rows) = db_obj.get(table).and_then(|v| v.as_array()) else {
            continue;
        };
        if rows.is_empty() {
            continue;
        }
        tables_restored += 1;

        for row_val in rows {
            let Some(obj) = row_val.as_object() else {
                continue;
            };
            if obj.is_empty() {
                continue;
            }
            let cols: Vec<String> = obj
                .keys()
                .filter(|k| k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
                .cloned()
                .collect();
            if cols.is_empty() {
                continue;
            }
            let placeholders: Vec<String> =
                (1..=cols.len()).map(|i| format!("?{i}")).collect();
            let verb = if mode == "replace" {
                "INSERT OR REPLACE"
            } else {
                "INSERT OR IGNORE"
            };
            let sql = format!(
                "{verb} INTO {table} ({}) VALUES ({})",
                cols.join(", "),
                placeholders.join(", ")
            );
            let mut query = sqlx::query(&sql);
            for col in &cols {
                query = bind_json_val(query, &obj[col]);
            }
            query
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Restore error on {table}: {e}"))?;
            rows_restored += 1;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    let attach_root = state.app_data_dir.join("attachments");
    if mode == "replace" && attach_root.exists() {
        let _ = std::fs::remove_dir_all(&attach_root);
    }
    std::fs::create_dir_all(&attach_root).map_err(|e| e.to_string())?;

    let mut attachments_restored = 0usize;
    for (rel, data) in extracted_attachments {
        let dest = attach_root.join(&rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&dest, &data).map_err(|e| e.to_string())?;
        attachments_restored += 1;
    }

    Ok(BackupImportSummary {
        mode,
        tables_restored,
        rows_restored,
        attachments_restored,
    })
}

#[tauri::command]
pub fn open_backups_folder(state: State<'_, DbState>, app: AppHandle) -> Result<(), String> {
    let dir = state.app_data_dir.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}
