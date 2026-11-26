import { beforeEach, describe, expect, it } from 'vitest';
import { useJournalStore } from '../journalStore';

describe('journalStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useJournalStore.setState({
      trades: [],
      ongoingTrades: [],
      snapshots: [],
      loading: false,
      saving: false,
    });
  });

  it('tracks ongoing positions, closes them atomically to journal, and saves snapshots', async () => {
    await useJournalStore.getState().updateProfile({
      accountName: 'Test Prop',
      startingBalance: 10000,
      currency: 'USD',
      ddMode: 'static',
      dailyDdLimit: 5,
      maxDdLimit: 10,
    });

    const openPos = await useJournalStore.getState().openOngoingTrade({
      pair: 'GBPUSD',
      direction: 'long',
      entryPrice: 1.285,
      stopLoss: 1.283,
      takeProfit: 1.291,
      lotSize: 1.0,
      notes: 'London sweep',
      strategyId: null,
    });

    expect(useJournalStore.getState().ongoingTrades).toHaveLength(1);
    await useJournalStore.getState().cycleOngoingStatus(openPos);
    expect(useJournalStore.getState().ongoingTrades[0].status).toBe('moved_to_be');

    const closed = await useJournalStore.getState().closeOngoingToJournal({
      ongoingId: openPos.id,
      outcome: 'win',
      pnlDollars: 300,
      rMultiple: 3.0,
      notes: 'TP hit at PDH',
      screenshotPath: null,
      checklistSnapshot: null,
      setupGrade: 'A+',
      exitTime: new Date().toISOString(),
      session: 'NY AM',
    });

    expect(closed.pair).toBe('GBPUSD');
    expect(closed.setupGrade).toBe('A+');
    expect(useJournalStore.getState().ongoingTrades).toHaveLength(0);
    expect(useJournalStore.getState().trades).toHaveLength(1);
    expect(useJournalStore.getState().metrics.currentBalance).toBe(10300);

    await useJournalStore.getState().saveTodaySnapshot('Clean day');
    expect(useJournalStore.getState().snapshots).toHaveLength(1);
    expect(useJournalStore.getState().snapshots[0].balance).toBe(10300);
  });
});
