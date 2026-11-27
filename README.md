# ICT / SMC Trading Panel

A lightweight, always-on-top, slide-out Windows desktop trading companion engineered for **Inner Circle Trader (ICT)** and **Smart Money Concepts (SMC)** traders working alongside TradingView, MetaTrader 5, or cTrader.

Built with **Tauri v2**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **Konva**, **TipTap**, and **SQLite**.

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D6?logo=windows)](https://github.com/buddhisha51/my_trading_panel/releases)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri)](https://v2.tauri.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Table of Contents

- [Core Window & Shell Features](#core-window--shell-features)
- [10 Modular Widgets](#10-modular-widgets)
- [ICT Drawing Canvas & Markup Guide](#ict-drawing-canvas--markup-guide)
- [Settings Overview (6 Tabs)](#settings-overview-6-tabs)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Installing on Windows (GitHub Releases)](#installing-on-windows-github-releases)
- [Backup, Restore & Moving to a New PC](#backup-restore--moving-to-a-new-pc)
- [Local Development & Build Guide](#local-development--build-guide)
- [Cutting a Release (GitHub Actions)](#cutting-a-release-github-actions)
- [Data Storage & Privacy](#data-storage--privacy)
- [License](#license)

---

## Core Window & Shell Features

- **4-Edge Multi-Monitor Docking:** Drag the titlebar grip (`⋮⋮`) across displays and release near **Left, Right, Top, or Bottom** of any monitor work area (`rcWork`), respecting the Windows taskbar and mixed-DPI scaling. Automatically falls back to the primary monitor if a display is disconnected.
- **Adaptive Vertical & Horizontal Layouts:**
  - **Left / Right Edges:** Widgets stack vertically with per-widget bottom height resize handles (`120px–1200px`).
  - **Top / Bottom Edges:** Widgets arrange horizontally side-by-side with right-edge width resize handles (`240px–900px`), mouse-wheel horizontal scrolling, and scroll position preservation across dock/tab transitions.
- **Hover-to-Slide Edge Strip:** Collapses into a low-profile edge strip featuring a live **Killzone / Session** status indicator dot and expands smoothly via GPU-composited CSS `transform: translate3d(...)` animations with configurable hover open/close debounces.
- **Smart Pin & Auto-Lock:** Pin open manually (`Ctrl + Shift + P`) or rely on automatic expansion locking while typing notes, drawing on the ICT canvas, editing checklists, or adjusting settings.
- **Full-Screen Review Workspace:** Expand to full screen (`Ctrl + Shift + F`) for multi-column post-session journaling and chart markup, then press `Esc` or toggle back to return to your docked edge.
- **Non-Activating Focus Discipline & Screen-Recording Compatibility:** Uses `WS_EX_TOOLWINDOW` + conditional `WS_EX_NOACTIVATE` so collapsed/hover states never steal focus from your charts while keeping `HWND_TOPMOST` Z-order. Because capture exclusion (`WDA_EXCLUDEFROMCAPTURE`) is **not** set, OBS Studio, Windows Game Bar, and screen recorders capture the always-on-top panel normally alongside your charts.

---

## 10 Modular Widgets

All widgets can be reordered (drag-and-drop or up/down arrows), toggled on/off, collapsed in place, and custom-sized per dock orientation:

1. **ICT Killzones & Macros:** Live `America/New_York` countdowns for Asian, London Open, NY AM (`07:00–10:00`), NY Indices AM (`09:30–11:00`), London Close, Silver Bullet windows, NY Midnight Open (`00:00 NY`), and customizable ICT Macro intervals.
2. **Forex Session Clocks:** Local market hours for Sydney (`08:00–17:00`), Tokyo (`09:00–18:00`), London (`08:00–17:00`), and New York (`08:00–17:00`) with active session overlap tracking.
3. **Daily Bias Quick-Strip:** Track `MN / W1 / D1 / H4 / H1` directional bias (with Monthly & Weekly period scoping across dates), PDH / PDL / Asian liquidity notes, and custom watchlist pairs.
4. **Risk & Lot Size Calculator:** Instant lot sizing, tick/pip risk math, and R-multiple calculations across Forex majors, JPY crosses, XAUUSD, and US indices with editable instrument specifications.
5. **Quick Notes & Canvas:** TipTap rich text notes + Windows native snipping (`ms-screenclip:` & `Ctrl + V` paste) + lazy-loaded interactive Konva **ICT Drawing Canvas** with SVG card thumbnails.
6. **Strategies & Playbooks:** Build custom trade models with rich descriptions, ICT canvas diagrams, and interactive confluence checklists that live-grade setups (`A+`, `A`, `B`, `C`).
7. **Ongoing Trades Monitor:** Track active positions live with **Entry Time**, real-time **Elapsed Running Duration**, smart missing **SL/TP** warnings (plus inline quick-fix & 15m market-check notification reminders), and one-click closure directly into the Trade Journal.
8. **Trade Journal & Equity:** Manual trade log, win rate, profit factor, R-multiple stats, SVG equity curve, and Prop Firm drawdown alerts (Daily DD %, Max DD %, Static vs. Trailing High-Water Mark).
9. **Economic Calendar:** Rust-fetched, SQLite-cached economic events (`nfs.faireconomy.media`) with currency/impact filters and `<= 15m` Red-Folder volatility alerts.
10. **Forex & Crypto News:** SQLite-cached feeds from CryptoCompare, ForexLive RSS, FXStreet RSS, Cointelegraph RSS, custom user RSS URLs, and optional Finnhub integration (API key stored securely in Windows Credential Manager).

---

## ICT Drawing Canvas & Markup Guide

Available inside both **Quick Notes & Canvas** and **Strategies & Playbooks**, backed by full undo/redo history (`Ctrl + Z` / `Ctrl + Shift + Z`), shape color swatches, and miniature previews:

| Tool | Behavior |
| :--- | :--- |
| **`Sel`** | Select, drag, resize (`Transformer`), or delete (`Delete` / `Backspace`) any shape or pasted image |
| **`Pen`** | Freehand markup |
| **`Candle`** | Drag **up** for a bullish candle or **down** for a bearish candle with proportional wicks |
| **`Rect`** | General shaded rectangle box |
| **`FVG` / `IFVG` / `BPR`** | Fair Value Gap, Inversion FVG & Balanced Price Range (overlapped FVG) zones |
| **`OB` / `BB`** | Order Block & Breaker Block shaded zones |
| **`Liq`** | Liquidity trendline tagged `$$$`, `BSL`, or `SSL` |
| **`H-Line` / `V-Line`** | 1-click horizontal or vertical level lines |
| **`Channel`** | Parallel price channel |
| **`MSS` / `CISD`** | Market Structure Shift & Change in State of Delivery arrows (**1-click** places horizontally; **drag** draws angled) |
| **`Fib`** | Fibonacci retracement (`0 – 1`, customizable levels & highlight pocket) |
| **`OTE`** | ICT Optimal Trade Entry Fib (`0.62 / 0.705 / 0.79`, customizable levels & sweet spot color) |
| **`Text`** | Click canvas to place text; double-click any text shape to edit inline |

**Screenshot & Snip Workflow:**
- Click **`Snip`** (or press `Ctrl + Shift + S`) to launch Windows Snipping Tool (`ms-screenclip:`).
- Press **`Ctrl + V`** (or click **`Paste`**) directly on the canvas to insert a movable, resizable screenshot layer (`ImageShape`) saved cleanly as a file in `$APPDATA/attachments/`.
- Or click **`Img`** to upload an existing PNG/JPG/WebP chart image onto the canvas background.

---

## Settings Overview (6 Tabs)

Open Settings via the gear icon or **`Ctrl + ,`**:

- **Dock:** Select target display, docked edge (`left` / `right` / `top` / `bottom`), expanded size (`px` or `%` up to `60%`), edge strip thickness, hover open/close delays, and slide animation duration.
- **Theme:** Accent color presets or custom color picker, panel surface opacity, edge strip opacity/color, and strip status indicator mode (`Killzone`, `Session`, or `Hidden`).
- **Time:** Display timezone, `24h` / `12h` clock format, dual NY reference clock toggle, and automatic IANA DST handling.
- **Zones:** Toggle Silver Bullets, ICT Macros, and NY Midnight Open line; edit start/end times and colors for every Killzone and Macro; or reset ICT defaults.
- **Keys:** Enable/pause and rebind global shortcuts with live conflict detection, open the Hotkey Cheat Sheet, toggle Windows toast notifications (**Killzone & Session start/end**, `<= 15m` Red-Folder news, and **15m Missing SL/TP trade reminders**), and run **Full Backup & Restore (`.zip`)**.
- **Widgets:** Reorder or hide widgets, set per-widget custom height (Left/Right docks) or width (Top/Bottom docks), customize **OTE & Fib** levels/colors/opacity, save an optional **Finnhub API key**, add/remove custom **RSS feeds**, and inspect local SQLite status.

---

## Keyboard Shortcuts

Press **`Ctrl + /`** (or click the keyboard icon in the titlebar/footer) anytime while the panel is open to open the in-app **Hotkey Reference Cheat Sheet**.

### Default Global Hotkeys (Work Over TradingView & MT5)

| Default Shortcut | Action |
| :--- | :--- |
| `Ctrl + Shift + T` | Toggle Slide Panel (Expand / Collapse) |
| `Ctrl + Shift + F` | Toggle Full-Screen Workspace |
| `Ctrl + Shift + S` | Quick Windows Screen Snip (`ms-screenclip:`) |
| `Ctrl + Shift + P` | Pin / Unpin Panel Open |

### In-App Panel, Canvas & Editor Shortcuts

| Shortcut | Scope | Action |
| :--- | :--- | :--- |
| `Ctrl + /` | Panel Navigation | Open / close Hotkey Cheat Sheet |
| `Ctrl + ,` | Panel Navigation | Open / close Panel Settings |
| `Esc` | Panel Navigation | Close Settings, Cheat Sheet, or exit Full-Screen |
| `Ctrl + Z` | ICT Drawing Canvas | Undo drawing step |
| `Ctrl + Shift + Z` | ICT Drawing Canvas | Redo drawing step |
| `Ctrl + V` | ICT Drawing Canvas | Paste clipboard screenshot onto canvas |
| `Delete` / `Backspace` | ICT Drawing Canvas | Remove selected shape or image |
| `Double-Click Text` | ICT Drawing Canvas | Edit existing text annotation |
| `Ctrl + V` | Rich Note Editor | Paste clipboard screenshot as Note attachment & markup |
| `Ctrl + B` / `I` / `U` | Rich Note Editor | Bold / Italic / Underline formatting |

---

## Installing on Windows (GitHub Releases)

1. Download the `*-setup.exe` NSIS installer (and optional `SHA256SUMS.txt`) from the [GitHub Releases](https://github.com/buddhisha51/my_trading_panel/releases) page.
2. Verify download integrity in PowerShell:
   ```powershell
   Get-FileHash .\ICT*setup.exe -Algorithm SHA256
   ```
   Confirm the printed SHA-256 hash matches `SHA256SUMS.txt`.
3. Run the installer (`currentUser` install — **no administrator privileges required**).
   - *SmartScreen note:* Because release binaries are currently unsigned, Windows SmartScreen may show **"Windows protected your PC"** on first launch. Click **More info → Run anyway** after verifying the SHA-256 checksum above.
4. On first run, the app initializes a clean, empty local SQLite database at `%APPDATA%\com.icttrading.panel\` — no personal developer data is ever bundled in the installer.

---

## Backup, Restore & Moving to a New PC

- **Export Backup:** Open **Settings → Keys → Full Backup & Restore (.zip)** and click **Export Backup**. This creates a portable `.zip` archive (saved under `%APPDATA%\com.icttrading.panel\backups\` and downloaded cleanly) containing:
  - `manifest.json` (`schemaVersion: 1`)
  - `database.json` covering all 13 user tables (`settings`, `widget_layout`, `daily_bias`, `notes`, `note_attachments`, `strategies`, `checklist_templates`, `strategy_attachments`, `account_profile`, `trades`, `ongoing_trades`, `equity_snapshots`, `rss_feeds`)
  - All screenshot attachment files from `attachments\`
- **Restore on Another Machine:** Install the app fresh on your new PC, open **Settings → Keys → Full Backup & Restore (.zip)**, select **`replace`** (for a clean mirror) or **`merge`** (to keep existing items and insert missing ones), and click **Import**.
- *(Note: Optional Finnhub API keys are stored in Windows Credential Manager via DPAPI and are excluded from `.zip` backups for security — re-enter your Finnhub key on the new PC if needed.)*

---

## Local Development & Build Guide

### Prerequisites (Windows)
1. **Node.js** (v20+)
2. **Rust Toolchain (`rustup`)** (`cargo` + `rustc` MSVC target)
3. **Visual Studio 2022 Build Tools** with **Desktop development with C++** (plus Windows 10/11 SDK)
4. **WebView2 Runtime** (pre-installed on Windows 11)

### Commands
> Note: On Windows PowerShell with restricted script execution policies, run `npm.cmd`.

```powershell
# Install frontend dependencies
npm.cmd install

# Browser preview mode (uses localStorage preview fallback outside Tauri)
npm.cmd run dev

# Type-check and build production frontend bundle
npm.cmd run build

# Run Vitest unit & component test suite
npm.cmd test

# Run Rust backend unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Launch native always-on-top Windows desktop panel in dev mode
npm.cmd run tauri dev

# Build local Windows NSIS setup executable
npm.cmd run tauri build
```

Local NSIS installer output is written to:
`src-tauri\target\release\bundle\nsis\ICT Trading Panel_<version>_x64-setup.exe`

### Project Structure

```text
├── .github/workflows/       # Windows CI (ci.yml) & Draft Release pipeline (release.yml)
├── src/
│   ├── components/
│   │   ├── canvas/          # Lazy-loaded Konva ICT DrawingCanvas & SVG CanvasMiniPreview
│   │   ├── editor/          # TipTap rich text editor
│   │   ├── settings/        # 6-tab SettingsOverlay + Backup/Restore & Fib/OTE editors
│   │   ├── shell/           # EdgeStrip, TitleBar, PanelContainer, WidgetStack, WidgetFrame, HotkeySheet
│   │   └── widgets/         # 10 modular trading widgets
│   ├── hooks/               # Auto-lock, display watcher, global shortcuts, scroll preservation
│   ├── services/            # Tauri IPC bridge + browser localStorage preview fallback
│   ├── stores/              # Zustand + Immer state stores
│   ├── types/               # Canvas, Dock, Hotkeys, Market, Risk, Settings, Time TypeScript types
│   └── utils/               # Geometry, timezone/killzone, drawdown, risk & validation helpers
└── src-tauri/
    ├── src/
    │   ├── commands/        # Tauri IPC handlers (windowing, backup, trades, notes, strategies, secrets)
    │   ├── db/              # SQLite pool & WAL migrations
    │   ├── docking/         # Win32 HWND_TOPMOST / WS_EX_* styles & multi-monitor work-area math
    │   └── fetchers/        # Background calendar (ForexFactory), CryptoCompare, Finnhub & RSS sync
    ├── capabilities/        # Tauri v2 ACL permissions
    └── tauri.conf.json      # App window config & NSIS bundle metadata
```

---

## Cutting a Release (GitHub Actions)

`package.json` is the single source of truth for the app version: the UI reads it directly via Vite (`__APP_VERSION__`), and `scripts/sync-version.mjs` keeps `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` in sync.

1. Bump, sync, commit, and tag in **one command** (or edit `package.json` and run `npm.cmd run version:sync`):
   ```powershell
   npm.cmd version patch   # or: npm.cmd version 0.1.2
   ```
2. *(Optional)* Test the release pipeline without creating a GitHub Release by running **Actions → Release (Windows NSIS)** (`workflow_dispatch`) with `dry_run: true` to upload the `.exe` + `SHA256SUMS.txt` as workflow artifacts.
3. Push `main` and the new version tag:
   ```powershell
   git push origin main --follow-tags
   ```
   `.github/workflows/release.yml` verifies version/tag parity, runs `npm run build`, `npm test`, and `cargo test`, builds the NSIS setup `.exe`, generates `SHA256SUMS.txt`, and creates a **Draft GitHub Release** for review before publishing.

---

## Data Storage & Privacy

- **100% Local-First:** Notes, canvas drawings, strategies, checklists, trades, account profiles, cached news/calendar data, and settings live locally in `%APPDATA%\com.icttrading.panel\app.db` (SQLite WAL mode) and `%APPDATA%\com.icttrading.panel\attachments\`.
- **No Telemetry:** The application collects zero analytics or usage tracking. External network requests are limited to your configured market news/calendar feeds (ForexFactory/FairEconomy, CryptoCompare, RSS feeds, and optional Finnhub).

---

## License

Released under the [MIT License](LICENSE).
