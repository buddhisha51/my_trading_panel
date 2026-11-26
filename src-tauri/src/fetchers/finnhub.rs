use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Deserialize;
use sqlx::SqlitePool;

use super::fetch_metadata::{
    get_fetch_state, record_fetch_failure, record_fetch_success, should_fetch_now,
};
use super::{extract_currencies_from_text, upsert_news_item_dedup};

const PROVIDER_ID: &str = "finnhub";
const FINNHUB_TTL_SECS: i64 = 300; // 5 min
const KEYRING_SERVICE: &str = "com.icttrading.panel";
const FINNHUB_SECRET_KEY: &str = "finnhub_api_key";

#[derive(Debug, Deserialize)]
struct FinnhubNewsItem {
    headline: String,
    url: String,
    datetime: i64,
    #[serde(default)]
    source: Option<String>,
}

fn read_finnhub_key_from_keyring() -> Option<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, FINNHUB_SECRET_KEY).ok()?;
    let val = entry.get_password().ok()?;
    let trimmed = val.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

pub async fn sync_optional_finnhub(
    pool: &SqlitePool,
    client: &Client,
    force_bypass_ttl: bool,
) -> Result<bool, String> {
    let Some(token) = read_finnhub_key_from_keyring() else {
        return Ok(false);
    };

    let state = get_fetch_state(pool, PROVIDER_ID)
        .await
        .map_err(|e| e.to_string())?;
    let now = Utc::now();
    if !should_fetch_now(&state, now, force_bypass_ttl) {
        return Ok(false);
    }

    let prev_failures = state.as_ref().map(|s| s.consecutive_failures).unwrap_or(0);
    let mut updated = false;

    for cat in ["forex", "crypto"] {
        let url = format!("https://finnhub.io/api/v1/news?category={cat}&token={token}");
        let resp = match client.get(&url).send().await {
            Ok(r) => r,
            Err(_) => {
                let _ = record_fetch_failure(pool, PROVIDER_ID, None, prev_failures).await;
                return Ok(updated);
            }
        };

        let status = resp.status();
        if !status.is_success() {
            let _ = record_fetch_failure(
                pool,
                PROVIDER_ID,
                Some(status.as_u16() as i64),
                prev_failures,
            )
            .await;
            return Ok(updated);
        }

        let items: Vec<FinnhubNewsItem> = match resp.json().await {
            Ok(v) => v,
            Err(_) => continue,
        };

        for item in items.into_iter().take(25) {
            let pub_iso = DateTime::from_timestamp(item.datetime, 0)
                .unwrap_or_else(Utc::now)
                .to_rfc3339();
            let src = item.source.unwrap_or_else(|| "Finnhub".to_string());
            let currencies = extract_currencies_from_text(&item.headline);

            let _ = upsert_news_item_dedup(
                pool,
                PROVIDER_ID,
                &src,
                cat,
                &item.headline,
                &item.url,
                &pub_iso,
                &currencies,
                FINNHUB_TTL_SECS,
            )
            .await;
            updated = true;
        }
    }

    let _ = record_fetch_success(pool, PROVIDER_ID, None, 200, FINNHUB_TTL_SECS).await;
    Ok(updated)
}
