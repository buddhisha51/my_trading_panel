import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDailyBiasStore } from '../../../stores/dailyBiasStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { DEFAULT_SETTINGS, DEFAULT_WIDGET_LAYOUT } from '../../../types/settings';
import { DailyBiasWidget } from '../DailyBiasWidget';
import { KillzoneTimelineWidget } from '../KillzoneTimelineWidget';
import { RiskCalculatorWidget } from '../RiskCalculatorWidget';
import { SessionClockWidget } from '../SessionClockWidget';

describe('Milestone 2 Widgets', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      widgetLayout: DEFAULT_WIDGET_LAYOUT.map((w) => ({ ...w })),
      hydrated: true,
      saving: false,
    });
    useDailyBiasStore.setState({
      selectedDate: '2026-07-15',
      entriesByPair: {},
      loading: false,
      savingPair: null,
    });
  });

  it('renders KillzoneTimelineWidget and toggles axis and overlay controls', async () => {
    const now = DateTime.fromISO('2026-07-15T12:30:00Z', { zone: 'utc' }); // 08:30 NY AM Forex
    render(<KillzoneTimelineWidget now={now} />);

    expect(screen.getByText('New York AM (Forex)')).toBeTruthy();
    const axisBtn = screen.getByText('NY Axis');
    await act(async () => {
      fireEvent.click(axisBtn);
    });
    expect(useSettingsStore.getState().settings.timelineAxisMode).toBe('local');
  });

  it('renders all 4 financial center clocks in SessionClockWidget', () => {
    const now = DateTime.fromISO('2026-07-15T14:30:00Z', { zone: 'utc' }); // London/NY overlap
    render(<SessionClockWidget now={now} />);

    expect(screen.getByText('Sydney')).toBeTruthy();
    expect(screen.getByText('Tokyo')).toBeTruthy();
    expect(screen.getByText('London')).toBeTruthy();
    expect(screen.getByText('New York')).toBeTruthy();
    expect(screen.getByText('London / NY Peak Overlap')).toBeTruthy();
  });

  it('persists directional bias clicks inside DailyBiasWidget', async () => {
    render(<DailyBiasWidget />);

    const bullButtons = screen.getAllByText('Bull');
    await act(async () => {
      fireEvent.click(bullButtons[0]); // D1 Bullish
    });

    await waitFor(() => {
      expect(useDailyBiasStore.getState().entriesByPair.EURUSD?.biasDaily).toBe('bullish');
    });
  });

  it('calculates lot sizes live in RiskCalculatorWidget across instruments and R-targets', async () => {
    render(<RiskCalculatorWidget />);

    // Default EURUSD: Equity 10000, 1% ($100), Entry 1.08500, SL 1.08350 -> 0.66 lots
    expect(screen.getByText('0.66 lots')).toBeTruthy();

    const r3Button = screen.getByText('1:3');
    await act(async () => {
      fireEvent.click(r3Button);
    });
    expect(screen.getByText(/R:R 1 : 3\.00/)).toBeTruthy();
  });

  it('allows removing pairs in DailyBiasWidget and custom symbols in RiskCalculatorWidget', async () => {
    render(<DailyBiasWidget />);
    const removeUsdJpy = screen.getByRole('button', { name: 'Remove USDJPY' });
    await act(async () => {
      fireEvent.click(removeUsdJpy);
    });
    expect(useSettingsStore.getState().settings.watchlistPairs).not.toContain('USDJPY');

    render(<RiskCalculatorWidget />);
    await act(async () => {
      fireEvent.click(screen.getByText('Spec'));
    });
    const customInput = screen.getByPlaceholderText(/Add custom symbol/i);
    fireEvent.change(customInput, { target: { value: 'BTCUSD' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    });
    expect(useSettingsStore.getState().settings.selectedInstrument).toBe('BTCUSD');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove BTCUSD' }));
    });
    expect(useSettingsStore.getState().settings.instrumentSpecs.some((s) => s.symbol === 'BTCUSD')).toBe(
      false,
    );
  });
});
