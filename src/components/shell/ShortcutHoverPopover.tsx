import { HelpCircle, Keyboard, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDockStore } from '../../stores/dockStore';
import {
  CONTEXT_SHORTCUTS,
  WIDGET_SHORTCUTS,
  type ShortcutContextId,
} from '../../types/hotkeys';
import type { WidgetId } from '../../types/settings';

export type ShortcutPopoverScope =
  | { type: 'widget'; widgetId: WidgetId }
  | { type: 'context'; context: ShortcutContextId };

interface ShortcutHoverPopoverProps {
  scope: ShortcutPopoverScope;
  label?: string;
  showGlobalShortcutLink?: boolean;
}

export function ShortcutHoverPopover({
  scope,
  label,
  showGlobalShortcutLink = true,
}: ShortcutHoverPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 16, left: 16 });
  const setSettingsOpen = useDockStore((s) => s.setSettingsOpen);

  const group =
    scope.type === 'widget'
      ? WIDGET_SHORTCUTS[scope.widgetId]
      : CONTEXT_SHORTCUTS[scope.context];

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const popWidth = Math.min(300, Math.max(200, window.innerWidth - 16));
    const estHeight = 260;

    let left = rect.right - popWidth;
    if (left < 8) left = 8;
    if (left + popWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popWidth - 8);
    }

    let top = rect.bottom + 6;
    if (top + estHeight > window.innerHeight - 8 && rect.top > estHeight + 12) {
      top = Math.max(8, rect.top - estHeight - 6);
    }
    setCoords({ top, left });
  }, []);

  const openPopover = useCallback(() => {
    clearTimers();
    updatePosition();
    setOpen(true);
  }, [clearTimers, updatePosition]);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimerRef.current = window.setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, 100);
  }, [clearTimers, updatePosition]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 160);
  }, [clearTimers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDocDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('[data-shortcut-popover="true"]')) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDocDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, [open]);

  useEffect(() => clearTimers, [clearTimers]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openPopover();
        }}
        aria-label={`${group.title} shortcuts`}
        title={`Hover or click for ${group.title}`}
        className={`inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[9px] transition-colors ${
          open
            ? 'border-blue-500/60 bg-blue-500/20 text-blue-300'
            : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
        }`}
      >
        {label ? <Keyboard className="h-2.5 w-2.5" /> : <HelpCircle className="h-2.5 w-2.5" />}
        {label && <span>{label}</span>}
      </button>

      {open &&
        createPortal(
          <div
            role="tooltip"
            data-lock-open="true"
            data-shortcut-popover="true"
            onMouseEnter={clearTimers}
            onMouseLeave={scheduleClose}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: 'min(300px, calc(100vw - 16px))',
              zIndex: 120,
            }}
            className="rounded-lg border border-slate-700/90 bg-slate-950/98 p-2.5 text-[10px] text-slate-100 shadow-2xl backdrop-blur-md"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-slate-800 pb-1">
              <span className="inline-flex items-center gap-1 font-semibold text-blue-300">
                <Keyboard className="h-3 w-3" />
                {group.title}
              </span>
            </div>

            <div className="space-y-1">
              {group.items.map((item) => (
                <div
                  key={`${item.keys}-${item.action}`}
                  className="flex items-start justify-between gap-2 rounded bg-slate-900/65 px-1.5 py-1"
                >
                  <span className="text-[10px] leading-snug text-slate-300">{item.action}</span>
                  <kbd className="shrink-0 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-300">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>

            {showGlobalShortcutLink && (
              <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[9px] text-slate-500">
                <span>System hotkeys stay in Settings</span>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void setSettingsOpen(true, 'keys');
                  }}
                  className="inline-flex items-center gap-0.5 text-blue-400 hover:underline"
                >
                  <Settings2 className="h-2.5 w-2.5" />
                  Global Keys
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
