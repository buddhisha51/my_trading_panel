import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { tauriBridge } from '../services/tauriBridge';
import {
  clampWidgetHeight,
  clampWidgetWidth,
  DEFAULT_SETTINGS,
  DEFAULT_WIDGET_LAYOUT,
  WIDGET_CATALOG,
  type AppSettings,
  type DbStatus,
  type WidgetId,
  type WidgetLayoutItem,
} from '../types/settings';

interface SettingsState {
  settings: AppSettings;
  widgetLayout: WidgetLayoutItem[];
  hydrated: boolean;
  saving: boolean;
  dbStatus: DbStatus | null;
  finnhubKeyConfigured: boolean;

  hydrate: () => Promise<void>;
  patchSettingsLocal: (patch: Partial<AppSettings>) => void;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  toggleWidgetVisibility: (widgetId: WidgetId) => Promise<void>;
  toggleWidgetCollapsed: (widgetId: WidgetId) => Promise<void>;
  setWidgetHeight: (widgetId: WidgetId, height: number | null) => Promise<void>;
  setWidgetWidth: (widgetId: WidgetId, width: number | null) => Promise<void>;
  moveWidget: (widgetId: WidgetId, direction: 'up' | 'down') => Promise<void>;
  reorderWidgets: (activeId: WidgetId, overId: WidgetId) => Promise<void>;
  saveFinnhubKey: (key: string) => Promise<void>;
  resetDefaults: () => Promise<void>;
}

function parseSettingsMap(rawMap: Record<string, string>): AppSettings {
  const merged: AppSettings = { ...DEFAULT_SETTINGS };
  (Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>).forEach((key) => {
    const raw = rawMap[key];
    if (raw === undefined) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed !== undefined) {
        (merged as unknown as Record<string, unknown>)[key] = parsed;
      }
    } catch {
      // Keep default if malformed entry exists
    }
  });
  return merged;
}

function reconcileWidgetLayout(rows: WidgetLayoutItem[]): WidgetLayoutItem[] {
  if (rows.length === 0) return DEFAULT_WIDGET_LAYOUT.map((item) => ({ ...item }));

  const byId = new Map(rows.map((r) => [r.widgetId, r]));
  const result: WidgetLayoutItem[] = [];

  for (const row of rows) {
    if (WIDGET_CATALOG.some((c) => c.id === row.widgetId)) {
      result.push({ ...row, customWidth: row.customWidth ?? null });
    }
  }
  for (const catalogItem of WIDGET_CATALOG) {
    if (!byId.has(catalogItem.id)) {
      result.push({
        widgetId: catalogItem.id,
        isVisible: true,
        isCollapsed: false,
        sortOrder: result.length,
        customHeight: null,
        customWidth: null,
      });
    }
  }

  return result
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, idx) => ({ ...item, sortOrder: idx }));
}

export const useSettingsStore = create<SettingsState>()(
  immer((set, get) => ({
    settings: { ...DEFAULT_SETTINGS },
    widgetLayout: DEFAULT_WIDGET_LAYOUT.map((item) => ({ ...item })),
    hydrated: false,
    saving: false,
    dbStatus: null,
    finnhubKeyConfigured: false,

    hydrate: async () => {
      const [rawSettings, rawLayout, dbStatus, hasFinnhub] = await Promise.all([
        tauriBridge.getAllSettings(),
        tauriBridge.getWidgetLayout(),
        tauriBridge.getDbStatus(),
        tauriBridge.hasSecret('finnhub_api_key').catch(() => false),
        tauriBridge.getAppPaths().catch(() => null),
      ]);

      const settings = parseSettingsMap(rawSettings);
      const widgetLayout = reconcileWidgetLayout(rawLayout);

      if (rawLayout.length === 0) {
        await tauriBridge.saveWidgetLayout(widgetLayout);
      }

      set((state) => {
        state.settings = settings;
        state.widgetLayout = widgetLayout;
        state.dbStatus = dbStatus;
        state.finnhubKeyConfigured = hasFinnhub;
        state.hydrated = true;
      });
    },

    patchSettingsLocal: (patch) => {
      set((state) => {
        Object.assign(state.settings, patch);
      });
    },

    updateSettings: async (patch) => {
      set((state) => {
        Object.assign(state.settings, patch);
        state.saving = true;
      });

      const entries = Object.entries(patch).map(([key, value]) => ({
        key,
        valueJson: JSON.stringify(value),
      }));

      try {
        await tauriBridge.setSettingsBatch(entries);
      } finally {
        set((state) => {
          state.saving = false;
        });
      }
    },

    toggleWidgetVisibility: async (widgetId) => {
      set((state) => {
        const item = state.widgetLayout.find((w) => w.widgetId === widgetId);
        if (item) item.isVisible = !item.isVisible;
      });
      await tauriBridge.saveWidgetLayout(get().widgetLayout);
    },

    toggleWidgetCollapsed: async (widgetId) => {
      set((state) => {
        const item = state.widgetLayout.find((w) => w.widgetId === widgetId);
        if (item) item.isCollapsed = !item.isCollapsed;
      });
      await tauriBridge.saveWidgetLayout(get().widgetLayout);
    },

    setWidgetHeight: async (widgetId, height) => {
      const normalized = height === null ? null : clampWidgetHeight(height);
      set((state) => {
        const item = state.widgetLayout.find((w) => w.widgetId === widgetId);
        if (item) item.customHeight = normalized;
      });
      await tauriBridge.saveWidgetLayout(get().widgetLayout);
    },

    setWidgetWidth: async (widgetId, width) => {
      const normalized = width === null ? null : clampWidgetWidth(width);
      set((state) => {
        const item = state.widgetLayout.find((w) => w.widgetId === widgetId);
        if (item) item.customWidth = normalized;
      });
      await tauriBridge.saveWidgetLayout(get().widgetLayout);
    },

    moveWidget: async (widgetId, direction) => {
      set((state) => {
        const idx = state.widgetLayout.findIndex((w) => w.widgetId === widgetId);
        if (idx === -1) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= state.widgetLayout.length) return;
        const current = state.widgetLayout[idx];
        const target = state.widgetLayout[swapIdx];
        state.widgetLayout[idx] = target;
        state.widgetLayout[swapIdx] = current;
        state.widgetLayout.forEach((item, i) => {
          item.sortOrder = i;
        });
      });
      await tauriBridge.saveWidgetLayout(get().widgetLayout);
    },

    reorderWidgets: async (activeId, overId) => {
      if (activeId === overId) return;
      set((state) => {
        const oldIdx = state.widgetLayout.findIndex((w) => w.widgetId === activeId);
        const newIdx = state.widgetLayout.findIndex((w) => w.widgetId === overId);
        if (oldIdx === -1 || newIdx === -1) return;
        const [moved] = state.widgetLayout.splice(oldIdx, 1);
        state.widgetLayout.splice(newIdx, 0, moved);
        state.widgetLayout.forEach((item, i) => {
          item.sortOrder = i;
        });
      });
      await tauriBridge.saveWidgetLayout(get().widgetLayout);
    },

    saveFinnhubKey: async (key) => {
      const trimmed = key.trim();
      if (trimmed) {
        await tauriBridge.setSecret('finnhub_api_key', trimmed);
        set((state) => {
          state.finnhubKeyConfigured = true;
        });
      } else {
        await tauriBridge.deleteSecret('finnhub_api_key');
        set((state) => {
          state.finnhubKeyConfigured = false;
        });
      }
    },

    resetDefaults: async () => {
      const defaults = { ...DEFAULT_SETTINGS };
      const layoutDefaults = DEFAULT_WIDGET_LAYOUT.map((w) => ({ ...w }));
      set((state) => {
        state.settings = defaults;
        state.widgetLayout = layoutDefaults;
      });
      const entries = Object.entries(defaults).map(([key, value]) => ({
        key,
        valueJson: JSON.stringify(value),
      }));
      await Promise.all([
        tauriBridge.setSettingsBatch(entries),
        tauriBridge.saveWidgetLayout(layoutDefaults),
      ]);
    },
  })),
);
