import { DateTime } from 'luxon';
import type {
  EconomicEventItem,
  FetchMetadataEntry,
  VolatilityAlert,
} from '../types/market';
import { formatCountdown, formatHmTime, NY_ZONE } from './killzoneEngine';

export function parseUtcIso(raw: string): DateTime {
  const iso = DateTime.fromISO(raw, { zone: 'utc' });
  if (iso.isValid) return iso;
  const sql = DateTime.fromSQL(raw, { zone: 'utc' });
  return sql;
}

/**
 * Computes imminent ICT "High Volatility" warnings directly from cached SQLite `economic_events`.
 */
export function getUpcomingHighImpactAlerts(
  events: EconomicEventItem[],
  nowUtc: DateTime,
  thresholdMinutes = 15,
): VolatilityAlert[] {
  return events
    .filter((e) => e.impact === 'high')
    .map((e) => {
      const dt = parseUtcIso(e.eventDatetime);
      const minutesUntil = dt.isValid ? dt.diff(nowUtc, 'minutes').minutes : -1;
      return { event: e, minutesUntil };
    })
    .filter(({ minutesUntil }) => minutesUntil > 0 && minutesUntil <= thresholdMinutes)
    .sort((a, b) => a.minutesUntil - b.minutesUntil)
    .map(({ event, minutesUntil }) => ({
      event,
      minutesUntil,
      severity: 'red_folder' as const,
      message: `High Volatility: ${event.title} (${event.country}) in ${Math.max(1, Math.round(minutesUntil))}m`,
    }));
}

export function getNextHighImpactEvent(
  events: EconomicEventItem[],
  nowUtc: DateTime,
): { event: EconomicEventItem; msUntil: number } | null {
  let best: { event: EconomicEventItem; msUntil: number } | null = null;
  for (const ev of events) {
    if (ev.impact !== 'high') continue;
    const dt = parseUtcIso(ev.eventDatetime);
    if (!dt.isValid) continue;
    const diffMs = dt.toMillis() - nowUtc.toMillis();
    if (diffMs > 0 && (!best || diffMs < best.msUntil)) {
      best = { event: ev, msUntil: diffMs };
    }
  }
  return best;
}

export function formatEventTimes(
  eventDatetimeUtc: string,
  userTimezone: string,
  format: '12h' | '24h',
): { localLabel: string; nyLabel: string; dayLabel: string } {
  const dt = parseUtcIso(eventDatetimeUtc);
  if (!dt.isValid) {
    return { localLabel: '--:--', nyLabel: '--:--', dayLabel: '--' };
  }
  const ny = dt.setZone(NY_ZONE);
  const local = dt.setZone(userTimezone);
  return {
    localLabel: formatHmTime(local.isValid ? local : ny, format),
    nyLabel: formatHmTime(ny, format),
    dayLabel: ny.toFormat('EEE MMM d'),
  };
}

export interface FeedResilienceBanner {
  status: 'fresh' | 'backoff' | 'stale' | 'empty';
  label: string | null;
}

/**
 * Evaluates cached `fetch_metadata` rows against `nowUtc` to surface rate-limit backoff
 * countdowns or stale offline timestamps cleanly without breaking UI rendering.
 */
export function evaluateFeedResilience(
  metadata: FetchMetadataEntry[],
  providerFilter: string | null,
  hasCachedRows: boolean,
  nowUtc: DateTime = DateTime.utc(),
): FeedResilienceBanner {
  const relevant = providerFilter
    ? metadata.filter((m) => m.provider === providerFilter)
    : metadata;

  if (relevant.length === 0) {
    return hasCachedRows
      ? { status: 'fresh', label: null }
      : { status: 'empty', label: 'No cached feed yet — syncing or offline' };
  }

  // When aggregating multiple news adapters (providerFilter === null), do not show a
  // scary rate-limit banner if other news feeds are healthy and serving headlines.
  if (!providerFilter && hasCachedRows) {
    const anyHealthy = relevant.some((m) => {
      if (m.consecutiveFailures > 0) return false;
      if (m.backoffUntil) {
        const until = parseUtcIso(m.backoffUntil);
        if (until.isValid && until.toMillis() > nowUtc.toMillis()) return false;
      }
      return true;
    });
    if (anyHealthy) {
      return { status: 'fresh', label: null };
    }
  }

  for (const m of relevant) {
    if (m.backoffUntil) {
      const until = parseUtcIso(m.backoffUntil);
      if (until.isValid && until.toMillis() > nowUtc.toMillis()) {
        const ms = until.toMillis() - nowUtc.toMillis();
        return {
          status: 'backoff',
          label: `Rate-limited (${m.provider}) — retry in ${formatCountdown(ms)}`,
        };
      }
    }
  }

  const failing = relevant.find((m) => m.consecutiveFailures > 0);
  if (failing) {
    const last = parseUtcIso(failing.lastFetchedAt);
    const ago = last.isValid ? last.toRelative({ base: nowUtc }) : 'earlier';
    return {
      status: 'stale',
      label: `Offline cache — updated ${ago ?? 'earlier'}`,
    };
  }

  return { status: 'fresh', label: null };
}

const INDEX_CURRENCY_MAP: Record<string, string[]> = {
  NAS100: ['USD'],
  US100: ['USD'],
  US30: ['USD'],
  SPX500: ['USD'],
  US500: ['USD'],
  DXY: ['USD'],
  GER40: ['EUR'],
  DE40: ['EUR'],
  DAX: ['EUR'],
  UK100: ['GBP'],
  JP225: ['JPY'],
};

/**
 * Expands user calendar filter tokens (both 3-letter currencies like `USD` and trading
 * pairs/indices like `EURUSD`, `GBPJPY`, `XAUUSD`, `NAS100`) into normalized currency codes.
 */
export function expandCalendarTokensToCurrencies(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of tokens) {
    const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) continue;

    if (INDEX_CURRENCY_MAP[clean]) {
      for (const cur of INDEX_CURRENCY_MAP[clean]) out.add(cur);
      continue;
    }

    if (/^[A-Z]{6}$/.test(clean)) {
      out.add(clean.slice(0, 3));
      out.add(clean.slice(3, 6));
      continue;
    }

    out.add(clean);
  }
  return out;
}

/**
 * Returns true if an economic calendar currency impacts the given trading symbol
 * (supports FX pairs like EURUSD/GBPJPY, Gold XAUUSD, Crypto BTCUSD, and equity indices).
 */
export function pairMatchesCalendarCurrency(pair: string, currency: string): boolean {
  const cur = currency.trim().toUpperCase();
  if (!cur) return false;
  const pairCurrencies = expandCalendarTokensToCurrencies([pair]);
  if (pairCurrencies.has(cur)) return true;
  const cleanPair = pair.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleanPair.includes(cur);
}

/**
 * Finds the soonest Red-Folder (`high`) event within threshold impacting a specific traded pair.
 */
export function getImminentNewsForPair(
  pair: string,
  events: EconomicEventItem[],
  nowUtc: DateTime,
  thresholdMinutes = 15,
): VolatilityAlert | null {
  const alerts = getUpcomingHighImpactAlerts(events, nowUtc, thresholdMinutes);
  return alerts.find((a) => pairMatchesCalendarCurrency(pair, a.event.country)) ?? null;
}
