import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { tauriBridge } from '../services/tauriBridge';
import type { DockEdge, DockGeometry, DockPhase, MonitorInfo } from '../types/dock';
import type { HotkeyActionId } from '../types/hotkeys';
import { useSettingsStore } from './settingsStore';

interface PreFullscreenSnapshot {
  phase: 'collapsed' | 'expanded';
  isPinned: boolean;
}

interface DockState {
  monitors: MonitorInfo[];
  activeMonitorId: string | null;
  geometry: DockGeometry | null;
  phase: DockPhase;
  slideVisible: boolean;
  isPinned: boolean;
  isAutoLocked: boolean;
  isSettingsOpen: boolean;
  settingsTab: 'dock' | 'appearance' | 'time' | 'zones' | 'keys' | 'widgets';
  isHotkeysOpen: boolean;
  isResizing: boolean;
  isDragging: boolean;
  isReorderingWidgets: boolean;
  fellBackToPrimary: boolean;
  preFullscreenSnapshot: PreFullscreenSnapshot | null;
  hotkeyConflicts: Partial<Record<HotkeyActionId, string>>;

  initializeDock: () => Promise<void>;
  refreshMonitors: () => Promise<void>;
  reapplyBounds: () => Promise<void>;
  expandPanel: () => Promise<void>;
  collapsePanel: () => Promise<void>;
  finishCollapseBounds: () => Promise<void>;
  togglePin: () => Promise<void>;
  setAutoLocked: (locked: boolean) => Promise<void>;
  setSettingsOpen: (
    open: boolean,
    tab?: 'dock' | 'appearance' | 'time' | 'zones' | 'keys' | 'widgets',
  ) => Promise<void>;
  setSettingsTab: (tab: 'dock' | 'appearance' | 'time' | 'zones' | 'keys' | 'widgets') => void;
  setHotkeysOpen: (open: boolean) => Promise<void>;
  setHotkeyConflicts: (conflicts: Partial<Record<HotkeyActionId, string>>) => void;
  setResizing: (resizing: boolean) => void;
  setReorderingWidgets: (reordering: boolean) => void;
  resizePanel: (newSizePx: number, persist?: boolean) => Promise<void>;
  dockToMonitorEdge: (monitorId: string | null, edge: DockEdge) => Promise<void>;
  beginDrag: () => Promise<void>;
  completeDragSnap: () => Promise<void>;
  toggleFullScreen: () => Promise<void>;
}

let collapseToken = 0;

export const useDockStore = create<DockState>()(
  immer((set, get) => ({
    monitors: [],
    activeMonitorId: null,
    geometry: null,
    phase: 'collapsed',
    slideVisible: false,
    isPinned: false,
    isAutoLocked: false,
    isSettingsOpen: false,
    settingsTab: 'dock',
    isHotkeysOpen: false,
    isResizing: false,
    isDragging: false,
    isReorderingWidgets: false,
    fellBackToPrimary: false,
    preFullscreenSnapshot: null,
    hotkeyConflicts: {},

    initializeDock: async () => {
      const monitors = await tauriBridge.getMonitors();
      const { edge, monitorId, collapsedThickness, expandedSize } =
        useSettingsStore.getState().settings;

      const applied = await tauriBridge.applyDockBounds({
        edge,
        monitorId,
        collapsedThickness,
        expandedSize,
        expanded: false,
        allowFocus: false,
      });

      set((state) => {
        state.monitors = monitors;
        state.activeMonitorId = applied.monitorId;
        state.geometry = applied.geometry;
        state.phase = 'collapsed';
        state.slideVisible = false;
        state.fellBackToPrimary = applied.fellBackToPrimary;
      });

      if (applied.monitorId !== monitorId) {
        await useSettingsStore.getState().updateSettings({
          monitorId: applied.monitorId,
        });
      }
    },

    refreshMonitors: async () => {
      const monitors = await tauriBridge.getMonitors();
      set((state) => {
        state.monitors = monitors;
      });
    },

    reapplyBounds: async () => {
      const state = get();
      const monitors = await tauriBridge.getMonitors();
      const { edge, monitorId, collapsedThickness, expandedSize } =
        useSettingsStore.getState().settings;

      if (state.phase === 'fullscreen') {
        const stillConnected = monitors.some((m) => m.id === state.activeMonitorId);
        if (!stillConnected && monitors.length > 0) {
          const fallback = monitors.find((m) => m.isPrimary) ?? monitors[0];
          await tauriBridge.setPanelFullscreen({
            fullscreen: true,
            edge,
            monitorId: fallback.id,
            collapsedThickness,
            expandedSize,
            restoreExpanded: true,
          });
          set((s) => {
            s.monitors = monitors;
            s.activeMonitorId = fallback.id;
            s.fellBackToPrimary = true;
          });
          await useSettingsStore.getState().updateSettings({ monitorId: fallback.id });
        } else {
          set((s) => {
            s.monitors = monitors;
          });
        }
        return;
      }

      const expanded =
        state.phase === 'expanded' ||
        state.phase === 'expanding' ||
        state.isPinned ||
        state.isSettingsOpen;

      const applied = await tauriBridge.applyDockBounds({
        edge,
        monitorId,
        collapsedThickness,
        expandedSize,
        expanded,
        allowFocus: state.isAutoLocked || state.isSettingsOpen,
      });

      set((s) => {
        s.monitors = monitors;
        s.activeMonitorId = applied.monitorId;
        s.geometry = applied.geometry;
        s.fellBackToPrimary = applied.fellBackToPrimary;
      });

      if (applied.fellBackToPrimary && applied.monitorId !== monitorId) {
        await useSettingsStore.getState().updateSettings({
          monitorId: applied.monitorId,
        });
      }
    },

    expandPanel: async () => {
      const state = get();
      if (state.phase === 'fullscreen') return;

      // Cancel any pending collapse transition immediately
      collapseToken += 1;

      if (state.phase === 'expanded' && state.slideVisible) {
        return;
      }

      const { edge, monitorId, collapsedThickness, expandedSize } =
        useSettingsStore.getState().settings;

      const applied = await tauriBridge.prepareExpandBounds({
        edge,
        monitorId,
        collapsedThickness,
        expandedSize,
      });

      set((s) => {
        s.activeMonitorId = applied.monitorId;
        s.geometry = applied.geometry;
        s.phase = 'expanding';
        s.slideVisible = false;
      });

      // Next animation frame: flip CSS transform to translate3d(0,0,0) on GPU compositor
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          set((s) => {
            if (s.phase === 'expanding') {
              s.slideVisible = true;
              s.phase = 'expanded';
            }
          });
        });
      });
    },

    collapsePanel: async () => {
      const state = get();
      if (
        state.phase === 'collapsed' ||
        state.phase === 'collapsing' ||
        state.phase === 'fullscreen' ||
        state.isPinned ||
        state.isAutoLocked ||
        state.isSettingsOpen ||
        state.isHotkeysOpen ||
        state.isResizing ||
        state.isDragging ||
        state.isReorderingWidgets
      ) {
        return;
      }

      const token = ++collapseToken;
      const { animationDurationMs } = useSettingsStore.getState().settings;

      set((s) => {
        s.phase = 'collapsing';
        s.slideVisible = false;
      });

      // Safety fallback in case CSS transitionend doesn't fire (e.g. reduced motion / test env)
      setTimeout(() => {
        if (collapseToken === token && get().phase === 'collapsing') {
          void get().finishCollapseBounds();
        }
      }, animationDurationMs + 80);
    },

    finishCollapseBounds: async () => {
      const state = get();
      if (state.phase !== 'collapsing') return;

      const { edge, monitorId, collapsedThickness, expandedSize } =
        useSettingsStore.getState().settings;

      const applied = await tauriBridge.commitCollapseBounds({
        edge,
        monitorId,
        collapsedThickness,
        expandedSize,
      });

      set((s) => {
        s.activeMonitorId = applied.monitorId;
        s.geometry = applied.geometry;
        s.phase = 'collapsed';
        s.slideVisible = false;
      });
    },

    togglePin: async () => {
      const nextPinned = !get().isPinned;
      set((s) => {
        s.isPinned = nextPinned;
      });
      if (nextPinned && get().phase === 'collapsed') {
        await get().expandPanel();
      }
      await tauriBridge.setFocusable(nextPinned || get().isAutoLocked, false);
    },

    setAutoLocked: async (locked) => {
      if (get().isAutoLocked === locked) return;
      set((s) => {
        s.isAutoLocked = locked;
      });
      await tauriBridge.setFocusable(locked || get().isPinned || get().isSettingsOpen, false);
    },

    setSettingsOpen: async (open, tab) => {
      set((s) => {
        s.isSettingsOpen = open;
        if (tab) s.settingsTab = tab;
        if (open) s.isHotkeysOpen = false;
      });
      if (open && get().phase === 'collapsed') {
        await get().expandPanel();
      }
      await tauriBridge.setFocusable(
        open || get().isHotkeysOpen || get().isPinned || get().isAutoLocked,
        open,
      );
    },

    setSettingsTab: (tab) => {
      set((s) => {
        s.settingsTab = tab;
      });
    },

    setHotkeysOpen: async (open) => {
      set((s) => {
        s.isHotkeysOpen = open;
        if (open) s.isSettingsOpen = false;
      });
      if (open && get().phase === 'collapsed') {
        await get().expandPanel();
      }
      await tauriBridge.setFocusable(
        open || get().isSettingsOpen || get().isPinned || get().isAutoLocked,
        open,
      );
    },

    setHotkeyConflicts: (conflicts) => {
      set((s) => {
        s.hotkeyConflicts = conflicts;
      });
    },

    setResizing: (resizing) => {
      set((s) => {
        s.isResizing = resizing;
      });
    },

    setReorderingWidgets: (reordering) => {
      set((s) => {
        s.isReorderingWidgets = reordering;
      });
    },

    resizePanel: async (newSizePx, persist = true) => {
      const { edge, monitorId, collapsedThickness } = useSettingsStore.getState().settings;
      const applied = await tauriBridge.resizeDockedPanel({
        edge,
        monitorId,
        collapsedThickness,
        newSize: Math.round(newSizePx),
      });

      set((s) => {
        s.geometry = applied.geometry;
      });

      if (persist) {
        await useSettingsStore.getState().updateSettings({
          expandedSize: applied.geometry.clampedExpandedSize,
        });
      } else {
        useSettingsStore.getState().patchSettingsLocal({
          expandedSize: applied.geometry.clampedExpandedSize,
        });
      }
    },

    dockToMonitorEdge: async (monitorId, edge) => {
      const { collapsedThickness, expandedSize } = useSettingsStore.getState().settings;
      const keepExpanded = get().phase === 'expanded' || get().isPinned || get().isSettingsOpen;

      const applied = await tauriBridge.applyDockBounds({
        edge,
        monitorId,
        collapsedThickness,
        expandedSize,
        expanded: keepExpanded,
        allowFocus: get().isSettingsOpen || get().isAutoLocked,
      });

      set((s) => {
        s.activeMonitorId = applied.monitorId;
        s.geometry = applied.geometry;
        s.fellBackToPrimary = applied.fellBackToPrimary;
        s.phase = keepExpanded ? 'expanded' : 'collapsed';
        s.slideVisible = keepExpanded;
      });

      await useSettingsStore.getState().updateSettings({
        edge,
        monitorId: applied.monitorId,
        expandedSize: applied.geometry.clampedExpandedSize,
      });
    },

    beginDrag: async () => {
      set((s) => {
        s.isDragging = true;
      });
      await tauriBridge.startDockDrag();
    },

    completeDragSnap: async () => {
      if (!get().isDragging) return;
      const { collapsedThickness, expandedSize } = useSettingsStore.getState().settings;
      const keepExpanded = get().phase !== 'collapsed';

      const snap = await tauriBridge.resolveDragSnap({
        collapsedThickness,
        expandedSize,
        keepExpanded,
      });

      set((s) => {
        s.isDragging = false;
        s.activeMonitorId = snap.monitorId;
        s.geometry = snap.geometry;
        s.phase = keepExpanded ? 'expanded' : 'collapsed';
        s.slideVisible = keepExpanded;
      });

      await useSettingsStore.getState().updateSettings({
        edge: snap.edge,
        monitorId: snap.monitorId,
        expandedSize: snap.geometry.clampedExpandedSize,
      });
    },

    toggleFullScreen: async () => {
      const state = get();
      const { edge, monitorId, collapsedThickness, expandedSize } =
        useSettingsStore.getState().settings;

      if (state.phase !== 'fullscreen') {
        const snapshot: PreFullscreenSnapshot = {
          phase: state.phase === 'collapsed' ? 'collapsed' : 'expanded',
          isPinned: state.isPinned,
        };

        await tauriBridge.setPanelFullscreen({
          fullscreen: true,
          edge,
          monitorId,
          collapsedThickness,
          expandedSize,
          restoreExpanded: true,
        });

        set((s) => {
          s.preFullscreenSnapshot = snapshot;
          s.phase = 'fullscreen';
          s.slideVisible = true;
        });
      } else {
        const snapshot = state.preFullscreenSnapshot ?? {
          phase: 'expanded',
          isPinned: state.isPinned,
        };
        const restoreExpanded = snapshot.phase === 'expanded' || snapshot.isPinned;

        const applied = await tauriBridge.setPanelFullscreen({
          fullscreen: false,
          edge,
          monitorId,
          collapsedThickness,
          expandedSize,
          restoreExpanded,
        });

        set((s) => {
          s.preFullscreenSnapshot = null;
          s.isPinned = snapshot.isPinned;
          s.phase = restoreExpanded ? 'expanded' : 'collapsed';
          s.slideVisible = restoreExpanded;
          if (applied) {
            s.activeMonitorId = applied.monitorId;
            s.geometry = applied.geometry;
          }
        });
      }
    },
  })),
);
