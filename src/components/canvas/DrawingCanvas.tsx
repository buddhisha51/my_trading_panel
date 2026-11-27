import type Konva from 'konva';
import {
  ArrowRight,
  CandlestickChart,
  Camera,
  ClipboardPaste,
  Eraser,
  Layers,
  Minus,
  MousePointer,
  MoveVertical,
  PenTool,
  Percent,
  RectangleHorizontal,
  Redo2,
  Rows3,
  SlidersHorizontal,
  Square,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Arrow,
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import { tauriBridge } from '../../services/tauriBridge';
import { useSettingsStore } from '../../stores/settingsStore';
import type {
  CandleShape,
  CanvasDocument,
  CanvasShape,
  CanvasTool,
  ChannelShape,
  FibRetracementShape,
  FreehandShape,
  ImageShape,
  LiquidityLineShape,
  LiquidityTag,
  MssArrowShape,
  OteFibShape,
  RectShape,
  StraightLineShape,
  TextNoteShape,
  ZoneBoxShape,
} from '../../types/canvas';
import {
  buildCandleFromDrag,
  buildChannelFromDrag,
  buildFibFromDrag,
  buildImageShape,
  buildLiquidityLineFromDrag,
  buildMssArrowFromDrag,
  buildOteFibFromDrag,
  buildRectFromDrag,
  buildStraightLine,
  buildZoneBoxFromDrag,
  computeFibLevels,
  computeOteFibLevels,
  createCanvasHistory,
  fitImageRectToStage,
  pushCanvasHistory,
  redoCanvasHistory,
  undoCanvasHistory,
} from '../../utils/canvasGeometry';
import { generateUlid } from '../../utils/id';
import {
  extractClipboardImageFile,
  launchWindowsScreenSnip,
  readClipboardImageBlob,
} from '../../utils/imageClipboard';

interface DrawingCanvasProps {
  document: CanvasDocument;
  onChange: (nextDoc: CanvasDocument) => void;
  /** Uploads screenshot bytes cleanly to disk and returns relative path (never base64 in canvas_json) */
  onSaveScreenshotFile: (blob: Blob) => Promise<string | null>;
}

const PEN_COLORS = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#F8FAFC', '#A855F7'];
const BG_NODE_ID = '__canvas_bg__';
const ZONE_TOOL_TO_KIND: Partial<Record<CanvasTool, ZoneBoxShape['kind']>> = {
  fvg: 'FVG',
  ifvg: 'IFVG',
  bpr: 'BPR',
  order_block: 'OB',
  breaker: 'BB',
};

function readBlobImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return Promise.resolve({ width: 320, height: 200 });
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new window.Image();
    let settled = false;
    const finish = (w: number, h: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve({ width: w > 0 ? w : 320, height: h > 0 ? h : 200 });
    };
    img.onload = () => finish(img.naturalWidth, img.naturalHeight);
    img.onerror = () => finish(320, 200);
    img.src = objectUrl;
    window.setTimeout(() => finish(320, 200), 150);
  });
}

function CanvasImageNode({
  shape,
  selectable,
  selected,
  onSelect,
  onChangeRect,
}: {
  shape: ImageShape;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChangeRect: (rect: { x: number; y: number; width: number; height: number }) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const src = tauriBridge.resolveAttachmentSrc(shape.attachmentPath);

  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    let active = true;
    const el = new window.Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => {
      if (active) setImg(el);
    };
    el.onerror = () => {
      if (active) setImg(null);
    };
    el.src = src;
    return () => {
      active = false;
    };
  }, [src]);

  return (
    <Group
      id={shape.id}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      listening={selectable}
      draggable={selectable}
      onClick={() => selectable && onSelect()}
      onTap={() => selectable && onSelect()}
      onDragEnd={(ev) => {
        onChangeRect({
          x: ev.target.x(),
          y: ev.target.y(),
          width: shape.width,
          height: shape.height,
        });
      }}
      onTransformEnd={(ev) => {
        const node = ev.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChangeRect({
          x: node.x(),
          y: node.y(),
          width: Math.max(32, shape.width * scaleX),
          height: Math.max(24, shape.height * scaleY),
        });
      }}
    >
      {img ? (
        <KonvaImage image={img} width={shape.width} height={shape.height} />
      ) : (
        <Rect
          width={shape.width}
          height={shape.height}
          fill="#0F172A"
          stroke={selected ? '#60A5FA' : '#334155'}
          strokeWidth={1.5}
        />
      )}
    </Group>
  );
}

export function DrawingCanvas({
  document: canvasDoc,
  onChange,
  onSaveScreenshotFile,
}: DrawingCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stageSize, setStageSize] = useState({ width: canvasDoc.width || 560, height: 340 });
  const [tool, setTool] = useState<CanvasTool>('candle');
  const [penColor, setPenColor] = useState('#3B82F6');
  const [liquidityTag, setLiquidityTag] = useState<LiquidityTag>('BSL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftShape, setDraftShape] = useState<CanvasShape | null>(null);
  const [liveShapeOverride, setLiveShapeOverride] = useState<CanvasShape | null>(null);
  const [textDraft, setTextDraft] = useState<{
    id: string | null;
    x: number;
    y: number;
    value: string;
  } | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [snipPending, setSnipPending] = useState(false);

  const canvasTools = useSettingsStore((s) => s.settings.canvasTools);

  const [history, setHistory] = useState(() => createCanvasHistory(canvasDoc.shapes));
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingTextPosRef = useRef<{ x: number; y: number } | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const textOpenedAtRef = useRef<number>(0);

  const openTextDraft = useCallback(
    (next: { id: string | null; x: number; y: number; value: string }) => {
      textOpenedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
      setTextDraft(next);
    },
    [],
  );

  useEffect(() => {
    if (!textDraft) return;
    const raf = requestAnimationFrame(() => {
      textInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [textDraft?.id, textDraft?.x, textDraft?.y]);

  // Measure container width cleanly
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 120) {
        setStageSize({ width: Math.floor(w), height: Math.max(260, Math.round(w * 0.62)) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load background screenshot from resolved Tauri Asset URL or browser preview storage
  useEffect(() => {
    const src = tauriBridge.resolveAttachmentSrc(canvasDoc.backgroundAttachmentPath);
    if (!src) {
      setBgImage(null);
      return;
    }
    let active = true;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (active) setBgImage(img);
    };
    img.onerror = () => {
      if (active) setBgImage(null);
    };
    img.src = src;
    return () => {
      active = false;
    };
  }, [canvasDoc.backgroundAttachmentPath]);

  const commitShapes = useCallback(
    (nextShapes: CanvasShape[]) => {
      setHistory((prev) => pushCanvasHistory(prev, nextShapes));
      onChange({
        ...canvasDoc,
        width: stageSize.width,
        height: stageSize.height,
        shapes: nextShapes,
      });
    },
    [canvasDoc, onChange, stageSize.height, stageSize.width],
  );

  // Sync Transformer attachment cleanly in select mode
  useEffect(() => {
    const tr = transformerRef.current;
    const layer = layerRef.current;
    if (!tr || !layer) return;

    if (tool !== 'select' || !selectedId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }

    if (selectedId === BG_NODE_ID) {
      const bgNode = layer.findOne(`#${BG_NODE_ID}`);
      tr.nodes(bgNode ? [bgNode] : []);
      tr.getLayer()?.batchDraw();
      return;
    }

    const shapeObj = history.present.find((s) => s.id === selectedId);
    // Candlesticks, lines, channels & fibs have dedicated handles; Rect/Image/Zone/Text/Freehand use Konva Transformer
    if (
      !shapeObj ||
      shapeObj.type === 'candle' ||
      shapeObj.type === 'liquidity_line' ||
      shapeObj.type === 'straight_line' ||
      shapeObj.type === 'channel' ||
      shapeObj.type === 'mss_arrow' ||
      shapeObj.type === 'fib_retracement' ||
      shapeObj.type === 'ote_fib'
    ) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }

    const node = layer.findOne(`#${selectedId}`);
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [canvasDoc.backgroundAttachmentPath, canvasDoc.backgroundRect, history.present, selectedId, tool]);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      const next = undoCanvasHistory(prev);
      onChange({ ...canvasDoc, shapes: next.present });
      return next;
    });
  }, [canvasDoc, onChange]);

  const handleRedo = useCallback(() => {
    setHistory((prev) => {
      const next = redoCanvasHistory(prev);
      onChange({ ...canvasDoc, shapes: next.present });
      return next;
    });
  }, [canvasDoc, onChange]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    if (selectedId === BG_NODE_ID) {
      setSelectedId(null);
      onChange({
        ...canvasDoc,
        backgroundAttachmentPath: null,
        backgroundRect: null,
        shapes: history.present,
      });
      return;
    }
    const next = history.present.filter((s) => s.id !== selectedId);
    setSelectedId(null);
    commitShapes(next);
  }, [canvasDoc, commitShapes, history.present, onChange, selectedId]);

  const attachScreenshotBlob = useCallback(
    async (blob: Blob) => {
      const [relPath, dims] = await Promise.all([
        onSaveScreenshotFile(blob),
        readBlobImageDimensions(blob),
      ]);
      if (relPath) {
        setSnipPending(false);
        const rect = fitImageRectToStage(
          dims.width,
          dims.height,
          stageSize.width,
          stageSize.height,
        );
        const imgShape = buildImageShape(relPath, rect);
        commitShapes([...history.present, imgShape]);
        setTool('select');
        setSelectedId(imgShape.id);
      }
    },
    [commitShapes, history.present, onSaveScreenshotFile, stageSize.height, stageSize.width],
  );

  const handleClipboardButton = useCallback(async () => {
    const blob = await readClipboardImageBlob();
    if (blob) {
      await attachScreenshotBlob(blob);
    }
  }, [attachScreenshotBlob]);

  // Listen for Ctrl+Z, Ctrl+Shift+Z, Delete, and Ctrl+V when canvas has focus
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (textDraft) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && document.activeElement?.tagName !== 'INPUT') {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      const file = extractClipboardImageFile(e.clipboardData);
      if (file) {
        e.preventDefault();
        void attachScreenshotBlob(file);
      }
    };

    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('paste', onPaste);
    return () => {
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('paste', onPaste);
    };
  }, [attachScreenshotBlob, handleDeleteSelected, handleRedo, handleUndo, selectedId, textDraft]);

  const bgDrawRect = useMemo(() => {
    if (canvasDoc.backgroundRect) return canvasDoc.backgroundRect;
    if (!bgImage) return null;
    const scale = Math.min(
      stageSize.width / Math.max(1, bgImage.naturalWidth || stageSize.width),
      stageSize.height / Math.max(1, bgImage.naturalHeight || stageSize.height),
    );
    const drawW = (bgImage.naturalWidth || stageSize.width) * scale;
    const drawH = (bgImage.naturalHeight || stageSize.height) * scale;
    return {
      x: (stageSize.width - drawW) / 2,
      y: (stageSize.height - drawH) / 2,
      width: drawW,
      height: drawH,
    };
  }, [bgImage, canvasDoc.backgroundRect, stageSize.height, stageSize.width]);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;

    if (tool === 'select') {
      if (e.target === stage) {
        setSelectedId(null);
      }
      return;
    }

    if (tool === 'text') {
      pendingTextPosRef.current = { x: pos.x, y: pos.y };
      return;
    }

    dragOriginRef.current = { x: pos.x, y: pos.y };
    dragLastPosRef.current = { x: pos.x, y: pos.y };

    if (tool === 'pen') {
      const freehand: FreehandShape = {
        id: generateUlid(),
        type: 'freehand',
        points: [pos.x, pos.y],
        color: penColor,
        strokeWidth: 2.5,
      };
      setDraftShape(freehand);
    } else if (tool === 'candle') {
      setDraftShape(buildCandleFromDrag(pos.x, pos.y, pos.y - 20));
    } else if (tool === 'rect') {
      setDraftShape(buildRectFromDrag(pos.x, pos.y, pos.x, pos.y, penColor));
    } else if (ZONE_TOOL_TO_KIND[tool]) {
      setDraftShape(
        buildZoneBoxFromDrag(ZONE_TOOL_TO_KIND[tool], pos.x, pos.y, pos.x + 2, pos.y + 2),
      );
    } else if (tool === 'liquidity') {
      setDraftShape(buildLiquidityLineFromDrag(liquidityTag, pos.x, pos.y, pos.x + 2, pos.y));
    } else if (tool === 'hline' || tool === 'vline') {
      setDraftShape(
        buildStraightLine(
          tool === 'hline' ? 'horizontal' : 'vertical',
          pos.x,
          pos.y,
          stageSize.width,
          stageSize.height,
          penColor,
        ),
      );
    } else if (tool === 'channel') {
      setDraftShape(buildChannelFromDrag(pos.x, pos.y, pos.x, pos.y, penColor));
    } else if (tool === 'mss' || tool === 'cisd') {
      setDraftShape(
        buildMssArrowFromDrag(tool === 'mss' ? 'MSS' : 'CISD', pos.x, pos.y, pos.x, pos.y, penColor),
      );
    } else if (tool === 'fib') {
      setDraftShape(
        buildFibFromDrag(pos.x, pos.y, pos.x, pos.y, canvasTools.fibHighlightColor, false),
      );
    } else if (tool === 'ote_fib') {
      setDraftShape(buildOteFibFromDrag(pos.x, pos.y, pos.x, pos.y, false, canvasTools.oteColor));
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const origin = dragOriginRef.current;
    if (!origin || !draftShape) return;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    dragLastPosRef.current = { x: pos.x, y: pos.y };

    if (draftShape.type === 'freehand') {
      setDraftShape({ ...draftShape, points: [...draftShape.points, pos.x, pos.y] });
    } else if (draftShape.type === 'candle') {
      setDraftShape({
        ...buildCandleFromDrag(origin.x, origin.y, pos.y),
        id: draftShape.id,
      });
    } else if (draftShape.type === 'rect') {
      setDraftShape({
        ...buildRectFromDrag(origin.x, origin.y, pos.x, pos.y, draftShape.color),
        id: draftShape.id,
      });
    } else if (draftShape.type === 'zone_box') {
      setDraftShape({
        ...buildZoneBoxFromDrag(draftShape.kind, origin.x, origin.y, pos.x, pos.y),
        id: draftShape.id,
      });
    } else if (draftShape.type === 'liquidity_line') {
      setDraftShape({
        ...buildLiquidityLineFromDrag(liquidityTag, origin.x, origin.y, pos.x, pos.y),
        id: draftShape.id,
      });
    } else if (draftShape.type === 'straight_line') {
      setDraftShape({
        ...buildStraightLine(
          draftShape.variant,
          pos.x,
          pos.y,
          stageSize.width,
          stageSize.height,
          draftShape.color,
        ),
        id: draftShape.id,
      });
    } else if (draftShape.type === 'channel') {
      setDraftShape({
        ...buildChannelFromDrag(origin.x, origin.y, pos.x, pos.y, draftShape.color),
        id: draftShape.id,
      });
    } else if (draftShape.type === 'mss_arrow') {
      setDraftShape({
        ...buildMssArrowFromDrag(draftShape.label, origin.x, origin.y, pos.x, pos.y, penColor),
        id: draftShape.id,
      });
    } else if (draftShape.type === 'fib_retracement') {
      setDraftShape({
        ...buildFibFromDrag(
          origin.x,
          origin.y,
          pos.x,
          pos.y,
          canvasTools.fibHighlightColor,
          false,
        ),
        id: draftShape.id,
      });
    } else if (draftShape.type === 'ote_fib') {
      setDraftShape({
        ...buildOteFibFromDrag(origin.x, origin.y, pos.x, pos.y, false, canvasTools.oteColor),
        id: draftShape.id,
      });
    }
  };

  const handleMouseUp = () => {
    if (pendingTextPosRef.current) {
      const pt = pendingTextPosRef.current;
      pendingTextPosRef.current = null;
      openTextDraft({ id: null, x: pt.x, y: pt.y, value: '' });
      return;
    }

    if (!draftShape) return;
    const origin = dragOriginRef.current;
    const lastPos = dragLastPosRef.current ?? origin;
    dragOriginRef.current = null;
    dragLastPosRef.current = null;

    let finalShape = draftShape;
    if (origin && lastPos) {
      if (draftShape.type === 'ote_fib') {
        finalShape = {
          ...buildOteFibFromDrag(
            origin.x,
            origin.y,
            lastPos.x,
            lastPos.y,
            true,
            canvasTools.oteColor,
          ),
          id: draftShape.id,
        };
      } else if (draftShape.type === 'fib_retracement') {
        finalShape = {
          ...buildFibFromDrag(
            origin.x,
            origin.y,
            lastPos.x,
            lastPos.y,
            canvasTools.fibHighlightColor,
            true,
          ),
          id: draftShape.id,
        };
      }
    }

    commitShapes([...history.present, finalShape]);
    setSelectedId(finalShape.id);
    setDraftShape(null);
  };

  const updateShapeById = (id: string, updater: (s: CanvasShape) => CanvasShape) => {
    const next = history.present.map((s) => (s.id === id ? updater(s) : s));
    commitShapes(next);
  };

  const commitTextDraft = () => {
    if (!textDraft) return;
    const trimmed = textDraft.value.trim();
    if (trimmed) {
      if (textDraft.id) {
        updateShapeById(textDraft.id, (s) =>
          s.type === 'text_note' ? { ...s, text: trimmed } : s,
        );
      } else {
        const created: TextNoteShape = {
          id: generateUlid(),
          type: 'text_note',
          x: textDraft.x,
          y: textDraft.y,
          text: trimmed,
          fontSize: 13,
          color: penColor,
          strokeWidth: 1,
        };
        commitShapes([...history.present, created]);
        setSelectedId(created.id);
      }
    }
    setTextDraft(null);
  };

  const renderShape = (s: CanvasShape, isPreview = false) => {
    const selectable = tool === 'select' && !isPreview;
    const selected = s.id === selectedId;

    if (s.type === 'freehand') {
      return (
        <Line
          key={s.id}
          id={s.id}
          points={s.points}
          stroke={s.color}
          strokeWidth={s.strokeWidth}
          tension={0.4}
          lineCap="round"
          lineJoin="round"
          draggable={selectable}
          onClick={() => selectable && setSelectedId(s.id)}
          onTap={() => selectable && setSelectedId(s.id)}
          onDragEnd={(ev) => {
            const dx = ev.target.x();
            const dy = ev.target.y();
            ev.target.position({ x: 0, y: 0 });
            updateShapeById(s.id, (prev) =>
              prev.type === 'freehand'
                ? {
                  ...prev,
                  points: prev.points.map((v, idx) => (idx % 2 === 0 ? v + dx : v + dy)),
                }
                : prev,
            );
          }}
        />
      );
    }

    if (s.type === 'candle') {
      const c = s as CandleShape;
      const centerX = c.x + c.bodyWidth / 2;
      return (
        <Group
          key={c.id}
          id={c.id}
          draggable={selectable}
          onClick={() => selectable && setSelectedId(c.id)}
          onTap={() => selectable && setSelectedId(c.id)}
          onDragEnd={(ev) => {
            const dx = ev.target.x();
            const dy = ev.target.y();
            ev.target.position({ x: 0, y: 0 });
            updateShapeById(c.id, (prev) =>
              prev.type === 'candle'
                ? {
                  ...prev,
                  x: prev.x + dx,
                  bodyY: prev.bodyY + dy,
                  wickTopY: prev.wickTopY + dy,
                  wickBottomY: prev.wickBottomY + dy,
                }
                : prev,
            );
          }}
        >
          {/* Upper Wick */}
          <Line
            points={[centerX, Math.min(c.wickTopY, c.bodyY), centerX, c.bodyY]}
            stroke={c.color}
            strokeWidth={c.strokeWidth}
          />
          {/* Lower Wick */}
          <Line
            points={[
              centerX,
              c.bodyY + c.bodyHeight,
              centerX,
              Math.max(c.wickBottomY, c.bodyY + c.bodyHeight),
            ]}
            stroke={c.color}
            strokeWidth={c.strokeWidth}
          />
          {/* Candle Body */}
          <Rect
            x={c.x}
            y={c.bodyY}
            width={c.bodyWidth}
            height={c.bodyHeight}
            fill={c.color}
            stroke={selected ? '#FFFFFF' : c.color}
            strokeWidth={selected ? 1.5 : 1}
            cornerRadius={2}
          />
          {/* Interactive Wick Handles when selected */}
          {selected && !isPreview && (
            <>
              <Circle
                x={centerX}
                y={c.wickTopY}
                radius={4.5}
                fill="#FFFFFF"
                stroke={c.color}
                strokeWidth={1.5}
                draggable
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nextY = Math.min(ev.target.y(), c.bodyY);
                  updateShapeById(c.id, (prev) =>
                    prev.type === 'candle' ? { ...prev, wickTopY: nextY } : prev,
                  );
                }}
              />
              <Circle
                x={centerX}
                y={c.wickBottomY}
                radius={4.5}
                fill="#FFFFFF"
                stroke={c.color}
                strokeWidth={1.5}
                draggable
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nextY = Math.max(ev.target.y(), c.bodyY + c.bodyHeight);
                  updateShapeById(c.id, (prev) =>
                    prev.type === 'candle' ? { ...prev, wickBottomY: nextY } : prev,
                  );
                }}
              />
            </>
          )}
        </Group>
      );
    }

    if (s.type === 'image') {
      const im = s as ImageShape;
      return (
        <CanvasImageNode
          key={im.id}
          shape={im}
          selectable={selectable}
          selected={selected}
          onSelect={() => setSelectedId(im.id)}
          onChangeRect={(rect) => {
            updateShapeById(im.id, (prev) =>
              prev.type === 'image' ? { ...prev, ...rect } : prev,
            );
          }}
        />
      );
    }

    if (s.type === 'rect') {
      const r = s as RectShape;
      return (
        <Group
          key={r.id}
          id={r.id}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          draggable={selectable}
          onClick={() => selectable && setSelectedId(r.id)}
          onTap={() => selectable && setSelectedId(r.id)}
          onDragEnd={(ev) => {
            updateShapeById(r.id, (prev) =>
              prev.type === 'rect' ? { ...prev, x: ev.target.x(), y: ev.target.y() } : prev,
            );
          }}
          onTransformEnd={(ev) => {
            const node = ev.target;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            updateShapeById(r.id, (prev) =>
              prev.type === 'rect'
                ? {
                  ...prev,
                  x: node.x(),
                  y: node.y(),
                  width: Math.max(18, prev.width * scaleX),
                  height: Math.max(12, prev.height * scaleY),
                }
                : prev,
            );
          }}
        >
          <Rect
            width={r.width}
            height={r.height}
            fill={r.color}
            opacity={r.fillOpacity}
            stroke={r.color}
            strokeWidth={selected ? r.strokeWidth + 1 : r.strokeWidth}
          />
        </Group>
      );
    }

    if (s.type === 'straight_line') {
      const sl = s as StraightLineShape;
      return (
        <Group
          key={sl.id}
          id={sl.id}
          draggable={selectable}
          onClick={() => selectable && setSelectedId(sl.id)}
          onTap={() => selectable && setSelectedId(sl.id)}
          onDragEnd={(ev) => {
            const dx = sl.variant === 'vertical' ? ev.target.x() : 0;
            const dy = sl.variant === 'horizontal' ? ev.target.y() : 0;
            ev.target.position({ x: 0, y: 0 });
            updateShapeById(sl.id, (prev) =>
              prev.type === 'straight_line'
                ? {
                  ...prev,
                  x1: prev.x1 + dx,
                  y1: prev.y1 + dy,
                  x2: prev.x2 + dx,
                  y2: prev.y2 + dy,
                }
                : prev,
            );
          }}
        >
          <Line
            points={[sl.x1, sl.y1, sl.x2, sl.y2]}
            stroke={sl.color}
            strokeWidth={selected ? sl.strokeWidth + 1.5 : sl.strokeWidth}
            hitStrokeWidth={12}
          />
        </Group>
      );
    }

    if (s.type === 'channel') {
      const ch = s as ChannelShape;
      const midX = (ch.x1 + ch.x2) / 2;
      const midY = (ch.y1 + ch.y2) / 2;
      return (
        <Group
          key={ch.id}
          id={ch.id}
          draggable={selectable}
          onClick={() => selectable && setSelectedId(ch.id)}
          onTap={() => selectable && setSelectedId(ch.id)}
          onDragEnd={(ev) => {
            const dx = ev.target.x();
            const dy = ev.target.y();
            ev.target.position({ x: 0, y: 0 });
            updateShapeById(ch.id, (prev) =>
              prev.type === 'channel'
                ? {
                  ...prev,
                  x1: prev.x1 + dx,
                  y1: prev.y1 + dy,
                  x2: prev.x2 + dx,
                  y2: prev.y2 + dy,
                }
                : prev,
            );
          }}
        >
          <Line
            closed
            points={[ch.x1, ch.y1, ch.x2, ch.y2, ch.x2, ch.y2 + ch.offsetY, ch.x1, ch.y1 + ch.offsetY]}
            fill={ch.color}
            opacity={ch.fillOpacity}
          />
          <Line
            points={[ch.x1, ch.y1, ch.x2, ch.y2]}
            stroke={ch.color}
            strokeWidth={selected ? ch.strokeWidth + 1 : ch.strokeWidth}
            hitStrokeWidth={10}
          />
          <Line
            points={[ch.x1, ch.y1 + ch.offsetY, ch.x2, ch.y2 + ch.offsetY]}
            stroke={ch.color}
            strokeWidth={selected ? ch.strokeWidth + 1 : ch.strokeWidth}
            hitStrokeWidth={10}
          />
          <Line
            points={[ch.x1, ch.y1 + ch.offsetY / 2, ch.x2, ch.y2 + ch.offsetY / 2]}
            stroke={ch.color}
            strokeWidth={1}
            dash={[5, 4]}
          />
          {selected && !isPreview && (
            <>
              <Circle
                x={ch.x1}
                y={ch.y1}
                radius={4.5}
                fill="#FFFFFF"
                stroke={ch.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  setLiveShapeOverride({
                    ...ch,
                    x1: ev.target.x(),
                    y1: ev.target.y(),
                  });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(ch.id, (prev) =>
                    prev.type === 'channel' ? { ...prev, x1: nx, y1: ny } : prev,
                  );
                }}
              />
              <Circle
                x={ch.x2}
                y={ch.y2}
                radius={4.5}
                fill="#FFFFFF"
                stroke={ch.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  setLiveShapeOverride({
                    ...ch,
                    x2: ev.target.x(),
                    y2: ev.target.y(),
                  });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(ch.id, (prev) =>
                    prev.type === 'channel' ? { ...prev, x2: nx, y2: ny } : prev,
                  );
                }}
              />
              <Circle
                x={midX}
                y={midY + ch.offsetY}
                radius={4.5}
                fill="#F59E0B"
                stroke="#FFFFFF"
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  setLiveShapeOverride({
                    ...ch,
                    offsetY: ev.target.y() - midY,
                  });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(ch.id, (prev) =>
                    prev.type === 'channel' ? { ...prev, offsetY: ny - midY } : prev,
                  );
                }}
              />
            </>
          )}
        </Group>
      );
    }

    if (s.type === 'zone_box') {
      const z = s as ZoneBoxShape;
      return (
        <Group
          key={z.id}
          id={z.id}
          x={z.x}
          y={z.y}
          width={z.width}
          height={z.height}
          draggable={selectable}
          onClick={() => selectable && setSelectedId(z.id)}
          onTap={() => selectable && setSelectedId(z.id)}
          onDragEnd={(ev) => {
            updateShapeById(z.id, (prev) =>
              prev.type === 'zone_box'
                ? { ...prev, x: ev.target.x(), y: ev.target.y() }
                : prev,
            );
          }}
          onTransformEnd={(ev) => {
            const node = ev.target;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            updateShapeById(z.id, (prev) =>
              prev.type === 'zone_box'
                ? {
                  ...prev,
                  x: node.x(),
                  y: node.y(),
                  width: Math.max(20, prev.width * scaleX),
                  height: Math.max(12, prev.height * scaleY),
                }
                : prev,
            );
          }}
        >
          <Rect
            width={z.width}
            height={z.height}
            fill={z.color}
            opacity={z.fillOpacity}
            stroke={z.color}
            strokeWidth={z.strokeWidth}
            dash={z.kind === 'IFVG' ? [5, 3] : undefined}
          />
          {(z.kind === 'OB' || z.kind === 'BB') && (
            <Rect width={4} height={z.height} fill={z.color} opacity={0.95} />
          )}
          {z.kind === 'BPR' && (
            <>
              <Rect width={z.width} height={3} fill={z.color} opacity={0.75} listening={false} />
              <Rect
                y={Math.max(0, z.height - 3)}
                width={z.width}
                height={3}
                fill={z.color}
                opacity={0.75}
                listening={false}
              />
              <Line
                points={[0, z.height / 2, z.width, z.height / 2]}
                stroke={z.color}
                strokeWidth={1}
                dash={[4, 3]}
                opacity={0.75}
                listening={false}
              />
            </>
          )}
          <Text
            text={z.label}
            width={z.width}
            height={z.height}
            align="center"
            verticalAlign="middle"
            fontSize={11}
            fontStyle="bold"
            fill="#F8FAFC"
            listening={false}
          />
        </Group>
      );
    }

    if (s.type === 'liquidity_line') {
      const l = s as LiquidityLineShape;
      const midX = (l.x1 + l.x2) / 2;
      const midY = (l.y1 + l.y2) / 2;
      return (
        <Group
          key={l.id}
          id={l.id}
          draggable={selectable}
          onClick={() => selectable && setSelectedId(l.id)}
          onTap={() => selectable && setSelectedId(l.id)}
          onDragEnd={(ev) => {
            const dx = ev.target.x();
            const dy = ev.target.y();
            ev.target.position({ x: 0, y: 0 });
            updateShapeById(l.id, (prev) =>
              prev.type === 'liquidity_line'
                ? { ...prev, x1: prev.x1 + dx, y1: prev.y1 + dy, x2: prev.x2 + dx, y2: prev.y2 + dy }
                : prev,
            );
          }}
        >
          <Line
            points={[l.x1, l.y1, l.x2, l.y2]}
            stroke={l.color}
            strokeWidth={selected ? l.strokeWidth + 1 : l.strokeWidth}
            dash={[6, 4]}
            hitStrokeWidth={12}
          />
          <Text
            x={midX - 18}
            y={midY - 16}
            text={l.tag}
            fontSize={11}
            fontStyle="bold"
            fill={l.color}
            listening={false}
          />
          {selected && !isPreview && (
            <>
              <Circle
                x={l.x1}
                y={l.y1}
                radius={4}
                fill="#FFFFFF"
                stroke={l.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  setLiveShapeOverride({ ...l, x1: ev.target.x(), y1: ev.target.y() });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(l.id, (prev) =>
                    prev.type === 'liquidity_line' ? { ...prev, x1: nx, y1: ny } : prev,
                  );
                }}
              />
              <Circle
                x={l.x2}
                y={l.y2}
                radius={4}
                fill="#FFFFFF"
                stroke={l.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  setLiveShapeOverride({ ...l, x2: ev.target.x(), y2: ev.target.y() });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(l.id, (prev) =>
                    prev.type === 'liquidity_line' ? { ...prev, x2: nx, y2: ny } : prev,
                  );
                }}
              />
            </>
          )}
        </Group>
      );
    }

    if (s.type === 'mss_arrow') {
      const a = s as MssArrowShape;
      return (
        <Group
          key={a.id}
          id={a.id}
          draggable={selectable}
          onClick={() => selectable && setSelectedId(a.id)}
          onTap={() => selectable && setSelectedId(a.id)}
          onDragEnd={(ev) => {
            const dx = ev.target.x();
            const dy = ev.target.y();
            ev.target.position({ x: 0, y: 0 });
            updateShapeById(a.id, (prev) =>
              prev.type === 'mss_arrow'
                ? { ...prev, x1: prev.x1 + dx, y1: prev.y1 + dy, x2: prev.x2 + dx, y2: prev.y2 + dy }
                : prev,
            );
          }}
        >
          <Arrow
            points={[a.x1, a.y1, a.x2, a.y2]}
            stroke={a.color}
            fill={a.color}
            strokeWidth={selected ? a.strokeWidth + 1 : a.strokeWidth}
            pointerLength={9}
            pointerWidth={8}
            hitStrokeWidth={12}
          />
          <Text
            x={a.x2 >= a.x1 ? a.x2 + 6 : a.x2 - 36}
            y={a.y2 - 7}
            text={a.label}
            fontSize={11}
            fontStyle="bold"
            fill={a.color}
            listening={false}
          />
          {selected && !isPreview && (
            <>
              <Circle
                x={a.x1}
                y={a.y1}
                radius={4}
                fill="#FFFFFF"
                stroke={a.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  setLiveShapeOverride({ ...a, x1: ev.target.x(), y1: ev.target.y() });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(a.id, (prev) =>
                    prev.type === 'mss_arrow' ? { ...prev, x1: nx, y1: ny } : prev,
                  );
                }}
              />
              <Circle
                x={a.x2}
                y={a.y2}
                radius={4}
                fill="#FFFFFF"
                stroke={a.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  setLiveShapeOverride({ ...a, x2: ev.target.x(), y2: ev.target.y() });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(a.id, (prev) =>
                    prev.type === 'mss_arrow' ? { ...prev, x2: nx, y2: ny } : prev,
                  );
                }}
              />
            </>
          )}
        </Group>
      );
    }

    if (s.type === 'fib_retracement') {
      const fib = s as FibRetracementShape;
      const { levels, goldenTopY, goldenBottomY } = computeFibLevels(
        fib.startY,
        fib.endY,
        canvasTools.fibLevels,
      );
      const fibBaseColor = canvasTools.fibColor || '#94A3B8';
      const fibHlColor = canvasTools.fibHighlightColor || fib.color;
      const topY = Math.min(fib.startY, fib.endY);
      const spanH = Math.max(20, Math.abs(fib.endY - fib.startY));
      return (
        <Group
          key={fib.id}
          id={fib.id}
          draggable={selectable}
          onClick={() => selectable && setSelectedId(fib.id)}
          onTap={() => selectable && setSelectedId(fib.id)}
          onDragEnd={(ev) => {
            const dx = ev.target.x();
            const dy = ev.target.y();
            ev.target.position({ x: 0, y: 0 });
            updateShapeById(fib.id, (prev) =>
              prev.type === 'fib_retracement'
                ? { ...prev, x: prev.x + dx, startY: prev.startY + dy, endY: prev.endY + dy }
                : prev,
            );
          }}
        >
          <Rect
            x={fib.x}
            y={topY}
            width={fib.width}
            height={spanH}
            fill="transparent"
            stroke={selected ? '#60A5FA' : undefined}
            strokeWidth={selected ? 1 : 0}
            dash={selected ? [3, 3] : undefined}
          />
          <Rect
            x={fib.x}
            y={goldenTopY}
            width={fib.width}
            height={Math.max(4, goldenBottomY - goldenTopY)}
            fill={fibHlColor}
            opacity={canvasTools.fibBandOpacity ?? 0.14}
            listening={false}
          />
          {levels.map((lvl, idx) => (
            <Group key={`${idx}-${lvl.ratio}-${lvl.label}`}>
              <Line
                points={[fib.x, lvl.y, fib.x + fib.width, lvl.y]}
                stroke={lvl.isHighlight ? fibHlColor : fibBaseColor}
                strokeWidth={lvl.isHighlight ? 1.5 : 1}
                dash={lvl.isHighlight ? undefined : [4, 3]}
                hitStrokeWidth={8}
              />
              <Text
                x={fib.x + 4}
                y={lvl.y - 11}
                text={lvl.label}
                fontSize={9}
                fontStyle={lvl.isHighlight ? 'bold' : 'normal'}
                fill={lvl.isHighlight ? fibHlColor : fibBaseColor}
                listening={false}
              />
            </Group>
          ))}
          {selected && !isPreview && (
            <>
              <Circle
                x={fib.x}
                y={fib.startY}
                radius={4.5}
                fill="#FFFFFF"
                stroke={fib.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  const anchorRight = fib.x + fib.width;
                  setLiveShapeOverride({
                    ...fib,
                    width: Math.max(24, anchorRight - nx),
                    x: Math.min(nx, anchorRight - 24),
                    startY: ny,
                  });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(fib.id, (prev) =>
                    prev.type === 'fib_retracement'
                      ? {
                        ...prev,
                        width: Math.max(24, prev.x + prev.width - nx),
                        x: Math.min(nx, prev.x + prev.width - 24),
                        startY: ny,
                      }
                      : prev,
                  );
                }}
              />
              <Circle
                x={fib.x + fib.width}
                y={fib.endY}
                radius={4.5}
                fill="#FFFFFF"
                stroke={fib.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride({
                    ...fib,
                    width: Math.max(24, nx - fib.x),
                    endY: ny,
                  });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(fib.id, (prev) =>
                    prev.type === 'fib_retracement'
                      ? {
                        ...prev,
                        width: Math.max(24, nx - prev.x),
                        endY: ny,
                      }
                      : prev,
                  );
                }}
              />
            </>
          )}
        </Group>
      );
    }

    if (s.type === 'ote_fib') {
      const f = s as OteFibShape;
      const { levels, zoneTopY, zoneBottomY } = computeOteFibLevels(
        f.startY,
        f.endY,
        canvasTools.oteLevels,
      );
      const oteBandColor = canvasTools.oteColor || f.color;
      const oteSweetColor = canvasTools.oteSweetSpotColor || '#10B981';
      const topY = Math.min(f.startY, f.endY);
      const spanH = Math.max(20, Math.abs(f.endY - f.startY));
      return (
        <Group
          key={f.id}
          id={f.id}
          draggable={selectable}
          onClick={() => selectable && setSelectedId(f.id)}
          onTap={() => selectable && setSelectedId(f.id)}
          onDragEnd={(ev) => {
            const dx = ev.target.x();
            const dy = ev.target.y();
            ev.target.position({ x: 0, y: 0 });
            updateShapeById(f.id, (prev) =>
              prev.type === 'ote_fib'
                ? { ...prev, x: prev.x + dx, startY: prev.startY + dy, endY: prev.endY + dy }
                : prev,
            );
          }}
        >
          {/* Full swing bounding hit area so OTE can be selected & dragged anywhere */}
          <Rect
            x={f.x}
            y={topY}
            width={f.width}
            height={spanH}
            fill="transparent"
            stroke={selected ? '#60A5FA' : undefined}
            strokeWidth={selected ? 1 : 0}
            dash={selected ? [3, 3] : undefined}
          />
          <Rect
            x={f.x}
            y={zoneTopY}
            width={f.width}
            height={Math.max(4, zoneBottomY - zoneTopY)}
            fill={oteBandColor}
            opacity={canvasTools.oteBandOpacity ?? 0.14}
            listening={false}
          />
          {levels.map((lvl, idx) => (
            <Group key={`${idx}-${lvl.ratio}-${lvl.label}`}>
              <Line
                points={[f.x, lvl.y, f.x + f.width, lvl.y]}
                stroke={lvl.isSweetSpot ? oteSweetColor : oteBandColor}
                strokeWidth={lvl.isSweetSpot ? 2 : 1}
                dash={lvl.isSweetSpot ? undefined : [4, 3]}
                hitStrokeWidth={10}
              />
              <Text
                x={f.x + 4}
                y={lvl.y - 12}
                text={lvl.label}
                fontSize={10}
                fontStyle="bold"
                fill={lvl.isSweetSpot ? oteSweetColor : oteBandColor}
                listening={false}
              />
            </Group>
          ))}
          {selected && !isPreview && (
            <>
              <Circle
                x={f.x}
                y={f.startY}
                radius={4.5}
                fill="#FFFFFF"
                stroke={f.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  const anchorRight = f.x + f.width;
                  setLiveShapeOverride({
                    ...f,
                    width: Math.max(24, anchorRight - nx),
                    x: Math.min(nx, anchorRight - 24),
                    startY: ny,
                  });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(f.id, (prev) =>
                    prev.type === 'ote_fib'
                      ? {
                        ...prev,
                        width: Math.max(24, prev.x + prev.width - nx),
                        x: Math.min(nx, prev.x + prev.width - 24),
                        startY: ny,
                      }
                      : prev,
                  );
                }}
              />
              <Circle
                x={f.x + f.width}
                y={f.endY}
                radius={4.5}
                fill="#FFFFFF"
                stroke={f.color}
                strokeWidth={1.5}
                draggable
                onDragMove={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride({
                    ...f,
                    width: Math.max(24, nx - f.x),
                    endY: ny,
                  });
                }}
                onDragEnd={(ev) => {
                  ev.cancelBubble = true;
                  const nx = ev.target.x();
                  const ny = ev.target.y();
                  setLiveShapeOverride(null);
                  updateShapeById(f.id, (prev) =>
                    prev.type === 'ote_fib'
                      ? {
                        ...prev,
                        width: Math.max(24, nx - prev.x),
                        endY: ny,
                      }
                      : prev,
                  );
                }}
              />
            </>
          )}
        </Group>
      );
    }

    const t = s as TextNoteShape;
    return (
      <Text
        key={t.id}
        id={t.id}
        x={t.x}
        y={t.y}
        padding={4}
        text={t.text}
        fontSize={t.fontSize}
        fill={t.color}
        draggable={selectable}
        onClick={() => selectable && setSelectedId(t.id)}
        onTap={() => selectable && setSelectedId(t.id)}
        onDblClick={(ev) => {
          ev.cancelBubble = true;
          openTextDraft({ id: t.id, x: t.x, y: t.y, value: t.text });
        }}
        onTransformEnd={(ev) => {
          const node = ev.target;
          const scale = Math.max(node.scaleX(), node.scaleY());
          node.scaleX(1);
          node.scaleY(1);
          updateShapeById(t.id, (prev) =>
            prev.type === 'text_note'
              ? {
                ...prev,
                x: node.x(),
                y: node.y(),
                fontSize: Math.max(9, Math.min(48, Math.round(prev.fontSize * scale))),
              }
              : prev,
          );
        }}
        onDragEnd={(ev) => {
          updateShapeById(t.id, (prev) =>
            prev.type === 'text_note'
              ? { ...prev, x: ev.target.x(), y: ev.target.y() }
              : prev,
          );
        }}
      />
    );
  };

  const toolButtons: Array<{
    id: CanvasTool;
    label: string;
    short: string;
    icon: typeof MousePointer;
  }> = [
      { id: 'select', label: 'Select / Resize', short: 'Sel', icon: MousePointer },
      { id: 'pen', label: 'Freehand Pen', short: 'Pen', icon: PenTool },
      { id: 'candle', label: 'Candlestick Builder (Drag Up=Bull / Down=Bear)', short: 'Candle', icon: CandlestickChart },
      { id: 'rect', label: 'Rectangle Box', short: 'Rect', icon: RectangleHorizontal },
      { id: 'fvg', label: 'FVG Shaded Zone', short: 'FVG', icon: Square },
      { id: 'ifvg', label: 'Inversion FVG', short: 'IFVG', icon: Square },
      { id: 'bpr', label: 'Balanced Price Range (Overlapped FVG)', short: 'BPR', icon: Layers },
      { id: 'order_block', label: 'Order Block (OB)', short: 'OB', icon: Layers },
      { id: 'breaker', label: 'Breaker Block (BB)', short: 'BB', icon: Layers },
      { id: 'liquidity', label: 'Liquidity Trendline ($$$/BSL/SSL)', short: 'Liq', icon: TrendingUp },
      { id: 'hline', label: 'Horizontal Line (1-click)', short: 'H-Line', icon: Minus },
      { id: 'vline', label: 'Vertical Line (1-click)', short: 'V-Line', icon: MoveVertical },
      { id: 'channel', label: 'Parallel Channel', short: 'Channel', icon: Rows3 },
      { id: 'mss', label: 'Market Structure Shift Arrow (1-click horizontal, or drag)', short: 'MSS', icon: ArrowRight },
      { id: 'cisd', label: 'Change in State of Delivery Arrow (1-click horizontal, or drag)', short: 'CISD', icon: ArrowRight },
      { id: 'fib', label: 'Fibonacci Retracement (0 - 1)', short: 'Fib', icon: SlidersHorizontal },
      { id: 'ote_fib', label: 'OTE Fibonacci (0.62 / 0.705 / 0.79)', short: 'OTE', icon: Percent },
      { id: 'text', label: 'Text Annotation', short: 'Text', icon: Type },
    ];

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      data-canvas-active="true"
      className="space-y-1.5 rounded-md border border-slate-800 bg-slate-950/90 p-2 focus:outline-none"
    >
      {/* ICT / SMC Vector Tool Palette */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 pb-1.5">
        {toolButtons.map(({ id, label, short, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            onClick={() => setTool(id)}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${tool === id
                ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
          >
            <Icon className="h-3 w-3" />
            <span>{short}</span>
          </button>
        ))}

        {tool === 'liquidity' && (
          <div className="ml-1 flex items-center gap-0.5 rounded border border-slate-800 bg-slate-900 p-0.5">
            {(['BSL', 'SSL', '$$$'] as LiquidityTag[]).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setLiquidityTag(tag)}
                className={`rounded px-1 py-0.5 font-mono text-[9px] ${liquidityTag === tag
                    ? 'bg-amber-500/25 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Colors, History & Screenshot Capture Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
        <div className="flex items-center gap-1">
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => {
                setPenColor(c);
                if (tool === 'select' && selectedId && selectedId !== BG_NODE_ID) {
                  updateShapeById(selectedId, (prev) => ({ ...prev, color: c }));
                }
              }}
              style={{ backgroundColor: c }}
              className={`h-4 w-4 rounded-full border ${penColor === c ? 'scale-110 border-white' : 'border-transparent opacity-75'
                }`}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={history.past.length === 0}
            onClick={handleUndo}
            title="Undo (Ctrl+Z)"
            className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800 disabled:opacity-35"
          >
            <Undo2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={history.future.length === 0}
            onClick={handleRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800 disabled:opacity-35"
          >
            <Redo2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={handleDeleteSelected}
            title="Delete selected shape"
            className="rounded border border-slate-800 bg-slate-900 p-1 text-rose-400 hover:bg-slate-800 disabled:opacity-35"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              commitShapes([]);
            }}
            title="Clear shapes"
            className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-400 hover:bg-slate-800"
          >
            <Eraser className="h-3 w-3" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void attachScreenshotBlob(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload chart screenshot"
            className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:bg-slate-800"
          >
            <Upload className="h-3 w-3" />
            Img
          </button>
          <button
            type="button"
            onClick={() => void handleClipboardButton()}
            title="Paste screenshot from clipboard (or press Ctrl+V)"
            className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-slate-300 hover:bg-slate-800"
          >
            <ClipboardPaste className="h-3 w-3" />
            Paste
          </button>
          <button
            type="button"
            onClick={() => {
              setSnipPending(true);
              void launchWindowsScreenSnip();
            }}
            title="Open Windows Snipping Tool (Win+Shift+S)"
            className="inline-flex items-center gap-1 rounded border border-blue-500/40 bg-blue-500/15 px-1.5 py-0.5 text-blue-300 hover:bg-blue-500/25"
          >
            <Camera className="h-3 w-3" />
            Snip
          </button>
        </div>
      </div>

      {snipPending && (
        <div className="flex items-center justify-between rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-200">
          <span>Capture screen region, then click Paste or press Ctrl+V here.</span>
          <button
            type="button"
            onClick={() => void handleClipboardButton()}
            className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-500"
          >
            Paste Snip
          </button>
        </div>
      )}

      {/* Stage Surface */}
      <div
        ref={stageContainerRef}
        className="relative overflow-hidden rounded border border-slate-800 bg-[#0b1120]"
      >
        <Stage
          width={stageSize.width}
          height={stageSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          {/* Layer 1: Background Fill */}
          <Layer listening={false}>
            <Rect
              x={0}
              y={0}
              width={stageSize.width}
              height={stageSize.height}
              fill="#0b1120"
            />
          </Layer>

          {/* Layer 2: Interactive Background Screenshot + ICT / SMC Shapes */}
          <Layer ref={layerRef}>
            {bgImage && bgDrawRect && (
              <Group
                id={BG_NODE_ID}
                x={bgDrawRect.x}
                y={bgDrawRect.y}
                width={bgDrawRect.width}
                height={bgDrawRect.height}
                listening={tool === 'select'}
                draggable={tool === 'select'}
                onClick={() => tool === 'select' && setSelectedId(BG_NODE_ID)}
                onTap={() => tool === 'select' && setSelectedId(BG_NODE_ID)}
                onDragEnd={(ev) => {
                  onChange({
                    ...canvasDoc,
                    backgroundRect: {
                      x: ev.target.x(),
                      y: ev.target.y(),
                      width: bgDrawRect.width,
                      height: bgDrawRect.height,
                    },
                    shapes: history.present,
                  });
                }}
                onTransformEnd={(ev) => {
                  const node = ev.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  node.scaleX(1);
                  node.scaleY(1);
                  onChange({
                    ...canvasDoc,
                    backgroundRect: {
                      x: node.x(),
                      y: node.y(),
                      width: Math.max(40, bgDrawRect.width * scaleX),
                      height: Math.max(30, bgDrawRect.height * scaleY),
                    },
                    shapes: history.present,
                  });
                }}
              >
                <KonvaImage
                  image={bgImage}
                  width={bgDrawRect.width}
                  height={bgDrawRect.height}
                />
              </Group>
            )}
            {history.present.map((s) =>
              renderShape(liveShapeOverride?.id === s.id ? liveShapeOverride : s, false),
            )}
            {draftShape && renderShape(draftShape, true)}
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              borderStroke="#60A5FA"
              anchorStroke="#60A5FA"
              anchorFill="#0F172A"
              anchorSize={6}
            />
          </Layer>
        </Stage>

        {/* Inline Floating Text Input Overlay */}
        {textDraft && (
          <form
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              commitTextDraft();
            }}
            style={{
              left: Math.min(textDraft.x, Math.max(10, stageSize.width - 175)),
              top: Math.min(textDraft.y, Math.max(10, stageSize.height - 38)),
            }}
            className="absolute z-20 flex items-center gap-1 rounded border border-blue-500 bg-slate-950 p-1 shadow-lg"
          >
            <input
              ref={textInputRef}
              autoFocus
              type="text"
              value={textDraft.value}
              onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setTextDraft(null);
                }
              }}
              onBlur={() => {
                const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
                if (nowMs - textOpenedAtRef.current < 200 && !textDraft.value.trim()) {
                  requestAnimationFrame(() => textInputRef.current?.focus());
                  return;
                }
                commitTextDraft();
              }}
              placeholder="Label..."
              className="w-28 bg-transparent px-1 text-xs text-slate-100 focus:outline-none"
            />
            <button
              type="submit"
              onMouseDown={(e) => e.preventDefault()}
              title="Apply text"
              className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-500"
            >
              OK
            </button>
          </form>
        )}

        {canvasDoc.backgroundAttachmentPath && (
          <button
            type="button"
            onClick={() => {
              if (selectedId === BG_NODE_ID) setSelectedId(null);
              onChange({
                ...canvasDoc,
                backgroundAttachmentPath: null,
                backgroundRect: null,
                shapes: history.present,
              });
            }}
            className="absolute right-1.5 bottom-1.5 rounded bg-slate-950/85 px-1.5 py-0.5 text-[9px] text-rose-300 hover:bg-slate-900"
          >
            Remove BG
          </button>
        )}
      </div>
    </div>
  );
}
