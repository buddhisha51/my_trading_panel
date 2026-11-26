export type CanvasTool =
  | 'select'
  | 'pen'
  | 'candle'
  | 'fvg'
  | 'ifvg'
  | 'order_block'
  | 'breaker'
  | 'liquidity'
  | 'mss'
  | 'cisd'
  | 'ote_fib'
  | 'text';

export type LiquidityTag = '$$$' | 'BSL' | 'SSL';

export interface BaseShape {
  id: string;
  type:
    | 'freehand'
    | 'candle'
    | 'zone_box'
    | 'liquidity_line'
    | 'mss_arrow'
    | 'ote_fib'
    | 'text_note';
  color: string;
  strokeWidth: number;
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
  kind: 'FVG' | 'IFVG' | 'OB' | 'BB';
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
  | ZoneBoxShape
  | LiquidityLineShape
  | MssArrowShape
  | OteFibShape
  | TextNoteShape;

export interface CanvasDocument {
  version: 1;
  width: number;
  height: number;
  /** Relative attachment path under `%APPDATA%/attachments/` — never raw base64 */
  backgroundAttachmentPath: string | null;
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
    shapes: [],
  };
}

export function parseCanvasDocument(raw: string | null | undefined): CanvasDocument {
  if (!raw) return createEmptyCanvasDocument();
  try {
    const parsed = JSON.parse(raw) as Partial<CanvasDocument>;
    return {
      version: 1,
      width: typeof parsed.width === 'number' && parsed.width > 0 ? parsed.width : 640,
      height: typeof parsed.height === 'number' && parsed.height > 0 ? parsed.height : 420,
      backgroundAttachmentPath:
        typeof parsed.backgroundAttachmentPath === 'string' &&
        !parsed.backgroundAttachmentPath.startsWith('data:')
          ? parsed.backgroundAttachmentPath
          : null,
      shapes: Array.isArray(parsed.shapes) ? parsed.shapes : [],
    };
  } catch {
    return createEmptyCanvasDocument();
  }
}
