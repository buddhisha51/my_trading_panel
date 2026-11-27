import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotesStore } from '../../../stores/notesStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useStrategiesStore } from '../../../stores/strategiesStore';
import { createEmptyCanvasDocument, type CanvasDocument } from '../../../types/canvas';
import { DEFAULT_SETTINGS, DEFAULT_WIDGET_LAYOUT } from '../../../types/settings';
import { SettingsOverlay } from '../../settings/SettingsOverlay';
import { QuickNotesWidget } from '../../widgets/QuickNotesWidget';
import { StrategiesWidget } from '../../widgets/StrategiesWidget';
import { CanvasMiniPreview } from '../CanvasMiniPreview';
import { DrawingCanvas } from '../DrawingCanvas';

vi.mock('react-konva', () => {
  const mkStageEvt = (x = 120, y = 160) => {
    const stageObj = {
      getPointerPosition: () => ({ x, y }),
      getStage: () => stageObj,
    };
    return { target: stageObj };
  };
  return {
    Stage: ({
      children,
      onMouseDown,
      onMouseMove,
      onMouseUp,
    }: {
      children?: ReactNode;
      onMouseDown?: (e: unknown) => void;
      onMouseMove?: (e: unknown) => void;
      onMouseUp?: () => void;
    }) => (
      <div
        data-testid="konva-stage-mock"
        onMouseDown={(e) => onMouseDown?.(mkStageEvt(e.clientX || 120, e.clientY || 160))}
        onMouseMove={(e) => onMouseMove?.(mkStageEvt(e.clientX || 120, e.clientY || 160))}
        onMouseUp={() => onMouseUp?.()}
      >
        {children}
      </div>
    ),
    Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Group: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Rect: () => null,
    Line: () => null,
    Arrow: () => null,
    Circle: () => null,
    Text: () => null,
    Image: () => null,
    Transformer: () => null,
  };
});

describe('DrawingCanvas & CanvasMiniPreview', () => {
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

  it('exposes Rect, Fib, H-Line, V-Line, and Channel tools in both QuickNotesWidget and StrategiesWidget', async () => {
    const notesView = render(<QuickNotesWidget />);
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    fireEvent.click(screen.getByRole('button', { name: /ICT Canvas/i }));
    await waitFor(() => expect(screen.getByTitle('Rectangle Box')).toBeTruthy(), {
      timeout: 5000,
    });
      for (const label of ['Rect', 'BPR', 'Fib', 'H-Line', 'V-Line', 'Channel', 'MSS', 'CISD']) {
        expect(screen.getByRole('button', { name: label })).toBeTruthy();
      }
      notesView.unmount();

      render(<StrategiesWidget />);
      fireEvent.click(screen.getByRole('button', { name: /New/i }));
      fireEvent.click(screen.getByRole('button', { name: /Diagram/i }));
      await waitFor(() => expect(screen.getByTitle('Rectangle Box')).toBeTruthy(), {
        timeout: 5000,
      });
        for (const label of ['Rect', 'BPR', 'Fib', 'H-Line', 'V-Line', 'Channel', 'MSS', 'CISD']) {
          expect(screen.getByRole('button', { name: label })).toBeTruthy();
        }
      }, 15000);

  it('creates horizontal MSS & CISD arrows on single click and draws Rect, Fib, H-Line, V-Line, and Channel', () => {
    let latestDoc: CanvasDocument = createEmptyCanvasDocument(560, 340);
    render(
      <DrawingCanvas
        document={latestDoc}
        onChange={(next) => {
          latestDoc = next;
        }}
        onSaveScreenshotFile={async () => null}
      />,
    );

    const stage = screen.getByTestId('konva-stage-mock');

    // One-click MSS -> horizontal arrow
    fireEvent.click(screen.getByRole('button', { name: 'MSS' }));
    fireEvent.mouseDown(stage, { clientX: 100, clientY: 140 });
    fireEvent.mouseUp(stage);
    const mss = latestDoc.shapes[latestDoc.shapes.length - 1];
    expect(mss.type).toBe('mss_arrow');
    if (mss.type === 'mss_arrow') {
      expect(mss.label).toBe('MSS');
      expect(mss.y1).toBe(140);
      expect(mss.y2).toBe(140);
      expect(mss.x2).toBeGreaterThan(mss.x1);
    }

    // One-click CISD -> horizontal arrow
    fireEvent.click(screen.getByRole('button', { name: 'CISD' }));
    fireEvent.mouseDown(stage, { clientX: 150, clientY: 200 });
    fireEvent.mouseUp(stage);
    const cisd = latestDoc.shapes[latestDoc.shapes.length - 1];
    expect(cisd.type).toBe('mss_arrow');
    if (cisd.type === 'mss_arrow') {
      expect(cisd.label).toBe('CISD');
      expect(cisd.y1).toBe(200);
      expect(cisd.y2).toBe(200);
      expect(cisd.x2).toBeGreaterThan(cisd.x1);
    }

    // Rect, BPR, Fib, H-Line, V-Line, Channel
    for (const [btn, expectedType] of [
      ['Rect', 'rect'],
      ['BPR', 'zone_box'],
      ['Fib', 'fib_retracement'],
      ['H-Line', 'straight_line'],
      ['V-Line', 'straight_line'],
      ['Channel', 'channel'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: btn }));
      fireEvent.mouseDown(stage, { clientX: 80, clientY: 90 });
      fireEvent.mouseMove(stage, { clientX: 200, clientY: 190 });
      fireEvent.mouseUp(stage);
      expect(latestDoc.shapes[latestDoc.shapes.length - 1].type).toBe(expectedType);
    }
    const bprShape = latestDoc.shapes.find((s) => s.type === 'zone_box');
    expect(bprShape?.type === 'zone_box' ? bprShape.kind : null).toBe('BPR');

    // Preview renders all new shape types cleanly
    const { container } = render(<CanvasMiniPreview canvasJson={JSON.stringify(latestDoc)} />);
    expect(container.querySelectorAll('polygon').length).toBe(1); // Channel fill
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2); // Rect + Fib golden pocket
    expect(container.querySelectorAll('text').length).toBe(2); // MSS + CISD labels
  });

  it('scales OTE smoothly on drag and makes uploaded/pasted snips selectable, resizable, and removable', async () => {
    let latestDoc: CanvasDocument = createEmptyCanvasDocument(560, 340);
    const { container } = render(
      <DrawingCanvas
        document={latestDoc}
        onChange={(next) => {
          latestDoc = next;
        }}
        onSaveScreenshotFile={async () => 'notes/n_test/snip_1.png'}
      />,
    );

    const stage = screen.getByTestId('konva-stage-mock');

    // Drag OTE smoothly to small + large dimensions
    fireEvent.click(screen.getByRole('button', { name: 'OTE' }));
    fireEvent.mouseDown(stage, { clientX: 80, clientY: 100 });
    fireEvent.mouseMove(stage, { clientX: 120, clientY: 115 });
    fireEvent.mouseUp(stage);
    const ote = latestDoc.shapes[0];
    expect(ote.type).toBe('ote_fib');
    if (ote.type === 'ote_fib') {
      expect(ote.width).toBe(40);
      expect(ote.startY).toBe(100);
      expect(ote.endY).toBe(115);
    }

    // Upload/paste screenshot onto canvas -> adds movable/resizable ImageShape, switches to Sel, enables Delete
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], 'snip.png', {
      type: 'image/png',
    });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [pngFile] } });
    });

    await waitFor(() => {
      expect(latestDoc.shapes.some((s) => s.type === 'image')).toBe(true);
    });
    const imgShape = latestDoc.shapes.find((s) => s.type === 'image');
    expect(imgShape?.type).toBe('image');

    // Delete button is enabled because pasted snip is auto-selected in Select mode
    const deleteBtn = screen.getByTitle('Delete selected shape') as HTMLButtonElement;
    expect(deleteBtn.disabled).toBe(false);
    fireEvent.click(deleteBtn);
    expect(latestDoc.shapes.some((s) => s.type === 'image')).toBe(false);
  });

  it('opens Text tool input on click without closing on immediate canvas blur and commits label', () => {
    let latestDoc: CanvasDocument = createEmptyCanvasDocument(560, 340);
    render(
      <DrawingCanvas
        document={latestDoc}
        onChange={(next) => {
          latestDoc = next;
        }}
        onSaveScreenshotFile={async () => null}
      />,
    );

    const stage = screen.getByTestId('konva-stage-mock');
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.mouseDown(stage, { clientX: 110, clientY: 130 });
    fireEvent.mouseUp(stage);

    const input = screen.getByPlaceholderText('Label...') as HTMLInputElement;
    // Simulate immediate stray blur right after opening on canvas click
    fireEvent.blur(input);
    expect(screen.getByPlaceholderText('Label...')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'NY AM Sweep' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    const textShape = latestDoc.shapes.find((s) => s.type === 'text_note');
    expect(textShape?.type).toBe('text_note');
    if (textShape?.type === 'text_note') {
      expect(textShape.text).toBe('NY AM Sweep');
    }
  });

  it('allows dynamic editing and resetting of OTE & Fib ranges and colors in Settings > Widgets', async () => {
    render(<SettingsOverlay initialTab="widgets" />);

    expect(screen.getByText(/Canvas Tools: OTE & Fib Ranges \/ Colors/i)).toBeTruthy();

    const oteRatio1 = screen.getByLabelText('ote level 1 ratio') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(oteRatio1, { target: { value: '0.618' } });
      fireEvent.blur(oteRatio1);
    });
    expect(useSettingsStore.getState().settings.canvasTools.oteLevels[0].ratio).toBe(0.618);

    const oteBandColor = screen.getByLabelText('ote Band Color') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(oteBandColor, { target: { value: '#3b82f6' } });
    });
    expect(useSettingsStore.getState().settings.canvasTools.oteColor.toLowerCase()).toBe('#3b82f6');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset OTE Tool' }));
    });
    expect(useSettingsStore.getState().settings.canvasTools.oteLevels[0].ratio).toBe(0.62);
  });
});
