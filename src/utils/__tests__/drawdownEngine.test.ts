import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { AccountProfile, TradeRecord } from '../../types/journal';
import { computeAccountMetrics } from '../drawdownEngine';

function makeTrade(overrides: Partial<TradeRecord> & { id: string }): TradeRecord {
  return {
    pair: 'EURUSD',
    direction: 'long',
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    lotSize: 1,
    outcome: 'win',
    pnlDollars: 0,
    rMultiple: null,
    strategyId: null,
    notes: null,
    screenshotPath: null,
    checklistSnapshot: null,
    setupGrade: null,
    entryTime: '2026-07-15T12:00:00Z',
    exitTime: '2026-07-15T13:00:00Z',
    session: 'NY AM',
    createdAt: '2026-07-15T13:00:00Z',
    updatedAt: '2026-07-15T13:00:00Z',
    ...overrides,
  };
}

describe('drawdownEngine', () => {
  it('distinguishes Static vs Trailing High-Water Mark drawdown and computes stats', () => {
    const trades: TradeRecord[] = [
      makeTrade({
        id: 't1',
        outcome: 'win',
        pnlDollars: 1000,
        rMultiple: 2.5,
        exitTime: '2026-07-13T14:00:00Z',
      }),
      makeTrade({
        id: 't2',
        outcome: 'loss',
        pnlDollars: -600,
        rMultiple: -1.0,
        exitTime: '2026-07-14T14:00:00Z',
      }),
    ];

    const baseProfile: AccountProfile = {
      id: 'default',
      accountName: 'Prop Eval',
      startingBalance: 10000,
      currentBalance: 10400,
      highWaterMark: 11000,
      currency: 'USD',
      ddMode: 'static',
      dailyDdLimit: 5,
      maxDdLimit: 5,
      updatedAt: '',
    };

    const now = DateTime.fromISO('2026-07-15T15:00:00Z', { zone: 'utc' });
    const staticMetrics = computeAccountMetrics(baseProfile, trades, now);
    expect(staticMetrics.currentBalance).toBe(10400);
    expect(staticMetrics.highWaterMark).toBe(11000);
    expect(staticMetrics.maxDrawdownPct).toBe(0); // Never dipped below 10000 starting balance
    expect(staticMetrics.maxDdBreached).toBe(false);
    expect(staticMetrics.winRatePct).toBe(50);
    expect(staticMetrics.avgRMultiple).toBeCloseTo(0.75, 4);
    expect(staticMetrics.profitFactor).toBeCloseTo(1000 / 600, 4);

    const trailingMetrics = computeAccountMetrics(
      { ...baseProfile, ddMode: 'trailing' },
      trades,
      now,
    );
    // HWM = 11000, dropped to 10400 -> 600 / 11000 = 5.4545% >= 5% limit
    expect(trailingMetrics.maxDrawdownPct).toBeCloseTo((600 / 11000) * 100, 3);
    expect(trailingMetrics.maxDdBreached).toBe(true);
  });

  it('triggers daily drawdown breach alert for same-NY-day losses', () => {
    const profile: AccountProfile = {
      id: 'default',
      accountName: 'Funded',
      startingBalance: 10000,
      currentBalance: 9650,
      highWaterMark: 10000,
      currency: 'USD',
      ddMode: 'static',
      dailyDdLimit: 3,
      maxDdLimit: 6,
      updatedAt: '',
    };

    const now = DateTime.fromISO('2026-07-15T16:00:00Z', { zone: 'utc' });
    const m = computeAccountMetrics(
      profile,
      [
        makeTrade({
          id: 'today_loss',
          outcome: 'loss',
          pnlDollars: -350,
          rMultiple: -1,
          exitTime: '2026-07-15T14:30:00Z',
        }),
      ],
      now,
    );

    expect(m.dailyPnl).toBe(-350);
    expect(m.dailyDrawdownPct).toBeCloseTo(3.5, 3);
    expect(m.dailyDdBreached).toBe(true);
  });

  it('normalizes positive loss PnL and R inputs so losses always reduce equity', () => {
    const profile: AccountProfile = {
      id: 'default',
      accountName: 'Funded',
      startingBalance: 10000,
      currentBalance: 10000,
      highWaterMark: 10000,
      currency: 'USD',
      ddMode: 'static',
      dailyDdLimit: 5,
      maxDdLimit: 10,
      updatedAt: '',
    };

    const now = DateTime.fromISO('2026-07-15T16:00:00Z', { zone: 'utc' });
    const m = computeAccountMetrics(
      profile,
      [
        makeTrade({
          id: 't_loss_pos',
          outcome: 'loss',
          pnlDollars: 200,
          rMultiple: 1.5,
          exitTime: '2026-07-15T14:00:00Z',
        }),
      ],
      now,
    );
    expect(m.currentBalance).toBe(9800);
    expect(m.netPnl).toBe(-200);
    expect(m.dailyPnl).toBe(-200);
    expect(m.dailyDrawdownPct).toBeCloseTo(2, 4);
    expect(m.avgRMultiple).toBe(-1.5);
  });
});
