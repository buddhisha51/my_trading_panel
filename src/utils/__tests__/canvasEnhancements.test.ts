import { describe, expect, it } from 'vitest';
import {
  buildCandleFromDrag,
  buildIctPatternTemplate,
  buildLiquidityLineFromDrag,
  buildOteFibFromDrag,
  buildZoneBoxFromDrag,
  duplicateCanvasShape,
} from '../canvasGeometry';

describe('canvasGeometry: duplicateCanvasShape & ICT templates', () => {
  it('clones any shape with a distinct ULID and offset coordinates for Ctrl+D', () => {
    const zone = buildZoneBoxFromDrag('BPR', 40, 60, 140, 95);
    const dupZone = duplicateCanvasShape(zone, 18);
    expect(dupZone.id).not.toBe(zone.id);
    expect(dupZone.type).toBe('zone_box');
    if (dupZone.type === 'zone_box') {
      expect(dupZone.kind).toBe('BPR');
      expect(dupZone.x).toBe(zone.x + 18);
      expect(dupZone.y).toBe(zone.y + 18);
    }

    const candle = buildCandleFromDrag(100, 120, 70, 20);
    const dupCandle = duplicateCanvasShape(candle, 16);
    expect(dupCandle.id).not.toBe(candle.id);
    if (dupCandle.type === 'candle') {
      expect(dupCandle.x).toBe(candle.x + 16);
      expect(dupCandle.bodyY).toBe(candle.bodyY + 16);
      expect(dupCandle.wickTopY).toBe(candle.wickTopY + 16);
      expect(dupCandle.wickBottomY).toBe(candle.wickBottomY + 16);
    }

    const liq = buildLiquidityLineFromDrag('BSL', 10, 20, 90, 20);
    const dupLiq = duplicateCanvasShape(liq, 10);
    expect(dupLiq.id).not.toBe(liq.id);
    if (dupLiq.type === 'liquidity_line') {
      expect(dupLiq.x1).toBe(20);
      expect(dupLiq.x2).toBe(100);
    }

    const ote = buildOteFibFromDrag(30, 50, 160, 190);
    const dupOte = duplicateCanvasShape(ote, 12);
    expect(dupOte.id).not.toBe(ote.id);
    if (dupOte.type === 'ote_fib') {
      expect(dupOte.x).toBe(ote.x + 12);
      expect(dupOte.startY).toBe(ote.startY + 12);
      expect(dupOte.endY).toBe(ote.endY + 12);
    }
  });

  it('builds centered ICT 2022 Model and Breaker+BPR multi-shape templates', () => {
    const model2022 = buildIctPatternTemplate('model_2022', 280, 170);
    expect(model2022.map((s) => s.type)).toEqual([
      'liquidity_line',
      'candle',
      'mss_arrow',
      'zone_box',
    ]);
    const fvg = model2022[3];
    expect(fvg.type === 'zone_box' && fvg.kind).toBe('FVG');

    const breakerBpr = buildIctPatternTemplate('breaker_bpr', 280, 170);
    expect(breakerBpr).toHaveLength(4);
    const kinds = breakerBpr
      .filter((s) => s.type === 'zone_box')
      .map((s) => (s.type === 'zone_box' ? s.kind : null));
    expect(kinds).toEqual(['OB', 'BB', 'BPR']);
  });
});
