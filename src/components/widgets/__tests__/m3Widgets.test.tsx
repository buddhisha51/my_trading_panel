import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useNotesStore } from '../../../stores/notesStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useStrategiesStore } from '../../../stores/strategiesStore';
import { EMPTY_TIPTAP_DOC } from '../../../types/canvas';
import { DEFAULT_SETTINGS, DEFAULT_WIDGET_LAYOUT } from '../../../types/settings';
import { QuickNotesWidget } from '../QuickNotesWidget';
import { StrategiesWidget } from '../StrategiesWidget';

describe('Milestone 3 Widgets', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
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
  });

  it('computes live Grade C -> A+ as checklist items are toggled in StrategiesWidget', async () => {
    await useStrategiesStore.getState().saveStrategy({
      id: 'st_1',
      name: 'Silver Bullet AM',
      description: '10-11 AM NY FVG model',
      bodyJson: EMPTY_TIPTAP_DOC,
      canvasJson: null,
      tags: ['ny-am'],
      isActive: true,
      sortOrder: 0,
      checklist: [
        { id: 'c1', name: 'Liquidity Sweep', description: null, sortOrder: 0, isRequired: true },
        { id: 'c2', name: 'FVG Entry', description: null, sortOrder: 1, isRequired: false },
      ],
    });

    render(<StrategiesWidget />);
    await waitFor(() => expect(screen.getByText('Grade C')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText('Liquidity Sweep'));
    });
    expect(screen.getByText('Grade B')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText('FVG Entry'));
    });
    expect(screen.getByText('Grade A+')).toBeTruthy();
  });

  it('creates, saves, and renders notes in QuickNotesWidget', async () => {
    render(<QuickNotesWidget />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Search notes (FTS5)...')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.click(screen.getByText('New'));
    });

    const titleInput = screen.getByPlaceholderText(/Note title/i);
    fireEvent.change(titleInput, { target: { value: 'NAS100 NY PM Breaker' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
      fireEvent.click(screen.getByText('Back'));
    });

    await waitFor(() => {
      expect(screen.getByText('NAS100 NY PM Breaker')).toBeTruthy();
    });
  });
});
