import { describe, expect, it } from 'vitest';
import { parseCanvasDocument } from '../../types/canvas';
import {
  buildCandleFromDrag,
  buildChannelFromDrag,
  buildFibFromDrag,
  buildImageShape,
  buildMssArrowFromDrag,
  buildOteFibFromDrag,
  buildRectFromDrag,
  buildStraightLine,
  buildZoneBoxFromDrag,
  computeFibLevels,
  computeOteFibLevels,
  createCanvasHistory,
  fitImageRectToStage,
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

  it('defaults 1-click MSS and CISD arrows horizontally and builds Rect, Fib, Lines, and Channel shapes', () => {
    const mssTap = buildMssArrowFromDrag('MSS', 120, 200, 120, 200, '#3B82F6');
    expect(mssTap.y1).toBe(200);
    expect(mssTap.y2).toBe(200);
    expect(mssTap.x2).toBeGreaterThan(mssTap.x1);
    expect(mssTap.color).toBe('#3B82F6');

    const cisdTap = buildMssArrowFromDrag('CISD', 80, 150, 82, 152, '#F59E0B');
    expect(cisdTap.y1).toBe(150);
    expect(cisdTap.y2).toBe(150);
    expect(cisdTap.x2).toBeGreaterThan(cisdTap.x1);
    expect(cisdTap.color).toBe('#F59E0B');

    const rect = buildRectFromDrag(40, 50, 140, 110, '#10B981');
    expect(rect.type).toBe('rect');
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(60);

    const fib = buildFibFromDrag(50, 100, 220, 300, '#F59E0B');
    expect(fib.type).toBe('fib_retracement');
    const levels = computeFibLevels(fib.startY, fib.endY);
    expect(levels.levels.map((l) => l.ratio)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
    expect(levels.levels[3].y).toBeCloseTo(200, 5); // 0.5 midpoint

    const hline = buildStraightLine('horizontal', 140, 180, 560, 340, '#3B82F6');
    expect(hline.x1).toBe(0);
    expect(hline.x2).toBe(560);
    expect(hline.y1).toBe(180);
    expect(hline.y2).toBe(180);

    const vline = buildStraightLine('vertical', 245, 180, 560, 340, '#EF4444');
    expect(vline.x1).toBe(245);
    expect(vline.x2).toBe(245);
    expect(vline.y1).toBe(0);
    expect(vline.y2).toBe(340);

    const channel = buildChannelFromDrag(60, 220, 260, 160, '#A855F7');
    expect(channel.type).toBe('channel');
    expect(channel.x1).toBe(60);
    expect(channel.x2).toBe(260);
    expect(channel.offsetY).toBe(48);

    // OTE scales smoothly during drag without snapping +20px/+100px
    const oteDragging = buildOteFibFromDrag(100, 100, 130, 114, false);
    expect(oteDragging.width).toBe(30);
    expect(oteDragging.startY).toBe(100);
    expect(oteDragging.endY).toBe(114);

    // Single tap with applyTapDefault creates default OTE dimensions
    const oteTap = buildOteFibFromDrag(100, 100, 100, 100, true);
    expect(oteTap.width).toBe(140);
    expect(oteTap.endY).toBe(200);

    // Snip image fit & shape builder
    const fitted = fitImageRectToStage(1000, 500, 560, 340);
    expect(fitted.width).toBeLessThanOrEqual(Math.round(560 * 0.78));
    expect(Math.abs(fitted.height - fitted.width / 2)).toBeLessThanOrEqual(1);
    const imgShape = buildImageShape('notes/n1/snip.png', fitted);
    expect(imgShape.type).toBe('image');
    expect(imgShape.attachmentPath).toBe('notes/n1/snip.png');
  });
});
