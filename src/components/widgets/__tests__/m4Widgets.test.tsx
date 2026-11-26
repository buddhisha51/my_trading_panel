import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tauriBridge } from '../../../services/tauriBridge';
import { useJournalStore } from '../../../stores/journalStore';
import { useMarketStore } from '../../../stores/marketStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useStrategiesStore } from '../../../stores/strategiesStore';
import { DEFAULT_SETTINGS, DEFAULT_WIDGET_LAYOUT } from '../../../types/settings';
import { EconomicCalendarWidget } from '../EconomicCalendarWidget';
import { NewsFeedWidget } from '../NewsFeedWidget';
import { OngoingTradesWidget } from '../OngoingTradesWidget';
import { TradeJournalWidget } from '../TradeJournalWidget';

describe('Milestone 4 Widgets', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      widgetLayout: DEFAULT_WIDGET_LAYOUT.map((w) => ({ ...w })),
      hydrated: true,
      saving: false,
    });
    useStrategiesStore.setState({
      strategies: [],
      loading: false,
      saving: false,
      checkedRuleIdsByStrategy: {},
      attachmentsByStrategyId: {},
    });
    useJournalStore.setState({
      profile: {
        id: 'default',
        accountName: 'My Account',
        startingBalance: 0,
        currentBalance: 0,
        highWaterMark: 0,
        currency: 'USD',
        ddMode: 'static',
        dailyDdLimit: 5,
        maxDdLimit: 10,
        updatedAt: '',
      },
      trades: [],
      ongoingTrades: [],
      snapshots: [],
      loading: false,
      saving: false,
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

  it('sets up account, logs trade, and displays DD limit warning in TradeJournalWidget', async () => {
    await useJournalStore.getState().updateProfile({
      accountName: 'Eval 10K',
      startingBalance: 10000,
      currency: 'USD',
      ddMode: 'static',
      dailyDdLimit: 3,
      maxDdLimit: 6,
    });

    await useJournalStore.getState().recordTrade({
      pair: 'EURUSD',
      direction: 'short',
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      lotSize: 1,
      outcome: 'loss',
      pnlDollars: -350,
      rMultiple: -1,
      strategyId: null,
      notes: 'Countertrend entry',
      screenshotPath: null,
      checklistSnapshot: null,
      setupGrade: null,
      entryTime: new Date().toISOString(),
      exitTime: new Date().toISOString(),
      session: 'NY AM',
    });

    render(<TradeJournalWidget />);
    await waitFor(() =>
      expect(screen.getByText(/Daily DD limit reached/i)).toBeTruthy(),
    );
    expect(screen.getByText('-$350.00')).toBeTruthy();
  });

  it('displays active OngoingTradesWidget entry and opens close-to-journal sheet', async () => {
    await useJournalStore.getState().openOngoingTrade({
      pair: 'XAUUSD',
      direction: 'long',
      entryPrice: 2650,
      stopLoss: 2642,
      takeProfit: 2674,
      lotSize: 0.25,
      notes: 'OB bounce',
      strategyId: null,
    });

    render(<OngoingTradesWidget />);
    await waitFor(() => expect(screen.getByText('XAUUSD')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText('Close'));
    });
    expect(screen.getByText(/Close XAUUSD/i)).toBeTruthy();
  });

  it('shows High Volatility banner and filters currencies in EconomicCalendarWidget', async () => {
    const now = DateTime.fromISO('2026-07-15T12:20:00Z', { zone: 'utc' });
    await useMarketStore.getState().addManualEvent({
      title: 'US Core CPI',
      country: 'USD',
      eventDatetime: '2026-07-15T12:30:00Z', // 10 min away
      impact: 'high',
      forecast: '0.3%',
      previous: '0.2%',
    });

    render(<EconomicCalendarWidget now={now} />);
    await waitFor(() =>
      expect(screen.getByText(/High Volatility: US Core CPI \(USD\) in 10m/i)).toBeTruthy(),
    );

    // Add a trading pair filter chip (EURUSD) and verify edit/remove controls exist
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add calendar currency or pair' }));
    });
    const addInput = screen.getByLabelText('Add currency or pair');
    fireEvent.change(addInput, { target: { value: 'EURUSD' } });
    await act(async () => {
      fireEvent.submit(addInput.closest('form')!);
    });
    expect(useSettingsStore.getState().settings.calendarFilterOptions).toContain('EURUSD');
    expect(useSettingsStore.getState().settings.calendarCurrencies).toContain('EURUSD');

    // Removing EURUSD cleans up both option and active filter
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove EURUSD' }));
    });
    expect(useSettingsStore.getState().settings.calendarFilterOptions).not.toContain('EURUSD');
  });

  it('filters NewsFeedWidget categories and opens articles in external browser', async () => {
    const openSpy = vi.spyOn(tauriBridge, 'openExternalUrl').mockResolvedValue();
    localStorage.setItem(
      'ict_panel_preview_news_items',
      JSON.stringify([
        {
          id: 'n1',
          provider: 'forexlive',
          sourceName: 'ForexLive',
          category: 'forex',
          title: 'Dollar strengthens ahead of FOMC',
          url: 'https://www.forexlive.com/news/dollar-fomc',
          publishedAt: new Date().toISOString(),
          relatedCurrencies: ['USD'],
          fetchedAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        },
        {
          id: 'n2',
          provider: 'cryptocompare',
          sourceName: 'CoinTelegraph',
          category: 'crypto',
          title: 'BTC tests liquidity high',
          url: 'https://cointelegraph.com/news/btc',
          publishedAt: new Date().toISOString(),
          relatedCurrencies: ['BTC'],
          fetchedAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        },
      ]),
    );

    render(<NewsFeedWidget />);
    await waitFor(() =>
      expect(screen.getByText('Dollar strengthens ahead of FOMC')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Dollar strengthens ahead of FOMC'));
    });
    expect(openSpy).toHaveBeenCalledWith('https://www.forexlive.com/news/dollar-fomc');

    // Toggle forex off -> only crypto remains
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'forex' }));
    });
    expect(screen.queryByText('Dollar strengthens ahead of FOMC')).toBeNull();
    expect(screen.getByText('BTC tests liquidity high')).toBeTruthy();

    openSpy.mockRestore();
  });
});
