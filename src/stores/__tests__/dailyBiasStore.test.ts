import { beforeEach, describe, expect, it } from 'vitest';
import { useDailyBiasStore } from '../dailyBiasStore';

describe('dailyBiasStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDailyBiasStore.setState({
      selectedDate: '2026-07-15',
      entriesByPair: {},
      weeklyByPair: {},
      monthlyByPair: {},
      loading: false,
      savingPair: null,
    });
  });

  it('upserts, re-loads, updates conflict keys, and deletes daily bias records cleanly', async () => {
    const first = await useDailyBiasStore.getState().upsertBias({
      pair: 'eurusd',
      date: '2026-07-15',
      biasDaily: 'bullish',
      bias4h: 'bullish',
      bias15m: 'range',
      pdh: 1.092,
      pdl: 1.084,
      asianHigh: 1.089,
      asianLow: 1.086,
      dolNotes: 'Target PDH BSL',
    });

    expect(first.pair).toBe('EURUSD');
    expect(first.id).toBeTruthy();

    // Re-load from persistence layer
    useDailyBiasStore.setState({ entriesByPair: {} });
    await useDailyBiasStore.getState().loadDate('2026-07-15');
    const reloaded = useDailyBiasStore.getState().entriesByPair.EURUSD;
    expect(reloaded?.biasDaily).toBe('bullish');
    expect(reloaded?.pdh).toBe(1.092);

    // Update existing (pair, date) preserves id & merges updated fields
    const updated = await useDailyBiasStore.getState().upsertBias({
      pair: 'EURUSD',
      date: '2026-07-15',
      biasDaily: 'bullish',
      bias4h: 'bullish',
      bias15m: 'bullish',
      pdh: 1.0925,
      pdl: 1.084,
      asianHigh: 1.089,
      asianLow: 1.086,
      dolNotes: 'MSS confirmed',
    });
    expect(updated.id).toBe(first.id);
    expect(updated.bias15m).toBe('bullish');

    await useDailyBiasStore.getState().clearBias('EURUSD', '2026-07-15');
    expect(useDailyBiasStore.getState().entriesByPair.EURUSD).toBeUndefined();
  });

  it('scopes Monthly and Weekly bias cleanly across date selections and month/week boundaries', async () => {
    // 2026-11-27 (Fri): Week of Nov 23–29, Month Nov 2026
    await useDailyBiasStore.getState().loadDate('2026-11-27');
    await useDailyBiasStore.getState().upsertPeriodBias('monthly', 'EURUSD', 'bullish');
    await useDailyBiasStore.getState().upsertPeriodBias('weekly', 'EURUSD', 'bearish');

    // Another day in the same week & month (2026-11-25 Wed) keeps both MN and W1
    await useDailyBiasStore.getState().setDate('2026-11-25');
    expect(useDailyBiasStore.getState().monthlyByPair.EURUSD?.biasDaily).toBe('bullish');
    expect(useDailyBiasStore.getState().weeklyByPair.EURUSD?.biasDaily).toBe('bearish');

    // Next Monday (2026-11-30) starts a new week (W1 cleared), but stays in Nov 2026 (MN preserved!)
    await useDailyBiasStore.getState().setDate('2026-11-30');
    expect(useDailyBiasStore.getState().monthlyByPair.EURUSD?.biasDaily).toBe('bullish');
    expect(useDailyBiasStore.getState().weeklyByPair.EURUSD).toBeUndefined();

    // Set W1 on 2026-11-30, then move to 2026-12-01 (Tue): same week preserved, new month Dec 2026!
    await useDailyBiasStore.getState().upsertPeriodBias('weekly', 'EURUSD', 'range');
    await useDailyBiasStore.getState().setDate('2026-12-01');
    expect(useDailyBiasStore.getState().weeklyByPair.EURUSD?.biasDaily).toBe('range');
    expect(useDailyBiasStore.getState().monthlyByPair.EURUSD).toBeUndefined();
  });
});
