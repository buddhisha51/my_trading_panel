use chrono::{DateTime, Duration, Utc};
use reqwest::{header, Client, StatusCode};
use serde::Deserialize;
use sqlx::SqlitePool;

use super::fetch_metadata::{
    get_fetch_state, record_fetch_failure_capped, record_fetch_success, should_fetch_now,
};
use super::{extract_currencies_from_text, upsert_news_item_dedup};

const PROVIDER_ID: &str = "cryptocompare";
const CRYPTOCOMPARE_URL: &str = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
const CRYPTO_TTL_SECS: i64 = 900; // 15 min
const CRYPTO_MAX_BACKOFF_SECS: i64 = 600; // 10 min max backoff

#[derive(Debug, Deserialize)]
struct CryptoCompareResponse {
    #[serde(rename = "Data", default)]
    data: Vec<CryptoCompareItem>,
}

#[derive(Debug, Deserialize)]
struct CryptoCompareSourceInfo {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CryptoCompareItem {
    title: String,
    url: String,
    published_on: i64,
    #[serde(default)]
    source_info: Option<CryptoCompareSourceInfo>,
    #[serde(default)]
    categories: Option<String>,
}

pub async fn sync_news(
    pool: &SqlitePool,
    client: &Client,
    force_bypass_ttl: bool,
) -> Result<bool, String> {
    let state = get_fetch_state(pool, PROVIDER_ID)
        .await
        .map_err(|e| e.to_string())?;
    let now = Utc::now();
    // Allow explicit manual refresh after a 60s cooldown even during backoff.
    let manual_allowed = force_bypass_ttl
        && state
            .as_ref()
            .and_then(|s| s.backoff_until)
            .map(|b| now >= b - Duration::seconds(CRYPTO_MAX_BACKOFF_SECS - 60))
            .unwrap_or(true);
    if !manual_allowed && !should_fetch_now(&state, now, force_bypass_ttl) {
        return Ok(false);
    }

    let prev_failures = state.as_ref().map(|s| s.consecutive_failures).unwrap_or(0);
    let mut req = client.get(CRYPTOCOMPARE_URL);
    if let Some(tag) = state.as_ref().and_then(|s| s.last_etag.as_deref()) {
        req = req.header(header::IF_NONE_MATCH, tag);
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(_) => {
            let _ = record_fetch_failure_capped(
                pool,
                PROVIDER_ID,
                None,
                prev_failures,
                CRYPTO_MAX_BACKOFF_SECS,
            )
            .await;
            return Ok(false);
        }
    };

    let status = resp.status();
    if status == StatusCode::NOT_MODIFIED {
        let _ = record_fetch_success(pool, PROVIDER_ID, None, 304, CRYPTO_TTL_SECS).await;
        return Ok(false);
    }
    if !status.is_success() {
        let _ = record_fetch_failure_capped(
            pool,
            PROVIDER_ID,
            Some(status.as_u16() as i64),
            prev_failures,
            CRYPTO_MAX_BACKOFF_SECS,
        )
        .await;
        return Ok(false);
    }

    let next_etag = resp
        .headers()
        .get(header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let parsed: CryptoCompareResponse = match resp.json().await {
        Ok(p) => p,
        Err(_) => {
            let _ = record_fetch_failure_capped(
                pool,
                PROVIDER_ID,
                Some(200),
                prev_failures,
                CRYPTO_MAX_BACKOFF_SECS,
            )
            .await;
            return Ok(false);
        }
    };

    for item in parsed.data.into_iter().take(40) {
        let pub_iso = DateTime::from_timestamp(item.published_on, 0)
            .unwrap_or_else(Utc::now)
            .to_rfc3339();
        let source_name = item
            .source_info
            .and_then(|s| s.name)
            .unwrap_or_else(|| "CryptoCompare".to_string());

        let mut currencies = extract_currencies_from_text(&item.title);
        if let Some(cats) = item.categories {
            for c in extract_currencies_from_text(&cats) {
                if !currencies.contains(&c) {
                    currencies.push(c);
                }
            }
        }

        let _ = upsert_news_item_dedup(
            pool,
            PROVIDER_ID,
            &source_name,
            "crypto",
            &item.title,
            &item.url,
            &pub_iso,
            &currencies,
            CRYPTO_TTL_SECS,
        )
        .await;
    }

    let _ = record_fetch_success(pool, PROVIDER_ID, next_etag, 200, CRYPTO_TTL_SECS).await;
    Ok(true)
}
