import { DateTime } from 'luxon';
import { useEffect, useRef } from 'react';
import { tauriBridge } from '../services/tauriBridge';
import { useDockStore } from '../stores/dockStore';
import { useMarketStore } from '../stores/marketStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { HotkeyActionId } from '../types/hotkeys';
import { getUpcomingHighImpactAlerts } from '../utils/calendarAlerts';
import { matchesAccelerator } from '../utils/hotkeyUtils';
import { launchWindowsScreenSnip } from '../utils/imageClipboard';
import { getCurrentKillzones, NY_ZONE } from '../utils/killzoneEngine';
import { isFxWeekendClosed } from '../utils/sessionEngine';

export function useWindowLifecycle() {
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const settings = useSettingsStore((s) => s.settings);

  const initializeDock = useDockStore((s) => s.initializeDock);
  const reapplyBounds = useDockStore((s) => s.reapplyBounds);
  const expandPanel = useDockStore((s) => s.expandPanel);
  const collapsePanel = useDockStore((s) => s.collapsePanel);
  const togglePin = useDockStore((s) => s.togglePin);
  const completeDragSnap = useDockStore((s) => s.completeDragSnap);
  const toggleFullScreen = useDockStore((s) => s.toggleFullScreen);
  const setSettingsOpen = useDockStore((s) => s.setSettingsOpen);
  const setHotkeysOpen = useDockStore((s) => s.setHotkeysOpen);
  const setHotkeyConflicts = useDockStore((s) => s.setHotkeyConflicts);
  const loadMarketData = useMarketStore((s) => s.loadMarketData);
  const events = useMarketStore((s) => s.events);

  const notifiedTokensRef = useRef<Set<string>>(new Set());

  // Hydrate persisted settings from SQLite and dock collapsed strip cleanly on startup
  useEffect(() => {
    let active = true;
    (async () => {
      await hydrate();
      if (active) {
        await initializeDock();
      }
    })();
    return () => {
      active = false;
    };
  }, [hydrate, initializeDock]);

  // Sync CSS theme variables cleanly whenever appearance settings change
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--accent-primary', settings.accentColor);
    root.setProperty('--panel-opacity', String(settings.panelOpacity));
    root.setProperty('--strip-color', settings.stripColor);
    root.setProperty('--strip-opacity', String(settings.stripOpacity));
  }, [
    settings.accentColor,
    settings.panelOpacity,
    settings.stripColor,
    settings.stripOpacity,
  ]);

  // Execute a configured hotkey action uniformly whether triggered globally or locally
  const dispatchHotkeyAction = useRef<(action: HotkeyActionId) => void>(() => { });
  dispatchHotkeyAction.current = (action: HotkeyActionId) => {
    const dock = useDockStore.getState();
    switch (action) {
      case 'togglePanel':
        if (dock.phase === 'fullscreen') return;
        if (dock.phase === 'collapsed' || dock.phase === 'collapsing') {
          void expandPanel();
        } else if (!dock.isPinned) {
          void collapsePanel();
        } else {
          // If pinned open, explicit toggle unpins and collapses
          void togglePin().then(() => collapsePanel());
        }
        break;
      case 'toggleFullscreen':
        void toggleFullScreen();
        break;
      case 'screenSnip':
        void launchWindowsScreenSnip();
        break;
      case 'togglePin':
        void togglePin();
        break;
    }
  };

  // Register system-wide global hotkeys via Tauri plugin whenever hotkey settings change
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void tauriBridge
      .syncGlobalHotkeys(settings.hotkeys, (action) => dispatchHotkeyAction.current(action))
      .then((conflicts) => {
        if (!cancelled) setHotkeyConflicts(conflicts);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, setHotkeyConflicts, settings.hotkeys]);

  // Cleanup shortcuts on unmount
  useEffect(() => {
    return () => {
      void tauriBridge.unregisterAllHotkeys();
    };
  }, []);

  // Recompute work-area bounds when DPI or monitor configuration changes, complete
  // native drag-snap once Win32 modal move loop releases, and refresh calendar/news cache on Rust `data-updated`.
  useEffect(() => {
    if (!hydrated) return;
    let unlistenMetrics: (() => void) | undefined;
    let unlistenDrag: (() => void) | undefined;
    let unlistenData: (() => void) | undefined;
    let unlistenTray: (() => void) | undefined;
    let mounted = true;

    void tauriBridge.onDisplayMetricsChanged(() => {
      void reapplyBounds();
    }).then((fn) => {
      if (mounted) unlistenMetrics = fn;
      else fn();
    });

    void tauriBridge.onDockDragReleased(() => {
      void completeDragSnap();
    }).then((fn) => {
      if (mounted) unlistenDrag = fn;
      else fn();
    });

    void tauriBridge.onMarketDataUpdated(() => {
      void loadMarketData();
    }).then((fn) => {
      if (mounted) unlistenData = fn;
      else fn();
    });

    void tauriBridge.onTrayAction((action) => {
      dispatchHotkeyAction.current(action);
    }).then((fn) => {
      if (mounted) unlistenTray = fn;
      else fn();
    });

    return () => {
      mounted = false;
      if (unlistenMetrics) unlistenMetrics();
      if (unlistenDrag) unlistenDrag();
      if (unlistenData) unlistenData();
      if (unlistenTray) unlistenTray();
    };
  }, [completeDragSnap, hydrated, loadMarketData, reapplyBounds]);

  // Local window keyboard shortcuts (Cheat Sheet Ctrl+/, Settings Ctrl+,, Escape, and configurable hotkeys fallback)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        const inEditable =
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.tagName === 'SELECT' ||
          Boolean(target?.isContentEditable);

        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
          e.preventDefault();
          const cur = useDockStore.getState().isHotkeysOpen;
          void setHotkeysOpen(!cur);
          return;
        }

        if (!inEditable && e.key === '?') {
          e.preventDefault();
          const cur = useDockStore.getState().isHotkeysOpen;
          void setHotkeysOpen(!cur);
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
          e.preventDefault();
          const cur = useDockStore.getState().isSettingsOpen;
          void setSettingsOpen(!cur);
          return;
        }

        if (e.key === 'Escape') {
          const dock = useDockStore.getState();
          if (dock.isHotkeysOpen) {
            e.preventDefault();
            void setHotkeysOpen(false);
            return;
          }
          if (dock.isSettingsOpen) {
            e.preventDefault();
            void setSettingsOpen(false);
            return;
          }
          if (dock.phase === 'fullscreen') {
            e.preventDefault();
            void toggleFullScreen();
            return;
          }
        }

        if (settings.hotkeys.enabled) {
          const actions: HotkeyActionId[] = [
            'toggleFullscreen',
            'togglePanel',
            'screenSnip',
            'togglePin',
          ];
          for (const actId of actions) {
            if (matchesAccelerator(e, settings.hotkeys[actId])) {
              e.preventDefault();
              dispatchHotkeyAction.current(actId);
              return;
            }
          }
        }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
}, [setHotkeysOpen, setSettingsOpen, settings.hotkeys, toggleFullScreen]);

// Background notification watcher for active primary Killzones and <=15m Red-Folder alerts
useEffect(() => {
  if (!hydrated || !settings.notificationsEnabled) return;

  const checkAlerts = () => {
    const now = DateTime.utc();
    if (!isFxWeekendClosed(now)) {
      const activeKzs = getCurrentKillzones(now, NY_ZONE, settings.killzones).filter(
        (z) => z.isActive && z.kind === 'killzone',
      );
      for (const kz of activeKzs) {
        const token = `kz:${kz.id}:${kz.nyStart.toISODate()}`;
        if (!notifiedTokensRef.current.has(token)) {
          notifiedTokensRef.current.add(token);
          void tauriBridge.sendDesktopNotification(
            `${kz.label} Active`,
            `NY window ${kz.nyStart.toFormat('HH:mm')}–${kz.nyEnd.toFormat('HH:mm')} is now live.`,
          );
        }
      }
    }

    const imminent = getUpcomingHighImpactAlerts(
      events,
      now,
      settings.volatilityThresholdMin || 15,
    );
    for (const al of imminent) {
      const token = `ev:${al.event.id}`;
      if (!notifiedTokensRef.current.has(token)) {
        notifiedTokensRef.current.add(token);
        void tauriBridge.sendDesktopNotification(
          `High Volatility Alert (${al.event.country})`,
          al.message,
        );
      }
    }
  };

  const timer = window.setInterval(checkAlerts, 30_000);
  return () => window.clearInterval(timer);
}, [
  events,
  hydrated,
  settings.killzones,
  settings.notificationsEnabled,
  settings.volatilityThresholdMin,
]);
}
