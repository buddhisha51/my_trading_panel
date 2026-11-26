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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeRecord {
    pub id: String,
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
    pub date: String,
    pub balance: f64,
    pub daily_pnl: f64,
    pub daily_drawdown: Option<f64>,
    pub max_drawdown: Option<f64>,
    pub win_count: i64,
    pub loss_count: i64,
    pub notes: Option<String>,
}

fn validate_direction(d: &str) -> Result<String, String> {
    match d.to_lowercase().as_str() {
        "long" | "short" => Ok(d.to_lowercase()),
        other => Err(format!("Invalid trade direction: {other}")),
    }
}

fn row_to_trade(row: sqlx::sqlite::SqliteRow) -> Result<TradeRecord, String> {
    Ok(TradeRecord {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        pair: row.try_get("pair").map_err(|e| e.to_string())?,
        direction: row.try_get("direction").map_err(|e| e.to_string())?,
        entry_price: row.try_get("entry_price").map_err(|e| e.to_string())?,
        stop_loss: row.try_get("stop_loss").map_err(|e| e.to_string())?,
        take_profit: row.try_get("take_profit").map_err(|e| e.to_string())?,
        lot_size: row.try_get("lot_size").map_err(|e| e.to_string())?,
        outcome: row.try_get("outcome").map_err(|e| e.to_string())?,
        pnl_dollars: row.try_get("pnl_dollars").map_err(|e| e.to_string())?,
        r_multiple: row.try_get("r_multiple").map_err(|e| e.to_string())?,
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

/// Recomputes `current_balance` and `high_water_mark` chronologically from starting balance + closed trades.
async fn recompute_account_balance(pool: &SqlitePool) -> Result<AccountProfileRecord, String> {
    ensure_default_profile(pool).await?;
    let profile = fetch_account_profile(pool).await?;

    let pnls = sqlx::query(
        "SELECT COALESCE(pnl_dollars, 0.0) AS pnl FROM trades ORDER BY COALESCE(exit_time, entry_time, created_at) ASC, created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut running = profile.starting_balance;
    let mut hwm = profile.starting_balance;
    for row in pnls {
        let p: f64 = row.try_get("pnl").unwrap_or(0.0);
        running += p;
        if running > hwm {
            hwm = running;
        }
    }

    sqlx::query(
        "UPDATE account_profile SET current_balance = ?1, high_water_mark = ?2, updated_at = datetime('now') WHERE id = 'default'",
    )
    .bind(running)
    .bind(hwm)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    fetch_account_profile(pool).await
}

async fn ensure_default_profile(pool: &SqlitePool) -> Result<(), String> {
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

async fn fetch_account_profile(pool: &SqlitePool) -> Result<AccountProfileRecord, String> {
    ensure_default_profile(pool).await?;
    let row = sqlx::query(
        "SELECT id, account_name, starting_balance, current_balance, high_water_mark, currency, dd_mode, daily_dd_limit, max_dd_limit, updated_at FROM account_profile WHERE id = 'default'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

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

#[tauri::command]
pub async fn get_account_profile(state: State<'_, DbState>) -> Result<AccountProfileRecord, String> {
    fetch_account_profile(&state.pool).await
}

#[tauri::command]
pub async fn update_account_profile(
    state: State<'_, DbState>,
    input: UpdateAccountProfileInput,
) -> Result<AccountProfileRecord, String> {
    let dd_mode = match input.dd_mode.as_str() {
        "static" | "trailing" => input.dd_mode,
        other => return Err(format!("Invalid dd_mode: {other}")),
    };
    ensure_default_profile(&state.pool).await?;

    sqlx::query(
        r#"
        UPDATE account_profile
        SET account_name = ?1, starting_balance = ?2, currency = ?3,
            dd_mode = ?4, daily_dd_limit = ?5, max_dd_limit = ?6,
            updated_at = datetime('now')
        WHERE id = 'default'
        "#,
    )
    .bind(input.account_name.trim())
    .bind(input.starting_balance.max(0.0))
    .bind(input.currency.trim().to_uppercase())
    .bind(dd_mode)
    .bind(input.daily_dd_limit)
    .bind(input.max_dd_limit)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    recompute_account_balance(&state.pool).await
}

#[tauri::command]
pub async fn list_trades(state: State<'_, DbState>) -> Result<Vec<TradeRecord>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, pair, direction, entry_price, stop_loss, take_profit, lot_size,
               outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path,
               checklist_snapshot, setup_grade, entry_time, exit_time, session,
               created_at, updated_at
        FROM trades
        ORDER BY COALESCE(exit_time, entry_time, created_at) DESC, created_at DESC
        LIMIT 500
        "#,
    )
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
    let pair = input.pair.trim().to_uppercase();
    if pair.is_empty() {
        return Err("Pair symbol cannot be empty".to_string());
    }
    let direction = validate_direction(&input.direction)?;
    let id = input
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| next_id("tr"));

    sqlx::query(
        r#"
        INSERT INTO trades (
            id, pair, direction, entry_price, stop_loss, take_profit, lot_size,
            outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path,
            checklist_snapshot, setup_grade, entry_time, exit_time, session,
            created_at, updated_at
        )
        VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7,
            ?8, ?9, ?10, ?11, ?12, ?13,
            ?14, ?15, COALESCE(?16, datetime('now')), ?17, ?18,
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
    .bind(pair)
    .bind(direction)
    .bind(input.entry_price)
    .bind(input.stop_loss)
    .bind(input.take_profit)
    .bind(input.lot_size)
    .bind(input.outcome)
    .bind(input.pnl_dollars)
    .bind(input.r_multiple)
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

    let _ = recompute_account_balance(&state.pool).await?;

    let row = sqlx::query(
        "SELECT id, pair, direction, entry_price, stop_loss, take_profit, lot_size, outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path, checklist_snapshot, setup_grade, entry_time, exit_time, session, created_at, updated_at FROM trades WHERE id = ?1",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    row_to_trade(row)
}

#[tauri::command]
pub async fn delete_trade(state: State<'_, DbState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM trades WHERE id = ?1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    let _ = recompute_account_balance(&state.pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_ongoing_trades(
    state: State<'_, DbState>,
) -> Result<Vec<OngoingTradeRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, pair, direction, entry_price, stop_loss, take_profit, lot_size, status, notes, strategy_id, opened_at, updated_at FROM ongoing_trades ORDER BY opened_at DESC",
    )
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
            id, pair, direction, entry_price, stop_loss, take_profit,
            lot_size, status, notes, strategy_id, opened_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, COALESCE(?11, datetime('now')), datetime('now'))
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
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query(
        "SELECT id, pair, direction, entry_price, stop_loss, take_profit, lot_size, status, notes, strategy_id, opened_at, updated_at FROM ongoing_trades WHERE id = ?1",
    )
    .bind(&id)
    .fetch_one(&state.pool)
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

/// Atomically moves an ongoing trade into the Trade Journal and updates account equity.
#[tauri::command]
pub async fn close_ongoing_to_journal(
    state: State<'_, DbState>,
    input: CloseOngoingTradeInput,
) -> Result<TradeRecord, String> {
    let ongoing_row = sqlx::query(
        "SELECT id, pair, direction, entry_price, stop_loss, take_profit, lot_size, status, notes, strategy_id, opened_at, updated_at FROM ongoing_trades WHERE id = ?1",
    )
    .bind(&input.ongoing_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| format!("Ongoing trade not found: {e}"))?;

    let ongoing = row_to_ongoing(ongoing_row)?;
    let trade_id = next_id("tr");

    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO trades (
            id, pair, direction, entry_price, stop_loss, take_profit, lot_size,
            outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path,
            checklist_snapshot, setup_grade, entry_time, exit_time, session,
            created_at, updated_at
        )
        VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7,
            ?8, ?9, ?10, ?11, ?12, ?13,
            ?14, ?15, ?16, COALESCE(?17, datetime('now')), ?18,
            datetime('now'), datetime('now')
        )
        "#,
    )
    .bind(&trade_id)
    .bind(&ongoing.pair)
    .bind(&ongoing.direction)
    .bind(ongoing.entry_price)
    .bind(ongoing.stop_loss)
    .bind(ongoing.take_profit)
    .bind(ongoing.lot_size)
    .bind(&input.outcome)
    .bind(input.pnl_dollars)
    .bind(input.r_multiple)
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

    sqlx::query("DELETE FROM ongoing_trades WHERE id = ?1")
        .bind(&input.ongoing_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = recompute_account_balance(&state.pool).await?;

    let row = sqlx::query(
        "SELECT id, pair, direction, entry_price, stop_loss, take_profit, lot_size, outcome, pnl_dollars, r_multiple, strategy_id, notes, screenshot_path, checklist_snapshot, setup_grade, entry_time, exit_time, session, created_at, updated_at FROM trades WHERE id = ?1",
    )
    .bind(&trade_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    row_to_trade(row)
}

#[tauri::command]
pub async fn list_equity_snapshots(
    state: State<'_, DbState>,
) -> Result<Vec<EquitySnapshotRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, date, balance, daily_pnl, daily_drawdown, max_drawdown, win_count, loss_count, notes, created_at FROM equity_snapshots ORDER BY date ASC LIMIT 365",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|r| {
            Ok(EquitySnapshotRecord {
                id: r.try_get("id").map_err(|e| e.to_string())?,
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
    let id = next_id("eq");
    sqlx::query(
        r#"
        INSERT INTO equity_snapshots (
            id, date, balance, daily_pnl, daily_drawdown, max_drawdown,
            win_count, loss_count, notes, created_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
        ON CONFLICT(date) DO UPDATE SET
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
        "SELECT id, date, balance, daily_pnl, daily_drawdown, max_drawdown, win_count, loss_count, notes, created_at FROM equity_snapshots WHERE date = ?1",
    )
    .bind(&input.date)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(EquitySnapshotRecord {
        id: r.try_get("id").map_err(|e| e.to_string())?,
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
