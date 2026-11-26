use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use super::db_ops::DbState;

static ATT_SEQ: AtomicU64 = AtomicU64::new(0);

fn next_att_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = ATT_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("att_{nanos:x}_{seq:x}")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRecord {
    pub id: String,
    pub owner_id: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub mime_type: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub size_bytes: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentInput {
    pub owner_type: String, // "notes" | "strategies"
    pub owner_id: String,
    pub bytes: Vec<u8>,
    pub mime_type: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

fn sanitize_owner_id(id: &str) -> Result<String, String> {
    let clean: String = id
        .trim()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    if clean.is_empty() {
        Err("Invalid owner_id".to_string())
    } else {
        Ok(clean)
    }
}

fn ext_from_mime(mime: &str) -> &'static str {
    match mime.to_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

/// Saves binary screenshot/image data cleanly under `%APPDATA%/attachments/{owner_type}/{owner_id}/`
/// and returns its relative path (never stores base64 strings inside SQLite JSON fields).
#[tauri::command]
pub async fn save_attachment(
    state: State<'_, DbState>,
    input: SaveAttachmentInput,
) -> Result<AttachmentRecord, String> {
    let folder = match input.owner_type.as_str() {
        "notes" => "notes",
        "strategies" => "strategies",
        other => return Err(format!("Unsupported attachment owner_type: {other}")),
    };
    let clean_owner_id = sanitize_owner_id(&input.owner_id)?;
    let att_id = next_att_id();
    let ext = ext_from_mime(&input.mime_type);

    let relative_path = format!("{folder}/{clean_owner_id}/{att_id}.{ext}");
    let target_dir = state
        .app_data_dir
        .join("attachments")
        .join(folder)
        .join(&clean_owner_id);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let target_file: PathBuf = target_dir.join(format!("{att_id}.{ext}"));
    std::fs::write(&target_file, &input.bytes).map_err(|e| e.to_string())?;
    let size_bytes = input.bytes.len() as i64;

    if folder == "notes" {
        sqlx::query(
            r#"
            INSERT INTO note_attachments (id, note_id, filename, mime_type, width, height, size_bytes, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
            "#,
        )
        .bind(&att_id)
        .bind(&clean_owner_id)
        .bind(&relative_path)
        .bind(&input.mime_type)
        .bind(input.width)
        .bind(input.height)
        .bind(size_bytes)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO strategy_attachments (id, strategy_id, filename, mime_type, size_bytes, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
            "#,
        )
        .bind(&att_id)
        .bind(&clean_owner_id)
        .bind(&relative_path)
        .bind(&input.mime_type)
        .bind(size_bytes)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(AttachmentRecord {
        id: att_id,
        owner_id: clean_owner_id,
        relative_path,
        absolute_path: target_file.to_string_lossy().to_string(),
        mime_type: input.mime_type,
        width: input.width,
        height: input.height,
        size_bytes,
        created_at: chrono_now_iso_fallback(),
    })
}

fn chrono_now_iso_fallback() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

#[tauri::command]
pub async fn list_attachments(
    state: State<'_, DbState>,
    owner_type: String,
    owner_id: String,
) -> Result<Vec<AttachmentRecord>, String> {
    let clean_id = sanitize_owner_id(&owner_id)?;
    let attach_root = state.app_data_dir.join("attachments");

    if owner_type == "notes" {
        let rows = sqlx::query(
            "SELECT id, note_id, filename, mime_type, width, height, size_bytes, created_at FROM note_attachments WHERE note_id = ?1 ORDER BY created_at DESC",
        )
        .bind(&clean_id)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter()
            .map(|r| {
                let rel: String = r.try_get("filename").map_err(|e| e.to_string())?;
                Ok(AttachmentRecord {
                    id: r.try_get("id").map_err(|e| e.to_string())?,
                    owner_id: r.try_get("note_id").map_err(|e| e.to_string())?,
                    absolute_path: attach_root.join(&rel).to_string_lossy().to_string(),
                    relative_path: rel,
                    mime_type: r.try_get("mime_type").map_err(|e| e.to_string())?,
                    width: r.try_get("width").map_err(|e| e.to_string())?,
                    height: r.try_get("height").map_err(|e| e.to_string())?,
                    size_bytes: r.try_get("size_bytes").map_err(|e| e.to_string())?,
                    created_at: r.try_get("created_at").map_err(|e| e.to_string())?,
                })
            })
            .collect()
    } else if owner_type == "strategies" {
        let rows = sqlx::query(
            "SELECT id, strategy_id, filename, mime_type, size_bytes, created_at FROM strategy_attachments WHERE strategy_id = ?1 ORDER BY created_at DESC",
        )
        .bind(&clean_id)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter()
            .map(|r| {
                let rel: String = r.try_get("filename").map_err(|e| e.to_string())?;
                Ok(AttachmentRecord {
                    id: r.try_get("id").map_err(|e| e.to_string())?,
                    owner_id: r.try_get("strategy_id").map_err(|e| e.to_string())?,
                    absolute_path: attach_root.join(&rel).to_string_lossy().to_string(),
                    relative_path: rel,
                    mime_type: r.try_get("mime_type").map_err(|e| e.to_string())?,
                    width: None,
                    height: None,
                    size_bytes: r.try_get("size_bytes").map_err(|e| e.to_string())?,
                    created_at: r.try_get("created_at").map_err(|e| e.to_string())?,
                })
            })
            .collect()
    } else {
        Err(format!("Unsupported owner_type: {owner_type}"))
    }
}

#[tauri::command]
pub async fn delete_attachment(
    state: State<'_, DbState>,
    owner_type: String,
    id: String,
) -> Result<(), String> {
    let filename: Option<String> = if owner_type == "notes" {
        let rel: Option<String> = sqlx::query_scalar("SELECT filename FROM note_attachments WHERE id = ?1")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM note_attachments WHERE id = ?1")
            .bind(&id)
            .execute(&state.pool)
            .await
            .map_err(|e| e.to_string())?;
        rel
    } else if owner_type == "strategies" {
        let rel: Option<String> =
            sqlx::query_scalar("SELECT filename FROM strategy_attachments WHERE id = ?1")
                .bind(&id)
                .fetch_optional(&state.pool)
                .await
                .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM strategy_attachments WHERE id = ?1")
            .bind(&id)
            .execute(&state.pool)
            .await
            .map_err(|e| e.to_string())?;
        rel
    } else {
        return Err(format!("Unsupported owner_type: {owner_type}"));
    };

    if let Some(rel) = filename {
        // Prevent path traversal out of attachments directory
        if !rel.contains("..") {
            let full = state.app_data_dir.join("attachments").join(rel);
            if full.exists() {
                let _ = std::fs::remove_file(full);
            }
        }
    }
    Ok(())
}
