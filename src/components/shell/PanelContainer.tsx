import { Keyboard, SlidersHorizontal } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import { useDockStore } from '../../stores/dockStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getSlideTransform, isHorizontalEdge } from '../../utils/dockMath';
import { formatZoneClock, getStatusIndicatorLight, NY_TIMEZONE } from '../../utils/timezone';
import { SettingsOverlay, type SettingsTab } from '../settings/SettingsOverlay';
import { HotkeySheetModal } from './HotkeySheetModal';
import { ResizeHandle } from './ResizeHandle';
import { TitleBar } from './TitleBar';
import { WidgetStack } from './WidgetStack';

interface PanelContainerProps {
  onMouseEnter: () => void;
  onMouseLeave: (clientX: number, clientY: number, rect: DOMRect | null) => void;
}

export function PanelContainer({ onMouseEnter, onMouseLeave }: PanelContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const edge = useSettingsStore((s) => s.settings.edge);
  const animationDurationMs = useSettingsStore((s) => s.settings.animationDurationMs);
  const panelOpacity = useSettingsStore((s) => s.settings.panelOpacity);
  const displayTimezone = useSettingsStore((s) => s.settings.displayTimezone);
  const showDualNyClock = useSettingsStore((s) => s.settings.showDualNyClock);
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat);
  const statusIndicator = useSettingsStore((s) => s.settings.statusIndicator);
  const killzones = useSettingsStore((s) => s.settings.killzones);

  const slideVisible = useDockStore((s) => s.slideVisible);
  const phase = useDockStore((s) => s.phase);
  const isSettingsOpen = useDockStore((s) => s.isSettingsOpen);
  const isHotkeysOpen = useDockStore((s) => s.isHotkeysOpen);
  const fellBackToPrimary = useDockStore((s) => s.fellBackToPrimary);
  const finishCollapseBounds = useDockStore((s) => s.finishCollapseBounds);
  const setSettingsOpen = useDockStore((s) => s.setSettingsOpen);
  const setHotkeysOpen = useDockStore((s) => s.setHotkeysOpen);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('dock');

  const [now, setNow] = useState(() => DateTime.utc());
  useEffect(() => {
    const id = window.setInterval(() => setNow(DateTime.utc()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const horizontal = isHorizontalEdge(edge);
  const statusLight = getStatusIndicatorLight(now, statusIndicator, killzones);

  const borderEdgeClass =
    edge === 'left'
      ? 'border-r border-slate-700/80'
      : edge === 'right'
        ? 'border-l border-slate-700/80'
        : edge === 'top'
          ? 'border-b border-slate-700/80'
          : 'border-t border-slate-700/80';

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    if (phase === 'collapsing') {
      void finishCollapseBounds();
    }
  };

  return (
    <aside
      ref={containerRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={(e) =>
        onMouseLeave(
          e.clientX,
          e.clientY,
          containerRef.current?.getBoundingClientRect() ?? null,
        )
      }
      onTransitionEnd={handleTransitionEnd}
      style={{
        transform: getSlideTransform(edge, slideVisible),
        transition: `transform ${animationDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        backgroundColor: `rgba(15, 23, 42, ${panelOpacity})`,
      }}
      className={`relative flex h-full w-full flex-col overflow-hidden text-slate-100 shadow-2xl backdrop-blur-md ${borderEdgeClass}`}
    >
      <ResizeHandle />
      <TitleBar />

      {fellBackToPrimary && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">
          Saved monitor disconnected — docked to primary display work area.
        </div>
      )}

      {/* Live Local / NY + Killzone Status Strip */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800/90 bg-slate-900/70 px-3 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{
              backgroundColor: statusLight.color,
              boxShadow: statusLight.isActive ? `0 0 8px ${statusLight.color}` : 'none',
            }}
          />
          <span className="truncate font-medium text-slate-200" title={statusLight.label}>
            {statusLight.label}
          </span>
        </div>
        <div className="shrink-0 font-mono text-[10px] text-slate-400">
          {showDualNyClock && displayTimezone !== NY_TIMEZONE
            ? `${formatZoneClock(now, displayTimezone, timeFormat)} • NY ${formatZoneClock(now, NY_TIMEZONE, timeFormat)}`
            : `${displayTimezone === NY_TIMEZONE ? 'NY ' : ''}${formatZoneClock(now, displayTimezone, timeFormat)}`}
        </div>
      </div>

      {/* Modular Widget Stack (adapts vertical vs horizontal dock orientation) */}
      <WidgetStack now={now} layout={horizontal ? 'horizontal' : 'vertical'} />

      {/* Footer Quick Actions */}
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] text-slate-400">
        <span>ICT / SMC Assistant</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void setHotkeysOpen(true)}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="View Hotkey Cheat Sheet (Ctrl+/)"
          >
            <Keyboard className="h-3 w-3" />
            Hotkeys
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsTab('dock');
              void setSettingsOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <SlidersHorizontal className="h-3 w-3" />
            Customize
          </button>
        </div>
      </footer>

      {isHotkeysOpen && (
        <HotkeySheetModal
          onOpenHotkeySettings={() => {
            setSettingsTab('keys');
            void setHotkeysOpen(false).then(() => setSettingsOpen(true));
          }}
        />
      )}
      {isSettingsOpen && <SettingsOverlay initialTab={settingsTab} />}
    </aside>
  );
}
