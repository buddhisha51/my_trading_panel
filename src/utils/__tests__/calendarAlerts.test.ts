import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { EconomicEventItem, FetchMetadataEntry } from '../../types/market';
import {
  evaluateFeedResilience,
  formatEventTimes,
  getNextHighImpactEvent,
  getUpcomingHighImpactAlerts,
} from '../calendarAlerts';

describe('calendarAlerts', () => {
  const now = DateTime.fromISO('2026-07-15T12:18:00Z', { zone: 'utc' }); // 08:18 AM NY

  const events: EconomicEventItem[] = [
    {
      id: 'e1',
      provider: 'faireconomy',
      title: 'US CPI m/m',
      country: 'USD',
      eventDatetime: '2026-07-15T12:30:00Z', // 12 minutes away
      impact: 'high',
      forecast: '0.2%',
      previous: '0.1%',
      actual: null,
      fetchedAt: '2026-07-15T12:00:00Z',
      expiresAt: '2026-07-15T13:00:00Z',
    },
    {
      id: 'e2',
      provider: 'faireconomy',
      title: 'Minor Speech',
      country: 'EUR',
      eventDatetime: '2026-07-15T12:25:00Z', // 7 min away, medium impact
      impact: 'medium',
      forecast: null,
      previous: null,
      actual: null,
      fetchedAt: '2026-07-15T12:00:00Z',
      expiresAt: '2026-07-15T13:00:00Z',
    },
  ];

  it('triggers High Volatility alerts strictly for Red-Folder events within threshold', () => {
    const alerts = getUpcomingHighImpactAlerts(events, now, 15);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain('US CPI m/m (USD) in 12m');

    const next = getNextHighImpactEvent(events, now);
    expect(next?.event.id).toBe('e1');
    expect(next?.msUntil).toBe(12 * 60 * 1000);
  });

  it('converts UTC event times cleanly into user display timezone and NY time', () => {
    const times = formatEventTimes('2026-07-15T12:30:00Z', 'Asia/Kolkata', '24h');
    expect(times.nyLabel).toBe('08:30');
    expect(times.localLabel).toBe('18:00');
  });

  it('reports rate-limit backoff countdowns and offline stale cache status', () => {
    const backoffMeta: FetchMetadataEntry[] = [
      {
        provider: 'faireconomy',
        lastFetchedAt: '2026-07-15T12:00:00Z',
        lastStatus: 429,
        nextFetchAt: '2026-07-15T12:28:00Z',
        consecutiveFailures: 2,
        backoffUntil: '2026-07-15T12:28:00Z', // 10 min from now
      },
    ];
    const b = evaluateFeedResilience(backoffMeta, 'faireconomy', true, now);
    expect(b.status).toBe('backoff');
    expect(b.label).toContain('Rate-limited');
    expect(b.label).toContain('10m');

    const staleMeta: FetchMetadataEntry[] = [
      {
        provider: 'rss:rss_forexlive',
        lastFetchedAt: '2026-07-15T10:18:00Z', // 2 hours ago
        lastStatus: null,
        nextFetchAt: '2026-07-15T10:20:00Z',
        consecutiveFailures: 3,
        backoffUntil: null, // backoff window expired, offline retries failing
      },
    ];
    const s = evaluateFeedResilience(staleMeta, null, true, now);
    expect(s.status).toBe('stale');
    expect(s.label).toContain('Offline cache');

    const mixedMeta: FetchMetadataEntry[] = [
      ...staleMeta,
      {
        provider: 'rss:rss_cointelegraph',
        lastFetchedAt: '2026-07-15T12:10:00Z',
        lastStatus: 200,
        nextFetchAt: '2026-07-15T12:20:00Z',
        consecutiveFailures: 0,
        backoffUntil: null,
      },
    ];
    const mixed = evaluateFeedResilience(mixedMeta, null, true, now);
    expect(mixed.status).toBe('fresh');
    expect(mixed.label).toBeNull();
  });
});
