import { DEFAULT_WATCHLIST_PAIRS } from './dailyBias';
import type { DockEdge } from './dock';
import {
  cloneDefaultInstrumentSpecs,
  DEFAULT_CONVERSION_RATES,
  type ConversionRates,
  type InstrumentSpec,
  type RiskInputMode,
} from './risk';
import { cloneDefaultKillzones, type KillzoneDefinition } from './time';
import { DEFAULT_HOTKEYS, type HotkeyConfig } from './hotkeys';
import type { EventImpact, NewsCategory } from './market';

export type StatusIndicatorMode = 'killzone' | 'session' | 'none';
export type TimeFormat = '12h' | '24h';
export type DrawdownMode = 'static' | 'trailing';

export type WidgetId =
  | 'killzone-timeline'
  | 'session-clock'
  | 'daily-bias'
  | 'quick-notes'
  | 'strategies'
  | 'risk-calculator'
  | 'ongoing-trades'
  | 'trade-journal'
  | 'economic-calendar'
  | 'news-feed';

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  description: string;
  milestone: number;
}

export const WIDGET_CATALOG: WidgetMeta[] = [
  {
    id: 'killzone-timeline',
    title: 'ICT Killzones & Macros',
    description: 'Live NY-time Killzone, Silver Bullet & Macro window timeline.',
    milestone: 2,
  },
  {
    id: 'session-clock',
    title: 'Forex Session Clocks',
    description: 'Sydney, Tokyo, London & New York local market clocks and overlap bar.',
    milestone: 2,
  },
  {
    id: 'daily-bias',
    title: 'Daily Bias Quick-Strip',
    description: 'D/4H/15M directional bias and PDH/PDL/Asian liquidity notes.',
    milestone: 2,
  },
  {
    id: 'quick-notes',
    title: 'Quick Notes & Canvas',
    description: 'Rich notes with ICT candlestick drawing tools and screenshot markup.',
    milestone: 3,
  },
  {
    id: 'strategies',
    title: 'Strategies & Playbooks',
    description: 'Playbooks with interactive confluence checklist & A+/A/B grading.',
    milestone: 3,
  },
  {
    id: 'risk-calculator',
    title: 'Risk & Lot Size Calculator',
    description: 'Position sizing across Forex, JPY crosses, XAUUSD & US Indices.',
    milestone: 2,
  },
  {
    id: 'ongoing-trades',
    title: 'Ongoing Trades Monitor',
    description: 'Active positions tracker with one-click Close Trade to Journal.',
    milestone: 4,
  },
  {
    id: 'trade-journal',
    title: 'Trade Journal & Equity',
    description: 'Manual trade log, equity curve, win rate & drawdown alerts.',
    milestone: 4,
  },
  {
    id: 'economic-calendar',
    title: 'Economic Calendar',
    description: 'Red-folder high-impact news events with 15m volatility countdown.',
    milestone: 4,
  },
  {
    id: 'news-feed',
    title: 'Forex & Crypto News',
    description: 'SQLite-cached RSS & market headlines from ForexLive, FXStreet & CryptoCompare.',
    milestone: 4,
  },
];

export interface WidgetLayoutItem {
  widgetId: WidgetId;
  isVisible: boolean;
  isCollapsed: boolean;
  sortOrder: number;
  customHeight: number | null;
}

export const DEFAULT_WIDGET_LAYOUT: WidgetLayoutItem[] = WIDGET_CATALOG.map((w, idx) => ({
  widgetId: w.id,
  isVisible: true,
  isCollapsed: false,
  sortOrder: idx,
  customHeight: null,
}));

export interface AppSettings {
  // Dock & Geometry
  edge: DockEdge;
  monitorId: string | null;
  collapsedThickness: number;
  expandedSize: number;
  hoverOpenDelayMs: number;
  hoverCloseDelayMs: number;
  animationDurationMs: number;

  // Appearance
  accentColor: string;
  stripColor: string;
  stripOpacity: number;
  panelOpacity: number;
  statusIndicator: StatusIndicatorMode;

  // Time & Regional
  displayTimezone: string;
  timeFormat: TimeFormat;
  showDualNyClock: boolean;
  autoDst: boolean;
  timelineAxisMode: 'ny' | 'local';
  showSilverBullets: boolean;
  showMacros: boolean;
  showNyMidnight: boolean;
  killzones: KillzoneDefinition[];

  // Daily Bias & Watchlist
  watchlistPairs: string[];
  selectedBiasPair: string;

  // Multi-Asset Risk Calculator Defaults
  instrumentSpecs: InstrumentSpec[];
  selectedInstrument: string;
  riskEquity: number;
  riskMode: RiskInputMode;
  riskPercent: number;
  riskDollars: number;
  conversionRates: ConversionRates;

  // Risk & Prop Firm Defaults
  dailyDdLimit: number;
  maxDdLimit: number;
  ddMode: DrawdownMode;

  // Calendar & News Preferences
  calendarCurrencies: string[];
  calendarImpacts: EventImpact[];
  volatilityThresholdMin: number;
  newsCategories: NewsCategory[];

  // Hotkeys & Alerts
  hotkeys: HotkeyConfig;
  notificationsEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  edge: 'left',
  monitorId: null,
  collapsedThickness: 6,
  expandedSize: 380,
  hoverOpenDelayMs: 300,
  hoverCloseDelayMs: 500,
  animationDurationMs: 200,

  accentColor: '#3B82F6',
  stripColor: '#0F172A',
  stripOpacity: 0.72,
  panelOpacity: 0.96,
  statusIndicator: 'killzone',

  displayTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  timeFormat: '24h',
  showDualNyClock: true,
  autoDst: true,
  timelineAxisMode: 'ny',
  showSilverBullets: true,
  showMacros: true,
  showNyMidnight: true,
  killzones: cloneDefaultKillzones(),

  watchlistPairs: [...DEFAULT_WATCHLIST_PAIRS],
  selectedBiasPair: 'EURUSD',

  instrumentSpecs: cloneDefaultInstrumentSpecs(),
  selectedInstrument: 'EURUSD',
  riskEquity: 10000,
  riskMode: 'percent',
  riskPercent: 1.0,
  riskDollars: 100,
  conversionRates: { ...DEFAULT_CONVERSION_RATES },

  dailyDdLimit: 5.0,
  maxDdLimit: 10.0,
  ddMode: 'static',

  calendarCurrencies: ['USD', 'EUR', 'GBP', 'JPY'],
  calendarImpacts: ['high', 'medium'],
  volatilityThresholdMin: 15,
  newsCategories: ['forex', 'crypto', 'macro'],

  hotkeys: { ...DEFAULT_HOTKEYS },
  notificationsEnabled: true,
};

export interface DbStatus {
  dbPath: string;
  appDataDir: string;
  journalMode: string;
  schemaVersion: number;
}
