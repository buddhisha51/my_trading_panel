use sqlx::SqlitePool;

const MIGRATION_001_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL DEFAULT '',
    body_json     TEXT NOT NULL,
    body_text     TEXT NOT NULL DEFAULT '',
    canvas_json   TEXT,
    tags          TEXT NOT NULL DEFAULT '[]',
    pair          TEXT,
    session       TEXT,
    is_pinned     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title, body_text, tags,
    content='notes',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, body_text, tags)
    VALUES (new.rowid, new.title, new.body_text, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body_text, tags)
    VALUES ('delete', old.rowid, old.title, old.body_text, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body_text, tags)
    VALUES ('delete', old.rowid, old.title, old.body_text, old.tags);
    INSERT INTO notes_fts(rowid, title, body_text, tags)
    VALUES (new.rowid, new.title, new.body_text, new.tags);
END;

CREATE TABLE IF NOT EXISTS note_attachments (
    id          TEXT PRIMARY KEY,
    note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    width       INTEGER,
    height      INTEGER,
    size_bytes  INTEGER NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategies (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT,
    body_json     TEXT NOT NULL,
    canvas_json   TEXT,
    tags          TEXT NOT NULL DEFAULT '[]',
    is_active     INTEGER NOT NULL DEFAULT 1,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_templates (
    id            TEXT PRIMARY KEY,
    strategy_id   TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_required   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_attachments (
    id            TEXT PRIMARY KEY,
    strategy_id   TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
    id                 TEXT PRIMARY KEY,
    pair               TEXT NOT NULL,
    direction          TEXT NOT NULL CHECK(direction IN ('long','short')),
    entry_price        REAL,
    stop_loss          REAL,
    take_profit        REAL,
    lot_size           REAL,
    outcome            TEXT CHECK(outcome IN ('win','loss','breakeven','partial')),
    pnl_dollars        REAL,
    r_multiple         REAL,
    strategy_id        TEXT REFERENCES strategies(id) ON DELETE SET NULL,
    notes              TEXT,
    screenshot_path    TEXT,
    checklist_snapshot TEXT,
    setup_grade        TEXT,
    entry_time         TEXT,
    exit_time          TEXT,
    session            TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ongoing_trades (
    id              TEXT PRIMARY KEY,
    pair            TEXT NOT NULL,
    direction       TEXT NOT NULL CHECK(direction IN ('long','short')),
    entry_price     REAL NOT NULL,
    stop_loss       REAL,
    take_profit     REAL,
    lot_size        REAL,
    status          TEXT NOT NULL DEFAULT 'running'
                    CHECK(status IN ('running','moved_to_be','partials_taken','pending')),
    notes           TEXT,
    strategy_id     TEXT REFERENCES strategies(id) ON DELETE SET NULL,
    opened_at       TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equity_snapshots (
    id              TEXT PRIMARY KEY,
    date            TEXT NOT NULL UNIQUE,
    balance         REAL NOT NULL,
    daily_pnl       REAL NOT NULL DEFAULT 0,
    daily_drawdown  REAL,
    max_drawdown    REAL,
    win_count       INTEGER NOT NULL DEFAULT 0,
    loss_count      INTEGER NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_profile (
    id               TEXT PRIMARY KEY DEFAULT 'default',
    account_name     TEXT NOT NULL DEFAULT 'My Account',
    starting_balance REAL NOT NULL DEFAULT 0,
    current_balance  REAL NOT NULL DEFAULT 0,
    high_water_mark  REAL NOT NULL DEFAULT 0,
    currency         TEXT NOT NULL DEFAULT 'USD',
    dd_mode          TEXT NOT NULL DEFAULT 'static' CHECK(dd_mode IN ('static','trailing')),
    daily_dd_limit   REAL,
    max_dd_limit     REAL,
    updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_bias (
    id              TEXT PRIMARY KEY,
    pair            TEXT NOT NULL,
    date            TEXT NOT NULL,
    bias_daily      TEXT CHECK(bias_daily IN ('bullish','bearish','range')),
    bias_4h         TEXT CHECK(bias_4h IN ('bullish','bearish','range')),
    bias_15m        TEXT CHECK(bias_15m IN ('bullish','bearish','range')),
    pdh             REAL,
    pdl             REAL,
    asian_high      REAL,
    asian_low       REAL,
    dol_notes       TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(pair, date)
);

CREATE TABLE IF NOT EXISTS economic_events (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL DEFAULT 'faireconomy',
    title           TEXT NOT NULL,
    country         TEXT NOT NULL,
    event_datetime  TEXT NOT NULL,
    impact          TEXT NOT NULL CHECK(impact IN ('high','medium','low')),
    forecast        TEXT,
    previous        TEXT,
    actual          TEXT,
    source_hash     TEXT NOT NULL UNIQUE,
    fetched_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_econ_events_datetime ON economic_events(event_datetime);
CREATE INDEX IF NOT EXISTS idx_econ_events_country  ON economic_events(country);
CREATE INDEX IF NOT EXISTS idx_econ_events_impact   ON economic_events(impact);

CREATE TABLE IF NOT EXISTS news_items (
    id                 TEXT PRIMARY KEY,
    provider           TEXT NOT NULL,
    source_name        TEXT NOT NULL,
    category           TEXT NOT NULL CHECK(category IN ('forex','crypto','macro')),
    title              TEXT NOT NULL,
    url                TEXT NOT NULL,
    published_at       TEXT NOT NULL,
    url_hash           TEXT NOT NULL UNIQUE,
    title_hash         TEXT NOT NULL,
    related_currencies TEXT NOT NULL DEFAULT '[]',
    fetched_at         TEXT NOT NULL,
    expires_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_category  ON news_items(category);
CREATE INDEX IF NOT EXISTS idx_news_provider  ON news_items(provider);

CREATE TABLE IF NOT EXISTS rss_feeds (
    id              TEXT PRIMARY KEY,
    url             TEXT NOT NULL UNIQUE,
    label           TEXT NOT NULL,
    category        TEXT NOT NULL DEFAULT 'forex' CHECK(category IN ('forex','crypto','macro')),
    is_enabled      INTEGER NOT NULL DEFAULT 1,
    poll_interval_s INTEGER NOT NULL DEFAULT 600,
    last_fetched_at TEXT,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fetch_metadata (
    provider             TEXT PRIMARY KEY,
    last_fetched_at      TEXT NOT NULL,
    last_etag            TEXT,
    last_status          INTEGER,
    next_fetch_at        TEXT NOT NULL,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    backoff_until        TEXT
);

CREATE TABLE IF NOT EXISTS widget_layout (
    widget_id       TEXT PRIMARY KEY,
    is_visible      INTEGER NOT NULL DEFAULT 1,
    is_collapsed    INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    custom_height   INTEGER
);
"#;

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::raw_sql(MIGRATION_001_SQL).execute(&mut *tx).await?;
    sqlx::query("INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}
