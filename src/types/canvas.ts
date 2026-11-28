export type CanvasTool =
  | 'select'
  | 'pen'
  | 'candle'
  | 'rect'
  | 'fvg'
  | 'ifvg'
  | 'bpr'
  | 'order_block'
  | 'breaker'
  | 'liquidity'
  | 'hline'
  | 'vline'
  | 'channel'
  | 'mss'
  | 'cisd'
  | 'fib'
  | 'ote_fib'
  | 'text';

export type LiquidityTag = '$$$' | 'BSL' | 'SSL';

export interface BaseShape {
  id: string;
  type:
  | 'freehand'
  | 'candle'
  | 'rect'
  | 'image'
  | 'zone_box'
  | 'liquidity_line'
  | 'straight_line'
  | 'channel'
  | 'mss_arrow'
  | 'fib_retracement'
  | 'ote_fib'
  | 'text_note';
  color: string;
  strokeWidth: number;
}

export interface ImageShape extends BaseShape {
  type: 'image';
  attachmentPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RectShape extends BaseShape {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fillOpacity: number;
}

export interface StraightLineShape extends BaseShape {
  type: 'straight_line';
  variant: 'horizontal' | 'vertical';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ChannelShape extends BaseShape {
  type: 'channel';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offsetY: number;
  fillOpacity: number;
}

export interface FibRetracementShape extends BaseShape {
  type: 'fib_retracement';
  x: number;
  width: number;
  startY: number;
  endY: number;
}

export interface FreehandShape extends BaseShape {
  type: 'freehand';
  points: number[];
}

export interface CandleShape extends BaseShape {
  type: 'candle';
  x: number;
  bodyY: number;
  bodyWidth: number;
  bodyHeight: number;
  wickTopY: number;
  wickBottomY: number;
  isBullish: boolean;
}

export interface ZoneBoxShape extends BaseShape {
  type: 'zone_box';
  kind: 'FVG' | 'IFVG' | 'BPR' | 'OB' | 'BB';
  x: number;
  y: number;
  width: number;
  height: number;
  fillOpacity: number;
  label: string;
}

export interface LiquidityLineShape extends BaseShape {
  type: 'liquidity_line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tag: LiquidityTag;
}

export interface MssArrowShape extends BaseShape {
  type: 'mss_arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: 'MSS' | 'CISD';
}

export interface OteFibShape extends BaseShape {
  type: 'ote_fib';
  x: number;
  width: number;
  startY: number;
  endY: number;
}

export interface FibLevelConfig {
  ratio: number;
  label: string;
  isHighlight: boolean;
}

export interface CanvasToolSettings {
  fibColor: string;
  fibHighlightColor: string;
  fibBandOpacity: number;
  fibLevels: FibLevelConfig[];
  oteColor: string;
  oteSweetSpotColor: string;
  oteBandOpacity: number;
  oteLevels: FibLevelConfig[];
}

export const DEFAULT_FIB_LEVELS: FibLevelConfig[] = [
  { ratio: 0, label: '0', isHighlight: false },
  { ratio: 0.236, label: '0.236', isHighlight: false },
  { ratio: 0.382, label: '0.382', isHighlight: false },
  { ratio: 0.5, label: '0.5', isHighlight: true },
  { ratio: 0.618, label: '0.618', isHighlight: true },
  { ratio: 0.786, label: '0.786', isHighlight: true },
  { ratio: 1, label: '1', isHighlight: false },
];

export const DEFAULT_OTE_LEVELS: FibLevelConfig[] = [
  { ratio: 0.62, label: '0.62', isHighlight: false },
  { ratio: 0.705, label: '0.705 OTE', isHighlight: true },
  { ratio: 0.79, label: '0.79', isHighlight: false },
];

export function cloneDefaultCanvasToolSettings(): CanvasToolSettings {
  return {
    fibColor: '#94A3B8',
    fibHighlightColor: '#F59E0B',
    fibBandOpacity: 0.14,
    fibLevels: DEFAULT_FIB_LEVELS.map((l) => ({ ...l })),
    oteColor: '#F59E0B',
    oteSweetSpotColor: '#10B981',
    oteBandOpacity: 0.14,
    oteLevels: DEFAULT_OTE_LEVELS.map((l) => ({ ...l })),
  };
}

export interface TextNoteShape extends BaseShape {
  type: 'text_note';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type CanvasShape =
  | FreehandShape
  | CandleShape
  | RectShape
  | ImageShape
  | ZoneBoxShape
  | LiquidityLineShape
  | StraightLineShape
  | ChannelShape
  | MssArrowShape
  | FibRetracementShape
  | OteFibShape
  | TextNoteShape;

export interface CanvasBackgroundRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasDocument {
  version: 1;
  width: number;
  height: number;
  /** Relative attachment path under `%APPDATA%/attachments/` — never raw base64 */
  backgroundAttachmentPath: string | null;
  backgroundRect?: CanvasBackgroundRect | null;
  backgroundLocked?: boolean;
  shapes: CanvasShape[];
}

export const EMPTY_TIPTAP_DOC = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

export function createEmptyCanvasDocument(
  width = 640,
  height = 420,
): CanvasDocument {
  return {
    version: 1,
    width,
    height,
    backgroundAttachmentPath: null,
    backgroundRect: null,
    backgroundLocked: false,
    shapes: [],
  };
}

export function parseCanvasDocument(raw: string | null | undefined): CanvasDocument {
  if (!raw) return createEmptyCanvasDocument();
  try {
    const parsed = JSON.parse(raw) as Partial<CanvasDocument>;
    const rawBgRect = parsed.backgroundRect;
    const backgroundRect =
      rawBgRect &&
        typeof rawBgRect.x === 'number' &&
        typeof rawBgRect.y === 'number' &&
        typeof rawBgRect.width === 'number' &&
        typeof rawBgRect.height === 'number' &&
        rawBgRect.width > 0 &&
        rawBgRect.height > 0
        ? {
          x: rawBgRect.x,
          y: rawBgRect.y,
          width: rawBgRect.width,
          height: rawBgRect.height,
        }
        : null;

    return {
      version: 1,
      width: typeof parsed.width === 'number' && parsed.width > 0 ? parsed.width : 640,
      height: typeof parsed.height === 'number' && parsed.height > 0 ? parsed.height : 420,
      backgroundAttachmentPath:
        typeof parsed.backgroundAttachmentPath === 'string' &&
          !parsed.backgroundAttachmentPath.startsWith('data:')
          ? parsed.backgroundAttachmentPath
          : null,
      backgroundRect,
      backgroundLocked: Boolean(parsed.backgroundLocked),
      shapes: Array.isArray(parsed.shapes)
        ? parsed.shapes.filter(
          (s) =>
            !(
              s &&
              s.type === 'image' &&
              typeof s.attachmentPath === 'string' &&
              s.attachmentPath.startsWith('data:')
            ),
        )
        : [],
    };
  } catch {
    return createEmptyCanvasDocument();
  }
}
