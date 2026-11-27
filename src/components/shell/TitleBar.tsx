import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Keyboard,
  Lock,
  Maximize2,
  Pin,
  PinOff,
  Power,
  Settings,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { memo, useEffect, useState } from 'react';
import { tauriBridge } from '../../services/tauriBridge';
import { useDockStore } from '../../stores/dockStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatMonitorLabel } from '../../utils/dockMath';
import { formatZoneClock, NY_TIMEZONE } from '../../utils/timezone';

  export const TitleBar = memo(function TitleBar() {
    const edge = useSettingsStore((s) => s.settings.edge);
    const displayTimezone = useSettingsStore((s) => s.settings.displayTimezone);
    const timeFormat = useSettingsStore((s) => s.settings.timeFormat);
    const showDualNyClock = useSettingsStore((s) => s.settings.showDualNyClock);

    const isPinned = useDockStore((s) => s.isPinned);
    const isAutoLocked = useDockStore((s) => s.isAutoLocked);
    const isSettingsOpen = useDockStore((s) => s.isSettingsOpen);
    const isHotkeysOpen = useDockStore((s) => s.isHotkeysOpen);
    const activeMonitorId = useDockStore((s) => s.activeMonitorId);
    const togglePin = useDockStore((s) => s.togglePin);
    const setSettingsOpen = useDockStore((s) => s.setSettingsOpen);
    const setHotkeysOpen = useDockStore((s) => s.setHotkeysOpen);
    const toggleFullScreen = useDockStore((s) => s.toggleFullScreen);
    const collapsePanel = useDockStore((s) => s.collapsePanel);
    const beginDrag = useDockStore((s) => s.beginDrag);
    const completeDragSnap = useDockStore((s) => s.completeDragSnap);

    const [now, setNow] = useState(() => DateTime.utc());
    useEffect(() => {
      const id = window.setInterval(() => setNow(DateTime.utc()), 1000);
      return () => window.clearInterval(id);
    }, []);

    const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      void beginDrag();
      const finish = () => {
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('blur', finish);
        void completeDragSnap();
      };
      window.addEventListener('pointerup', finish, { once: true });
      window.addEventListener('blur', finish, { once: true });
    };

    const CollapseIcon =
      edge === 'left'
        ? ChevronLeft
        : edge === 'right'
          ? ChevronRight
          : edge === 'top'
            ? ChevronUp
            : ChevronDown;

    return (
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-700/60 bg-slate-900/90 px-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <div
            role="button"
            tabIndex={-1}
            title="Drag across monitors & release near any screen edge to dock"
            onPointerDown={handleDragStart}
            className="flex cursor-grab items-center rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold tracking-wide text-slate-100">
              ICT / SMC Panel
            </span>
            <span className="truncate text-[10px] text-slate-400">
              {edge.toUpperCase()} • {formatMonitorLabel(activeMonitorId)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="mr-1 hidden flex-col items-end font-mono text-[10px] leading-tight sm:flex">
            <span className="text-slate-200">
              {formatZoneClock(now, displayTimezone, timeFormat)}
            </span>
            {showDualNyClock && (
              <span className="text-amber-400/90">
                NY {formatZoneClock(now, NY_TIMEZONE, timeFormat)}
              </span>
            )}
          </div>

          {isAutoLocked && (
            <span
              title="Auto-locked open while editing"
              className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
            >
              <Lock className="h-3 w-3" />
            </span>
          )}

          <button
            type="button"
            onClick={() => void togglePin()}
            title={isPinned ? 'Unpin panel (auto-collapse on mouse-out)' : 'Pin panel open'}
            aria-pressed={isPinned}
            className={`rounded p-1.5 transition-colors ${isPinned
                ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
          >
            {isPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => void toggleFullScreen()}
            title="Toggle Full-Screen Workspace (Ctrl+Shift+F)"
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => void setHotkeysOpen(!isHotkeysOpen)}
            title="Keyboard Shortcuts Cheat Sheet (Ctrl+/)"
            aria-label="Keyboard Shortcuts Cheat Sheet"
            aria-pressed={isHotkeysOpen}
            className={`rounded p-1.5 transition-colors ${isHotkeysOpen
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
          >
            <Keyboard className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => void setSettingsOpen(!isSettingsOpen)}
            title="Panel Settings (Ctrl+,)"
            aria-label="Panel Settings"
            aria-pressed={isSettingsOpen}
            className={`rounded p-1.5 transition-colors ${isSettingsOpen
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          {!isPinned && (
            <button
              type="button"
              onClick={() => void collapsePanel()}
              title="Collapse to edge strip"
              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <CollapseIcon className="h-3.5 w-3.5" />
            </button>
          )}

          <div className="mx-0.5 h-3.5 w-px bg-slate-700/70" aria-hidden="true" />

          <button
            type="button"
            onClick={() => void tauriBridge.quitApp()}
            title="Quit ICT Trading Panel"
            aria-label="Quit Application"
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-500/20 hover:text-rose-400"
          >
            <Power className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
    );
});
