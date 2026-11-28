import {
  DEFAULT_FIB_LEVELS,
  DEFAULT_OTE_LEVELS,
  type CandleShape,
  type CanvasShape,
  type ChannelShape,
  type FibLevelConfig,
  type FibRetracementShape,
  type ImageShape,
  type LiquidityLineShape,
  type LiquidityTag,
  type MssArrowShape,
  type OteFibShape,
  type RectShape,
  type StraightLineShape,
  type ZoneBoxShape,
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
  configuredLevels?: FibLevelConfig[],
): {
  levels: OteLevelResult[];
  zoneTopY: number;
  zoneBottomY: number;
} {
  const span = endY - startY;
  const source =
    configuredLevels && configuredLevels.length > 0 ? configuredLevels : DEFAULT_OTE_LEVELS;
  const levels = source.map((item) => ({
    ratio: item.ratio,
    label: item.label || String(item.ratio),
    y: startY + span * item.ratio,
    isSweetSpot: item.isHighlight,
  }));

  const ys = levels.map((l) => l.y);
  const zoneTopY = ys.length > 0 ? Math.min(...ys) : startY;
  const zoneBottomY = ys.length > 0 ? Math.max(...ys) : endY;

  return {
    levels,
    zoneTopY,
    zoneBottomY,
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
    BPR: '#06B6D4',
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
  defaultColor = '#10B981',
): MssArrowShape {
  const isTap = Math.abs(x2 - x1) < 8 && Math.abs(y2 - y1) < 8;
  const endX = isTap ? x1 + 60 : x2;
  const endY = isTap ? y1 : y2;
  const dy = endY - y1;
  const color = Math.abs(dy) < 6 ? defaultColor : dy < 0 ? '#10B981' : '#EF4444';

  return {
    id: generateUlid(),
    type: 'mss_arrow',
    x1,
    y1,
    x2: endX,
    y2: endY,
    label,
    color,
    strokeWidth: 2.5,
  };
}

export interface FibLevelResult {
  ratio: number;
  label: string;
  y: number;
  isHighlight: boolean;
}

export function computeFibLevels(
  startY: number,
  endY: number,
  configuredLevels?: FibLevelConfig[],
): {
  levels: FibLevelResult[];
  goldenTopY: number;
  goldenBottomY: number;
} {
  const span = endY - startY;
  const source =
    configuredLevels && configuredLevels.length > 0 ? configuredLevels : DEFAULT_FIB_LEVELS;
  const levels = source.map((r) => ({
    ratio: r.ratio,
    label: r.label || String(r.ratio),
    y: startY + span * r.ratio,
    isHighlight: r.isHighlight,
  }));

  const pocketLevels = levels.filter((l) => l.ratio === 0.618 || l.ratio === 0.786);
  const bandSource =
    pocketLevels.length >= 2 ? pocketLevels : levels.filter((l) => l.isHighlight);
  const bandYs = bandSource.map((l) => l.y);

  const goldenTopY = bandYs.length >= 2 ? Math.min(...bandYs) : bandYs[0] ?? startY;
  const goldenBottomY = bandYs.length >= 2 ? Math.max(...bandYs) : bandYs[0] ?? startY;

  return {
    levels,
    goldenTopY,
    goldenBottomY,
  };
}

export function buildRectFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color = '#3B82F6',
): RectShape {
  const isTap = Math.abs(endX - startX) < 8 && Math.abs(endY - startY) < 8;
  return {
    id: generateUlid(),
    type: 'rect',
    x: isTap ? startX : Math.min(startX, endX),
    y: isTap ? startY : Math.min(startY, endY),
    width: isTap ? 84 : Math.max(18, Math.abs(endX - startX)),
    height: isTap ? 44 : Math.max(12, Math.abs(endY - startY)),
    fillOpacity: 0.16,
    color,
    strokeWidth: 1.5,
  };
}

export function buildFibFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color = '#F59E0B',
  applyTapDefault = false,
): FibRetracementShape {
  const isTap = Math.abs(endX - startX) < 10 && Math.abs(endY - startY) < 10;
  const x = Math.min(startX, endX);
  const width = applyTapDefault && isTap ? 140 : Math.max(24, Math.abs(endX - startX));
  const resolvedEndY = applyTapDefault && isTap ? startY + 110 : endY;

  return {
    id: generateUlid(),
    type: 'fib_retracement',
    x,
    width,
    startY,
    endY: resolvedEndY,
    color,
    strokeWidth: 1.5,
  };
}

export function buildStraightLine(
  variant: 'horizontal' | 'vertical',
  x: number,
  y: number,
  stageWidth: number,
  stageHeight: number,
  color = '#3B82F6',
): StraightLineShape {
  return variant === 'horizontal'
    ? {
        id: generateUlid(),
        type: 'straight_line',
        variant,
        x1: 0,
        y1: y,
        x2: Math.max(120, stageWidth),
        y2: y,
        color,
        strokeWidth: 2,
      }
    : {
        id: generateUlid(),
        type: 'straight_line',
        variant,
        x1: x,
        y1: 0,
        x2: x,
        y2: Math.max(120, stageHeight),
        color,
        strokeWidth: 2,
      };
}

export function buildChannelFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color = '#3B82F6',
): ChannelShape {
  const isTap = Math.abs(endX - startX) < 12 && Math.abs(endY - startY) < 12;
  return {
    id: generateUlid(),
    type: 'channel',
    x1: startX,
    y1: startY,
    x2: isTap ? startX + 140 : endX,
    y2: isTap ? startY - 24 : endY,
    offsetY: 48,
    fillOpacity: 0.14,
    color,
    strokeWidth: 1.5,
  };
}

export function buildOteFibFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  applyTapDefault = false,
  color = '#F59E0B',
): OteFibShape {
  const isTap = Math.abs(endX - startX) < 10 && Math.abs(endY - startY) < 10;
  const x = Math.min(startX, endX);
  const width = applyTapDefault && isTap ? 140 : Math.max(24, Math.abs(endX - startX));
  const resolvedEndY = applyTapDefault && isTap ? startY + 100 : endY;

  return {
    id: generateUlid(),
    type: 'ote_fib',
    x,
    width,
    startY,
    endY: resolvedEndY,
    color,
    strokeWidth: 1.5,
  };
}

export function fitImageRectToStage(
  naturalWidth: number,
  naturalHeight: number,
  stageWidth: number,
  stageHeight: number,
  maxRatio = 0.78,
): { x: number; y: number; width: number; height: number } {
  const nw = Math.max(1, naturalWidth || 320);
  const nh = Math.max(1, naturalHeight || 200);
  const sw = Math.max(120, stageWidth || 560);
  const sh = Math.max(120, stageHeight || 340);
  const scale = Math.min((sw * maxRatio) / nw, (sh * maxRatio) / nh, 1);
  const width = Math.max(48, Math.round(nw * scale));
  const height = Math.max(36, Math.round(nh * scale));
  return {
    x: Math.round((sw - width) / 2),
    y: Math.round((sh - height) / 2),
    width,
    height,
  };
}

export function buildImageShape(
  attachmentPath: string,
  rect: { x: number; y: number; width: number; height: number },
): ImageShape {
  return {
    id: generateUlid(),
    type: 'image',
    attachmentPath,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: '#3B82F6',
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

/**
 * Clones any `CanvasShape` with a new ULID and shifted coordinates (`+offset px`) for `Ctrl + D`.
 */
export function duplicateCanvasShape(shape: CanvasShape, offset = 16): CanvasShape {
  const id = generateUlid();
  switch (shape.type) {
    case 'freehand':
      return {
        ...shape,
        id,
        points: shape.points.map((v) => v + offset),
      };
    case 'candle':
      return {
        ...shape,
        id,
        x: shape.x + offset,
        bodyY: shape.bodyY + offset,
        wickTopY: shape.wickTopY + offset,
        wickBottomY: shape.wickBottomY + offset,
      };
    case 'rect':
    case 'image':
    case 'zone_box':
    case 'text_note':
      return { ...shape, id, x: shape.x + offset, y: shape.y + offset };
    case 'liquidity_line':
    case 'straight_line':
    case 'channel':
    case 'mss_arrow':
      return {
        ...shape,
        id,
        x1: shape.x1 + offset,
        y1: shape.y1 + offset,
        x2: shape.x2 + offset,
        y2: shape.y2 + offset,
      };
    case 'fib_retracement':
    case 'ote_fib':
      return {
        ...shape,
        id,
        x: shape.x + offset,
        startY: shape.startY + offset,
        endY: shape.endY + offset,
      };
  }
}

export type IctTemplateId = 'model_2022' | 'breaker_bpr';

/**
 * Generates centered starter ICT markup skeletons so traders can stamp patterns in 1 click.
 */
export function buildIctPatternTemplate(
  templateId: IctTemplateId,
  centerX: number,
  centerY: number,
): CanvasShape[] {
  if (templateId === 'breaker_bpr') {
    const ob = buildZoneBoxFromDrag('OB', centerX - 110, centerY - 35, centerX - 10, centerY - 5);
    const bb = buildZoneBoxFromDrag('BB', centerX - 30, centerY - 10, centerX + 90, centerY + 20);
    const bpr = buildZoneBoxFromDrag('BPR', centerX - 20, centerY + 18, centerX + 105, centerY + 46);
    const mss = buildMssArrowFromDrag('MSS', centerX - 15, centerY - 22, centerX + 85, centerY - 22, '#3B82F6');
    return [ob, bb, bpr, mss];
  }

  // ICT 2022 Model: BSL Sweep -> MSS -> Displacement FVG
  const liq = buildLiquidityLineFromDrag('BSL', centerX - 115, centerY - 50, centerX + 15, centerY - 50);
  const sweep = buildCandleFromDrag(centerX - 45, centerY - 25, centerY - 65, 18);
  const mss = buildMssArrowFromDrag('MSS', centerX - 20, centerY + 5, centerX + 95, centerY + 5, '#EF4444');
  const fvg = buildZoneBoxFromDrag('FVG', centerX - 10, centerY - 28, centerX + 100, centerY - 4);
  return [liq, sweep, mss, fvg];
}
