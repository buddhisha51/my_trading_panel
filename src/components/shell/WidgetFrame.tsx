import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePreservedScroll } from '../../hooks/usePreservedScroll';
import { useDockStore } from '../../stores/dockStore';
import {
  clampWidgetHeight,
  clampWidgetWidth,
  DEFAULT_WIDGET_WIDTH,
  type WidgetId,
} from '../../types/settings';

interface WidgetFrameProps {
  widgetId: WidgetId;
  title: string;
  badge?: ReactNode;
  isCollapsed: boolean;
  resizeAxis?: 'vertical' | 'horizontal';
  customHeight?: number | null;
  customWidth?: number | null;
  onToggleCollapse: () => void;
  onResizeHeight?: (height: number | null) => void;
  onResizeWidth?: (width: number | null) => void;
  className?: string;
  children: ReactNode;
}

export const WidgetFrame = memo(function WidgetFrame({
  widgetId,
  title,
  badge,
  isCollapsed,
  resizeAxis = 'vertical',
  customHeight = null,
  customWidth = null,
  onToggleCollapse,
  onResizeHeight,
  onResizeWidth,
  className = '',
  children,
}: WidgetFrameProps) {
  const sectionDomRef = useRef<HTMLElement | null>(null);
  const bodyDomRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const setResizing = useDockStore((s) => s.setResizing);
  const setPreservedScrollRef = usePreservedScroll<HTMLDivElement>(`widget-frame:${widgetId}`);
  const setBodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      bodyDomRef.current = node;
      setPreservedScrollRef(node);
    },
    [setPreservedScrollRef],
  );

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widgetId });

  const setSectionRef = useCallback(
    (node: HTMLElement | null) => {
      sectionDomRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  const isHorizontalResize = resizeAxis === 'horizontal';
  const effectiveHeight = dragHeight ?? customHeight;
  const effectiveWidth = dragWidth ?? customWidth;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    ...(isHorizontalResize ? { width: `${effectiveWidth ?? DEFAULT_WIDGET_WIDTH}px` } : {}),
  };

  const startResizeDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    options: {
      axis: 'x' | 'y';
      startSize: number;
      clamp: (px: number) => number;
      onPreview: (px: number | null) => void;
      onCommit: (px: number) => void;
    },
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    dragCleanupRef.current?.();

    const startCoord = options.axis === 'x' ? e.clientX : e.clientY;
    let latestSize = options.startSize;

    setResizing(true);
    options.onPreview(options.startSize);

    const onMove = (moveEvent: PointerEvent) => {
      const coord = options.axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
      latestSize = options.clamp(options.startSize + (coord - startCoord));
      options.onPreview(latestSize);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragCleanupRef.current = null;
      setResizing(false);
      options.onPreview(null);
    };

    const onUp = () => {
      cleanup();
      options.onCommit(latestSize);
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleHeightResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onResizeHeight) return;
    const measured = bodyDomRef.current
      ? Math.round(bodyDomRef.current.getBoundingClientRect().height)
      : 260;
    startResizeDrag(e, {
      axis: 'y',
      startSize: clampWidgetHeight(customHeight ?? (measured > 0 ? measured : 260)),
      clamp: clampWidgetHeight,
      onPreview: setDragHeight,
      onCommit: onResizeHeight,
    });
  };

  const handleWidthResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onResizeWidth) return;
    const measured = sectionDomRef.current
      ? Math.round(sectionDomRef.current.getBoundingClientRect().width)
      : DEFAULT_WIDGET_WIDTH;
    startResizeDrag(e, {
      axis: 'x',
      startSize: clampWidgetWidth(customWidth ?? (measured > 0 ? measured : DEFAULT_WIDGET_WIDTH)),
      clamp: clampWidgetWidth,
      onPreview: setDragWidth,
      onCommit: onResizeWidth,
    });
  };

  return (
    <section
      ref={setSectionRef}
      style={style}
      className={`flex ${
        isHorizontalResize ? 'flex-row' : 'flex-col'
      } rounded-lg border border-slate-800/95 bg-slate-900/85 shadow-sm ${isDragging ? 'z-30 ring-1 ring-blue-500/60' : ''
        } ${className}`}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-1.5 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              {...attributes}
              {...listeners}
              title="Drag to reorder widget"
              aria-label={`Reorder ${title}`}
              className="cursor-grab rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!isCollapsed}
              className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-800/60"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              )}
              <span className="truncate text-xs font-semibold text-slate-100">
                {title}
              </span>
            </button>
          </div>

          {badge && <div className="shrink-0">{badge}</div>}
        </div>

        {!isCollapsed && (
          <>
            <div
              ref={setBodyRef}
              style={
                !isHorizontalResize && effectiveHeight !== null
                  ? { height: `${effectiveHeight}px` }
                  : undefined
              }
              className={`min-h-0 ${
                !isHorizontalResize && effectiveHeight !== null ? '' : 'max-h-[540px] '
              }overflow-y-auto border-t border-slate-800/80 px-2.5 py-2.5`}
            >
              {children}
            </div>

            {!isHorizontalResize && onResizeHeight && (
              <div className="relative flex h-3 shrink-0 items-center justify-center rounded-b-lg border-t border-slate-800/60 bg-slate-950/35">
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label={`Resize ${title}`}
                  title="Drag to resize widget height (double-click to reset)"
                  onPointerDown={handleHeightResizePointerDown}
                  onDoubleClick={() => onResizeHeight(null)}
                  className="group/resize flex h-full w-full cursor-ns-resize items-center justify-center transition-colors hover:bg-blue-500/15"
                >
                  <span className="h-0.5 w-8 rounded-full bg-slate-700/90 transition-colors group-hover/resize:bg-blue-400" />
                </div>

                {effectiveHeight !== null &&
                  (dragHeight !== null ? (
                    <span className="pointer-events-none absolute right-2 font-mono text-[9px] text-blue-300">
                      {dragHeight}px
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onResizeHeight(null)}
                      aria-label={`Reset ${title} height`}
                      title={`Custom height ${effectiveHeight}px — click to reset to Auto`}
                      className="absolute right-1.5 rounded px-1 font-mono text-[9px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                    >
                      {effectiveHeight}px ×
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {isHorizontalResize && onResizeWidth && (
        <div className="relative flex w-3 shrink-0 items-center justify-center rounded-r-lg border-l border-slate-800/60 bg-slate-950/35">
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize ${title} width`}
            title="Drag right edge to resize widget width (double-click to reset)"
            onPointerDown={handleWidthResizePointerDown}
            onDoubleClick={() => onResizeWidth(null)}
            className="group/resize flex h-full w-full cursor-ew-resize items-center justify-center transition-colors hover:bg-blue-500/15"
          >
            <span className="h-8 w-0.5 rounded-full bg-slate-700/90 transition-colors group-hover/resize:bg-blue-400" />
          </div>

          {effectiveWidth !== null &&
            (dragWidth !== null ? (
              <span className="pointer-events-none absolute right-3.5 bottom-1.5 rounded bg-slate-950/90 px-1 font-mono text-[9px] text-blue-300 shadow">
                {dragWidth}px
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onResizeWidth(null)}
                aria-label={`Reset ${title} width`}
                title={`Custom width ${effectiveWidth}px — click to reset to Default`}
                className="absolute right-3.5 bottom-1 rounded bg-slate-900/90 px-1 font-mono text-[9px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              >
                {effectiveWidth}px ×
              </button>
            ))}
        </div>
      )}
    </section>
  );
});
