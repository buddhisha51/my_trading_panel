import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { OngoingTradeRecord } from '../../types/journal';
import { cloneDefaultKillzones } from '../../types/time';
import {
  evaluateMarketTimeAlerts,
  getOngoingRiskSummary,
  getUnprotectedTradeReminders,
  inspectOngoingTradeRisk,
} from '../alertEngine';

function makeOngoing(overrides: Partial<OngoingTradeRecord> = {}): OngoingTradeRecord {
  return {
    id: 'og_1',
    pair: 'EURUSD',
    direction: 'long',
    entryPrice: 1.085,
    stopLoss: 1.083,
    takeProfit: 1.091,
    lotSize: 0.5,
    status: 'running',
    notes: null,
    strategyId: null,
    openedAt: '2026-11-27T12:00:00.000Z',
    updatedAt: '2026-11-27T12:00:00.000Z',
    ...overrides,
  };
}

describe('alertEngine', () => {
  it('fires Killzone Start & End and Forex Session Start & End alerts cleanly on transitions', () => {
    const zones = cloneDefaultKillzones();
    // 2026-11-27 (Fri, EST = UTC-5):
    // NY AM Forex Killzone is 07:00–10:00 NY (12:00–15:00 UTC)
    // New York Forex Session is 08:00–17:00 NY (13:00–22:00 UTC)
    // London Forex Session is 08:00–17:00 London (08:00–17:00 UTC)
    const beforeNySession = DateTime.fromISO('2026-11-27T12:59:30Z', { zone: 'utc' });
    const step1 = evaluateMarketTimeAlerts({
      now: beforeNySession,
      killzones: zones,
      displayTimezone: 'America/New_York',
      timeFormat: '24h',
      prevSnapshot: null,
    });
    expect(step1.alerts.some((a) => a.title === 'Killzone Started: New York AM (Forex)')).toBe(true);
    expect(step1.alerts.some((a) => a.title.includes('Session Started'))).toBe(false);

    // Move past 08:00 NY (13:00 UTC) -> New York Session Started triggers
    const atNyOpen = DateTime.fromISO('2026-11-27T13:00:10Z', { zone: 'utc' });
    const step2 = evaluateMarketTimeAlerts({
      now: atNyOpen,
      killzones: zones,
      displayTimezone: 'America/New_York',
      timeFormat: '24h',
      prevSnapshot: step1.nextSnapshot,
    });
    expect(step2.alerts.some((a) => a.title === 'New York Session Started')).toBe(true);

    // Move past 10:00 NY (15:00 UTC) -> NY AM Killzone Ended triggers
    const afterKzEnd = DateTime.fromISO('2026-11-27T15:00:10Z', { zone: 'utc' });
    const step3 = evaluateMarketTimeAlerts({
      now: afterKzEnd,
      killzones: zones,
      displayTimezone: 'America/New_York',
      timeFormat: '24h',
      prevSnapshot: step2.nextSnapshot,
    });
    expect(step3.alerts.some((a) => a.title === 'Killzone Ended: New York AM (Forex)')).toBe(true);

    // Move past 17:00 UTC -> London Session Ended triggers
    const afterLondonClose = DateTime.fromISO('2026-11-27T17:00:15Z', { zone: 'utc' });
    const step4 = evaluateMarketTimeAlerts({
      now: afterLondonClose,
      killzones: zones,
      displayTimezone: 'America/New_York',
      timeFormat: '24h',
      prevSnapshot: step3.nextSnapshot,
    });
    expect(step4.alerts.some((a) => a.title === 'London Session Ended')).toBe(true);
  });

  it('assesses missing SL/TP risk and emits recurring 15-minute reminder tokens', () => {
    const protectedTrade = makeOngoing();
    expect(inspectOngoingTradeRisk(protectedTrade).needsAttention).toBe(false);

    const noSlTrade = makeOngoing({ id: 'og_nosl', stopLoss: null, takeProfit: 1.09 });
    expect(inspectOngoingTradeRisk(noSlTrade).severity).toBe('critical');
    expect(inspectOngoingTradeRisk(noSlTrade).shortBadge).toBe('NO SL');

    const noTpTrade = makeOngoing({ id: 'og_notp', stopLoss: 1.08, takeProfit: null });
    expect(inspectOngoingTradeRisk(noTpTrade).severity).toBe('warning');
    expect(inspectOngoingTradeRisk(noTpTrade).shortBadge).toBe('NO TP');

    const at10m = DateTime.fromISO('2026-11-27T12:10:00.000Z', { zone: 'utc' });
    expect(getUnprotectedTradeReminders([noSlTrade], at10m)).toHaveLength(0);
    const summary10m = getOngoingRiskSummary([protectedTrade, noSlTrade], at10m);
    expect(summary10m.unprotectedCount).toBe(1);
    expect(summary10m.missingSlCount).toBe(1);
    expect(summary10m.soonestNextReminderMs).toBe(5 * 60 * 1000);

    const at15m = DateTime.fromISO('2026-11-27T12:15:05.000Z', { zone: 'utc' });
    const rem1 = getUnprotectedTradeReminders([protectedTrade, noSlTrade], at15m);
    expect(rem1).toHaveLength(1);
    expect(rem1[0].token).toBe('trade-risk:og_nosl:b1:sl');
    expect(rem1[0].title).toContain('Missing SL');

    const at30m = DateTime.fromISO('2026-11-27T12:30:10.000Z', { zone: 'utc' });
    const rem2 = getUnprotectedTradeReminders([noSlTrade], at30m);
    expect(rem2).toHaveLength(1);
    expect(rem2[0].token).toBe('trade-risk:og_nosl:b2:sl');
  });
});
