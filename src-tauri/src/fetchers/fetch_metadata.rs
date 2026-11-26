use chrono::{DateTime, Duration, Utc};
use sqlx::{Row, SqlitePool};

#[derive(Debug, Clone)]
pub struct FetchState {
    pub last_etag: Option<String>,
    pub next_fetch_at: Option<DateTime<Utc>>,
    pub consecutive_failures: i64,
    pub backoff_until: Option<DateTime<Utc>>,
}

pub async fn get_fetch_state(
    pool: &SqlitePool,
    provider: &str,
) -> Result<Option<FetchState>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT last_etag, next_fetch_at, consecutive_failures, backoff_until FROM fetch_metadata WHERE provider = ?1",
    )
    .bind(provider)
    .fetch_optional(pool)
    .await?;

    let Some(r) = row else {
        return Ok(None);
    };

    let last_etag: Option<String> = r.try_get("last_etag").ok().flatten();
    let next_raw: String = r.try_get("next_fetch_at").unwrap_or_default();
    let backoff_raw: Option<String> = r.try_get("backoff_until").ok().flatten();
    let consecutive_failures: i64 = r.try_get("consecutive_failures").unwrap_or(0);

    Ok(Some(FetchState {
        last_etag,
        next_fetch_at: DateTime::parse_from_rfc3339(&next_raw)
            .ok()
            .map(|d| d.with_timezone(&Utc)),
        consecutive_failures,
        backoff_until: backoff_raw
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|d| d.with_timezone(&Utc)),
    }))
}

/// Checks whether a provider is allowed to fetch right now.
/// Never bypasses active rate-limit backoff; only bypasses fresh TTL when `force_bypass_ttl` is true
/// and `respect_hard_floor` is false (or past minimum floor).
pub fn should_fetch_now(
    state: &Option<FetchState>,
    now: DateTime<Utc>,
    force_bypass_ttl: bool,
) -> bool {
    let Some(st) = state else {
        return true;
    };

    if let Some(backoff) = st.backoff_until {
        if now < backoff {
            return false;
        }
    }

    if force_bypass_ttl {
        return true;
    }

    match st.next_fetch_at {
        Some(next_at) => now >= next_at,
        None => true,
    }
}

pub async fn record_fetch_success(
    pool: &SqlitePool,
    provider: &str,
    etag: Option<String>,
    status: i64,
    ttl_seconds: i64,
) -> Result<(), sqlx::Error> {
    let now = Utc::now();
    let next_at = now + Duration::seconds(ttl_seconds.max(60));
    sqlx::query(
        r#"
        INSERT INTO fetch_metadata (
            provider, last_fetched_at, last_etag, last_status,
            next_fetch_at, consecutive_failures, backoff_until
        )
        VALUES (?1, ?2, ?3, ?4, ?5, 0, NULL)
        ON CONFLICT(provider) DO UPDATE SET
            last_fetched_at      = excluded.last_fetched_at,
            last_etag            = COALESCE(excluded.last_etag, fetch_metadata.last_etag),
            last_status          = excluded.last_status,
            next_fetch_at        = excluded.next_fetch_at,
            consecutive_failures = 0,
            backoff_until        = NULL
        "#,
    )
    .bind(provider)
    .bind(now.to_rfc3339())
    .bind(etag)
    .bind(status)
    .bind(next_at.to_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}

/// Exponential backoff on 429/5xx/network failure: min(2^failures * 60s, 3600s).
pub async fn record_fetch_failure(
    pool: &SqlitePool,
    provider: &str,
    status: Option<i64>,
    prev_failures: i64,
) -> Result<(), sqlx::Error> {
    let failures = (prev_failures + 1).min(10);
    let backoff_secs = (1i64 << (failures - 1).min(6))
        .saturating_mul(60)
        .min(3600);
    let now = Utc::now();
    let backoff_until = now + Duration::seconds(backoff_secs);

    sqlx::query(
        r#"
        INSERT INTO fetch_metadata (
            provider, last_fetched_at, last_status, next_fetch_at,
            consecutive_failures, backoff_until
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?4)
        ON CONFLICT(provider) DO UPDATE SET
            last_fetched_at      = excluded.last_fetched_at,
            last_status          = COALESCE(excluded.last_status, fetch_metadata.last_status),
            next_fetch_at        = excluded.next_fetch_at,
            consecutive_failures = excluded.consecutive_failures,
            backoff_until        = excluded.backoff_until
        "#,
    )
    .bind(provider)
    .bind(now.to_rfc3339())
    .bind(status)
    .bind(backoff_until.to_rfc3339())
    .bind(failures)
    .execute(pool)
    .await?;

    Ok(())
}
