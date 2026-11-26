export type BiasDirection = 'bullish' | 'bearish' | 'range';

export interface DailyBiasEntry {
  id: string;
  pair: string;
  date: string; // YYYY-MM-DD (NY date convention)
  biasDaily: BiasDirection | null;
  bias4h: BiasDirection | null;
  bias15m: BiasDirection | null;
  pdh: number | null;
  pdl: number | null;
  asianHigh: number | null;
  asianLow: number | null;
  dolNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertDailyBiasPayload {
  id?: string;
  pair: string;
  date: string;
  biasDaily: BiasDirection | null;
  bias4h: BiasDirection | null;
  bias15m: BiasDirection | null;
  pdh: number | null;
  pdl: number | null;
  asianHigh: number | null;
  asianLow: number | null;
  dolNotes: string | null;
}

export const DEFAULT_WATCHLIST_PAIRS = [
  'EURUSD',
  'GBPUSD',
  'XAUUSD',
  'NAS100',
  'US30',
  'USDJPY',
];
