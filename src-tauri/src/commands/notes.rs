use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use super::db_ops::DbState;

static NOTE_SEQ: AtomicU64 = AtomicU64::new(0);

fn next_note_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = NOTE_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("nt_{nanos:x}_{seq:x}")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRecord {
    pub id: String,
    pub title: String,
    pub body_json: String,
    pub body_text: String,
    pub canvas_json: Option<String>,
    pub tags: Vec<String>,
    pub pair: Option<String>,
    pub session: Option<String>,
    pub is_pinned: bool,
    pub trade_id: Option<String>,
    pub ongoing_trade_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertNoteInput {
    pub id: Option<String>,
    pub title: String,
    pub body_json: String,
    pub body_text: String,
    pub canvas_json: Option<String>,
    pub tags: Vec<String>,
    pub pair: Option<String>,
    pub session: Option<String>,
    pub is_pinned: bool,
    #[serde(default)]
    pub trade_id: Option<String>,
    #[serde(default)]
    pub ongoing_trade_id: Option<String>,
}

fn parse_tags_json(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

fn row_to_note(row: sqlx::sqlite::SqliteRow) -> Result<NoteRecord, String> {
    let tags_raw: String = row.try_get("tags").map_err(|e| e.to_string())?;
    let pinned_int: i64 = row.try_get("is_pinned").map_err(|e| e.to_string())?;
    Ok(NoteRecord {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        title: row.try_get("title").map_err(|e| e.to_string())?,
        body_json: row.try_get("body_json").map_err(|e| e.to_string())?,
        body_text: row.try_get("body_text").map_err(|e| e.to_string())?,
        canvas_json: row.try_get("canvas_json").map_err(|e| e.to_string())?,
        tags: parse_tags_json(&tags_raw),
        pair: row.try_get("pair").map_err(|e| e.to_string())?,
        session: row.try_get("session").map_err(|e| e.to_string())?,
        is_pinned: pinned_int != 0,
        trade_id: row.try_get("trade_id").ok().flatten(),
        ongoing_trade_id: row.try_get("ongoing_trade_id").ok().flatten(),
        created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
        updated_at: row.try_get("updated_at").map_err(|e| e.to_string())?,
    })
}

/// Sanitizes arbitrary user search input into safe quoted FTS5 prefix tokens
/// (e.g. `EUR/USD ob` -> `"EUR"* AND "USD"* AND "ob"*`) so punctuation never crashes `MATCH`.
fn build_safe_fts_query(raw: &str) -> Option<String> {
    let tokens: Vec<String> = raw
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{}\"*", t.replace('"', "")))
        .collect();

    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" AND "))
    }
}

#[tauri::command]
pub async fn list_notes(
    state: State<'_, DbState>,
    query: Option<String>,
    pair: Option<String>,
    session: Option<String>,
) -> Result<Vec<NoteRecord>, String> {
    let clean_pair = pair
        .map(|p| p.trim().to_uppercase())
        .filter(|p| !p.is_empty());
    let clean_session = session
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let fts_match = query.as_deref().and_then(build_safe_fts_query);

    let rows = if let Some(match_expr) = fts_match {
        sqlx::query(
            r#"
            SELECT n.id, n.title, n.body_json, n.body_text, n.canvas_json,
                   n.tags, n.pair, n.session, n.is_pinned, n.trade_id, n.ongoing_trade_id,
                   n.created_at, n.updated_at
            FROM notes n
            INNER JOIN notes_fts f ON f.rowid = n.rowid
            WHERE notes_fts MATCH ?1
              AND (?2 IS NULL OR UPPER(COALESCE(n.pair, '')) = ?2)
              AND (?3 IS NULL OR COALESCE(n.session, '') = ?3)
            ORDER BY n.is_pinned DESC, n.updated_at DESC
            LIMIT 200
            "#,
        )
        .bind(match_expr)
        .bind(clean_pair)
        .bind(clean_session)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query(
            r#"
            SELECT id, title, body_json, body_text, canvas_json,
                   tags, pair, session, is_pinned, trade_id, ongoing_trade_id,
                   created_at, updated_at
            FROM notes
            WHERE (?1 IS NULL OR UPPER(COALESCE(pair, '')) = ?1)
              AND (?2 IS NULL OR COALESCE(session, '') = ?2)
            ORDER BY is_pinned DESC, updated_at DESC
            LIMIT 200
            "#,
        )
        .bind(clean_pair)
        .bind(clean_session)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?
    };

    rows.into_iter().map(row_to_note).collect()
}

#[tauri::command]
pub async fn upsert_note(
    state: State<'_, DbState>,
    input: UpsertNoteInput,
) -> Result<NoteRecord, String> {
    let id = input
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(next_note_id);
    let tags_json = serde_json::to_string(&input.tags).unwrap_or_else(|_| "[]".to_string());
    let norm_pair = input
        .pair
        .map(|p| p.trim().to_uppercase())
        .filter(|p| !p.is_empty());
    let clean_session = input
        .session
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let clean_trade_id = input
        .trade_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let clean_ongoing_id = input
        .ongoing_trade_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    sqlx::query(
        r#"
        INSERT INTO notes (
            id, title, body_json, body_text, canvas_json,
            tags, pair, session, is_pinned, trade_id, ongoing_trade_id,
            created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            title            = excluded.title,
            body_json        = excluded.body_json,
            body_text        = excluded.body_text,
            canvas_json      = excluded.canvas_json,
            tags             = excluded.tags,
            pair             = excluded.pair,
            session          = excluded.session,
            is_pinned        = excluded.is_pinned,
            trade_id         = excluded.trade_id,
            ongoing_trade_id = excluded.ongoing_trade_id,
            updated_at       = datetime('now')
        "#,
    )
    .bind(&id)
    .bind(input.title)
    .bind(input.body_json)
    .bind(input.body_text)
    .bind(input.canvas_json)
    .bind(tags_json)
    .bind(norm_pair)
    .bind(clean_session)
    .bind(if input.is_pinned { 1 } else { 0 })
    .bind(clean_trade_id)
    .bind(clean_ongoing_id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query(
        "SELECT id, title, body_json, body_text, canvas_json, tags, pair, session, is_pinned, trade_id, ongoing_trade_id, created_at, updated_at FROM notes WHERE id = ?1",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    row_to_note(row)
}

#[tauri::command]
pub async fn delete_note(state: State<'_, DbState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM notes WHERE id = ?1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let dir = state.app_data_dir.join("attachments").join("notes").join(&id);
    if dir.exists() {
        let _ = std::fs::remove_dir_all(dir);
    }
    Ok(())
}
