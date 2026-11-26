use chrono::Utc;
use reqwest::{header, Client, StatusCode};
use sqlx::{Row, SqlitePool};

use super::fetch_metadata::{
    get_fetch_state, record_fetch_failure, record_fetch_success, should_fetch_now,
};
use super::{extract_currencies_from_text, upsert_news_item_dedup};

struct FeedRow {
    id: String,
    url: String,
    label: String,
    category: String,
    poll_interval_s: i64,
}

pub async fn sync_all_enabled_feeds(
    pool: &SqlitePool,
    client: &Client,
    force_bypass_ttl: bool,
) -> Result<bool, String> {
    let rows = sqlx::query(
        "SELECT id, url, label, category, poll_interval_s FROM rss_feeds WHERE is_enabled = 1",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut feeds = Vec::with_capacity(rows.len());
    for r in rows {
        feeds.push(FeedRow {
            id: r.try_get("id").map_err(|e| e.to_string())?,
            url: r.try_get("url").map_err(|e| e.to_string())?,
            label: r.try_get("label").map_err(|e| e.to_string())?,
            category: r.try_get("category").map_err(|e| e.to_string())?,
            poll_interval_s: r.try_get("poll_interval_s").unwrap_or(600),
        });
    }

    let mut any_updated = false;
    for feed in feeds {
        let meta_key = format!("rss:{}", feed.id);
        let state = get_fetch_state(pool, &meta_key)
            .await
            .map_err(|e| e.to_string())?;
        let now = Utc::now();
        if !should_fetch_now(&state, now, force_bypass_ttl) {
            continue;
        }

        let prev_failures = state.as_ref().map(|s| s.consecutive_failures).unwrap_or(0);
        let ttl = feed.poll_interval_s.max(300);

        let mut req = client.get(&feed.url);
        if let Some(tag) = state.as_ref().and_then(|s| s.last_etag.as_deref()) {
            req = req.header(header::IF_NONE_MATCH, tag);
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(_) => {
                let _ = record_fetch_failure(pool, &meta_key, None, prev_failures).await;
                continue;
            }
        };

        let status = resp.status();
        if status == StatusCode::NOT_MODIFIED {
            let _ = record_fetch_success(pool, &meta_key, None, 304, ttl).await;
            continue;
        }
        if !status.is_success() {
            let _ = record_fetch_failure(
                pool,
                &meta_key,
                Some(status.as_u16() as i64),
                prev_failures,
            )
            .await;
            continue;
        }

        let next_etag = resp
            .headers()
            .get(header::ETAG)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let Ok(bytes) = resp.bytes().await else {
            let _ = record_fetch_failure(pool, &meta_key, Some(200), prev_failures).await;
            continue;
        };

        let Ok(parsed_feed) = feed_rs::parser::parse(bytes.as_ref()) else {
            let _ = record_fetch_failure(pool, &meta_key, Some(200), prev_failures).await;
            continue;
        };

        let provider_tag = if feed.id.starts_with("rss_") {
            feed.id.trim_start_matches("rss_")
        } else {
            "custom_rss"
        };

        for entry in parsed_feed.entries.into_iter().take(35) {
            let Some(title) = entry.title.map(|t| t.content) else {
                continue;
            };
            let Some(link) = entry.links.into_iter().next().map(|l| l.href) else {
                continue;
            };
            let published_at = entry
                .published
                .or(entry.updated)
                .unwrap_or_else(Utc::now)
                .to_rfc3339();
            let currencies = extract_currencies_from_text(&title);

            let _ = upsert_news_item_dedup(
                pool,
                provider_tag,
                &feed.label,
                &feed.category,
                &title,
                &link,
                &published_at,
                &currencies,
                ttl,
            )
            .await;
        }

        let _ = sqlx::query("UPDATE rss_feeds SET last_fetched_at = ?1 WHERE id = ?2")
            .bind(Utc::now().to_rfc3339())
            .bind(&feed.id)
            .execute(pool)
            .await;

        let _ = record_fetch_success(pool, &meta_key, next_etag, 200, ttl).await;
        any_updated = true;
    }

    Ok(any_updated)
}
