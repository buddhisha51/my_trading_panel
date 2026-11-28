import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { AccountProfile, TradeRecord } from '../../types/journal';
import { computeAccountMetrics, computeGroupedPerformanceStats } from '../drawdownEngine';

function makeTrade(overrides: Partial<TradeRecord> & Pick<TradeRecord, 'id' | 'outcome' | 'pnlDollars'>): TradeRecord {
  const { id, outcome, pnlDollars, ...rest } = overrides;
  const iso = '2026-11-25T15:00:00Z';
  return {
    id,
    accountId: 'default',
    pair: 'EURUSD',
    direction: 'long',
    entryPrice: 1.08,
    stopLoss: 1.078,
    takeProfit: 1.086,
    lotSize: 1,
    outcome,
    pnlDollars,
    rMultiple: outcome === 'win' ? 2 : outcome === 'loss' ? -1 : 0,
    strategyId: 'strat-a',
    notes: null,
    screenshotPath: null,
    checklistSnapshot: null,
    setupGrade: 'A',
    entryTime: iso,
    exitTime: iso,
    session: 'NY AM',
    createdAt: iso,
    updatedAt: iso,
    ...rest,
  };
}

describe('drawdownEngine: discipline counters & grouped performance stats', () => {
  const profile: AccountProfile = {
    id: 'default',
    accountName: 'Main 100K',
    startingBalance: 100_000,
    currentBalance: 100_000,
    highWaterMark: 100_000,
    currency: 'USD',
    ddMode: 'static',
    dailyDdLimit: 5,
    maxDdLimit: 10,
    updatedAt: '2026-11-25T00:00:00Z',
  };

  it('tracks todayTradeCount and trailing consecutiveLosses streak', () => {
    const todayNow = DateTime.fromISO('2026-11-25T16:30:00Z');
    const trades: TradeRecord[] = [
      makeTrade({
        id: 't1',
        outcome: 'win',
        pnlDollars: 400,
        exitTime: '2026-11-24T15:00:00Z',
        createdAt: '2026-11-24T15:00:00Z',
      }),
      makeTrade({
        id: 't2',
        outcome: 'loss',
        pnlDollars: -200,
        exitTime: '2026-11-25T10:00:00Z',
        createdAt: '2026-11-25T10:00:00Z',
      }),
      makeTrade({
        id: 't3',
        outcome: 'loss',
        pnlDollars: -200,
        exitTime: '2026-11-25T14:00:00Z',
        createdAt: '2026-11-25T14:00:00Z',
      }),
    ];

    const metrics = computeAccountMetrics(profile, trades, todayNow);
    expect(metrics.todayTradeCount).toBe(2);
    expect(metrics.consecutiveLosses).toBe(2);
    expect(metrics.currentBalance).toBe(100_000);
  });

  it('computes win%, avg R, and net P/L breakdown grouped by session, playbook, and grade', () => {
    const trades: TradeRecord[] = [
      makeTrade({ id: 't1', outcome: 'win', pnlDollars: 600, rMultiple: 3, session: 'London Open', setupGrade: 'A+' }),
      makeTrade({ id: 't2', outcome: 'loss', pnlDollars: -200, rMultiple: -1, session: 'London Open', setupGrade: 'C' }),
      makeTrade({ id: 't3', outcome: 'win', pnlDollars: 400, rMultiple: 2, session: 'NY AM', setupGrade: 'A+' }),
    ];

    const bySession = computeGroupedPerformanceStats(trades, (t) => t.session ?? 'Unspecified');
    expect(bySession[0]).toMatchObject({
      key: 'London Open',
      trades: 2,
      wins: 1,
      losses: 1,
      winRatePct: 50,
      netPnl: 400,
      avgR: 1,
    });
    expect(bySession[1]).toMatchObject({
      key: 'NY AM',
      trades: 1,
      winRatePct: 100,
      netPnl: 400,
      avgR: 2,
    });

    const byGrade = computeGroupedPerformanceStats(trades, (t) => String(t.setupGrade ?? 'Ungraded'));
    expect(byGrade[0]).toMatchObject({ key: 'A+', trades: 2, winRatePct: 100, netPnl: 1000, avgR: 2.5 });
    expect(byGrade[1]).toMatchObject({ key: 'C', trades: 1, winRatePct: 0, netPnl: -200, avgR: -1 });
  });
});
