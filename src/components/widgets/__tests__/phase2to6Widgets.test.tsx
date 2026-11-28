import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDailyBiasStore } from '../../../stores/dailyBiasStore';
import { useJournalStore } from '../../../stores/journalStore';
import { useMarketStore } from '../../../stores/marketStore';
import { useNotesStore } from '../../../stores/notesStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useStrategiesStore } from '../../../stores/strategiesStore';
import { useViewerStore } from '../../../stores/viewerStore';
import { createInstrumentFromPreset } from '../../../types/risk';
import { DEFAULT_SETTINGS, DEFAULT_WIDGET_LAYOUT } from '../../../types/settings';
import { PreviewFloatingViewerPortal } from '../../viewer/FloatingDetailViewer';
import { DailyBiasWidget } from '../DailyBiasWidget';
import { EconomicCalendarWidget } from '../EconomicCalendarWidget';
import { OngoingTradesWidget } from '../OngoingTradesWidget';
import { QuickNotesWidget } from '../QuickNotesWidget';
import { RiskCalculatorWidget } from '../RiskCalculatorWidget';
import { TradeJournalWidget } from '../TradeJournalWidget';

describe('Phase 2-6 Widget & Viewer Integration', () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        watchlistPairs: ['EURUSD', 'XAUUSD'],
        selectedBiasPair: 'EURUSD',
      },
      widgetLayout: DEFAULT_WIDGET_LAYOUT.map((w) => ({ ...w })),
      hydrated: true,
      saving: false,
    });
    useNotesStore.setState({
      notes: [],
      loading: false,
      saving: false,
      filters: { query: '', pair: null, session: null },
      attachmentsByNoteId: {},
    });
    useStrategiesStore.setState({
      strategies: [],
      loading: false,
      saving: false,
      checkedRuleIdsByStrategy: {},
      attachmentsByStrategyId: {},
    });
    useViewerStore.setState({
      previewPayload: null,
      previewPinned: false,
      editRequest: null,
      navigateRequest: null,
      noteLinkRequest: null,
    });
    await useJournalStore.getState().hydrateJournal('default');
    await useJournalStore.getState().updateProfile({
      id: 'default',
      accountName: 'Main 10K',
      startingBalance: 10_000,
      currency: 'USD',
      ddMode: 'static',
      dailyDdLimit: 5,
      maxDdLimit: 10,
    });
    useMarketStore.setState({
      events: [],
      news: [],
      rssFeeds: [],
      metadata: [],
      loading: false,
      syncing: false,
    });
  });

  it('shows contract math readout, computes custom BTCUSD non-zero lots, and tracks live trade from Risk Calculator', async () => {
    const btcSpec = createInstrumentFromPreset('BTCUSD', 'crypto_1unit');
    await useSettingsStore.getState().updateSettings({
      instrumentSpecs: [...DEFAULT_SETTINGS.instrumentSpecs, btcSpec],
      selectedInstrument: 'BTCUSD',
    });

    render(<RiskCalculatorWidget />);

    fireEvent.change(screen.getByLabelText('Entry'), { target: { value: '90000' } });
    fireEvent.change(screen.getByLabelText('Stop Loss'), { target: { value: '89500' } });

    // Live broker contract math clarity line
    expect(screen.getAllByText(/per 1\.00 lot/i).length).toBeGreaterThanOrEqual(1);

    // Valid prices compute 0.20 lots and allow 1-click Track Trade ->
    const trackBtn = screen.getByRole('button', { name: /Track Trade/i }) as HTMLButtonElement;
    expect(trackBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(trackBtn);
    });

    expect(useJournalStore.getState().ongoingTrades).toHaveLength(1);
    expect(useJournalStore.getState().ongoingTrades[0].pair).toBe('BTCUSD');
    expect(useJournalStore.getState().ongoingTrades[0].lotSize).toBe(0.2);
  });

  it('toggles DailyBiasWidget Multi-Pair Matrix view and cycles timeframe cells on click', async () => {
    await useDailyBiasStore.getState().setDate('2026-11-24');
    render(<DailyBiasWidget />);

    fireEvent.click(screen.getByRole('button', { name: /Matrix/i }));
    expect(screen.getByText(/Top-Down Watchlist Matrix/i)).toBeTruthy();

    const d1Cell = screen.getByRole('button', { name: 'EURUSD D1' });
    await act(async () => {
      fireEvent.click(d1Cell);
    });
    await waitFor(() => {
      expect(useDailyBiasStore.getState().entriesByPair.EURUSD?.biasDaily).toBe('bullish');
    });

    const mnCell = screen.getByRole('button', { name: 'EURUSD MN' });
    await act(async () => {
      fireEvent.click(mnCell);
    });
    await waitFor(() => {
      expect(useDailyBiasStore.getState().monthlyByPair.EURUSD?.biasDaily).toBe('bullish');
    });
  });

  it('flags imminent Red-Folder news on OngoingTradesWidget and links Note -> auto-migrates on Close', async () => {
    const opened = await useJournalStore.getState().openOngoingTrade({
      pair: 'EURUSD',
      direction: 'long',
      entryPrice: 1.085,
      stopLoss: 1.083,
      takeProfit: 1.091,
      lotSize: 1.0,
      status: 'running',
      notes: null,
      strategyId: null,
    });

    const nowUtc = DateTime.utc();
    useMarketStore.setState({
      events: [
        {
          id: 'ev-cpi',
          provider: 'faireconomy',
          title: 'US CPI m/m',
          country: 'USD',
          eventDatetime: nowUtc.plus({ minutes: 8 }).toISO()!,
          impact: 'high',
          forecast: '0.3%',
          previous: '0.2%',
          actual: null,
          fetchedAt: nowUtc.toISO()!,
          expiresAt: nowUtc.plus({ hours: 6 }).toISO()!,
        },
      ],
    });

    render(
      <div>
        <OngoingTradesWidget />
        <QuickNotesWidget />
      </div>,
    );

    expect(screen.getByText(/NEWS 8m/i)).toBeTruthy();

    // Click +Note on ongoing EURUSD trade -> opens QuickNotesWidget linked draft
    fireEvent.click(screen.getByRole('button', { name: /\+Note/i }));
    expect(screen.getByText(/Linked to Ongoing Position/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    });
    expect(useNotesStore.getState().notes).toHaveLength(1);
    expect(useNotesStore.getState().notes[0].ongoingTradeId).toBe(opened.id);
  });

  it('applies Watchlist currency preset in EconomicCalendarWidget', async () => {
    render(<EconomicCalendarWidget now={DateTime.utc()} />);

    const wlBtn = screen.getByRole('button', { name: 'Watchlist' });
    await act(async () => {
      fireEvent.click(wlBtn);
    });

    expect(useSettingsStore.getState().settings.calendarCurrencies).toEqual(['EUR', 'USD', 'XAU']);
  });

  it('supports Multi-Account creation, Stats breakdown, Trade Inspect/Edit, and MT5 CSV Import in TradeJournalWidget', async () => {
    const trade = await useJournalStore.getState().recordTrade({
      accountId: 'default',
      pair: 'XAUUSD',
      direction: 'long',
      entryPrice: 2650,
      stopLoss: 2640,
      takeProfit: 2680,
      lotSize: 0.5,
      outcome: 'win',
      pnlDollars: 1500,
      rMultiple: 3,
      strategyId: null,
      notes: 'Clean sweep',
      screenshotPath: null,
      checklistSnapshot: JSON.stringify([
        { id: 'c1', name: 'HTF liquidity swept', checked: true, isRequired: true },
      ]),
      setupGrade: 'A+',
      entryTime: '2026-11-24T14:00:00Z',
      exitTime: '2026-11-24T15:30:00Z',
      session: 'NY AM',
    });

    const { container } = render(<TradeJournalWidget />);

    // Stats tab breakdown
    fireEvent.click(screen.getByRole('button', { name: /Stats/i }));
    expect(screen.getByText('Performance by Session')).toBeTruthy();
    expect(screen.getByText('Performance by Setup Grade')).toBeTruthy();
    expect(screen.getByText('A+')).toBeTruthy();

    // Switch back to Log tab and inspect/edit existing trade + stored checklist snapshot
    fireEvent.click(screen.getByRole('button', { name: /Log \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: `Edit trade ${trade.pair}` }));
    expect(screen.getByText('Edit Trade (XAUUSD)')).toBeTruthy();
    expect(screen.getByText('Stored Setup Checklist')).toBeTruthy();
    expect(screen.getByText('HTF liquidity swept')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Update Trade Entry/i }));
    });

    // Multi-account creation
    fireEvent.click(screen.getByRole('button', { name: /^Acc$/i }));
    expect(screen.getByText('New Trading Account')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));
    });
    await waitFor(() => {
      expect(useJournalStore.getState().profiles.length).toBeGreaterThanOrEqual(2);
    });

    // MT5 semicolon CSV import preview & commit
    const csvFileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const csvContent =
      '\uFEFFSymbol;Type;Volume;Profit\nEURUSD;buy;1.00;1 250.50\nGBPUSD;sell;0.50;(200.00)';
    const file = new File([csvContent], 'mt5.csv', { type: 'text/csv' });
    await act(async () => {
      fireEvent.change(csvFileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/CSV Preview \(2 trades ready\)/i)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Import 2 Trades/i }));
    });
    await waitFor(() => {
      expect(useJournalStore.getState().trades).toHaveLength(2);
    });
  });

  it('supports Prev/Next sibling navigation buttons and ArrowRight shortcut in FloatingDetailViewer', () => {
    const nowIso = '2026-11-26T10:00:00Z';
    useViewerStore.setState({
      previewPayload: {
        kind: 'note',
        note: {
          id: 'n1',
          title: 'London Plan',
          bodyJson: '',
          bodyText: 'Wait for sweep',
          canvasJson: null,
          tags: [],
          pair: 'EURUSD',
          session: 'London Open',
          isPinned: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        attachments: [],
        canvasTools: DEFAULT_SETTINGS.canvasTools,
        displayTimezone: 'America/New_York',
        timeFormat: '24h',
        siblings: [
          { id: 'n1', title: 'London Plan' },
          { id: 'n2', title: 'NY AM Review' },
        ],
        currentIndex: 0,
      },
      previewPinned: false,
    });

    render(<PreviewFloatingViewerPortal kind="note" />);

    expect(screen.getByText('1/2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Previous item' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next item' }));
    expect(useViewerStore.getState().navigateRequest).toMatchObject({ kind: 'note', id: 'n2' });

    useViewerStore.getState().clearNavigateRequest();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useViewerStore.getState().navigateRequest).toMatchObject({ kind: 'note', id: 'n2' });
  });
});
