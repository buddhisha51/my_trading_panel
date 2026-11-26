import type {
  CandleShape,
  CanvasShape,
  LiquidityLineShape,
  LiquidityTag,
  MssArrowShape,
  OteFibShape,
  ZoneBoxShape,
} from '../types/canvas';
import { generateUlid } from './id';

export const MAX_CANVAS_UNDO_STEPS = 50;

/**
 * Computes OTE Fibonacci retracement Y-coordinates for levels `0.62`, `0.705`, `0.79`
 * as well as the shaded OTE box `[min(y_0.62, y_0.79), max(y_0.62, y_0.79)]`.
 * `startY` = swing anchor A (0.0), `endY` = opposite swing anchor B (1.0 impulse end -> retraces back toward A? Wait: standard ICT Fib: 0 = swing high/low end, 1 = origin, so retracing from B back toward A hits 0.62..0.79 between B and A; here startY = origin (1.0) -> endY = swing (0.0), so level = endY + (startY - endY) * ratio OR wait:
 * Let's match Appendix A formula: `startY` = origin point A -> `endY` = swing point B, 0.62..0.79 sits 62%-79% back from B toward A OR 62%-79% of span from A to B:
 * Let's compute `y = startY + (endY - startY) * ratio` so dragging from impulse origin (startY) to end (endY) puts 0.62..0.79 consistently inside the dragged bounding span!).
 */
export interface OteLevelResult {
  ratio: number;
  label: string;
  y: number;
  isSweetSpot: boolean;
}

export function computeOteFibLevels(
  startY: number,
  endY: number,
): {
  levels: OteLevelResult[];
  zoneTopY: number;
  zoneBottomY: number;
} {
  const span = endY - startY;
  const y62 = startY + span * 0.62;
  const y705 = startY + span * 0.705;
  const y79 = startY + span * 0.79;

  return {
    levels: [
      { ratio: 0.62, label: '0.62', y: y62, isSweetSpot: false },
      { ratio: 0.705, label: '0.705 OTE', y: y705, isSweetSpot: true },
      { ratio: 0.79, label: '0.79', y: y79, isSweetSpot: false },
    ],
    zoneTopY: Math.min(y62, y79),
    zoneBottomY: Math.max(y62, y79),
  };
}

/**
 * Creates a Candlestick shape from a vertical drag `[startY -> endY]` at center `x`.
 * Dragging up (`endY < startY`) produces a Bullish green candle; dragging down produces Bearish red.
 */
export function buildCandleFromDrag(
  centerX: number,
  startY: number,
  endY: number,
  bodyWidth = 22,
): CandleShape {
  const isBullish = endY < startY;
  const minH = 12;
  const rawHeight = Math.abs(endY - startY);
  const bodyHeight = Math.max(minH, rawHeight);
  const bodyY = isBullish ? Math.min(startY, endY) : startY;
  const defaultWick = 16;

  return {
    id: generateUlid(),
    type: 'candle',
    x: centerX - bodyWidth / 2,
    bodyY,
    bodyWidth,
    bodyHeight,
    wickTopY: bodyY - defaultWick,
    wickBottomY: bodyY + bodyHeight + defaultWick,
    isBullish,
    color: isBullish ? '#10B981' : '#EF4444',
    strokeWidth: 2,
  };
}

export function buildZoneBoxFromDrag(
  kind: ZoneBoxShape['kind'],
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): ZoneBoxShape {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.max(24, Math.abs(endX - startX));
  const height = Math.max(14, Math.abs(endY - startY));

  const colorMap: Record<ZoneBoxShape['kind'], string> = {
    FVG: '#3B82F6',
    IFVG: '#8B5CF6',
    OB: '#10B981',
    BB: '#F59E0B',
  };

  return {
    id: generateUlid(),
    type: 'zone_box',
    kind,
    label: kind,
    x,
    y,
    width,
    height,
    fillOpacity: 0.22,
    color: colorMap[kind],
    strokeWidth: 1.5,
  };
}

export function buildLiquidityLineFromDrag(
  tag: LiquidityTag,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): LiquidityLineShape {
  return {
    id: generateUlid(),
    type: 'liquidity_line',
    x1,
    y1,
    x2: Math.abs(x2 - x1) < 12 ? x1 + 60 : x2,
    y2,
    tag,
    color: tag === 'BSL' ? '#10B981' : tag === 'SSL' ? '#EF4444' : '#F59E0B',
    strokeWidth: 2,
  };
}

export function buildMssArrowFromDrag(
  label: 'MSS' | 'CISD',
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): MssArrowShape {
  const bullish = y2 < y1;
  return {
    id: generateUlid(),
    type: 'mss_arrow',
    x1,
    y1,
    x2,
    y2: Math.abs(y2 - y1) < 8 && Math.abs(x2 - x1) < 8 ? y1 - 36 : y2,
    label,
    color: bullish ? '#10B981' : '#EF4444',
    strokeWidth: 2.5,
  };
}

export function buildOteFibFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): OteFibShape {
  const x = Math.min(startX, endX);
  const width = Math.max(90, Math.abs(endX - startX));
  const minSpanY = Math.abs(endY - startY) < 20 ? startY + 100 : endY;

  return {
    id: generateUlid(),
    type: 'ote_fib',
    x,
    width,
    startY,
    endY: minSpanY,
    color: '#F59E0B',
    strokeWidth: 1.5,
  };
}

export interface CanvasHistoryState {
  past: CanvasShape[][];
  present: CanvasShape[];
  future: CanvasShape[][];
}

export function createCanvasHistory(initial: CanvasShape[]): CanvasHistoryState {
  return { past: [], present: initial, future: [] };
}

export function pushCanvasHistory(
  history: CanvasHistoryState,
  nextShapes: CanvasShape[],
): CanvasHistoryState {
  const nextPast = [...history.past, history.present].slice(-MAX_CANVAS_UNDO_STEPS);
  return {
    past: nextPast,
    present: nextShapes,
    future: [],
  };
}

export function undoCanvasHistory(history: CanvasHistoryState): CanvasHistoryState {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, MAX_CANVAS_UNDO_STEPS),
  };
}

export function redoCanvasHistory(history: CanvasHistoryState): CanvasHistoryState {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    past: [...history.past, history.present].slice(-MAX_CANVAS_UNDO_STEPS),
    present: next,
    future: history.future.slice(1),
  };
}
