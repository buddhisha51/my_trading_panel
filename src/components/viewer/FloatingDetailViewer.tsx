import {
  CheckSquare,
  Edit3,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Pin,
  PinOff,
  Square,
  Target,
  X,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tauriBridge } from '../../services/tauriBridge';
import { useSettingsStore } from '../../stores/settingsStore';
import { useViewerStore } from '../../stores/viewerStore';
import { parseCanvasDocument } from '../../types/canvas';
import type { FloatingViewerPayload } from '../../types/viewer';
import { evaluateSetupChecklist, gradeColor } from '../../utils/strategyGrade';
import { formatEntryTimestamp } from '../../utils/timezone';
import { CanvasMiniPreview } from '../canvas/CanvasMiniPreview';
import { RichTextViewer } from '../editor/RichTextEditor';

interface DetailViewerCardProps {
  payload: FloatingViewerPayload;
  isPinned: boolean;
  onTogglePin: () => void;
  onStartDrag?: (e: React.PointerEvent<HTMLElement>) => void;
  onClose: () => void;
  onEdit: (kind: 'note' | 'strategy', id: string) => void;
  draggableWindow?: boolean;
}

function DetailViewerCard({
  payload,
  isPinned,
  onTogglePin,
  onStartDrag,
  onClose,
  onEdit,
  draggableWindow = false,
}: DetailViewerCardProps) {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const now = DateTime.utc();

  const isNote = payload.kind === 'note';
  const title = isNote ? payload.note.title || 'Untitled Note' : payload.strategy.name;
  const rawCanvasJson = isNote ? payload.note.canvasJson : payload.strategy.canvasJson;
  const parsedCanvas = rawCanvasJson ? parseCanvasDocument(rawCanvasJson) : null;
  const hasCanvas = Boolean(
    parsedCanvas &&
    (parsedCanvas.shapes.length > 0 || parsedCanvas.backgroundAttachmentPath),
  );

  // Show all attachments clearly, keeping standalone shots distinct if background is also on canvas
  const attachments = payload.attachments;
  const updatedText = formatEntryTimestamp(
    isNote ? payload.note.updatedAt : payload.strategy.updatedAt,
    payload.displayTimezone,
    payload.timeFormat,
    now,
  );

  const checkedSet = !isNote ? new Set(payload.checkedRuleIds) : null;
  const evaluation =
    !isNote && checkedSet
      ? evaluateSetupChecklist(payload.strategy.checklist, checkedSet)
      : null;

  return (
    <div
      data-testid="floating-detail-viewer"
      onMouseDown={(e) => e.stopPropagation()}
      className={`flex h-full w-full flex-col overflow-hidden bg-slate-950 text-slate-100 shadow-2xl ${draggableWindow
          ? 'border border-slate-800'
          : 'rounded-xl border border-slate-700/90'
        }`}
    >
      {/* Header (draggable across screens) */}
      <header
        data-tauri-drag-region={draggableWindow ? true : undefined}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest('button')) return;
          onStartDrag?.(e);
        }}
        title="Drag to move floating panel across screens"
        className="flex shrink-0 cursor-grab select-none items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-3 py-2.5 active:cursor-grabbing"
      >
        <div
          data-tauri-drag-region={draggableWindow ? true : undefined}
          className="pointer-events-none flex min-w-0 items-center gap-2"
        >
          <GripVertical className="h-4 w-4 shrink-0 text-slate-500" />
          {isNote ? (
            <FileText className="h-4 w-4 shrink-0 text-blue-400" />
          ) : (
            <Target className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-300">
            {isNote ? 'Note' : 'Playbook'}
          </span>
          {isNote && payload.note.isPinned && (
            <Pin className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          )}
          <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={isPinned}
            aria-label={isPinned ? 'Unpin Floating View' : 'Pin Floating View'}
            title={
              isPinned
                ? 'Unpin (auto-closes when clicking outside)'
                : 'Pin open (stays open until manually closed or unpinned)'
            }
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
              isPinned
                ? 'border-blue-500/60 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isPinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
            {isPinned ? 'Pinned' : 'Pin'}
          </button>
          <button
            type="button"
            onClick={() => onEdit(payload.kind, isNote ? payload.note.id : payload.strategy.id)}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
            title={isNote ? 'Edit this note' : 'Edit this playbook'}
          >
            <Edit3 className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Floating View"
            title={isPinned ? 'Close Floating View' : 'Close (Esc or click outside)'}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {/* Metadata Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {isNote && payload.note.pair && (
            <span className="rounded bg-blue-500/15 px-2 py-0.5 font-mono font-semibold text-blue-300">
              {payload.note.pair}
            </span>
          )}
          {isNote && payload.note.session && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
              {payload.note.session}
            </span>
          )}
          {(isNote ? payload.note.tags : payload.strategy.tags).map((tag) => (
            <span key={tag} className="rounded bg-slate-900 px-2 py-0.5 text-slate-400 border border-slate-800">
              #{tag}
            </span>
          ))}
          <span className="ml-auto font-mono text-[10px] text-slate-500">
            Updated {updatedText.full}
          </span>
        </div>

        {/* Strategy Summary */}
        {!isNote && payload.strategy.description && (
          <p className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
            {payload.strategy.description}
          </p>
        )}

        {/* Strategy Confluence Checklist + Grade */}
        {!isNote && evaluation && payload.strategy.checklist.length > 0 && (
          <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-2 py-0.5 font-mono text-xs font-bold"
                  style={{
                    backgroundColor: `${gradeColor(evaluation.grade)}25`,
                    color: gradeColor(evaluation.grade),
                  }}
                >
                  Grade {evaluation.grade}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {evaluation.totalMet}/{evaluation.total} ({evaluation.scorePercent}%)
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Confluence Checklist</span>
            </div>

            <div className="space-y-1">
              {payload.strategy.checklist.map((rule) => {
                const checked = checkedSet?.has(rule.id) ?? false;
                return (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-[11px] ${checked
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-slate-100'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300'
                      }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {checked ? (
                        <CheckSquare className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <Square className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      )}
                      <span>{rule.name}</span>
                    </div>
                    {rule.isRequired && (
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                        REQ
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Full Formatted Rich Text Content */}
        <section className="rounded-lg border border-slate-800/90 bg-slate-900/40 p-3">
          <RichTextViewer
            bodyJson={isNote ? payload.note.bodyJson : payload.strategy.bodyJson}
            fallbackText={isNote ? payload.note.bodyText : null}
          />
          {((isNote && !payload.note.bodyText.trim() && payload.note.bodyJson === '') ||
            (!isNote && payload.strategy.bodyJson === '')) && (
              <p className="text-[11px] italic text-slate-500">No text notes written.</p>
            )}
        </section>

        {/* Full ICT Canvas Diagram */}
        {hasCanvas && rawCanvasJson && (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
              <Layers className="h-3.5 w-3.5" />
              ICT Drawing Canvas
            </div>
            <CanvasMiniPreview canvasJson={rawCanvasJson} size="full" />
          </section>
        )}

        {/* Attached Chart Screenshots */}
        {attachments.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
              <ImageIcon className="h-3.5 w-3.5" />
              Attached Screenshots ({attachments.length})
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {attachments.map((att) => {
                const src = tauriBridge.resolveAttachmentSrc(att.relativePath, att.absolutePath);
                return (
                  <div
                    key={att.id}
                    className="flex min-h-[120px] items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950"
                  >
                    {src ? (
                      <img
                        src={src}
                        alt={isNote ? 'Note screenshot attachment' : 'Strategy screenshot attachment'}
                        onClick={() => setZoomSrc(src)}
                        title="Click to zoom"
                        className="max-h-72 w-full cursor-zoom-in object-contain bg-slate-950"
                      />
                    ) : (
                      <div className="flex h-36 items-center justify-center text-xs text-slate-500">
                        Screenshot unavailable
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Footer Hint */}
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-800 bg-slate-900/70 px-4 py-1.5 text-[10px] text-slate-500">
        <span>
          {isPinned
            ? 'Pinned open — drag header across screens • click Pin or × to close'
            : 'Drag header to move • click outside or press Esc to close'}
        </span>
        <span>{hasCanvas ? 'Canvas attached' : ''}</span>
      </footer>

      {/* Optional Lightbox Zoom inside Viewer */}
      {zoomSrc && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            setZoomSrc(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <img
            src={zoomSrc}
            alt="Zoomed screenshot"
            className="max-h-full max-w-full rounded-lg border border-slate-700 object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

class ViewerErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-2 bg-slate-950 p-6 text-center text-xs text-rose-300">
          <p className="font-semibold">Unable to render detail view</p>
          <p className="font-mono text-[10px] text-slate-400">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => void tauriBridge.closeFloatingViewer()}
            className="rounded bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Standalone entry component rendered inside the separate OS window (`detail-viewer`)
 * when running in Tauri desktop mode.
 */
export function FloatingDetailViewerWindow() {
  const [payload, setPayload] = useState<FloatingViewerPayload | null>(null);
  const [pathsReady, setPathsReady] = useState(false);
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  const patchSettingsLocal = useSettingsStore((s) => s.patchSettingsLocal);

  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  useEffect(() => {
    let active = true;
    const applyPayload = (next: FloatingViewerPayload | null) => {
      if (!active || !next) return;
      patchSettingsLocal({
        canvasTools: next.canvasTools,
        displayTimezone: next.displayTimezone,
        timeFormat: next.timeFormat,
      });
      setPayload(next);
    };

    void Promise.all([
      tauriBridge.getAppPaths().catch(() => null),
      tauriBridge.getFloatingViewerPayload(),
      tauriBridge.getFloatingViewerPinned().catch(() => false),
    ]).then(([, initialPayload, initialPinned]) => {
      if (!active) return;
      setPinned(Boolean(initialPinned));
      pinnedRef.current = Boolean(initialPinned);
      setPathsReady(true);
      applyPayload(initialPayload);
    });

    let unlisten: (() => void) | undefined;
    void tauriBridge.onViewerPayloadUpdated(applyPayload).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pinnedRef.current) {
        e.preventDefault();
        void tauriBridge.closeFloatingViewer();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      active = false;
      if (unlisten) unlisten();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [patchSettingsLocal]);

  const handleTogglePin = () => {
    const next = !pinned;
    setPinned(next);
    pinnedRef.current = next;
    void tauriBridge.setFloatingViewerPinned(next).then((res) => {
      setPinned(res);
      pinnedRef.current = res;
    });
  };

  if (!pathsReady || !payload) {
    return (
      <div className="flex h-screen w-screen items-center justify-center border border-slate-800 bg-slate-950 text-xs text-slate-400">
        Loading view...
      </div>
    );
  }

  return (
    <ViewerErrorBoundary>
      <div className="h-screen w-screen bg-slate-950">
        <DetailViewerCard
          payload={payload}
          isPinned={pinned}
          onTogglePin={handleTogglePin}
          onStartDrag={() => void tauriBridge.startFloatingViewerDrag()}
          draggableWindow
          onClose={() => void tauriBridge.closeFloatingViewer()}
          onEdit={(kind, id) => void tauriBridge.requestViewerEdit(kind, id)}
        />
      </div>
    </ViewerErrorBoundary>
  );
}

/**
 * Browser preview & Vitest fallback modal rendered via portal when `!isTauriRuntime()`,
 * supporting Pin, header dragging, off-click backdrop close (when unpinned), and Escape close.
 */
export function PreviewFloatingViewerPortal({ kind }: { kind: 'note' | 'strategy' }) {
  const previewPayload = useViewerStore((s) => s.previewPayload);
  const previewPinned = useViewerStore((s) => s.previewPinned);
  const setPreviewPinned = useViewerStore((s) => s.setPreviewPinned);
  const closePreviewViewer = useViewerStore((s) => s.closePreviewViewer);
  const triggerEditRequest = useViewerStore((s) => s.triggerEditRequest);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const visible = Boolean(previewPayload && previewPayload.kind === kind);

  useEffect(() => {
    if (!visible) {
      setDragOffset({ x: 0, y: 0 });
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !previewPinned) {
        e.preventDefault();
        closePreviewViewer();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      dragCleanupRef.current?.();
    };
  }, [closePreviewViewer, previewPinned, visible]);

  const handleStartPreviewDrag = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    dragCleanupRef.current?.();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = dragOffset.x;
    const origY = dragOffset.y;

    const onMove = (mv: PointerEvent) => {
      setDragOffset({
        x: origX + (mv.clientX - startX),
        y: origY + (mv.clientY - startY),
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      dragCleanupRef.current = null;
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  if (!visible || !previewPayload) return null;

  return createPortal(
    <div
      data-testid="floating-viewer-backdrop"
      onMouseDown={() => {
        if (!previewPinned) closePreviewViewer();
      }}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${
        previewPinned ? 'pointer-events-none bg-transparent' : 'bg-slate-950/70 backdrop-blur-xs'
      }`}
    >
      <div
        style={{ transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` }}
        className="pointer-events-auto h-[min(86vh,620px)] w-[min(92vw,740px)]"
      >
        <DetailViewerCard
          payload={previewPayload}
          isPinned={previewPinned}
          onTogglePin={() => setPreviewPinned(!previewPinned)}
          onStartDrag={handleStartPreviewDrag}
          onClose={closePreviewViewer}
          onEdit={(k, id) => triggerEditRequest(k, id)}
        />
      </div>
    </div>,
    document.body,
  );
}
