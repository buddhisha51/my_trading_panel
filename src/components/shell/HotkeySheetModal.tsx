import { AlertTriangle, Keyboard, Settings2, X } from 'lucide-react';
import { usePreservedScroll } from '../../hooks/usePreservedScroll';
import { useDockStore } from '../../stores/dockStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  GLOBAL_HOTKEY_META,
  STATIC_SHORTCUTS,
  type StaticShortcutInfo,
} from '../../types/hotkeys';
import { formatAcceleratorForDisplay } from '../../utils/hotkeyUtils';

interface HotkeySheetModalProps {
  onOpenHotkeySettings?: () => void;
}

export function HotkeySheetModal({ onOpenHotkeySettings }: HotkeySheetModalProps) {
  const hotkeys = useSettingsStore((s) => s.settings.hotkeys);
  const setHotkeysOpen = useDockStore((s) => s.setHotkeysOpen);
  const setSettingsOpen = useDockStore((s) => s.setSettingsOpen);
  const hotkeyConflicts = useDockStore((s) => s.hotkeyConflicts);
  const contentScrollRef = usePreservedScroll<HTMLDivElement>('hotkey-sheet-modal');

  const scopes: Array<StaticShortcutInfo['scope']> = [
    'Panel Navigation',
    'ICT Drawing Canvas',
    'Rich Note Editor',
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts Cheat Sheet"
      data-lock-open="true"
      className="absolute inset-0 z-50 flex flex-col bg-slate-950/98 text-slate-100 backdrop-blur-lg"
    >
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 px-3">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-semibold tracking-wide">
            Hotkey Reference Cheat Sheet
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (onOpenHotkeySettings) {
                onOpenHotkeySettings();
              } else {
                void setHotkeysOpen(false).then(() => setSettingsOpen(true, 'keys'));
              }
            }}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-medium text-blue-300 hover:bg-slate-800"
          >
            <Settings2 className="h-3 w-3" />
            Customize
          </button>
          <button
            type="button"
            onClick={() => void setHotkeysOpen(false)}
            aria-label="Close Hotkey Cheat Sheet"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Shortcut Tables */}
      <div ref={contentScrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-xs">
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
              Global Hotkeys (Work Over TradingView &amp; MT5)
            </h3>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${hotkeys.enabled
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-slate-800 text-slate-400'
                }`}
            >
              {hotkeys.enabled ? 'Active' : 'Paused'}
            </span>
          </div>

          <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-900/75">
            {GLOBAL_HOTKEY_META.map((meta) => {
              const accel = hotkeys[meta.id];
              const conflict = hotkeyConflicts[meta.id];
              return (
                <div key={meta.id} className="space-y-1 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-100">{meta.title}</div>
                      <div className="text-[10px] text-slate-400">{meta.description}</div>
                    </div>
                    <kbd className="shrink-0 rounded border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300 shadow-sm">
                      {formatAcceleratorForDisplay(accel)}
                    </kbd>
                  </div>
                  {conflict && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-300">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>{conflict}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {scopes.map((scope) => {
          const items = STATIC_SHORTCUTS.filter((s) => s.scope === scope);
          return (
            <section key={scope} className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {scope}
              </h3>
              <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-900/60">
                {items.map((item) => (
                  <div
                    key={`${item.scope}-${item.keys}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5"
                  >
                    <span className="text-[11px] text-slate-300">{item.action}</span>
                    <kbd className="shrink-0 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <div className="rounded-md border border-slate-800 bg-slate-900/50 px-2.5 py-2 text-[10px] text-slate-400">
          Tip: Hover the <kbd className="rounded border border-slate-700 bg-slate-950 px-1 font-mono text-slate-200">?</kbd> icon on any widget header or the Drawing Canvas toolbar for contextual shortcuts, or press <kbd className="rounded border border-slate-700 bg-slate-950 px-1 font-mono text-slate-200">Ctrl + /</kbd> to toggle this cheat sheet.
        </div>
      </div>
    </div>
  );
}
