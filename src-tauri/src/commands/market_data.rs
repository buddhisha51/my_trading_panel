use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::{AppHandle, State};

use super::db_ops::DbState;
use crate::fetchers::{build_http_client, next_ulid_style_id, sha256_hex, sync_all_providers};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EconomicEventRecord {
    pub id: String,
    pub provider: String,
    pub title: String,
    pub country: String,
    pub event_datetime: String,
    pub impact: String,
    pub forecast: Option<String>,
    pub previous: Option<String>,
    pub actual: Option<String>,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualEventInput {
    pub title: String,
    pub country: String,
    pub event_datetime: String,
    pub impact: String,
    pub forecast: Option<String>,
    pub previous: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItemRecord {
    pub id: String,
    pub provider: String,
    pub source_name: String,
    pub category: String,
    pub title: String,
    pub url: String,
    pub published_at: String,
    pub related_currencies: Vec<String>,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RssFeedRecord {
    pub id: String,
    pub url: String,
    pub label: String,
    pub category: String,
    pub is_enabled: bool,
    pub poll_interval_s: i64,
    pub last_fetched_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertRssFeedInput {
    pub id: Option<String>,
    pub url: String,
    pub label: String,
    pub category: String,
    pub is_enabled: bool,
    pub poll_interval_s: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchMetadataRecord {
    pub provider: String,
    pub last_fetched_at: String,
    pub last_status: Option<i64>,
    pub next_fetch_at: String,
    pub consecutive_failures: i64,
    pub backoff_until: Option<String>,
}

#[tauri::command]
pub async fn get_economic_events(
    state: State<'_, DbState>,
    countries: Option<Vec<String>>,
    impacts: Option<Vec<String>>,
) -> Result<Vec<EconomicEventRecord>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, provider, title, country, event_datetime, impact,
               forecast, previous, actual, fetched_at, expires_at
        FROM economic_events
        ORDER BY event_datetime ASC
        LIMIT 500
        "#,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let c_filter = countries.map(|list| {
        list.into_iter()
            .map(|c| c.trim().to_uppercase())
            .collect::<Vec<_>>()
    });
    let i_filter = impacts.map(|list| {
        list.into_iter()
            .map(|i| i.trim().to_lowercase())
            .collect::<Vec<_>>()
    });

    let mut out = Vec::new();
    for r in rows {
        let country: String = r.try_get("country").map_err(|e| e.to_string())?;
        let impact: String = r.try_get("impact").map_err(|e| e.to_string())?;
        if let Some(ref cf) = c_filter {
            if !cf.is_empty() && !cf.contains(&country.to_uppercase()) {
                continue;
            }
        }
        if let Some(ref imf) = i_filter {
            if !imf.is_empty() && !imf.contains(&impact.to_lowercase()) {
                continue;
            }
        }
        out.push(EconomicEventRecord {
            id: r.try_get("id").map_err(|e| e.to_string())?,
            provider: r.try_get("provider").map_err(|e| e.to_string())?,
            title: r.try_get("title").map_err(|e| e.to_string())?,
            country,
            event_datetime: r.try_get("event_datetime").map_err(|e| e.to_string())?,
            impact,
            forecast: r.try_get("forecast").map_err(|e| e.to_string())?,
            previous: r.try_get("previous").map_err(|e| e.to_string())?,
            actual: r.try_get("actual").map_err(|e| e.to_string())?,
            fetched_at: r.try_get("fetched_at").map_err(|e| e.to_string())?,
            expires_at: r.try_get("expires_at").map_err(|e| e.to_string())?,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn add_manual_economic_event(
    state: State<'_, DbState>,
    input: ManualEventInput,
) -> Result<EconomicEventRecord, String> {
    let title = input.title.trim().to_string();
    let country = input.country.trim().to_uppercase();
    if title.is_empty() || country.is_empty() {
        return Err("Title and currency country code are required".to_string());
    }
    let impact = match input.impact.to_lowercase().as_str() {
        "high" | "medium" | "low" => input.impact.to_lowercase(),
        other => return Err(format!("Invalid impact: {other}")),
    };
    let parsed_dt = chrono::DateTime::parse_from_rfc3339(&input.event_datetime)
        .map_err(|e| format!("Invalid ISO datetime: {e}"))?;
    let utc_iso = parsed_dt.with_timezone(&Utc).to_rfc3339();

    let id = next_ulid_style_id("ev");
    let now = Utc::now();
    let fetched_at = now.to_rfc3339();
    let expires_at = (now + Duration::days(30)).to_rfc3339();
    let source_hash = sha256_hex(&format!("manual|{title}|{country}|{utc_iso}"));

    sqlx::query(
        r#"
        INSERT INTO economic_events (
            id, provider, title, country, event_datetime, impact,
            forecast, previous, actual, source_hash, fetched_at, expires_at
        )
        VALUES (?1, 'manual', ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10)
        "#,
    )
    .bind(&id)
    .bind(&title)
    .bind(&country)
    .bind(&utc_iso)
    .bind(&impact)
    .bind(&input.forecast)
    .bind(&input.previous)
    .bind(source_hash)
    .bind(&fetched_at)
    .bind(&expires_at)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(EconomicEventRecord {
        id,
        provider: "manual".to_string(),
        title,
        country,
        event_datetime: utc_iso,
        impact,
        forecast: input.forecast,
        previous: input.previous,
        actual: None,
        fetched_at,
        expires_at,
    })
}

#[tauri::command]
pub async fn delete_economic_event(state: State<'_, DbState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM economic_events WHERE id = ?1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_news_items(
    state: State<'_, DbState>,
    categories: Option<Vec<String>>,
    limit: Option<i64>,
) -> Result<Vec<NewsItemRecord>, String> {
    let lim = limit.unwrap_or(100).clamp(1, 300);
    let rows = sqlx::query(
        r#"
        SELECT id, provider, source_name, category, title, url,
               published_at, related_currencies, fetched_at, expires_at
        FROM news_items
        ORDER BY published_at DESC
        LIMIT ?1
        "#,
    )
    .bind(lim)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let c_filter = categories.map(|v| {
        v.into_iter()
            .map(|c| c.trim().to_lowercase())
            .collect::<Vec<_>>()
    });

    let mut out = Vec::new();
    for r in rows {
        let category: String = r.try_get("category").map_err(|e| e.to_string())?;
        if let Some(ref cf) = c_filter {
            if !cf.is_empty() && !cf.contains(&category.to_lowercase()) {
                continue;
            }
        }
        let cur_raw: String = r.try_get("related_currencies").unwrap_or_else(|_| "[]".into());
        let related_currencies = serde_json::from_str::<Vec<String>>(&cur_raw).unwrap_or_default();

        out.push(NewsItemRecord {
            id: r.try_get("id").map_err(|e| e.to_string())?,
            provider: r.try_get("provider").map_err(|e| e.to_string())?,
            source_name: r.try_get("source_name").map_err(|e| e.to_string())?,
            category,
            title: r.try_get("title").map_err(|e| e.to_string())?,
            url: r.try_get("url").map_err(|e| e.to_string())?,
            published_at: r.try_get("published_at").map_err(|e| e.to_string())?,
            related_currencies,
            fetched_at: r.try_get("fetched_at").map_err(|e| e.to_string())?,
            expires_at: r.try_get("expires_at").map_err(|e| e.to_string())?,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn list_rss_feeds(state: State<'_, DbState>) -> Result<Vec<RssFeedRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, url, label, category, is_enabled, poll_interval_s, last_fetched_at, created_at FROM rss_feeds ORDER BY created_at ASC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|r| {
            Ok(RssFeedRecord {
                id: r.try_get("id").map_err(|e| e.to_string())?,
                url: r.try_get("url").map_err(|e| e.to_string())?,
                label: r.try_get("label").map_err(|e| e.to_string())?,
                category: r.try_get("category").map_err(|e| e.to_string())?,
                is_enabled: r.try_get::<i64, _>("is_enabled").map_err(|e| e.to_string())? != 0,
                poll_interval_s: r.try_get("poll_interval_s").map_err(|e| e.to_string())?,
                last_fetched_at: r.try_get("last_fetched_at").map_err(|e| e.to_string())?,
                created_at: r.try_get("created_at").map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn upsert_rss_feed(
    state: State<'_, DbState>,
    input: UpsertRssFeedInput,
) -> Result<RssFeedRecord, String> {
    let url = input.url.trim().to_string();
    let label = input.label.trim().to_string();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("RSS URL must begin with http:// or https://".to_string());
    }
    if label.is_empty() {
        return Err("RSS label cannot be empty".to_string());
    }
    let category = match input.category.as_str() {
        "forex" | "crypto" | "macro" => input.category,
        other => return Err(format!("Invalid category: {other}")),
    };
    let id = input
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| next_ulid_style_id("rss_custom"));
    let interval = input.poll_interval_s.unwrap_or(600).max(300);

    sqlx::query(
        r#"
        INSERT INTO rss_feeds (id, url, label, category, is_enabled, poll_interval_s, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            url             = excluded.url,
            label           = excluded.label,
            category        = excluded.category,
            is_enabled      = excluded.is_enabled,
            poll_interval_s = excluded.poll_interval_s
        "#,
    )
    .bind(&id)
    .bind(&url)
    .bind(&label)
    .bind(&category)
    .bind(if input.is_enabled { 1 } else { 0 })
    .bind(interval)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let r = sqlx::query(
        "SELECT id, url, label, category, is_enabled, poll_interval_s, last_fetched_at, created_at FROM rss_feeds WHERE id = ?1",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(RssFeedRecord {
        id: r.try_get("id").map_err(|e| e.to_string())?,
        url: r.try_get("url").map_err(|e| e.to_string())?,
        label: r.try_get("label").map_err(|e| e.to_string())?,
        category: r.try_get("category").map_err(|e| e.to_string())?,
        is_enabled: r.try_get::<i64, _>("is_enabled").map_err(|e| e.to_string())? != 0,
        poll_interval_s: r.try_get("poll_interval_s").map_err(|e| e.to_string())?,
        last_fetched_at: r.try_get("last_fetched_at").map_err(|e| e.to_string())?,
        created_at: r.try_get("created_at").map_err(|e| e.to_string())?,
    })
}

#[tauri::command]
pub async fn delete_rss_feed(state: State<'_, DbState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM rss_feeds WHERE id = ?1")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_fetch_metadata(
    state: State<'_, DbState>,
) -> Result<Vec<FetchMetadataRecord>, String> {
    let rows = sqlx::query(
        "SELECT provider, last_fetched_at, last_status, next_fetch_at, consecutive_failures, backoff_until FROM fetch_metadata ORDER BY provider ASC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|r| {
            Ok(FetchMetadataRecord {
                provider: r.try_get("provider").map_err(|e| e.to_string())?,
                last_fetched_at: r.try_get("last_fetched_at").map_err(|e| e.to_string())?,
                last_status: r.try_get("last_status").map_err(|e| e.to_string())?,
                next_fetch_at: r.try_get("next_fetch_at").map_err(|e| e.to_string())?,
                consecutive_failures: r.try_get("consecutive_failures").map_err(|e| e.to_string())?,
                backoff_until: r.try_get("backoff_until").map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn trigger_market_sync(
    state: State<'_, DbState>,
    app: AppHandle,
    force: Option<bool>,
) -> Result<(), String> {
    let client = build_http_client();
    sync_all_providers(&state.pool, &client, &app, force.unwrap_or(false)).await;
    Ok(())
}
