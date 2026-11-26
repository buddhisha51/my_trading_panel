import type Konva from 'konva';
import {
  ArrowUpRight,
  CandlestickChart,
  Camera,
  ClipboardPaste,
  Eraser,
  Layers,
  MousePointer,
  PenTool,
  Percent,
  Redo2,
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
import type {
  CandleShape,
  CanvasDocument,
  CanvasShape,
  CanvasTool,
  FreehandShape,
  LiquidityLineShape,
  LiquidityTag,
  MssArrowShape,
  OteFibShape,
  TextNoteShape,
  ZoneBoxShape,
} from '../../types/canvas';
import {
  buildCandleFromDrag,
  buildLiquidityLineFromDrag,
  buildMssArrowFromDrag,
  buildOteFibFromDrag,
  buildZoneBoxFromDrag,
  computeOteFibLevels,
  createCanvasHistory,
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
  const [textDraft, setTextDraft] = useState<{
    id: string | null;
    x: number;
    y: number;
    value: string;
  } | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [snipPending, setSnipPending] = useState(false);

  const [history, setHistory] = useState(() => createCanvasHistory(canvasDoc.shapes));
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Sync undo/redo stack if external canvasDoc resets
  useEffect(() => {
    setHistory(createCanvasHistory(canvasDoc.shapes));
    setSelectedId(null);
  }, [canvasDoc.backgroundAttachmentPath, canvasDoc.width, canvasDoc.height]);

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

    const shapeObj = history.present.find((s) => s.id === selectedId);
    // Candlesticks have dedicated wick handles; Zone/Text/Freehand use Konva Transformer
    if (!shapeObj || shapeObj.type === 'candle' || shapeObj.type === 'liquidity_line' || shapeObj.type === 'mss_arrow' || shapeObj.type === 'ote_fib') {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }

    const node = layer.findOne(`#${selectedId}`);
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [history.present, selectedId, tool]);

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
    const next = history.present.filter((s) => s.id !== selectedId);
    setSelectedId(null);
    commitShapes(next);
  }, [commitShapes, history.present, selectedId]);

  const attachScreenshotBlob = useCallback(
    async (blob: Blob) => {
      const relPath = await onSaveScreenshotFile(blob);
      if (relPath) {
        setSnipPending(false);
        onChange({
          ...canvasDoc,
          width: stageSize.width,
          height: stageSize.height,
          backgroundAttachmentPath: relPath,
          shapes: history.present,
        });
      }
    },
    [canvasDoc, history.present, onChange, onSaveScreenshotFile, stageSize.height, stageSize.width],
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
  }, [bgImage, stageSize.height, stageSize.width]);

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
      setTextDraft({ id: null, x: pos.x, y: pos.y, value: '' });
      return;
    }

    dragOriginRef.current = { x: pos.x, y: pos.y };

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
    } else if (tool === 'fvg' || tool === 'ifvg' || tool === 'order_block' || tool === 'breaker') {
      const kind =
        tool === 'fvg'
          ? 'FVG'
          : tool === 'ifvg'
            ? 'IFVG'
            : tool === 'order_block'
              ? 'OB'
              : 'BB';
      setDraftShape(buildZoneBoxFromDrag(kind, pos.x, pos.y, pos.x + 2, pos.y + 2));
    } else if (tool === 'liquidity') {
      setDraftShape(buildLiquidityLineFromDrag(liquidityTag, pos.x, pos.y, pos.x + 2, pos.y));
    } else if (tool === 'mss' || tool === 'cisd') {
      setDraftShape(
        buildMssArrowFromDrag(tool === 'mss' ? 'MSS' : 'CISD', pos.x, pos.y, pos.x, pos.y - 20),
      );
    } else if (tool === 'ote_fib') {
      setDraftShape(buildOteFibFromDrag(pos.x, pos.y, pos.x + 120, pos.y + 80));
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const origin = dragOriginRef.current;
    if (!origin || !draftShape) return;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;

    if (draftShape.type === 'freehand') {
      setDraftShape({ ...draftShape, points: [...draftShape.points, pos.x, pos.y] });
    } else if (draftShape.type === 'candle') {
      setDraftShape({
        ...buildCandleFromDrag(origin.x, origin.y, pos.y),
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
    } else if (draftShape.type === 'mss_arrow') {
      setDraftShape({
        ...buildMssArrowFromDrag(draftShape.label, origin.x, origin.y, pos.x, pos.y),
        id: draftShape.id,
      });
    } else if (draftShape.type === 'ote_fib') {
      setDraftShape({
        ...buildOteFibFromDrag(origin.x, origin.y, pos.x, pos.y),
        id: draftShape.id,
      });
    }
  };

  const handleMouseUp = () => {
    if (!draftShape) return;
    dragOriginRef.current = null;
    commitShapes([...history.present, draftShape]);
    setSelectedId(draftShape.id);
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
          />
          <Text
            x={midX - 18}
            y={midY - 16}
            text={l.tag}
            fontSize={11}
            fontStyle="bold"
            fill={l.color}
          />
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
          />
          <Text
            x={a.x2 + 6}
            y={a.y2 - 7}
            text={a.label}
            fontSize={11}
            fontStyle="bold"
            fill={a.color}
          />
        </Group>
      );
    }

    if (s.type === 'ote_fib') {
      const f = s as OteFibShape;
      const { levels, zoneTopY, zoneBottomY } = computeOteFibLevels(f.startY, f.endY);
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
          <Rect
            x={f.x}
            y={zoneTopY}
            width={f.width}
            height={Math.max(4, zoneBottomY - zoneTopY)}
            fill={f.color}
            opacity={0.12}
          />
          {levels.map((lvl) => (
            <Group key={lvl.ratio}>
              <Line
                points={[f.x, lvl.y, f.x + f.width, lvl.y]}
                stroke={lvl.isSweetSpot ? '#10B981' : f.color}
                strokeWidth={lvl.isSweetSpot ? 2 : 1}
                dash={lvl.isSweetSpot ? undefined : [4, 3]}
              />
              <Text
                x={f.x + 4}
                y={lvl.y - 12}
                text={lvl.label}
                fontSize={10}
                fontStyle="bold"
                fill={lvl.isSweetSpot ? '#34D399' : f.color}
              />
            </Group>
          ))}
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
        text={t.text}
        fontSize={t.fontSize}
        fill={t.color}
        draggable={selectable}
        onClick={() => selectable && setSelectedId(t.id)}
        onTap={() => selectable && setSelectedId(t.id)}
        onDblClick={() => setTextDraft({ id: t.id, x: t.x, y: t.y, value: t.text })}
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
    { id: 'fvg', label: 'FVG Shaded Zone', short: 'FVG', icon: Square },
    { id: 'ifvg', label: 'Inversion FVG', short: 'IFVG', icon: Square },
    { id: 'order_block', label: 'Order Block (OB)', short: 'OB', icon: Layers },
    { id: 'breaker', label: 'Breaker Block (BB)', short: 'BB', icon: Layers },
    { id: 'liquidity', label: 'Liquidity Trendline ($$$/BSL/SSL)', short: 'Liq', icon: TrendingUp },
    { id: 'mss', label: 'Market Structure Shift Arrow', short: 'MSS', icon: ArrowUpRight },
    { id: 'cisd', label: 'Change in State of Delivery Arrow', short: 'CISD', icon: ArrowUpRight },
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
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              tool === id
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
                className={`rounded px-1 py-0.5 font-mono text-[9px] ${
                  liquidityTag === tag
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
              onClick={() => setPenColor(c)}
              style={{ backgroundColor: c }}
              className={`h-4 w-4 rounded-full border ${
                penColor === c ? 'scale-110 border-white' : 'border-transparent opacity-75'
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
          {/* Layer 1: Static Grid + Cached Screenshot Background */}
          <Layer listening={false}>
            <Rect
              x={0}
              y={0}
              width={stageSize.width}
              height={stageSize.height}
              fill="#0b1120"
            />
            {bgImage && bgDrawRect && (
              <KonvaImage
                image={bgImage}
                x={bgDrawRect.x}
                y={bgDrawRect.y}
                width={bgDrawRect.width}
                height={bgDrawRect.height}
              />
            )}
          </Layer>

          {/* Layer 2: Interactive ICT / SMC Shapes */}
          <Layer ref={layerRef}>
            {history.present.map((s) => renderShape(s, false))}
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
            onSubmit={(e) => {
              e.preventDefault();
              commitTextDraft();
            }}
            style={{
              left: Math.min(textDraft.x, Math.max(10, stageSize.width - 150)),
              top: Math.min(textDraft.y, Math.max(10, stageSize.height - 34)),
            }}
            className="absolute z-20 flex items-center gap-1 rounded border border-blue-500 bg-slate-950 p-1 shadow-lg"
          >
            <input
              autoFocus
              type="text"
              value={textDraft.value}
              onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
              onBlur={commitTextDraft}
              placeholder="Label..."
              className="w-28 bg-transparent px-1 text-xs text-slate-100 focus:outline-none"
            />
          </form>
        )}

        {canvasDoc.backgroundAttachmentPath && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...canvasDoc,
                backgroundAttachmentPath: null,
                shapes: history.present,
              })
            }
            className="absolute right-1.5 bottom-1.5 rounded bg-slate-950/85 px-1.5 py-0.5 text-[9px] text-rose-300 hover:bg-slate-900"
          >
            Remove BG
          </button>
        )}
      </div>
    </div>
  );
}
