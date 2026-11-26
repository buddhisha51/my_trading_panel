export type EventImpact = 'high' | 'medium' | 'low';
export type NewsCategory = 'forex' | 'crypto' | 'macro';

export const SUPPORTED_CALENDAR_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'NZD',
  'CHF',
] as const;

export interface EconomicEventItem {
  id: string;
  provider: string;
  title: string;
  country: string;
  eventDatetime: string; // ISO 8601 UTC
  impact: EventImpact;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  fetchedAt: string;
  expiresAt: string;
}

export interface ManualEventPayload {
  title: string;
  country: string;
  eventDatetime: string; // ISO 8601 UTC
  impact: EventImpact;
  forecast: string | null;
  previous: string | null;
}

export interface NewsArticleItem {
  id: string;
  provider: string;
  sourceName: string;
  category: NewsCategory;
  title: string;
  url: string;
  publishedAt: string; // ISO 8601 UTC
  relatedCurrencies: string[];
  fetchedAt: string;
  expiresAt: string;
}

export interface RssFeedSource {
  id: string;
  url: string;
  label: string;
  category: NewsCategory;
  isEnabled: boolean;
  pollIntervalS: number;
  lastFetchedAt: string | null;
  createdAt: string;
}

export interface UpsertRssFeedPayload {
  id?: string;
  url: string;
  label: string;
  category: NewsCategory;
  isEnabled: boolean;
  pollIntervalS?: number;
}

export interface FetchMetadataEntry {
  provider: string;
  lastFetchedAt: string;
  lastStatus: number | null;
  nextFetchAt: string;
  consecutiveFailures: number;
  backoffUntil: string | null;
}

export interface VolatilityAlert {
  event: EconomicEventItem;
  minutesUntil: number;
  severity: 'red_folder';
  message: string;
}
