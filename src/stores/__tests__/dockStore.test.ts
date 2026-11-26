import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tauriBridge } from '../../services/tauriBridge';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { useDockStore } from '../dockStore';
import { useSettingsStore } from '../settingsStore';

describe('dockStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      hydrated: true,
      saving: false,
    });
    useDockStore.setState({
      monitors: [],
      activeMonitorId: null,
      geometry: null,
      phase: 'collapsed',
      slideVisible: false,
      isPinned: false,
      isAutoLocked: false,
      isSettingsOpen: false,
      isResizing: false,
      isDragging: false,
      fellBackToPrimary: false,
      preFullscreenSnapshot: null,
    });
  });

  it('initializes dock bounds cleanly and switches edges', async () => {
    await useDockStore.getState().initializeDock();
    expect(useDockStore.getState().phase).toBe('collapsed');
    expect(useDockStore.getState().geometry?.collapsed.width).toBe(
      DEFAULT_SETTINGS.collapsedThickness,
    );

    await useDockStore.getState().dockToMonitorEdge(null, 'right');
    expect(useSettingsStore.getState().settings.edge).toBe('right');
    expect(useDockStore.getState().geometry?.collapsed.x).toBeGreaterThan(0);
  });

  it('persists expanded size only when persist flag is true during resize', async () => {
    const batchSpy = vi.spyOn(tauriBridge, 'setSettingsBatch');
    await useDockStore.getState().initializeDock();
    batchSpy.mockClear();

    // Live drag frames should update memory + geometry without hammering SQLite
    await useDockStore.getState().resizePanel(450, false);
    expect(useSettingsStore.getState().settings.expandedSize).toBe(450);
    expect(batchSpy).not.toHaveBeenCalled();

    // Pointer release persists once to SQLite
    await useDockStore.getState().resizePanel(480, true);
    expect(useSettingsStore.getState().settings.expandedSize).toBe(480);
    expect(batchSpy).toHaveBeenCalledTimes(1);
  });

  it('snapshots collapsed/pinned state across fullscreen toggle and restores it cleanly', async () => {
    await useDockStore.getState().initializeDock();
    await useDockStore.getState().toggleFullScreen();
    expect(useDockStore.getState().phase).toBe('fullscreen');
    expect(useDockStore.getState().preFullscreenSnapshot).toEqual({
      phase: 'collapsed',
      isPinned: false,
    });

    await useDockStore.getState().toggleFullScreen();
    expect(useDockStore.getState().phase).toBe('collapsed');
    expect(useDockStore.getState().preFullscreenSnapshot).toBeNull();
  });

  it('automatically moves to primary display when active monitor disconnects', async () => {
    vi.spyOn(tauriBridge, 'getMonitors').mockResolvedValue([
      {
        id: '\\\\.\\DISPLAY1',
        friendlyName: 'Primary (Display 1) — 1920×1032',
        x: 0,
        y: 0,
        width: 1920,
        height: 1032,
        scaleFactor: 1,
        isPrimary: true,
      },
    ]);
    vi.spyOn(tauriBridge, 'applyDockBounds').mockResolvedValue({
      monitorId: '\\\\.\\DISPLAY1',
      edge: 'left',
      geometry: {
        collapsed: { x: 0, y: 0, width: 10, height: 1032 },
        expanded: { x: 0, y: 0, width: 380, height: 1032 },
        clampedExpandedSize: 380,
        minExpandedSize: 260,
        maxExpandedSize: 1152,
      },
      fellBackToPrimary: true,
    });

    await useSettingsStore.getState().updateSettings({ monitorId: '\\\\.\\DISPLAY2' });
    await useDockStore.getState().reapplyBounds();

    expect(useDockStore.getState().fellBackToPrimary).toBe(true);
    expect(useDockStore.getState().activeMonitorId).toBe('\\\\.\\DISPLAY1');
    expect(useSettingsStore.getState().settings.monitorId).toBe('\\\\.\\DISPLAY1');
  });
});
