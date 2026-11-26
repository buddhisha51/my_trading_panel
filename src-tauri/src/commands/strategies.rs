use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use super::db_ops::DbState;

static STRAT_SEQ: AtomicU64 = AtomicU64::new(0);

fn next_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = STRAT_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{nanos:x}_{seq:x}")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistRuleRecord {
    pub id: String,
    pub strategy_id: String,
    pub name: String,
    pub description: Option<String>,
    pub sort_order: i64,
    pub is_required: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub body_json: String,
    pub canvas_json: Option<String>,
    pub tags: Vec<String>,
    pub is_active: bool,
    pub sort_order: i64,
    pub checklist: Vec<ChecklistRuleRecord>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistRuleInput {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub sort_order: i64,
    pub is_required: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertStrategyInput {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub body_json: String,
    pub canvas_json: Option<String>,
    pub tags: Vec<String>,
    pub is_active: bool,
    pub sort_order: i64,
    pub checklist: Vec<ChecklistRuleInput>,
}

async fn load_checklist(
    pool: &sqlx::SqlitePool,
    strategy_id: &str,
) -> Result<Vec<ChecklistRuleRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, strategy_id, name, description, sort_order, is_required, created_at FROM checklist_templates WHERE strategy_id = ?1 ORDER BY sort_order ASC",
    )
    .bind(strategy_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|r| {
            Ok(ChecklistRuleRecord {
                id: r.try_get("id").map_err(|e| e.to_string())?,
                strategy_id: r.try_get("strategy_id").map_err(|e| e.to_string())?,
                name: r.try_get("name").map_err(|e| e.to_string())?,
                description: r.try_get("description").map_err(|e| e.to_string())?,
                sort_order: r.try_get("sort_order").map_err(|e| e.to_string())?,
                is_required: r.try_get::<i64, _>("is_required").map_err(|e| e.to_string())? != 0,
                created_at: r.try_get("created_at").map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn list_strategies(state: State<'_, DbState>) -> Result<Vec<StrategyRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, name, description, body_json, canvas_json, tags, is_active, sort_order, created_at, updated_at FROM strategies ORDER BY sort_order ASC, updated_at DESC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let id: String = row.try_get("id").map_err(|e| e.to_string())?;
        let tags_raw: String = row.try_get("tags").map_err(|e| e.to_string())?;
        let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();
        let checklist = load_checklist(&state.pool, &id).await?;
        out.push(StrategyRecord {
            id,
            name: row.try_get("name").map_err(|e| e.to_string())?,
            description: row.try_get("description").map_err(|e| e.to_string())?,
            body_json: row.try_get("body_json").map_err(|e| e.to_string())?,
            canvas_json: row.try_get("canvas_json").map_err(|e| e.to_string())?,
            tags,
            is_active: row.try_get::<i64, _>("is_active").map_err(|e| e.to_string())? != 0,
            sort_order: row.try_get("sort_order").map_err(|e| e.to_string())?,
            checklist,
            created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
            updated_at: row.try_get("updated_at").map_err(|e| e.to_string())?,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn upsert_strategy(
    state: State<'_, DbState>,
    input: UpsertStrategyInput,
) -> Result<StrategyRecord, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("Strategy name cannot be empty".to_string());
    }
    let id = input
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| next_id("st"));
    let tags_json = serde_json::to_string(&input.tags).unwrap_or_else(|_| "[]".to_string());

    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO strategies (
            id, name, description, body_json, canvas_json,
            tags, is_active, sort_order, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            name        = excluded.name,
            description = excluded.description,
            body_json   = excluded.body_json,
            canvas_json = excluded.canvas_json,
            tags        = excluded.tags,
            is_active   = excluded.is_active,
            sort_order  = excluded.sort_order,
            updated_at  = datetime('now')
        "#,
    )
    .bind(&id)
    .bind(&name)
    .bind(input.description)
    .bind(input.body_json)
    .bind(input.canvas_json)
    .bind(tags_json)
    .bind(if input.is_active { 1 } else { 0 })
    .bind(input.sort_order)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Replace checklist templates atomically inside the same transaction
    sqlx::query("DELETE FROM checklist_templates WHERE strategy_id = ?1")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for (idx, rule) in input.checklist.into_iter().enumerate() {
        let rule_id = rule
            .id
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| next_id("chk"));
        sqlx::query(
            r#"
            INSERT INTO checklist_templates (
                id, strategy_id, name, description, sort_order, is_required, created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
            "#,
        )
        .bind(rule_id)
        .bind(&id)
        .bind(rule.name.trim())
        .bind(rule.description)
        .bind(idx as i64)
        .bind(if rule.is_required { 1 } else { 0 })
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    let row = sqlx::query(
        "SELECT id, name, description, body_json, canvas_json, tags, is_active, sort_order, created_at, updated_at FROM strategies WHERE id = ?1",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let tags_raw: String = row.try_get("tags").map_err(|e| e.to_string())?;
    let checklist = load_checklist(&state.pool, &id).await?;
    Ok(StrategyRecord {
        id,
        name: row.try_get("name").map_err(|e| e.to_string())?,
        description: row.try_get("description").map_err(|e| e.to_string())?,
        body_json: row.try_get("body_json").map_err(|e| e.to_string())?,
        canvas_json: row.try_get("canvas_json").map_err(|e| e.to_string())?,
        tags: serde_json::from_str(&tags_raw).unwrap_or_default(),
        is_active: row.try_get::<i64, _>("is_active").map_err(|e| e.to_string())? != 0,
        sort_order: row.try_get("sort_order").map_err(|e| e.to_string())?,
        checklist,
        created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
        updated_at: row.try_get("updated_at").map_err(|e| e.to_string())?,
    })
}

#[tauri::command]
pub async fn delete_strategy(state: State<'_, DbState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM strategies WHERE id = ?1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let dir = state
        .app_data_dir
        .join("attachments")
        .join("strategies")
        .join(&id);
    if dir.exists() {
        let _ = std::fs::remove_dir_all(dir);
    }
    Ok(())
}
