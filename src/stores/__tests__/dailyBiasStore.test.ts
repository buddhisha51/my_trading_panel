import { beforeEach, describe, expect, it } from 'vitest';
import { useDailyBiasStore } from '../dailyBiasStore';

describe('dailyBiasStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDailyBiasStore.setState({
      selectedDate: '2026-07-15',
      entriesByPair: {},
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
});
