import { Keyboard, Layers, Minimize2, Power, Settings } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { tauriBridge } from '../../services/tauriBridge';
import { useDockStore } from '../../stores/dockStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatZoneClock, getStatusIndicatorLight, NY_TIMEZONE } from '../../utils/timezone';
import { SettingsOverlay, type SettingsTab } from '../settings/SettingsOverlay';
import { HotkeySheetModal } from './HotkeySheetModal';
import { WidgetStack } from './WidgetStack';

export function FullScreenDashboard() {
  const displayTimezone = useSettingsStore((s) => s.settings.displayTimezone);
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat);
  const statusIndicator = useSettingsStore((s) => s.settings.statusIndicator);
  const killzones = useSettingsStore((s) => s.settings.killzones);
  const edge = useSettingsStore((s) => s.settings.edge);

  const isSettingsOpen = useDockStore((s) => s.isSettingsOpen);
  const isHotkeysOpen = useDockStore((s) => s.isHotkeysOpen);
  const setSettingsOpen = useDockStore((s) => s.setSettingsOpen);
  const setHotkeysOpen = useDockStore((s) => s.setHotkeysOpen);
  const toggleFullScreen = useDockStore((s) => s.toggleFullScreen);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('dock');

  const [now, setNow] = useState(() => DateTime.utc());
  useEffect(() => {
    const id = window.setInterval(() => setNow(DateTime.utc()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const light = getStatusIndicatorLight(now, statusIndicator, killzones);

  return (
    <div className="relative flex h-full w-full flex-col bg-slate-950 text-slate-100">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/95 px-5">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-blue-400" />
          <div>
            <h1 className="text-sm font-semibold tracking-wide">
              ICT / SMC Trading Workspace — Full-Screen Mode
            </h1>
            <p className="text-[11px] text-slate-400">
              {light.label} • Local {formatZoneClock(now, displayTimezone, timeFormat)} • NY{' '}
              {formatZoneClock(now, NY_TIMEZONE, timeFormat)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void setHotkeysOpen(!isHotkeysOpen)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            title="View Keyboard Shortcuts (Ctrl+/)"
          >
            <Keyboard className="h-3.5 w-3.5" />
            Hotkeys
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsTab('dock');
              void setSettingsOpen(!isSettingsOpen);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
          <button
            type="button"
            onClick={() => void toggleFullScreen()}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Return to {edge.toUpperCase()} Edge
          </button>
          <button
            type="button"
            onClick={() => void tauriBridge.quitApp()}
            title="Quit ICT Trading Panel"
            aria-label="Quit Application"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-rose-500/50 hover:bg-rose-500/15 hover:text-rose-300"
          >
            <Power className="h-3.5 w-3.5" />
            Quit
          </button>
        </div>
      </header>

      <WidgetStack now={now} layout="grid" />

      {isHotkeysOpen && (
        <HotkeySheetModal
          onOpenHotkeySettings={() => {
            setSettingsTab('keys');
            void setHotkeysOpen(false).then(() => setSettingsOpen(true));
          }}
        />
      )}
      {isSettingsOpen && <SettingsOverlay initialTab={settingsTab} />}
    </div>
  );
}
