use chrono::{Datelike, Duration, Utc, Weekday};
use reqwest::{header, Client, StatusCode};
use serde::Deserialize;
use sqlx::SqlitePool;

use super::fetch_metadata::{
    get_fetch_state, record_fetch_failure, record_fetch_success, should_fetch_now,
};
use super::{next_ulid_style_id, sha256_hex};

const PROVIDER_ID: &str = "faireconomy";
const THIS_WEEK_URL: &str = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const NEXT_WEEK_URL: &str = "https://nfs.faireconomy.media/ff_calendar_nextweek.json";
/// Hard minimum 60-minute cache TTL floor for Fair Economy calendar mirror.
const MIN_CALENDAR_TTL_SECS: i64 = 3600;

#[derive(Debug, Deserialize)]
struct FfCalendarRaw {
    title: String,
    country: String,
    date: String,
    impact: String,
    #[serde(default)]
    forecast: Option<String>,
    #[serde(default)]
    previous: Option<String>,
}

fn normalize_impact(raw: &str) -> Option<&'static str> {
    match raw.trim().to_lowercase().as_str() {
        "high" => Some("high"),
        "medium" => Some("medium"),
        "low" => Some("low"),
        _ => None, // Skip "Holiday" / "Non-Economic"
    }
}

fn clean_opt(val: Option<String>) -> Option<String> {
    val.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

async fn fetch_url_into_db(
    pool: &SqlitePool,
    client: &Client,
    url: &str,
    etag: Option<&str>,
) -> Result<(bool, Option<String>, StatusCode), (Option<i64>, String)> {
    let mut req = client.get(url);
    if let Some(tag) = etag {
        req = req.header(header::IF_NONE_MATCH, tag);
    }

    let resp = req.send().await.map_err(|e| (None, e.to_string()))?;
    let status = resp.status();

    if status == StatusCode::NOT_MODIFIED {
        return Ok((false, etag.map(|s| s.to_string()), status));
    }
    if !status.is_success() {
        return Err((Some(status.as_u16() as i64), format!("HTTP {status}")));
    }

    let next_etag = resp
        .headers()
        .get(header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let items: Vec<FfCalendarRaw> = resp
        .json()
        .await
        .map_err(|e| (Some(200), e.to_string()))?;

    let now = Utc::now();
    let fetched_at = now.to_rfc3339();
    let expires_at = (now + Duration::seconds(MIN_CALENDAR_TTL_SECS)).to_rfc3339();

    let mut tx = pool.begin().await.map_err(|e| (None, e.to_string()))?;
    let mut inserted_any = false;

    for item in items {
        let Some(impact) = normalize_impact(&item.impact) else {
            continue;
        };
        let Ok(parsed_dt) = chrono::DateTime::parse_from_rfc3339(&item.date) else {
            continue;
        };
        let utc_iso = parsed_dt.with_timezone(&Utc).to_rfc3339();
        let country = item.country.trim().to_uppercase();
        let title = item.title.trim().to_string();
        if country.is_empty() || title.is_empty() {
            continue;
        }

        let source_hash = sha256_hex(&format!("{title}|{country}|{utc_iso}"));
        let id = next_ulid_style_id("ev");

        sqlx::query(
            r#"
            INSERT INTO economic_events (
                id, provider, title, country, event_datetime, impact,
                forecast, previous, actual, source_hash, fetched_at, expires_at
            )
            VALUES (?1, 'faireconomy', ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10)
            ON CONFLICT(source_hash) DO UPDATE SET
                impact     = excluded.impact,
                forecast   = COALESCE(excluded.forecast, economic_events.forecast),
                previous   = COALESCE(excluded.previous, economic_events.previous),
                fetched_at = excluded.fetched_at,
                expires_at = excluded.expires_at
            "#,
        )
        .bind(id)
        .bind(title)
        .bind(country)
        .bind(utc_iso)
        .bind(impact)
        .bind(clean_opt(item.forecast))
        .bind(clean_opt(item.previous))
        .bind(source_hash)
        .bind(&fetched_at)
        .bind(&expires_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| (None, e.to_string()))?;

        inserted_any = true;
    }

    tx.commit().await.map_err(|e| (None, e.to_string()))?;
    Ok((inserted_any, next_etag, status))
}

pub async fn sync_calendar(
    pool: &SqlitePool,
    client: &Client,
    force_bypass_ttl: bool,
) -> Result<bool, String> {
    let state = get_fetch_state(pool, PROVIDER_ID)
        .await
        .map_err(|e| e.to_string())?;
    let now = Utc::now();

    // Even when force_bypass_ttl is true, enforce a hard 15-minute cooldown between manual
    // Fair Economy pulls unless zero data has ever been fetched, plus honor active backoff.
    if let Some(ref st) = state {
        if let Some(backoff) = st.backoff_until {
            if now < backoff {
                return Ok(false);
            }
        }
        if !force_bypass_ttl && !should_fetch_now(&state, now, false) {
            return Ok(false);
        }
        if force_bypass_ttl {
            if let Some(next_at) = st.next_fetch_at {
                let last_est = next_at - Duration::seconds(MIN_CALENDAR_TTL_SECS);
                if now < last_est + Duration::seconds(900) {
                    return Ok(false);
                }
            }
        }
    }

    let prev_failures = state.as_ref().map(|s| s.consecutive_failures).unwrap_or(0);
    let prev_etag = state.as_ref().and_then(|s| s.last_etag.as_deref());

    match fetch_url_into_db(pool, client, THIS_WEEK_URL, prev_etag).await {
        Ok((changed, next_etag, status)) => {
            let mut any_changed = changed;
            // On Fri/Sat/Sun, also pull nextweek JSON so Monday Red-Folder previews appear cleanly.
            let wd = now.weekday();
            if matches!(wd, Weekday::Fri | Weekday::Sat | Weekday::Sun) {
                if let Ok((next_changed, _, _)) =
                    fetch_url_into_db(pool, client, NEXT_WEEK_URL, None).await
                {
                    any_changed = any_changed || next_changed;
                }
            }

            let _ = record_fetch_success(
                pool,
                PROVIDER_ID,
                next_etag,
                status.as_u16() as i64,
                MIN_CALENDAR_TTL_SECS,
            )
            .await;
            Ok(any_changed)
        }
        Err((status, _err)) => {
            let _ = record_fetch_failure(pool, PROVIDER_ID, status, prev_failures).await;
            Ok(false)
        }
    }
}
