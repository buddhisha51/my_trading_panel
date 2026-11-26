pub mod cryptocompare;
pub mod fair_economy;
pub mod fetch_metadata;
pub mod finnhub;
pub mod rss_parser;

use reqwest::Client;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

static MARKET_SEQ: AtomicU64 = AtomicU64::new(0);

pub fn next_ulid_style_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = MARKET_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{nanos:x}_{seq:x}")
}

pub fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    result.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn extract_currencies_from_text(text: &str) -> Vec<String> {
    let upper = text.to_uppercase();
    let tokens = [
        "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF",
        "BTC", "ETH", "SOL", "XRP", "GOLD", "XAU", "FED", "ECB", "BOE", "BOJ",
    ];
    let mut found = Vec::new();
    for tok in tokens {
        if upper.contains(tok) {
            let mapped = match tok {
                "GOLD" => "XAU",
                "FED" => "USD",
                "ECB" => "EUR",
                "BOE" => "GBP",
                "BOJ" => "JPY",
                other => other,
            };
            if !found.iter().any(|x| x == mapped) {
                found.push(mapped.to_string());
            }
        }
    }
    found
}

pub async fn upsert_news_item_dedup(
    pool: &SqlitePool,
    provider: &str,
    source_name: &str,
    category: &str,
    title: &str,
    url: &str,
    published_at: &str,
    related_currencies: &[String],
    ttl_seconds: i64,
) -> Result<(), sqlx::Error> {
    let clean_title = title.trim();
    let clean_url = url.trim();
    if clean_title.is_empty() || clean_url.is_empty() {
        return Ok(());
    }

    let url_hash = sha256_hex(&clean_url.to_lowercase());
    let norm_title = clean_title
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let title_hash = sha256_hex(&norm_title);

    // Secondary dedup: skip identical headline if already present from another source within +-2 hours
    let dup_exists: Option<String> = sqlx::query_scalar(
        r#"
        SELECT id FROM news_items
        WHERE title_hash = ?1
          AND ABS(strftime('%s', published_at) - strftime('%s', ?2)) <= 7200
        LIMIT 1
        "#,
    )
    .bind(&title_hash)
    .bind(published_at)
    .fetch_optional(pool)
    .await?;

    if dup_exists.is_some() {
        return Ok(());
    }

    let currencies_json =
        serde_json::to_string(related_currencies).unwrap_or_else(|_| "[]".to_string());
    let id = next_ulid_style_id("nw");
    let now = chrono::Utc::now();
    let fetched_at = now.to_rfc3339();
    let expires_at = (now + chrono::Duration::seconds(ttl_seconds)).to_rfc3339();

    sqlx::query(
        r#"
        INSERT OR IGNORE INTO news_items (
            id, provider, source_name, category, title, url,
            published_at, url_hash, title_hash, related_currencies,
            fetched_at, expires_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        "#,
    )
    .bind(id)
    .bind(provider)
    .bind(source_name)
    .bind(category)
    .bind(clean_title)
    .bind(clean_url)
    .bind(published_at)
    .bind(url_hash)
    .bind(title_hash)
    .bind(currencies_json)
    .bind(fetched_at)
    .bind(expires_at)
    .execute(pool)
    .await?;

    Ok(())
}

/// Seeds default RSS feeds idempotently so first-time startups automatically poll ForexLive, FXStreet & CoinTelegraph.
pub async fn seed_default_rss_feeds(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let defaults = [
        (
            "rss_forexlive",
            "https://www.forexlive.com/feed/news",
            "ForexLive",
            "forex",
            600i64,
        ),
        (
            "rss_fxstreet",
            "https://www.fxstreet.com/rss/news",
            "FXStreet",
            "forex",
            600i64,
        ),
        (
            "rss_cointelegraph",
            "https://cointelegraph.com/rss",
            "CoinTelegraph",
            "crypto",
            600i64,
        ),
    ];

    for (id, url, label, category, interval_s) in defaults {
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO rss_feeds (
                id, url, label, category, is_enabled, poll_interval_s, created_at
            )
            VALUES (?1, ?2, ?3, ?4, 1, ?5, datetime('now'))
            "#,
        )
        .bind(id)
        .bind(url)
        .bind(label)
        .bind(category)
        .bind(interval_s)
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub fn build_http_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("ICT-SMC-Trading-Panel/0.1 (+https://github.com/ict-trading-panel)")
        .build()
        .unwrap_or_else(|_| Client::new())
}

/// Runs a sync cycle across all enabled backend adapters while strictly honoring
/// cache TTL floors (60m minimum for Fair Economy) and exponential rate-limit backoff.
pub async fn sync_all_providers(
    pool: &SqlitePool,
    client: &Client,
    app: &AppHandle,
    force_bypass_ttl: bool,
) {
    let mut updated = false;

    if fair_economy::sync_calendar(pool, client, force_bypass_ttl)
        .await
        .unwrap_or(false)
    {
        updated = true;
    }

    if cryptocompare::sync_news(pool, client, force_bypass_ttl)
        .await
        .unwrap_or(false)
    {
        updated = true;
    }

    if rss_parser::sync_all_enabled_feeds(pool, client, force_bypass_ttl)
        .await
        .unwrap_or(false)
    {
        updated = true;
    }

    if finnhub::sync_optional_finnhub(pool, client, force_bypass_ttl)
        .await
        .unwrap_or(false)
    {
        updated = true;
    }

    if updated {
        let _ = app.emit("data-updated", ());
    }
}

/// Starts the background Tokio interval loop (runs immediately once after startup delay, then every 60s
/// evaluates which providers' TTL has expired and backoff has cleared).
pub fn spawn_background_scheduler(pool: SqlitePool, app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let _ = seed_default_rss_feeds(&pool).await;
        let client = build_http_client();

        // Give WebView startup 2 seconds before firing first network requests
        tokio::time::sleep(Duration::from_secs(2)).await;
        sync_all_providers(&pool, &client, &app, false).await;

        let mut ticker = tokio::time::interval(Duration::from_secs(60));
        ticker.tick().await; // consume immediate first tick
        loop {
            ticker.tick().await;
            sync_all_providers(&pool, &client, &app, false).await;
        }
    });
}

#[allow(dead_code)]
async fn count_cached_events(pool: &SqlitePool) -> i64 {
    sqlx::query("SELECT COUNT(*) AS cnt FROM economic_events")
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|r| r.try_get::<i64, _>("cnt").ok())
        .unwrap_or(0)
}
