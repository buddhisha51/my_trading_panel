# ICT / SMC Forex Trading Assistant Panel

A lightweight, always-on-top, slide-out Windows desktop trading companion engineered for **Inner Circle Trader (ICT)** and **Smart Money Concepts (SMC)** traders working alongside TradingView, MetaTrader 5, or cTrader. Built with **Tauri v2**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **Konva**, **TipTap**, and **SQLite**.

---

## Core Window & Shell Features

- **4-Edge Multi-Monitor Docking:** Drag the panel across displays and snap cleanly to **Left, Right, Top, or Bottom** of any monitor work area (`rcWork`), respecting the Windows taskbar and mixed-DPI scaling.
- **Hover-to-Slide Edge Strip:** Collapses into a subtle configurable strip with a live Killzone / Session status indicator dot and expands smoothly using GPU-composited CSS `transform: translate3d(...)` animations with configurable hover debounce timers.
- **Smart Pin & Auto-Lock:** Pin open manually or let the panel automatically stay expanded while typing in notes, drawing on the ICT canvas, editing playbooks, logging trades, or adjusting settings.
- **Full-Screen Workspace:** Expand with one click or `Ctrl + Shift + F` for post-session journaling and chart markup, then restore cleanly back to your docked edge.
- **Windows Focus Discipline:** Non-activating (`WS_EX_NOACTIVATE`) while collapsed or hover-peeking so chart focus stays untouched, while switching cleanly to focusable input when editing notes or settings.

---

## 10 Modular Widgets (Reorderable & Toggleable)

1. **ICT Killzones & Macros:** Live NY-time countdowns for Asian, London Open, NY AM (`07:00–10:00`), NY Indices AM (`09:30–11:00`), London Close, Silver Bullet windows, and customizable ICT Macro intervals.
2. **Forex Session Clocks:** Local market hours for Sydney (`08:00–17:00`), Tokyo (`09:00–18:00`), London (`08:00–17:00`), and New York (`08:00–17:00`) with session overlap indicator.
3. **Daily Bias Quick-Strip:** Track D / 4H / 15M bias, PDH / PDL / Asian liquidity notes, and watchlist pairs.
4. **Risk & Lot Size Calculator:** Instant lot sizing, tick/pip risk math, and R-multiple calculations across Forex majors, JPY crosses, XAUUSD, and US indices with custom instrument specs.
5. **Quick Notes & Canvas:** TipTap rich text + Windows native screen snipping (`ms-screenclip:` + `Ctrl+V` clipboard attach) + lazy-loaded interactive Konva **ICT Canvas** (Bullish/Bearish candles, FVG/IFVG boxes, Order Blocks/Breakers, BSL/SSL liquidity trendlines, MSS/CISD arrows, and OTE Fibs).
6. **Strategies & Playbooks:** Build custom setups with rich notes, ICT canvas diagrams, and interactive confluence checklists that grade live setups (`A+`, `A`, `B`, `C`).
7. **Ongoing Trades Monitor:** Track active positions live with one-click closure directly into the Trade Journal.
8. **Trade Journal & Equity:** Manual trade execution log, win rate, profit factor, R-multiple analytics, SVG equity curve, and configurable Prop Firm style Drawdown alerts (Daily DD %, Max DD %, Static vs. Trailing HWM).
9. **Economic Calendar:** Rust-fetched, SQLite-cached economic calendar (`nfs.faireconomy.media`) with currency/impact filtering and `<= 15m` Red-Folder volatility alerts.
10. **Forex & Crypto News:** SQLite-cached feeds from CryptoCompare, ForexLive RSS, FXStreet RSS, Cointelegraph RSS, custom user RSS URLs, and optional Finnhub API key stored securely via Windows Credential Manager (`keyring` / DPAPI).

---

## Keyboard Shortcuts & In-App Cheat Sheet

Press **`Ctrl + /`** (or click the **Keyboard** icon in the titlebar / footer) anytime while the panel is open to launch the **Hotkey Reference Cheat Sheet**. Global hotkeys can also be customized under **Settings -> Keys & Data**.

### Default Global Hotkeys (Work Over TradingView & MT5)

| Default Shortcut | Action |
| :--- | :--- |
| `Ctrl + Shift + T` | Toggle Slide Panel (Expand / Collapse) |
| `Ctrl + Shift + F` | Toggle Full-Screen Workspace |
| `Ctrl + Shift + S` | Quick Windows Screen Snip (`ms-screenclip:`) |
| `Ctrl + Shift + P` | Pin / Unpin Panel Open |

### Built-In Panel, Canvas & Editor Shortcuts

| Shortcut | Scope | Action |
| :--- | :--- | :--- |
| `Ctrl + /` | Panel Navigation | Open / close Hotkey Cheat Sheet |
| `Ctrl + ,` | Panel Navigation | Open / close Panel Settings |
| `Esc` | Panel Navigation | Close Settings, Cheat Sheet, or exit Full-Screen |
| `Ctrl + Z` | ICT Drawing Canvas | Undo drawing step |
| `Ctrl + Shift + Z` | ICT Drawing Canvas | Redo drawing step |
| `Ctrl + V` | ICT Drawing Canvas | Paste screenshot directly onto canvas background |
| `Delete` / `Backspace` | ICT Drawing Canvas | Delete selected shape |
| `Double-Click Text` | ICT Drawing Canvas | Edit existing canvas text annotation |
| `Ctrl + V` | Rich Note Editor | Paste clipboard screenshot as attachment & canvas markup |
| `Ctrl + B` / `I` / `U` | Rich Note Editor | Bold / Italic / Underline text |

---

## Backup, Restore & Notifications

- **Full Backup (`.zip` / `.json` preview):** Under **Settings -> Keys & Data**, export a portable ZIP archive containing all 13 user SQLite tables (`settings`, `widget_layout`, `daily_bias`, `notes`, `note_attachments`, `strategies`, `checklist_templates`, `strategy_attachments`, `account_profile`, `trades`, `ongoing_trades`, `equity_snapshots`, `rss_feeds`) plus chart screenshot files in `$APPDATA/attachments/`.
- **Restore Modes:** Choose **`merge`** (non-destructive insert keeping existing records) or **`replace`** (cascade-safe clean restore).
- **Desktop Alerts:** Toggleable Windows toast notifications for Killzone transitions and upcoming `<= 15m` Red-Folder economic events.

---

## Prerequisites & Development Commands (Windows)

### Prerequisites for Native Desktop Builds
1. **Node.js** (v20+ recommended)
2. **Rust Toolchain (`rustup`)** (`cargo` + `rustc` MSVC target)
3. **Visual Studio 2022 Build Tools** with the **Desktop development with C++** workload (and Windows 10/11 SDK)
4. **WebView2 Runtime** (pre-installed on Windows 11)

### Frontend Preview & Tests
> Note: On Windows PowerShell with restricted script policies, invoke `npm.cmd`.

```powershell
# Install Node dependencies
npm.cmd install

# Start Vite frontend dev server (browser preview fallback via localStorage)
npm.cmd run dev

# Run TypeScript check + production Vite bundle
npm.cmd run build

# Run Vitest unit & component integration test suite
npm.cmd test
```

### Native Tauri Desktop Build
```powershell
# Launch native always-on-top Windows desktop panel in dev mode
npm.cmd run tauri dev

# Build optimized Windows NSIS installer bundle
npm.cmd run tauri build
```

---

## Installing on Windows (GitHub Releases)

1. Download the `*-setup.exe` NSIS installer (and optional `SHA256SUMS.txt`) from the [GitHub Releases](https://github.com/buddhisha51/my_trading_panel/releases) page.
2. Verify the download integrity in PowerShell:
   ```powershell
   Get-FileHash .\ICT*setup.exe -Algorithm SHA256
   ```
   Confirm the printed hash matches `SHA256SUMS.txt`.
3. Run the installer (`currentUser` install — no administrator privileges required). Because release builds are currently unsigned, Windows SmartScreen may show *"Windows protected your PC"* on first launch; click **More info → Run anyway**.
4. The app starts fresh with an empty local SQLite database stored at `%APPDATA%\com.icttrading.panel\` (`app.db`, `attachments\`, `backups\`) — no developer data is ever included in the installer.
5. **Moving to a New Machine:** Export your `.zip` archive from **Settings → Keys & Data → Export Backup** on your old machine and restore it on the new machine using **Import (replace)**. *(Optional Finnhub API keys live in Windows Credential Manager and must be re-entered on a new PC.)*

## Cutting a Release

1. Ensure `version` matches across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Tag and push to GitHub:
   ```powershell
   git tag v0.1.0
   git push origin v0.1.0
   ```
   `.github/workflows/release.yml` validates version/tag parity, runs `npm run build`, `npm test`, and `cargo test`, builds the Windows NSIS `.exe` installer, computes `SHA256SUMS.txt`, and creates a **Draft GitHub Release** for review before publishing.
