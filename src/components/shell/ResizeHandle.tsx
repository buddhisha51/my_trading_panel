import { useRef, useState } from 'react';
import { useDockStore } from '../../stores/dockStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { clampExpandedSize, isHorizontalEdge, sizeToPercent } from '../../utils/dockMath';

export function ResizeHandle() {
  const edge = useSettingsStore((s) => s.settings.edge);
  const expandedSize = useSettingsStore((s) => s.settings.expandedSize);

  const monitors = useDockStore((s) => s.monitors);
  const activeMonitorId = useDockStore((s) => s.activeMonitorId);
  const setResizing = useDockStore((s) => s.setResizing);
  const resizePanel = useDockStore((s) => s.resizePanel);

  const [previewPx, setPreviewPx] = useState<number | null>(null);
  const startCoordRef = useRef(0);
  const startSizeRef = useRef(expandedSize);

  const activeMonitor =
    monitors.find((m) => m.id === activeMonitorId) ?? monitors.find((m) => m.isPrimary) ?? monitors[0];

  const horizontal = isHorizontalEdge(edge);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startCoordRef.current = horizontal ? e.screenY : e.screenX;
    startSizeRef.current = expandedSize;
    setResizing(true);
    setPreviewPx(expandedSize);

    const scaleFactor = activeMonitor?.scaleFactor ?? 1;
    let latestPx = expandedSize;
    let rafPending = false;

    const onMove = (moveEvent: PointerEvent) => {
      const currentCoord = horizontal ? moveEvent.screenY : moveEvent.screenX;
      // Browser screenX/screenY are in CSS pixels (DIPs); convert delta to physical pixels.
      const rawDelta = (currentCoord - startCoordRef.current) * scaleFactor;
      // Moving inward grows the panel on left/top, shrinks on right/bottom
      const signedDelta = edge === 'left' || edge === 'top' ? rawDelta : -rawDelta;
      latestPx = clampExpandedSize(edge, activeMonitor, startSizeRef.current + signedDelta);
      setPreviewPx(latestPx);

      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          void resizePanel(latestPx, false);
        });
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizing(false);
      setPreviewPx(null);
      void resizePanel(latestPx, true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const positionClass =
    edge === 'left'
      ? 'right-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-blue-500/50'
      : edge === 'right'
        ? 'left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-blue-500/50'
        : edge === 'top'
          ? 'bottom-0 left-0 h-1.5 w-full cursor-ns-resize hover:bg-blue-500/50'
          : 'top-0 left-0 h-1.5 w-full cursor-ns-resize hover:bg-blue-500/50';

  return (
    <>
      <div
        role="separator"
        aria-orientation={horizontal ? 'horizontal' : 'vertical'}
        title="Drag edge to resize panel"
        onPointerDown={handlePointerDown}
        className={`absolute z-30 transition-colors ${positionClass}`}
      />
      {previewPx !== null && (
        <div className="pointer-events-none fixed bottom-3 right-3 z-50 rounded border border-slate-700 bg-slate-950/95 px-2.5 py-1 font-mono text-xs text-blue-300 shadow-lg">
          {previewPx}px ({sizeToPercent(edge, activeMonitor, previewPx)}%)
        </div>
      )}
    </>
  );
}
