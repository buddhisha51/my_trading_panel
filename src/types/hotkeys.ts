import type { WidgetId } from './settings';

export type HotkeyActionId =
  | 'togglePanel'
  | 'toggleFullscreen'
  | 'screenSnip'
  | 'togglePin';

export interface HotkeyConfig {
  enabled: boolean;
  togglePanel: string;
  toggleFullscreen: string;
  screenSnip: string;
  togglePin: string;
}

export const DEFAULT_HOTKEYS: HotkeyConfig = {
  enabled: true,
  togglePanel: 'CommandOrControl+Shift+T',
  toggleFullscreen: 'CommandOrControl+Shift+F',
  screenSnip: 'CommandOrControl+Shift+S',
  togglePin: 'CommandOrControl+Shift+P',
};

export interface HotkeyActionMeta {
  id: HotkeyActionId;
  title: string;
  description: string;
}

export const GLOBAL_HOTKEY_META: HotkeyActionMeta[] = [
  {
    id: 'togglePanel',
    title: 'Toggle Slide Panel',
    description: 'Expand or collapse the docked panel over TradingView / MT5.',
  },
  {
    id: 'toggleFullscreen',
    title: 'Full-Screen Workspace',
    description: 'Expand to full-screen review dashboard and return cleanly to edge.',
  },
  {
    id: 'screenSnip',
    title: 'Quick Screen Snip',
    description: 'Launch Windows Snipping Tool (ms-screenclip:) across any monitor.',
  },
  {
    id: 'togglePin',
    title: 'Pin / Unpin Panel',
    description: 'Lock the expanded panel open or re-enable hover auto-collapse.',
  },
];

export interface StaticShortcutInfo {
  keys: string;
  action: string;
  scope: 'Panel Navigation' | 'ICT Drawing Canvas' | 'Rich Note Editor';
}

export const STATIC_SHORTCUTS: StaticShortcutInfo[] = [
  { keys: 'Ctrl + /', action: 'Open or close this Hotkey Cheat Sheet', scope: 'Panel Navigation' },
  { keys: 'Ctrl + ,', action: 'Open or close Panel Settings', scope: 'Panel Navigation' },
  { keys: 'Esc', action: 'Close Settings / Cheat Sheet / Exit Full-Screen', scope: 'Panel Navigation' },
  { keys: 'Ctrl + Z', action: 'Undo canvas drawing step', scope: 'ICT Drawing Canvas' },
  { keys: 'Ctrl + Shift + Z', action: 'Redo canvas drawing step', scope: 'ICT Drawing Canvas' },
  { keys: 'Ctrl + D', action: 'Duplicate selected canvas shape', scope: 'ICT Drawing Canvas' },
  { keys: 'Ctrl + V', action: 'Paste screenshot directly onto canvas background', scope: 'ICT Drawing Canvas' },
  { keys: 'Ctrl + Scroll', action: 'Zoom canvas in / out around cursor', scope: 'ICT Drawing Canvas' },
  { keys: 'Delete / Backspace', action: 'Remove selected shape on canvas', scope: 'ICT Drawing Canvas' },
  { keys: 'Double-Click Text', action: 'Edit existing canvas text annotation', scope: 'ICT Drawing Canvas' },
  { keys: 'Ctrl + V', action: 'Paste screenshot image as Note attachment & markup', scope: 'Rich Note Editor' },
  { keys: 'Ctrl + B / I / U', action: 'Bold, Italic, Underline formatting', scope: 'Rich Note Editor' },
];

export interface ShortcutEntry {
  keys: string;
  action: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutEntry[];
}

export type ShortcutContextId = 'canvas' | 'rich-editor' | 'floating-viewer';

export const CONTEXT_SHORTCUTS: Record<ShortcutContextId, ShortcutGroup> = {
  canvas: {
    title: 'ICT Drawing Canvas Shortcuts',
    items: [
      { keys: 'V / P / C', action: 'Select / Pen / Candle tool' },
      { keys: 'R / F / I / B / O', action: 'Rect / FVG / IFVG / BPR / OB' },
      { keys: 'L / H / M / T', action: 'Liquidity / H-Line / MSS / Text' },
      { keys: 'Ctrl + D', action: 'Duplicate selected shape' },
      { keys: 'Ctrl + Z / Ctrl + Shift + Z', action: 'Undo / Redo canvas action' },
      { keys: 'Ctrl + V', action: 'Paste clipboard screenshot onto stage' },
      { keys: 'Ctrl + Scroll / +/-', action: 'Zoom canvas in or out' },
      { keys: 'Space + Drag', action: 'Pan around zoomed canvas' },
      { keys: 'Delete / Backspace', action: 'Delete selected shape' },
      { keys: 'Double-Click Text', action: 'Edit text annotation inline' },
    ],
  },
  'rich-editor': {
    title: 'Rich Note Editor Shortcuts',
    items: [
      { keys: 'Ctrl + V', action: 'Paste screenshot as Note attachment' },
      { keys: 'Ctrl + B / I / U', action: 'Bold / Italic / Underline' },
      { keys: 'Ctrl + Z / Shift + Z', action: 'Undo / Redo formatting' },
    ],
  },
  'floating-viewer': {
    title: 'Floating Viewer Shortcuts',
    items: [
      { keys: '← / →', action: 'Previous / Next Note or Playbook' },
      { keys: 'P', action: 'Pin / Unpin viewer open' },
      { keys: 'Drag Header', action: 'Move window across displays' },
      { keys: 'Esc', action: 'Close floating viewer (when unpinned)' },
    ],
  },
};

export const WIDGET_SHORTCUTS: Record<WidgetId, ShortcutGroup> = {
  'killzone-timeline': {
    title: 'Killzones & Macros Controls',
    items: [
      { keys: 'NY Axis / Local', action: 'Switch timeline timezone ruler' },
      { keys: 'Hover Strip', action: 'Inspect live window countdown details' },
      { keys: 'Settings → Zones', action: 'Customize killzone & macro hours' },
    ],
  },
  'session-clock': {
    title: 'Session Clocks Tips',
    items: [
      { keys: 'Settings → Time', action: 'Switch 24h / 12h or local timezone' },
      { keys: 'Settings → Keys', action: 'Toggle pre-open alerts & chimes' },
    ],
  },
  'daily-bias': {
    title: 'Daily Bias Controls',
    items: [
      { keys: 'Matrix / Pair View', action: 'Switch top-down multi-pair grid vs single pair' },
      { keys: 'Click Matrix Cell', action: 'Cycle Bull → Bear → Range → Unset' },
      { keys: 'Click Pair in Matrix', action: 'Jump to pair detail & PDH/PDL levels' },
    ],
  },
  'risk-calculator': {
    title: 'Risk & Lot Calculator Controls',
    items: [
      { keys: 'Spec Button', action: 'Edit Tick Size, Contract, or add Custom preset' },
      { keys: '1:2 / 1:3 / 1:5', action: 'Auto-fill TP price from Entry & SL' },
      { keys: 'Track Trade →', action: 'Open live Ongoing Trade with calculated size' },
      { keys: 'Sync Bal', action: 'Re-link Equity to active Journal account' },
    ],
  },
  'quick-notes': {
    title: 'Quick Notes & Snips Shortcuts',
    items: [
      { keys: 'Ctrl + V (Editor)', action: 'Paste screenshot onto Note + ICT Canvas' },
      { keys: 'Ctrl + Shift + S', action: 'Global Windows Snipping Tool capture' },
      { keys: 'Click Card', action: 'Open Floating Viewer (Prev/Next + Pin)' },
      { keys: 'Pencil Icon', action: 'Jump directly into Note & Canvas editor' },
    ],
  },
  strategies: {
    title: 'Playbooks & Checklist Controls',
    items: [
      { keys: 'Check Rules', action: 'Live-grade setup confluence (A+ / A / B / C)' },
      { keys: 'Drag ⋮⋮ Rule Row', action: 'Reorder playbook confluence steps' },
      { keys: 'Eye Icon', action: 'Open standalone Floating Playbook Viewer' },
    ],
  },
  'ongoing-trades': {
    title: 'Ongoing Trades Monitor Controls',
    items: [
      { keys: 'Click Status Pill', action: 'Cycle Running → BE Set → Partials → Pending' },
      { keys: 'Pencil / Fix', action: 'Assign or edit SL/TP (stops 15m warnings)' },
      { keys: '+Note / Note', action: 'Attach Note (auto-carries over on Close)' },
      { keys: 'Close', action: 'Move trade into Journal & update equity' },
    ],
  },
  'trade-journal': {
    title: 'Trade Journal & Accounts Controls',
    items: [
      { keys: 'Account Dropdown', action: 'Switch between Default, Challenge & Funded accounts' },
      { keys: 'Log / Stats Tabs', action: 'Analyze Win%, Avg R & P/L by Session/Grade' },
      { keys: 'Click Trade Row', action: 'Inspect checklist snapshot & edit details' },
      { keys: 'Import / CSV', action: 'Import MT5/Prop CSV or export filtered log' },
    ],
  },
  'economic-calendar': {
    title: 'Economic Calendar Controls',
    items: [
      { keys: 'Watchlist Button', action: 'Auto-filter news matching your watchlist pairs' },
      { keys: 'Double-Click Chip', action: 'Rename or customize a currency/pair token' },
      { keys: 'Refresh Icon', action: 'Sync latest FairEconomy macro calendar' },
    ],
  },
  'news-feed': {
    title: 'News Feed Controls',
    items: [
      { keys: 'Category Chips', action: 'Filter Forex, Crypto & Macro headlines' },
      { keys: 'Search Box', action: 'Filter titles, sources & currency tags live' },
      { keys: 'Settings → Widgets', action: 'Manage custom RSS feeds & Finnhub key' },
    ],
  },
};
