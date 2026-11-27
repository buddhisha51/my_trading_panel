use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use super::db_ops::DbState;

static ID_SEQ: AtomicU64 = AtomicU64::new(0);

fn next_record_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = ID_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("db_{nanos:x}_{seq:x}")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyBiasRecord {
    pub id: String,
    pub pair: String,
    pub date: String,
    pub bias_daily: Option<String>,
    pub bias_4h: Option<String>,
    pub bias_15m: Option<String>,
    pub pdh: Option<f64>,
    pub pdl: Option<f64>,
    pub asian_high: Option<f64>,
    pub asian_low: Option<f64>,
    pub dol_notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDailyBiasInput {
    pub id: Option<String>,
    pub pair: String,
    pub date: String,
    pub bias_daily: Option<String>,
    pub bias_4h: Option<String>,
    pub bias_15m: Option<String>,
    pub pdh: Option<f64>,
    pub pdl: Option<f64>,
    pub asian_high: Option<f64>,
    pub asian_low: Option<f64>,
    pub dol_notes: Option<String>,
}

fn is_valid_bias_date_key(key: &str) -> bool {
    let is_ymd = |s: &str| -> bool {
        let b = s.as_bytes();
        b.len() == 10
            && b[4] == b'-'
            && b[7] == b'-'
            && b.iter()
                .enumerate()
                .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    };
    let is_ym = |s: &str| -> bool {
        let b = s.as_bytes();
        b.len() == 7
            && b[4] == b'-'
            && b.iter()
                .enumerate()
                .all(|(i, c)| i == 4 || c.is_ascii_digit())
    };
    is_ymd(key)
        || key.strip_prefix("W:").is_some_and(is_ymd)
        || key.strip_prefix("M:").is_some_and(is_ym)
}

fn validate_bias_opt(val: &Option<String>) -> Result<(), String> {
    if let Some(ref b) = val {
        match b.as_str() {
            "bullish" | "bearish" | "range" => Ok(()),
            _ => Err(format!("Invalid bias direction: {b}")),
        }
    } else {
        Ok(())
    }
}

fn row_to_daily_bias(row: sqlx::sqlite::SqliteRow) -> Result<DailyBiasRecord, String> {
    Ok(DailyBiasRecord {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        pair: row.try_get("pair").map_err(|e| e.to_string())?,
        date: row.try_get("date").map_err(|e| e.to_string())?,
        bias_daily: row.try_get("bias_daily").map_err(|e| e.to_string())?,
        bias_4h: row.try_get("bias_4h").map_err(|e| e.to_string())?,
        bias_15m: row.try_get("bias_15m").map_err(|e| e.to_string())?,
        pdh: row.try_get("pdh").map_err(|e| e.to_string())?,
        pdl: row.try_get("pdl").map_err(|e| e.to_string())?,
        asian_high: row.try_get("asian_high").map_err(|e| e.to_string())?,
        asian_low: row.try_get("asian_low").map_err(|e| e.to_string())?,
        dol_notes: row.try_get("dol_notes").map_err(|e| e.to_string())?,
        created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
        updated_at: row.try_get("updated_at").map_err(|e| e.to_string())?,
    })
}

pub async fn fetch_by_pair_date(
    pool: &SqlitePool,
    pair: &str,
    date: &str,
) -> Result<DailyBiasRecord, String> {
    let row = sqlx::query(
        "SELECT id, pair, date, bias_daily, bias_4h, bias_15m, pdh, pdl, asian_high, asian_low, dol_notes, created_at, updated_at FROM daily_bias WHERE pair = ?1 AND date = ?2",
    )
    .bind(pair)
    .bind(date)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    row_to_daily_bias(row)
}

#[tauri::command]
pub async fn get_daily_biases(
    state: State<'_, DbState>,
    date: String,
) -> Result<Vec<DailyBiasRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, pair, date, bias_daily, bias_4h, bias_15m, pdh, pdl, asian_high, asian_low, dol_notes, created_at, updated_at FROM daily_bias WHERE date = ?1 ORDER BY pair ASC",
    )
    .bind(date)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter().map(row_to_daily_bias).collect()
}

#[tauri::command]
pub async fn list_recent_daily_bias(
    state: State<'_, DbState>,
    pair: String,
    limit: Option<i64>,
) -> Result<Vec<DailyBiasRecord>, String> {
    let norm_pair = pair.trim().to_uppercase();
    let lim = limit.unwrap_or(10).clamp(1, 90);
    let rows = sqlx::query(
        "SELECT id, pair, date, bias_daily, bias_4h, bias_15m, pdh, pdl, asian_high, asian_low, dol_notes, created_at, updated_at FROM daily_bias WHERE pair = ?1 AND date NOT LIKE 'W:%' AND date NOT LIKE 'M:%' ORDER BY date DESC LIMIT ?2",
    )
    .bind(norm_pair)
    .bind(lim)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter().map(row_to_daily_bias).collect()
}

#[tauri::command]
pub async fn upsert_daily_bias(
    state: State<'_, DbState>,
    input: UpsertDailyBiasInput,
) -> Result<DailyBiasRecord, String> {
    let pair = input.pair.trim().to_uppercase();
    if pair.is_empty() {
        return Err("Pair symbol cannot be empty".to_string());
    }
    let date = input.date.trim().to_string();
    if !is_valid_bias_date_key(&date) {
        return Err(format!(
            "Expected YYYY-MM-DD, W:YYYY-MM-DD, or M:YYYY-MM date key, got: {date}"
        ));
    }

    validate_bias_opt(&input.bias_daily)?;
    validate_bias_opt(&input.bias_4h)?;
    validate_bias_opt(&input.bias_15m)?;

    let id = input
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(next_record_id);

    sqlx::query(
        r#"
        INSERT INTO daily_bias (
            id, pair, date, bias_daily, bias_4h, bias_15m,
            pdh, pdl, asian_high, asian_low, dol_notes,
            created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'), datetime('now'))
        ON CONFLICT(pair, date) DO UPDATE SET
            bias_daily = excluded.bias_daily,
            bias_4h    = excluded.bias_4h,
            bias_15m   = excluded.bias_15m,
            pdh        = excluded.pdh,
            pdl        = excluded.pdl,
            asian_high = excluded.asian_high,
            asian_low  = excluded.asian_low,
            dol_notes  = excluded.dol_notes,
            updated_at = datetime('now')
        "#,
    )
    .bind(id)
    .bind(&pair)
    .bind(&date)
    .bind(input.bias_daily)
    .bind(input.bias_4h)
    .bind(input.bias_15m)
    .bind(input.pdh)
    .bind(input.pdl)
    .bind(input.asian_high)
    .bind(input.asian_low)
    .bind(input.dol_notes)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    fetch_by_pair_date(&state.pool, &pair, &date).await
}

#[tauri::command]
pub async fn delete_daily_bias(
    state: State<'_, DbState>,
    pair: String,
    date: String,
) -> Result<(), String> {
    let norm_pair = pair.trim().to_uppercase();
    sqlx::query("DELETE FROM daily_bias WHERE pair = ?1 AND date = ?2")
        .bind(norm_pair)
        .bind(date)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_valid_bias_date_key;

    #[test]
    fn accepts_daily_weekly_and_monthly_bias_keys() {
        assert!(is_valid_bias_date_key("2026-11-27"));
        assert!(is_valid_bias_date_key("W:2026-11-23"));
        assert!(is_valid_bias_date_key("M:2026-11"));
        assert!(!is_valid_bias_date_key("2026-11"));
        assert!(!is_valid_bias_date_key("W:2026-11"));
        assert!(!is_valid_bias_date_key("M:2026-11-27"));
    }
}
