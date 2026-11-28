use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use sqlx::{Column, Row, SqlitePool};
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use super::db_ops::DbState;
use super::trades::ensure_default_profile;

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

const DEFAULT_AUTO_BACKUP_RETENTION: usize = 7;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupEntry {
    pub filename: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupRunResult {
    pub created: bool,
    pub skipped_unchanged: bool,
    pub entry: Option<AutoBackupEntry>,
    pub pruned_count: usize,
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

async fn build_backup_zip_payload(
    pool: &SqlitePool,
    app_data_dir: &Path,
) -> Result<(Vec<u8>, BackupManifest), String> {
    let mut db_dump = Map::new();
    let mut counts = Map::new();

    for &table in BACKUP_TABLES {
        let rows = dump_table_rows(pool, table).await?;
        counts.insert(table.to_string(), Value::from(rows.len() as u64));
        db_dump.insert(table.to_string(), Value::Array(rows));
    }

    let attach_root = app_data_dir.join("attachments");
    let mut attachment_files = Vec::new();
    collect_attachment_files(&attach_root, &attach_root, &mut attachment_files);
    attachment_files.sort_by(|a, b| a.0.cmp(&b.0));

    let now = Utc::now();
    let manifest = BackupManifest {
        app_identifier: "com.icttrading.panel".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        schema_version: 2,
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

    Ok((buffer.into_inner(), manifest))
}

/// Computes a fast deterministic fingerprint of database content + attachment sizes
/// so identical idle quits never produce redundant auto-backup archives.
async fn compute_state_fingerprint(pool: &SqlitePool, app_data_dir: &Path) -> Result<String, String> {
    let mut hasher = Sha256::new();
    for &table in BACKUP_TABLES {
        let rows = dump_table_rows(pool, table).await?;
        hasher.update(table.as_bytes());
        hasher.update(b":");
        let serialized = serde_json::to_vec(&rows).map_err(|e| e.to_string())?;
        hasher.update(&serialized);
        hasher.update(b";");
    }

    let attach_root = app_data_dir.join("attachments");
    let mut attachment_files = Vec::new();
    collect_attachment_files(&attach_root, &attach_root, &mut attachment_files);
    attachment_files.sort_by(|a, b| a.0.cmp(&b.0));
    for (rel, path) in attachment_files {
        hasher.update(rel.as_bytes());
        if let Ok(meta) = std::fs::metadata(&path) {
            hasher.update(meta.len().to_le_bytes());
        }
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn list_auto_backups_in_dir(auto_dir: &Path) -> Vec<AutoBackupEntry> {
    let Ok(entries) = std::fs::read_dir(auto_dir) else {
        return Vec::new();
    };
    let mut items = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if !name.ends_with(".zip") {
            continue;
        }
        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let created_at = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        items.push(AutoBackupEntry {
            filename: name.to_string(),
            file_path: path.to_string_lossy().to_string(),
            size_bytes,
            created_at,
        });
    }
    items.sort_by(|a, b| b.filename.cmp(&a.filename));
    items
}

/// Writes an auto-backup atomically via `.zip.tmp` -> rename and prunes older snapshots
/// only after the new archive is safely finalized on disk.
pub async fn run_auto_backup_internal(
    pool: &SqlitePool,
    app_data_dir: &Path,
    retention_count: usize,
    force: bool,
) -> Result<AutoBackupRunResult, String> {
    let auto_dir = app_data_dir.join("backups").join("auto");
    std::fs::create_dir_all(&auto_dir).map_err(|e| e.to_string())?;
    let hash_file = auto_dir.join(".last_auto_hash");
    let existing = list_auto_backups_in_dir(&auto_dir);
    let fingerprint = compute_state_fingerprint(pool, app_data_dir).await?;

    if !force && !existing.is_empty() {
        if let Ok(prev_hash) = std::fs::read_to_string(&hash_file) {
            if prev_hash.trim() == fingerprint {
                return Ok(AutoBackupRunResult {
                    created: false,
                    skipped_unchanged: true,
                    entry: existing.into_iter().next(),
                    pruned_count: 0,
                });
            }
        }
    }

    let (zip_bytes, _) = build_backup_zip_payload(pool, app_data_dir).await?;
    let now = Utc::now();
    let filename = format!("ict_panel_auto_{}.zip", now.format("%Y-%m-%d_%H-%M-%S-%3f"));
    let tmp_path = auto_dir.join(format!("{filename}.tmp"));
    let final_path = auto_dir.join(&filename);

    {
        let mut f = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        f.write_all(&zip_bytes).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())?;
    let _ = std::fs::write(&hash_file, &fingerprint);

    let keep = retention_count.max(1);
    let all_after = list_auto_backups_in_dir(&auto_dir);
    let mut pruned_count = 0usize;
    for old in all_after.iter().skip(keep) {
        if std::fs::remove_file(&old.file_path).is_ok() {
            pruned_count += 1;
        }
    }

    let entry = AutoBackupEntry {
        filename,
        file_path: final_path.to_string_lossy().to_string(),
        size_bytes: zip_bytes.len() as u64,
        created_at: now.to_rfc3339(),
    };

    Ok(AutoBackupRunResult {
        created: true,
        skipped_unchanged: false,
        entry: Some(entry),
        pruned_count,
    })
}

pub async fn maybe_run_auto_backup_on_quit(pool: &SqlitePool, app_data_dir: &Path) {
    let enabled: bool = sqlx::query("SELECT value_json FROM settings WHERE key = 'autoBackupOnQuit'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<String, _>("value_json").ok())
        .and_then(|raw| serde_json::from_str::<bool>(&raw).ok())
        .unwrap_or(false);

    if !enabled {
        return;
    }

    let retention: usize =
        sqlx::query("SELECT value_json FROM settings WHERE key = 'autoBackupRetention'")
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
            .and_then(|r| r.try_get::<String, _>("value_json").ok())
            .and_then(|raw| serde_json::from_str::<usize>(&raw).ok())
            .unwrap_or(DEFAULT_AUTO_BACKUP_RETENTION);

    let _ = run_auto_backup_internal(pool, app_data_dir, retention, false).await;
}

#[tauri::command]
pub async fn trigger_auto_backup(
    state: State<'_, DbState>,
    force: Option<bool>,
    retention: Option<usize>,
) -> Result<AutoBackupRunResult, String> {
    run_auto_backup_internal(
        &state.pool,
        &state.app_data_dir,
        retention.unwrap_or(DEFAULT_AUTO_BACKUP_RETENTION),
        force.unwrap_or(false),
    )
    .await
}

#[tauri::command]
pub async fn list_auto_backups(state: State<'_, DbState>) -> Result<Vec<AutoBackupEntry>, String> {
    let auto_dir = state.app_data_dir.join("backups").join("auto");
    Ok(list_auto_backups_in_dir(&auto_dir))
}

#[tauri::command]
pub async fn export_backup_zip(
    state: State<'_, DbState>,
) -> Result<BackupExportResponse, String> {
    let (zip_bytes, manifest) =
        build_backup_zip_payload(&state.pool, &state.app_data_dir).await?;
    let backups_dir = state.app_data_dir.join("backups");
    std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    let filename = format!(
        "ict_panel_backup_{}.zip",
        Utc::now().format("%Y-%m-%d_%H-%M-%S")
    );
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

pub async fn import_backup_zip_impl(
    pool: &SqlitePool,
    app_data_dir: &Path,
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

    if manifest.schema_version != 1 && manifest.schema_version != 2 {
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

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    if mode == "replace" {
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
    ensure_default_profile(pool).await?;

    let attach_root = app_data_dir.join("attachments");
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
pub async fn import_backup_zip(
    state: State<'_, DbState>,
    bytes: Vec<u8>,
    mode: String,
) -> Result<BackupImportSummary, String> {
    import_backup_zip_impl(&state.pool, &state.app_data_dir, bytes, mode).await
}

#[tauri::command]
pub fn open_backups_folder(state: State<'_, DbState>, app: AppHandle) -> Result<(), String> {
    let dir = state.app_data_dir.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use sqlx::sqlite::SqlitePoolOptions;

    fn make_temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ict_panel_test_{name}_{}",
            Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn setup_mem_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        run_migrations(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn atomic_auto_backup_dirty_check_and_retention() {
        let pool = setup_mem_pool().await;
        let dir = make_temp_dir("auto_backup");
        ensure_default_profile(&pool).await.unwrap();

        let first = run_auto_backup_internal(&pool, &dir, 2, false).await.unwrap();
        assert!(first.created);
        assert!(!first.skipped_unchanged);

        // No changes -> skipped
        let second = run_auto_backup_internal(&pool, &dir, 2, false).await.unwrap();
        assert!(!second.created);
        assert!(second.skipped_unchanged);

        // Force two more backups -> retention=2 keeps only 2 zip files and no .tmp leftovers
        let _ = run_auto_backup_internal(&pool, &dir, 2, true).await.unwrap();
        let _ = run_auto_backup_internal(&pool, &dir, 2, true).await.unwrap();

        let auto_dir = dir.join("backups").join("auto");
        let list = list_auto_backups_in_dir(&auto_dir);
        assert_eq!(list.len(), 2);
        let leftover_tmp = std::fs::read_dir(&auto_dir)
            .unwrap()
            .flatten()
            .any(|e| e.path().extension().and_then(|s| s.to_str()) == Some("tmp"));
        assert!(!leftover_tmp);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn restores_legacy_v1_backup_into_v2_schema_with_default_account() {
        let pool = setup_mem_pool().await;
        let dir = make_temp_dir("v1_restore");

        let manifest = BackupManifest {
            app_identifier: "com.icttrading.panel".to_string(),
            app_version: "0.1.2".to_string(),
            schema_version: 1,
            exported_at: Utc::now().to_rfc3339(),
            table_counts: Map::new(),
            attachment_count: 0,
        };
        let db_dump = serde_json::json!({
            "trades": [{
                "id": "tr_legacy_1",
                "pair": "EURUSD",
                "direction": "long",
                "entry_price": 1.08,
                "stop_loss": null,
                "take_profit": null,
                "lot_size": 0.5,
                "outcome": "win",
                "pnl_dollars": 150.0,
                "r_multiple": 2.0,
                "strategy_id": null,
                "notes": "legacy",
                "screenshot_path": null,
                "checklist_snapshot": null,
                "setup_grade": null,
                "entry_time": "2026-11-20T10:00:00Z",
                "exit_time": "2026-11-20T11:00:00Z",
                "session": "NY AM",
                "created_at": "2026-11-20T11:00:00Z",
                "updated_at": "2026-11-20T11:00:00Z"
            }],
            "equity_snapshots": [{
                "id": "eq_1",
                "date": "2026-11-20",
                "balance": 10150.0,
                "daily_pnl": 150.0,
                "daily_drawdown": 0.0,
                "max_drawdown": 0.0,
                "win_count": 1,
                "loss_count": 0,
                "notes": null,
                "created_at": "2026-11-20T11:00:00Z"
            }]
        });

        let mut buf = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut buf);
            let opts = SimpleFileOptions::default();
            zip.start_file("manifest.json", opts).unwrap();
            zip.write_all(&serde_json::to_vec(&manifest).unwrap()).unwrap();
            zip.start_file("database.json", opts).unwrap();
            zip.write_all(&serde_json::to_vec(&db_dump).unwrap()).unwrap();
            zip.finish().unwrap();
        }

        let summary = import_backup_zip_impl(&pool, &dir, buf.into_inner(), "replace".to_string())
            .await
            .unwrap();
        assert_eq!(summary.rows_restored, 2);

        let (acc_id,): (String,) =
            sqlx::query_as("SELECT account_id FROM trades WHERE id = 'tr_legacy_1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(acc_id, "default");

        let (snap_acc,): (String,) =
            sqlx::query_as("SELECT account_id FROM equity_snapshots WHERE id = 'eq_1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(snap_acc, "default");

        let (def_count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM account_profile WHERE id = 'default'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(def_count, 1);

        let _ = std::fs::remove_dir_all(dir);
    }
}
