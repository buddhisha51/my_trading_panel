import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useNotesStore } from '../../../stores/notesStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useStrategiesStore } from '../../../stores/strategiesStore';
import { useViewerStore } from '../../../stores/viewerStore';
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
    useViewerStore.setState({
      previewPayload: null,
      editRequest: null,
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

    // Clicking Edit -> renders drag handles and Save exits back to the strategy view
    await act(async () => {
      fireEvent.click(screen.getByTitle('Edit playbook & checklist'));
    });
    expect(screen.getByRole('button', { name: 'Drag Liquidity Sweep' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => {
      expect(screen.getByText('Grade A+')).toBeTruthy();
    });
  });

  it('shows saved canvas diagram and screenshot in StrategiesWidget view', async () => {
    const sampleCanvas = JSON.stringify({
      version: 1,
      width: 560,
      height: 340,
      backgroundAttachmentPath: null,
      shapes: [
        {
          id: 'z1',
          type: 'zone_box',
          kind: 'FVG',
          label: 'FVG',
          x: 50,
          y: 60,
          width: 120,
          height: 40,
          fillOpacity: 0.25,
          color: '#3B82F6',
          strokeWidth: 1.5,
        },
      ],
    });

    await useStrategiesStore.getState().attachFileToStrategy(
      {
        id: 'st_vis_1',
        name: 'FVG Model',
        description: 'NY AM FVG',
        bodyJson: EMPTY_TIPTAP_DOC,
        canvasJson: sampleCanvas,
        tags: ['fvg'],
        isActive: true,
        sortOrder: 0,
        checklist: [],
      },
      [137, 80, 78, 71],
      'image/png',
    );

    render(<StrategiesWidget />);
    await waitFor(() => {
      expect(screen.getByText('Playbook Visuals')).toBeTruthy();
      expect(screen.getByTitle('ICT Canvas (1 shapes)')).toBeTruthy();
      expect(screen.getByAltText('Strategy screenshot')).toBeTruthy();
    });
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
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search notes (FTS5)...')).toBeTruthy();
      expect(screen.getByText('NAS100 NY PM Breaker')).toBeTruthy();
    });
  });

  it('shows canvas preview and screenshot thumbnail directly in saved note row', async () => {
    const sampleCanvas = JSON.stringify({
      version: 1,
      width: 560,
      height: 340,
      backgroundAttachmentPath: null,
      shapes: [
        {
          id: 'c1',
          type: 'candle',
          x: 100,
          bodyY: 80,
          bodyWidth: 22,
          bodyHeight: 50,
          wickTopY: 60,
          wickBottomY: 150,
          isBullish: true,
          color: '#10B981',
          strokeWidth: 2,
        },
      ],
    });

    await useNotesStore.getState().attachFileToNote(
      {
        id: 'nt_preview_1',
        title: 'EURUSD Markup',
        bodyJson: EMPTY_TIPTAP_DOC,
        bodyText: 'Marked FVG + candle',
        canvasJson: sampleCanvas,
        tags: ['fvg'],
        pair: 'EURUSD',
        session: 'NY AM',
        isPinned: false,
      },
      [137, 80, 78, 71],
      'image/png',
      100,
      60,
    );

    render(<QuickNotesWidget />);
    await waitFor(() => {
      expect(screen.getByText('EURUSD Markup')).toBeTruthy();
      expect(screen.getByTitle('ICT Canvas (1 shapes)')).toBeTruthy();
      expect(screen.getByAltText('Note screenshot')).toBeTruthy();
      expect(screen.getByText('1 Screenshot')).toBeTruthy();
    });

    // Clicking the note card opens the floating view (with full text, canvas, screenshots) and off-click closes it
    await act(async () => {
      fireEvent.click(screen.getByText('EURUSD Markup'));
    });
    const viewer = await screen.findByTestId('floating-detail-viewer');
    expect(viewer).toBeTruthy();
    expect(screen.getByText(/Attached Screenshots \(1\)/i)).toBeTruthy();
    expect(screen.getByAltText('Note screenshot attachment')).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId('floating-viewer-backdrop'));
    expect(screen.queryByTestId('floating-detail-viewer')).toBeNull();

    // Clicking the dedicated Pencil button between Pin and Delete opens inline edit mode
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
    });
    expect(screen.getByPlaceholderText(/Note title/i)).toBeTruthy();
  });

  it('opens Strategy floating viewer on click with full details and closes on off-click', async () => {
    const richBody = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Wait for 15M FVG sweep before entry.' }] },
      ],
    });
    await useStrategiesStore.getState().attachFileToStrategy(
      {
        id: 'st_view_1',
        name: '2022 Model',
        description: 'NY AM Liquidity + Displacement',
        bodyJson: richBody,
        canvasJson: null,
        tags: ['ict', 'ny-am'],
        isActive: true,
        sortOrder: 0,
        checklist: [
          { id: 'r1', name: 'HTF Draw Aligned', description: null, sortOrder: 0, isRequired: true },
        ],
      },
      [137, 80, 78, 71],
      'image/png',
    );

    render(<StrategiesWidget />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'View full playbook' })).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'View full playbook' }));
    });
    expect(await screen.findByTestId('floating-detail-viewer')).toBeTruthy();
    expect(screen.getByText('Wait for 15M FVG sweep before entry.')).toBeTruthy();
    expect(screen.getByText(/Attached Screenshots \(1\)/i)).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId('floating-viewer-backdrop'));
    expect(screen.queryByTestId('floating-detail-viewer')).toBeNull();
  });
});
