import { describe, expect, it } from 'vitest';
import { parseCanvasDocument } from '../../types/canvas';
import {
  buildCandleFromDrag,
  buildZoneBoxFromDrag,
  computeOteFibLevels,
  createCanvasHistory,
  MAX_CANVAS_UNDO_STEPS,
  pushCanvasHistory,
  redoCanvasHistory,
  undoCanvasHistory,
} from '../canvasGeometry';

describe('canvasGeometry', () => {
  it('detects bullish vs bearish candlesticks and sets wicks cleanly', () => {
    const bull = buildCandleFromDrag(100, 200, 140); // Dragged UP
    expect(bull.isBullish).toBe(true);
    expect(bull.bodyY).toBe(140);
    expect(bull.bodyHeight).toBe(60);
    expect(bull.wickTopY).toBeLessThan(bull.bodyY);
    expect(bull.wickBottomY).toBeGreaterThan(bull.bodyY + bull.bodyHeight);

    const bear = buildCandleFromDrag(100, 120, 190); // Dragged DOWN
    expect(bear.isBullish).toBe(false);
    expect(bear.bodyY).toBe(120);
    expect(bear.bodyHeight).toBe(70);
  });

  it('computes OTE Fibonacci 0.62 / 0.705 / 0.79 levels cleanly', () => {
    const ote = computeOteFibLevels(100, 300);
    expect(ote.levels.map((l) => l.ratio)).toEqual([0.62, 0.705, 0.79]);
    expect(ote.levels[0].y).toBeCloseTo(224, 5);
    expect(ote.levels[1].y).toBeCloseTo(241, 5);
    expect(ote.levels[2].y).toBeCloseTo(258, 5);
    expect(ote.zoneTopY).toBeCloseTo(224, 5);
    expect(ote.zoneBottomY).toBeCloseTo(258, 5);
  });

  it('supports undo/redo capped at MAX_CANVAS_UNDO_STEPS and strips base64 paths', () => {
    let hist = createCanvasHistory([]);
    for (let i = 0; i < MAX_CANVAS_UNDO_STEPS + 10; i++) {
      hist = pushCanvasHistory(hist, [buildZoneBoxFromDrag('FVG', 10, 10, 50 + i, 40)]);
    }
    expect(hist.past.length).toBe(MAX_CANVAS_UNDO_STEPS);

    const undone = undoCanvasHistory(hist);
    expect(undone.future.length).toBe(1);
    const redone = redoCanvasHistory(undone);
    expect(redone.present).toEqual(hist.present);

    const sanitized = parseCanvasDocument(
      JSON.stringify({
        version: 1,
        width: 640,
        height: 420,
        backgroundAttachmentPath: 'data:image/png;base64,AAAA',
        shapes: [],
      }),
    );
    expect(sanitized.backgroundAttachmentPath).toBeNull();

    const validRel = parseCanvasDocument(
      JSON.stringify({
        version: 1,
        width: 640,
        height: 420,
        backgroundAttachmentPath: 'notes/nt_1/att_1.png',
        shapes: [],
      }),
    );
    expect(validRel.backgroundAttachmentPath).toBe('notes/nt_1/att_1.png');
  });
});
