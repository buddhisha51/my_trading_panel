use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use super::db_ops::DbState;

static TRADE_SEQ: AtomicU64 = AtomicU64::new(0);

fn next_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = TRADE_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{nanos:x}_{seq:x}")
}

fn resolve_account_id(raw: Option<String>) -> String {
    raw.map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "default".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeRecord {
    pub id: String,
    pub account_id: String,
    pub pair: String,
    pub direction: String,
    pub entry_price: Option<f64>,
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
    pub lot_size: Option<f64>,
    pub outcome: Option<String>,
    pub pnl_dollars: Option<f64>,
    pub r_multiple: Option<f64>,
    pub strategy_id: Option<String>,
    pub notes: Option<String>,
    pub screenshot_path: Option<String>,
    pub checklist_snapshot: Option<String>,
    pub setup_grade: Option<String>,
    pub entry_time: Option<String>,
    pub exit_time: Option<String>,
    pub session: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTradeInput {
    pub id: Option<String>,
    #[serde(default)]
    pub account_id: Option<String>,
    pub pair: String,
    pub direction: String,
    pub entry_price: Option<f64>,
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
    pub lot_size: Option<f64>,
    pub outcome: Option<String>,
    pub pnl_dollars: Option<f64>,
    pub r_multiple: Option<f64>,
    pub strategy_id: Option<String>,
    pub notes: Option<String>,
    pub screenshot_path: Option<String>,
    pub checklist_snapshot: Option<String>,
    pub setup_grade: Option<String>,
    pub entry_time: Option<String>,
    pub exit_time: Option<String>,
    pub session: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OngoingTradeRecord {
    pub id: String,
    pub account_id: String,
    pub pair: String,
    pub direction: String,
    pub entry_price: f64,
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
    pub lot_size: Option<f64>,
    pub status: String,
    pub notes: Option<String>,
    pub strategy_id: Option<String>,
    pub opened_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertOngoingTradeInput {
    pub id: Option<String>,
    #[serde(default)]
    pub account_id: Option<String>,
    pub pair: String,
    pub direction: String,
    pub entry_price: f64,
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
    pub lot_size: Option<f64>,
    pub status: Option<String>,
    pub notes: Option<String>,
    pub strategy_id: Option<String>,
    pub opened_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseOngoingTradeInput {
    pub ongoing_id: String,
    pub outcome: String,
    pub pnl_dollars: f64,
    pub r_multiple: Option<f64>,
    pub notes: Option<String>,
    pub screenshot_path: Option<String>,
    pub checklist_snapshot: Option<String>,
    pub setup_grade: Option<String>,
    pub exit_time: Option<String>,
    pub session: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfileRecord {
    pub id: String,
    pub account_name: String,
    pub starting_balance: f64,
    pub current_balance: f64,
    pub high_water_mark: f64,
    pub currency: String,
    pub dd_mode: String,
    pub daily_dd_limit: Option<f64>,
    pub max_dd_limit: Option<f64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAccountProfileInput {
    #[serde(default)]
    pub id: Option<String>,
    pub account_name: String,
    pub starting_balance: f64,
    pub currency: String,
    pub dd_mode: String,
    pub daily_dd_limit: Option<f64>,
    pub max_dd_limit: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAccountProfileInput {
    pub account_name: String,
    pub starting_balance: f64,
    pub currency: String,
    pub dd_mode: String,
    pub daily_dd_limit: Option<f64>,
    pub max_dd_limit: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquitySnapshotRecord {
    pub id: String,
    pub account_id: String,
    pub date: String,
    pub balance: f64,
    pub daily_pnl: f64,
    pub daily_drawdown: Option<f64>,
    pub max_drawdown: Option<f64>,
    pub win_count: i64,
    pub loss_count: i64,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertEquitySnapshotInput {
    #[serde(default)]
    pub account_id: Option<String>,
    pub date: String,
    pub balance: f64,
    pub daily_pnl: f64,
    pub daily_drawdown: Option<f64>,
    pub max_drawdown: Option<f64>,
    pub win_count: i64,
    pub loss_count: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportSummary {
    pub imported_count: usize,
    pub skipped_duplicates: usize,
    pub trades: Vec<TradeRecord>,
}

fn validate_direction(d: &str) -> Result<String, String> {
    match d.to_lowercase().as_str() {
        "long" | "short" => Ok(d.to_lowercase()),
        other => Err(format!("Invalid trade direction: {other}")),
    }
}

fn validate_dd_mode(dd_mode: &str) -> Result<String, String> {
    match dd_mode {
        "static" | "trailing" => Ok(dd_mode.to_string()),
        other => Err(format!("Invalid dd_mode: {other}")),
    }
}

fn normalize_outcome_signed(outcome: Option<&str>, val: Option<f64>) -> Option<f64> {
    let v = val?;
    match outcome.map(|s| s.to_lowercase()).as_deref() {
        Some("loss") => Some(if v == 0.0 { 0.0 } else { -v.abs() }),
        Some("win") => Some(v.abs()),
        _ => Some(v),
    }
}

fn row_to_trade(row: sqlx::sqlite::SqliteRow) -> Result<TradeRecord, String> {
    let outcome: Option<String> = row.try_get("outcome").map_err(|e| e.to_string())?;
    let raw_pnl: Option<f64> = row.try_get("pnl_dollars").map_err(|e| e.to_string())?;
    let raw_r: Option<f64> = row.try_get("r_multiple").map_err(|e| e.to_string())?;
    Ok(TradeRecord {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        account_id: row
            .try_get("account_id")
            .unwrap_or_else(|_| "default".to_string()),
        pair: row.try_get("pair").map_err(|e| e.to_string())?,
        direction: row.try_get("direction").map_err(|e| e.to_string())?,
        entry_price: row.try_get("entry_price").map_err(|e| e.to_string())?,
        stop_loss: row.try_get("stop_loss").map_err(|e| e.to_string())?,
        take_profit: row.try_get("take_profit").map_err(|e| e.to_string())?,
        lot_size: row.try_get("lot_size").map_err(|e| e.to_string())?,
        pnl_dollars: normalize_outcome_signed(outcome.as_deref(), raw_pnl),
        r_multiple: normalize_outcome_signed(outcome.as_deref(), raw_r),
        outcome,
        strategy_id: row.try_get("strategy_id").map_err(|e| e.to_string())?,
        notes: row.try_get("notes").map_err(|e| e.to_string())?,
        screenshot_path: row.try_get("screenshot_path").map_err(|e| e.to_string())?,
        checklist_snapshot: row.try_get("checklist_snapshot").map_err(|e| e.to_string())?,
        setup_grade: row.try_get("setup_grade").map_err(|e| e.to_string())?,
        entry_time: row.try_get("entry_time").map_err(|e| e.to_string())?,
        exit_time: row.try_get("exit_time").map_err(|e| e.to_string())?,
        session: row.try_get("session").map_err(|e| e.to_string())?,
        created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
        updated_at: row.try_get("updated_at").map_err(|e| e.to_string())?,
    })
}

fn row_to_ongoing(row: sqlx::sqlite::SqliteRow) -> Result<OngoingTradeRecord, String> {
    Ok(OngoingTradeRecord {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        account_id: row
            .try_get("account_id")
            .unwrap_or_else(|_| "default".to_string()),
        pair: row.try_get("pair").map_err(|e| e.to_string())?,
        direction: row.try_get("direction").map_err(|e| e.to_string())?,
        entry_price: row.try_get("entry_price").map_err(|e| e.to_string())?,
        stop_loss: row.try_get("stop_loss").map_err(|e| e.to_string())?,
        take_profit: row.try_get("take_profit").map_err(|e| e.to_string())?,
        lot_size: row.try_get("lot_size").map_err(|e| e.to_string())?,
        status: row.try_get("status").map_err(|e| e.to_string())?,
        notes: row.try_get("notes").map_err(|e| e.to_string())?,
        strategy_id: row.try_get("strategy_id").map_err(|e| e.to_string())?,
        opened_at: row.try_get("opened_at").map_err(|e| e.to_string())?,
        updated_at: row.try_get("updated_at").map_err(|e| e.to_string())?,
    })
}

fn row_to_account_profile(row: sqlx::sqlite::SqliteRow) -> Result<AccountProfileRecord, String> {
    Ok(AccountProfileRecord {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        account_name: row.try_get("account_name").map_err(|e| e.to_string())?,
        starting_balance: row.try_get("starting_balance").map_err(|e| e.to_string())?,
        current_balance: row.try_get("current_balance").map_err(|e| e.to_string())?,
        high_water_mark: row.try_get("high_water_mark").map_err(|e| e.to_string())?,
        currency: row.try_get("currency").map_err(|e| e.to_string())?,
        dd_mode: row.try_get("dd_mode").map_err(|e| e.to_string())?,
        daily_dd_limit: row.try_get("daily_dd_limit").map_err(|e| e.to_string())?,
        max_dd_limit: row.try_get("max_dd_limit").map_err(|e| e.to_string())?,
        updated_at: row.try_get("updated_at").map_err(|e| e.to_string())?,
    })
}

pub async fn ensure_default_profile(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        r#"
        INSERT OR IGNORE INTO account_profile (
            id, account_name, starting_balance, current_balance, high_water_mark,
            currency, dd_mode, daily_dd_limit, max_dd_limit, updated_at
        )
        VALUES ('default', 'My Account', 0.0, 0.0, 0.0, 'USD', 'static', 5.0, 10.0, datetime('now'))
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn fetch_account_profile_for(
    pool: &SqlitePool,
    account_id: &str,
) -> Result<AccountProfileRecord, String> {
    ensure_default_profile(pool).await?;
    let row = sqlx::query(
        "SELECT id, account_name, starting_balance, current_balance, high_water_mark, currency, dd_mode, daily_dd_limit, max_dd_limit, updated_at FROM account_profile WHERE id = ?1",
    )
    .bind(account_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(r) = row {
        return row_to_account_profile(r);
    }

    let fallback = sqlx::query(
        "SELECT id, account_name, starting_balance, current_balance, high_water_mark, currency, dd_mode, daily_dd_limit, max_dd_limit, updated_at FROM account_profile WHERE id = 'default'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    row_to_account_profile(fallback)
}

/// Recomputes `current_balance` and `high_water_mark` chronologically for a specific account.
pub async fn recompute_account_balance(
    pool: &SqlitePool,
    account_id: &str,
) -> Result<AccountProfileRecord, String> {
    let profile = fetch_account_profile_for(pool, account_id).await?;
    let target_id = profile.id.clone();

    let pnls = sqlx::query(
        "SELECT outcome, COALESCE(pnl_dollars, 0.0) AS pnl FROM trades WHERE account_id = ?1 ORDER BY COALESCE(exit_time, entry_time, created_at) ASC, created_at ASC",
    )
    .bind(&target_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut running = profile.starting_balance;
    let mut hwm = profile.starting_balance;
    for row in pnls {
        let outcome: Option<String> = row.try_get("outcome").ok().flatten();
        let raw_p: f64 = row.try_get("pnl").unwrap_or(0.0);
        let p = normalize_outcome_signed(outcome.as_deref(), Some(raw_p)).unwrap_or(0.0);
        running += p;
        if running > hwm {
            hwm = running;
        }
    }

    sqlx::query(
        "UPDATE account_profile SET current_balance = ?1, high_water_mark = ?2, updated_at = datetime('now') WHERE id = ?3",
    )
    .bind(running)
    .bind(hwm)
    .bind(&target_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    fetch_account_profile_for(pool, &target_id).await
}

#[tauri::command]
pub async fn list_account_profiles(
    state: State<'_, DbState>,
) -> Result<Vec<AccountProfileRecord>, String> {
    list_account_profiles_impl(&state.pool).await
}

pub async fn list_account_profiles_impl(
    pool: &SqlitePool,
) -> Result<Vec<AccountProfileRecord>, String> {
    ensure_default_profile(pool).await?;
    let rows = sqlx::query(
        "SELECT id, account_name, starting_balance, current_balance, high_water_mark, currency, dd_mode, daily_dd_limit, max_dd_limit, updated_at FROM account_profile ORDER BY CASE WHEN id = 'default' THEN 0 ELSE 1 END, account_name ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter().map(row_to_account_profile).collect()
}

#[tauri::command]
pub async fn get_account_profile(
    state: State<'_, DbState>,
    account_id: Option<String>,
) -> Result<AccountProfileRecord, String> {
    let target = resolve_account_id(account_id);
    fetch_account_profile_for(&state.pool, &target).await
}

#[tauri::command]
pub async fn create_account_profile(
    state: State<'_, DbState>,
    input: CreateAccountProfileInput,
) -> Result<AccountProfileRecord, String> {
    create_account_profile_impl(&state.pool, input).await
}

pub async fn create_account_profile_impl(
    pool: &SqlitePool,
    input: CreateAccountProfileInput,
) -> Result<AccountProfileRecord, String> {
    let dd_mode = validate_dd_mode(&input.dd_mode)?;
    let name = input.account_name.trim();
    if name.is_empty() {
        return Err("Account name cannot be empty".to_string());
    }
    let bal = input.starting_balance.max(0.0);
    let curr = if input.currency.trim().is_empty() {
        "USD".to_string()
    } else {
        input.currency.trim().to_uppercase()
    };
    let id = next_id("acc");

    sqlx::query(
        r#"
        INSERT INTO account_profile (
            id, account_name, starting_balance, current_balance, high_water_mark,
            currency, dd_mode, daily_dd_limit, max_dd_limit, updated_at
        )
        VALUES (?1, ?2, ?3, ?3, ?3, ?4, ?5, ?6, ?7, datetime('now'))
        "#,
    )
    .bind(&id)
    .bind(name)
    .bind(bal)
    .bind(curr)
    .bind(dd_mode)
    .bind(input.daily_dd_limit)
    .bind(input.max_dd_limit)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    fetch_account_profile_for(pool, &id).await
}

#[tauri::command]
pub async fn update_account_profile(
    state: State<'_, DbState>,
    input: UpdateAccountProfileInput,
) -> Result<AccountProfileRecord, String> {
    let dd_mode = validate_dd_mode(&input.dd_mode)?;
    let target_id = resolve_account_id(input.id.clone());
    ensure_default_profile(&state.pool).await?;

    sqlx::query(
        r#"
        UPDATE account_profile
        SET account_name = ?1, starting_balance = ?2, currency = ?3,
            dd_mode = ?4, daily_dd_limit = ?5, max_dd_limit = ?6,
            updated_at = datetime('now')
        WHERE id = ?7
        "#,
    )
    .bind(input.account_name.trim())
    .bind(input.starting_balance.max(0.0))
    .bind(input.currency.trim().to_uppercase())
    .bind(dd_mode)
    .bind(input.daily_dd_limit)
    .bind(input.max_dd_limit)
    .bind(&target_id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    recompute_account_balance(&state.pool, &target_id).await
}

#[tauri::command]
pub async fn delete_account_profile(
    state: State<'_, DbState>,
    account_id: String,
    force_cascade: Option<bool>,
) -> Result<(), String> {
    delete_account_profile_impl(&state.pool, &account_id, force_cascade.unwrap_or(false)).await
}

pub async fn delete_account_profile_impl(
    pool: &SqlitePool,
    account_id: &str,
    force_cascade: bool,
) -> Result<(), String> {
    let target = account_id.trim();
    if target.is_empty() || target == "default" {
        return Err("The primary default account cannot be deleted.".to_string());
    }

    let (trades_count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM trades WHERE account_id = ?1")
            .bind(target)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
    let (ongoing_count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM ongoing_trades WHERE account_id = ?1")
            .bind(target)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
    let (snap_count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM equity_snapshots WHERE account_id = ?1")
            .bind(target)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

    let total_linked = trades_count + ongoing_count + snap_count;
    if total_linked > 0 && !force_cascade {
        return Err(format!(
            "Account has {trades_count} closed trades, {ongoing_count} ongoing trades, and {snap_count} snapshots. Confirm deletion to remove all account data."
        ));
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM trades WHERE account_id = ?1")
        .bind(target)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM ongoing_trades WHERE account_id = ?1")
        .bind(target)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM equity_snapshots WHERE account_id = ?1")
        .bind(target)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM account_profile WHERE id = ?1")
        .bind(target)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_trades(
    state: State<'_, DbState>,
    account_id: Option<String>,
) -> Result<Vec<TradeRecord>, String> {
    let acc_id = resolve_account_id(account_id);
    let rows = sqlx::query(
        r#"
        SELECT id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size,
               outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path,
               checklist_snapshot, setup_grade, entry_time, exit_time, session,
               created_at, updated_at
        FROM trades
        WHERE account_id = ?1
        ORDER BY COALESCE(exit_time, entry_time, created_at) DESC, created_at DESC
        LIMIT 1000
        "#,
    )
    .bind(acc_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter().map(row_to_trade).collect()
}

#[tauri::command]
pub async fn upsert_trade(
    state: State<'_, DbState>,
    input: UpsertTradeInput,
) -> Result<TradeRecord, String> {
    let acc_id = resolve_account_id(input.account_id);
    let pair = input.pair.trim().to_uppercase();
    if pair.is_empty() {
        return Err("Pair symbol cannot be empty".to_string());
    }
    let direction = validate_direction(&input.direction)?;
    let id = input
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| next_id("tr"));
    let normalized_pnl = normalize_outcome_signed(input.outcome.as_deref(), input.pnl_dollars);
    let normalized_r = normalize_outcome_signed(input.outcome.as_deref(), input.r_multiple);

    sqlx::query(
        r#"
        INSERT INTO trades (
            id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size,
            outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path,
            checklist_snapshot, setup_grade, entry_time, exit_time, session,
            created_at, updated_at
        )
        VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
            ?9, ?10, ?11, ?12, ?13, ?14,
            ?15, ?16, COALESCE(?17, datetime('now')), ?18, ?19,
            datetime('now'), datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
            pair               = excluded.pair,
            direction          = excluded.direction,
            entry_price        = excluded.entry_price,
            stop_loss          = excluded.stop_loss,
            take_profit        = excluded.take_profit,
            lot_size           = excluded.lot_size,
            outcome            = excluded.outcome,
            pnl_dollars        = excluded.pnl_dollars,
            r_multiple         = excluded.r_multiple,
            strategy_id        = excluded.strategy_id,
            notes              = excluded.notes,
            screenshot_path    = excluded.screenshot_path,
            checklist_snapshot = excluded.checklist_snapshot,
            setup_grade        = excluded.setup_grade,
            entry_time         = excluded.entry_time,
            exit_time          = excluded.exit_time,
            session            = excluded.session,
            updated_at         = datetime('now')
        "#,
    )
    .bind(&id)
    .bind(&acc_id)
    .bind(pair)
    .bind(direction)
    .bind(input.entry_price)
    .bind(input.stop_loss)
    .bind(input.take_profit)
    .bind(input.lot_size)
    .bind(input.outcome)
    .bind(normalized_pnl)
    .bind(normalized_r)
    .bind(input.strategy_id)
    .bind(input.notes)
    .bind(input.screenshot_path)
    .bind(input.checklist_snapshot)
    .bind(input.setup_grade)
    .bind(input.entry_time)
    .bind(input.exit_time)
    .bind(input.session)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = recompute_account_balance(&state.pool, &acc_id).await?;

    let row = sqlx::query(
        "SELECT id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size, outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path, checklist_snapshot, setup_grade, entry_time, exit_time, session, created_at, updated_at FROM trades WHERE id = ?1",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    row_to_trade(row)
}

#[tauri::command]
pub async fn import_trades_csv_rows(
    state: State<'_, DbState>,
    account_id: Option<String>,
    rows: Vec<UpsertTradeInput>,
) -> Result<CsvImportSummary, String> {
    let acc_id = resolve_account_id(account_id);
    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;
    let mut inserted_ids: Vec<String> = Vec::new();
    let mut skipped_duplicates = 0usize;

    for item in rows {
        let pair = item.pair.trim().to_uppercase();
        if pair.is_empty() {
            continue;
        }
        let direction = validate_direction(&item.direction)?;
        let normalized_pnl = normalize_outcome_signed(item.outcome.as_deref(), item.pnl_dollars);
        let normalized_r = normalize_outcome_signed(item.outcome.as_deref(), item.r_multiple);

        // Deduplicate on exact tuple match for same account so re-importing CSVs is idempotent
        let existing: Option<(String,)> = sqlx::query_as(
            r#"
            SELECT id FROM trades
            WHERE account_id = ?1
              AND pair = ?2
              AND direction = ?3
              AND COALESCE(entry_time, '') = COALESCE(?4, '')
              AND COALESCE(exit_time, '') = COALESCE(?5, '')
              AND COALESCE(pnl_dollars, 0.0) = COALESCE(?6, 0.0)
            LIMIT 1
            "#,
        )
        .bind(&acc_id)
        .bind(&pair)
        .bind(&direction)
        .bind(&item.entry_time)
        .bind(&item.exit_time)
        .bind(normalized_pnl)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if existing.is_some() {
            skipped_duplicates += 1;
            continue;
        }

        let id = next_id("tr");
        sqlx::query(
            r#"
            INSERT INTO trades (
                id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size,
                outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path,
                checklist_snapshot, setup_grade, entry_time, exit_time, session,
                created_at, updated_at
            )
            VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                ?9, ?10, ?11, ?12, ?13, ?14,
                ?15, ?16, COALESCE(?17, datetime('now')), ?18, ?19,
                datetime('now'), datetime('now')
            )
            "#,
        )
        .bind(&id)
        .bind(&acc_id)
        .bind(&pair)
        .bind(&direction)
        .bind(item.entry_price)
        .bind(item.stop_loss)
        .bind(item.take_profit)
        .bind(item.lot_size)
        .bind(item.outcome)
        .bind(normalized_pnl)
        .bind(normalized_r)
        .bind(item.strategy_id)
        .bind(item.notes)
        .bind(item.screenshot_path)
        .bind(item.checklist_snapshot)
        .bind(item.setup_grade)
        .bind(item.entry_time)
        .bind(item.exit_time)
        .bind(item.session)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        inserted_ids.push(id);
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    let _ = recompute_account_balance(&state.pool, &acc_id).await?;

    let mut inserted_trades = Vec::with_capacity(inserted_ids.len());
    for id in inserted_ids {
        let row = sqlx::query(
            "SELECT id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size, outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path, checklist_snapshot, setup_grade, entry_time, exit_time, session, created_at, updated_at FROM trades WHERE id = ?1",
        )
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
        inserted_trades.push(row_to_trade(row)?);
    }

    Ok(CsvImportSummary {
        imported_count: inserted_trades.len(),
        skipped_duplicates,
        trades: inserted_trades,
    })
}

#[tauri::command]
pub async fn delete_trade(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT account_id FROM trades WHERE id = ?1")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| e.to_string())?;
    let acc_id = existing
        .map(|(a,)| a)
        .unwrap_or_else(|| "default".to_string());

    sqlx::query("DELETE FROM trades WHERE id = ?1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    let _ = recompute_account_balance(&state.pool, &acc_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_ongoing_trades(
    state: State<'_, DbState>,
    account_id: Option<String>,
) -> Result<Vec<OngoingTradeRecord>, String> {
    let acc_id = resolve_account_id(account_id);
    let rows = sqlx::query(
        "SELECT id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size, status, notes, strategy_id, opened_at, updated_at FROM ongoing_trades WHERE account_id = ?1 ORDER BY opened_at DESC",
    )
    .bind(acc_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter().map(row_to_ongoing).collect()
}

#[tauri::command]
pub async fn upsert_ongoing_trade(
    state: State<'_, DbState>,
    input: UpsertOngoingTradeInput,
) -> Result<OngoingTradeRecord, String> {
    upsert_ongoing_trade_impl(&state.pool, input).await
}

pub async fn upsert_ongoing_trade_impl(
    pool: &SqlitePool,
    input: UpsertOngoingTradeInput,
) -> Result<OngoingTradeRecord, String> {
    let acc_id = resolve_account_id(input.account_id);
    let pair = input.pair.trim().to_uppercase();
    if pair.is_empty() {
        return Err("Pair cannot be empty".to_string());
    }
    let direction = validate_direction(&input.direction)?;
    let status = match input.status.as_deref().unwrap_or("running") {
        "running" | "moved_to_be" | "partials_taken" | "pending" => {
            input.status.unwrap_or_else(|| "running".to_string())
        }
        other => return Err(format!("Invalid ongoing status: {other}")),
    };
    let id = input
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| next_id("on"));

    sqlx::query(
        r#"
        INSERT INTO ongoing_trades (
            id, account_id, pair, direction, entry_price, stop_loss, take_profit,
            lot_size, status, notes, strategy_id, opened_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, COALESCE(?12, datetime('now')), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            pair        = excluded.pair,
            direction   = excluded.direction,
            entry_price = excluded.entry_price,
            stop_loss   = excluded.stop_loss,
            take_profit = excluded.take_profit,
            lot_size    = excluded.lot_size,
            status      = excluded.status,
            notes       = excluded.notes,
            strategy_id = excluded.strategy_id,
            updated_at  = datetime('now')
        "#,
    )
    .bind(&id)
    .bind(&acc_id)
    .bind(pair)
    .bind(direction)
    .bind(input.entry_price)
    .bind(input.stop_loss)
    .bind(input.take_profit)
    .bind(input.lot_size)
    .bind(status)
    .bind(input.notes)
    .bind(input.strategy_id)
    .bind(input.opened_at)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query(
        "SELECT id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size, status, notes, strategy_id, opened_at, updated_at FROM ongoing_trades WHERE id = ?1",
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    row_to_ongoing(row)
}

#[tauri::command]
pub async fn delete_ongoing_trade(state: State<'_, DbState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM ongoing_trades WHERE id = ?1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Atomically moves an ongoing trade into the Trade Journal, migrates any linked notes,
/// and recomputes account equity & high-water mark.
#[tauri::command]
pub async fn close_ongoing_to_journal(
    state: State<'_, DbState>,
    input: CloseOngoingTradeInput,
) -> Result<TradeRecord, String> {
    close_ongoing_to_journal_impl(&state.pool, input).await
}

pub async fn close_ongoing_to_journal_impl(
    pool: &SqlitePool,
    input: CloseOngoingTradeInput,
) -> Result<TradeRecord, String> {
    let ongoing_row = sqlx::query(
        "SELECT id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size, status, notes, strategy_id, opened_at, updated_at FROM ongoing_trades WHERE id = ?1",
    )
    .bind(&input.ongoing_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Ongoing trade not found: {e}"))?;

    let ongoing = row_to_ongoing(ongoing_row)?;
    let trade_id = next_id("tr");
    let normalized_pnl = normalize_outcome_signed(Some(&input.outcome), Some(input.pnl_dollars))
        .unwrap_or(input.pnl_dollars);
    let normalized_r = normalize_outcome_signed(Some(&input.outcome), input.r_multiple);

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO trades (
            id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size,
            outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path,
            checklist_snapshot, setup_grade, entry_time, exit_time, session,
            created_at, updated_at
        )
        VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
            ?9, ?10, ?11, ?12, ?13, ?14,
            ?15, ?16, ?17, COALESCE(?18, datetime('now')), ?19,
            datetime('now'), datetime('now')
        )
        "#,
    )
    .bind(&trade_id)
    .bind(&ongoing.account_id)
    .bind(&ongoing.pair)
    .bind(&ongoing.direction)
    .bind(ongoing.entry_price)
    .bind(ongoing.stop_loss)
    .bind(ongoing.take_profit)
    .bind(ongoing.lot_size)
    .bind(&input.outcome)
    .bind(normalized_pnl)
    .bind(normalized_r)
    .bind(&ongoing.strategy_id)
    .bind(input.notes.or(ongoing.notes))
    .bind(&input.screenshot_path)
    .bind(&input.checklist_snapshot)
    .bind(&input.setup_grade)
    .bind(&ongoing.opened_at)
    .bind(&input.exit_time)
    .bind(&input.session)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Carry over any Quick Notes linked to this ongoing position to the closed journal record.
    sqlx::query(
        "UPDATE notes SET trade_id = ?1, ongoing_trade_id = NULL, updated_at = datetime('now') WHERE ongoing_trade_id = ?2",
    )
    .bind(&trade_id)
    .bind(&input.ongoing_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM ongoing_trades WHERE id = ?1")
        .bind(&input.ongoing_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = recompute_account_balance(pool, &ongoing.account_id).await?;

    let row = sqlx::query(
        "SELECT id, account_id, pair, direction, entry_price, stop_loss, take_profit, lot_size, outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path, checklist_snapshot, setup_grade, entry_time, exit_time, session, created_at, updated_at FROM trades WHERE id = ?1",
    )
    .bind(&trade_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    row_to_trade(row)
}

#[tauri::command]
pub async fn list_equity_snapshots(
    state: State<'_, DbState>,
    account_id: Option<String>,
) -> Result<Vec<EquitySnapshotRecord>, String> {
    let acc_id = resolve_account_id(account_id);
    let rows = sqlx::query(
        "SELECT id, account_id, date, balance, daily_pnl, daily_drawdown, max_drawdown, win_count, loss_count, notes, created_at FROM equity_snapshots WHERE account_id = ?1 ORDER BY date ASC LIMIT 365",
    )
    .bind(acc_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|r| {
            Ok(EquitySnapshotRecord {
                id: r.try_get("id").map_err(|e| e.to_string())?,
                account_id: r
                    .try_get("account_id")
                    .unwrap_or_else(|_| "default".to_string()),
                date: r.try_get("date").map_err(|e| e.to_string())?,
                balance: r.try_get("balance").map_err(|e| e.to_string())?,
                daily_pnl: r.try_get("daily_pnl").map_err(|e| e.to_string())?,
                daily_drawdown: r.try_get("daily_drawdown").map_err(|e| e.to_string())?,
                max_drawdown: r.try_get("max_drawdown").map_err(|e| e.to_string())?,
                win_count: r.try_get("win_count").map_err(|e| e.to_string())?,
                loss_count: r.try_get("loss_count").map_err(|e| e.to_string())?,
                notes: r.try_get("notes").map_err(|e| e.to_string())?,
                created_at: r.try_get("created_at").map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn upsert_equity_snapshot(
    state: State<'_, DbState>,
    input: UpsertEquitySnapshotInput,
) -> Result<EquitySnapshotRecord, String> {
    let acc_id = resolve_account_id(input.account_id);
    let id = next_id("eq");
    sqlx::query(
        r#"
        INSERT INTO equity_snapshots (
            id, account_id, date, balance, daily_pnl, daily_drawdown, max_drawdown,
            win_count, loss_count, notes, created_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
        ON CONFLICT(account_id, date) DO UPDATE SET
            balance        = excluded.balance,
            daily_pnl      = excluded.daily_pnl,
            daily_drawdown = excluded.daily_drawdown,
            max_drawdown   = excluded.max_drawdown,
            win_count      = excluded.win_count,
            loss_count     = excluded.loss_count,
            notes          = excluded.notes
        "#,
    )
    .bind(&id)
    .bind(&acc_id)
    .bind(&input.date)
    .bind(input.balance)
    .bind(input.daily_pnl)
    .bind(input.daily_drawdown)
    .bind(input.max_drawdown)
    .bind(input.win_count)
    .bind(input.loss_count)
    .bind(input.notes)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let r = sqlx::query(
        "SELECT id, account_id, date, balance, daily_pnl, daily_drawdown, max_drawdown, win_count, loss_count, notes, created_at FROM equity_snapshots WHERE account_id = ?1 AND date = ?2",
    )
    .bind(&acc_id)
    .bind(&input.date)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(EquitySnapshotRecord {
        id: r.try_get("id").map_err(|e| e.to_string())?,
        account_id: r
            .try_get("account_id")
            .unwrap_or_else(|_| "default".to_string()),
        date: r.try_get("date").map_err(|e| e.to_string())?,
        balance: r.try_get("balance").map_err(|e| e.to_string())?,
        daily_pnl: r.try_get("daily_pnl").map_err(|e| e.to_string())?,
        daily_drawdown: r.try_get("daily_drawdown").map_err(|e| e.to_string())?,
        max_drawdown: r.try_get("max_drawdown").map_err(|e| e.to_string())?,
        win_count: r.try_get("win_count").map_err(|e| e.to_string())?,
        loss_count: r.try_get("loss_count").map_err(|e| e.to_string())?,
        notes: r.try_get("notes").map_err(|e| e.to_string())?,
        created_at: r.try_get("created_at").map_err(|e| e.to_string())?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use sqlx::sqlite::SqlitePoolOptions;

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
    async fn migrates_linked_notes_when_closing_ongoing_trade() {
        let pool = setup_mem_pool().await;
        let acc = create_account_profile_impl(
            &pool,
            CreateAccountProfileInput {
                account_name: "Funded 100K".to_string(),
                starting_balance: 100000.0,
                currency: "USD".to_string(),
                dd_mode: "trailing".to_string(),
                daily_dd_limit: Some(5.0),
                max_dd_limit: Some(10.0),
            },
        )
        .await
        .unwrap();

        let ongoing = upsert_ongoing_trade_impl(
            &pool,
            UpsertOngoingTradeInput {
                id: None,
                account_id: Some(acc.id.clone()),
                pair: "EURUSD".to_string(),
                direction: "long".to_string(),
                entry_price: 1.085,
                stop_loss: Some(1.0835),
                take_profit: Some(1.0895),
                lot_size: Some(2.0),
                status: Some("running".to_string()),
                notes: Some("NY AM sweep".to_string()),
                strategy_id: None,
                opened_at: None,
            },
        )
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO notes (id, title, body_json, body_text, ongoing_trade_id, created_at, updated_at) VALUES ('nt_linked', 'Pre-entry', '{}', 'body', ?1, datetime('now'), datetime('now'))",
        )
        .bind(&ongoing.id)
        .execute(&pool)
        .await
        .unwrap();

        let closed = close_ongoing_to_journal_impl(
            &pool,
            CloseOngoingTradeInput {
                ongoing_id: ongoing.id.clone(),
                outcome: "win".to_string(),
                pnl_dollars: 900.0,
                r_multiple: Some(3.0),
                notes: None,
                screenshot_path: None,
                checklist_snapshot: None,
                setup_grade: None,
                exit_time: None,
                session: Some("NY AM".to_string()),
            },
        )
        .await
        .unwrap();

        assert_eq!(closed.account_id, acc.id);
        let (linked_trade_id, linked_ongoing_id): (Option<String>, Option<String>) =
            sqlx::query_as("SELECT trade_id, ongoing_trade_id FROM notes WHERE id = 'nt_linked'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(linked_trade_id.as_deref(), Some(closed.id.as_str()));
        assert_eq!(linked_ongoing_id, None);

        // Balance isolation: default remains 0, funded account becomes 100900
        let default_acc = fetch_account_profile_for(&pool, "default").await.unwrap();
        let updated_acc = fetch_account_profile_for(&pool, &acc.id).await.unwrap();
        assert_eq!(default_acc.current_balance, 0.0);
        assert_eq!(updated_acc.current_balance, 100900.0);

        // Deleting non-empty account without cascade must fail, then cascade removes cleanly
        let err = delete_account_profile_impl(&pool, &acc.id, false)
            .await
            .unwrap_err();
        assert!(err.contains("Confirm deletion"));
        delete_account_profile_impl(&pool, &acc.id, true)
            .await
            .unwrap();
        let remaining = list_account_profiles_impl(&pool).await.unwrap();
        assert_eq!(remaining.len(), 1);
    }
}
