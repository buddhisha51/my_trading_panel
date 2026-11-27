import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { register as registerGlobalShortcut, unregisterAll as unregisterAllGlobalShortcuts } from '@tauri-apps/plugin-global-shortcut';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { openUrl } from '@tauri-apps/plugin-opener';
import type {
  BackupExportResponse,
  BackupImportSummary,
  BackupRestoreMode,
} from '../types/backup';
import type { DailyBiasEntry, UpsertDailyBiasPayload } from '../types/dailyBias';
import type { HotkeyActionId, HotkeyConfig } from '../types/hotkeys';
import type { FloatingViewerPayload } from '../types/viewer';
import type {
  DockAppliedResponse,
  DockEdge,
  DockSnapResult,
  MonitorInfo,
} from '../types/dock';
import type {
  AttachmentItem,
  AttachmentOwnerType,
  NoteItem,
  SaveAttachmentPayload,
  StrategyItem,
  UpsertNotePayload,
  UpsertStrategyPayload,
} from '../types/notes';
import type {
  AccountProfile,
  CloseOngoingTradePayload,
  EquitySnapshotRecord,
  OngoingTradeRecord,
  TradeRecord,
  UpdateAccountProfilePayload,
  UpsertEquitySnapshotPayload,
  UpsertOngoingTradePayload,
  UpsertTradePayload,
} from '../types/journal';
import type {
  EconomicEventItem,
  FetchMetadataEntry,
  ManualEventPayload,
  NewsArticleItem,
  RssFeedSource,
  UpsertRssFeedPayload,
} from '../types/market';
import {
  DEFAULT_SETTINGS,
  DEFAULT_WIDGET_LAYOUT,
  type DbStatus,
  type WidgetLayoutItem,
} from '../types/settings';
import { normalizeTradePnl, normalizeTradeR } from '../utils/drawdownEngine';
import { generateUlid } from '../utils/id';

const PREVIEW_SETTINGS_KEY = 'ict_panel_preview_settings';
const PREVIEW_LAYOUT_KEY = 'ict_panel_preview_layout';
const PREVIEW_BIAS_KEY = 'ict_panel_preview_daily_bias';
const PREVIEW_NOTES_KEY = 'ict_panel_preview_notes';
const PREVIEW_STRATEGIES_KEY = 'ict_panel_preview_strategies';
const PREVIEW_ATTACHMENTS_KEY = 'ict_panel_preview_attachments';
const PREVIEW_PROFILE_KEY = 'ict_panel_preview_account_profile';
const PREVIEW_TRADES_KEY = 'ict_panel_preview_trades';
const PREVIEW_ONGOING_KEY = 'ict_panel_preview_ongoing_trades';
const PREVIEW_SNAPSHOTS_KEY = 'ict_panel_preview_equity_snapshots';
const PREVIEW_EVENTS_KEY = 'ict_panel_preview_economic_events';
const PREVIEW_NEWS_KEY = 'ict_panel_preview_news_items';
const PREVIEW_RSS_KEY = 'ict_panel_preview_rss_feeds';
const PREVIEW_META_KEY = 'ict_panel_preview_fetch_metadata';

const DEFAULT_PREVIEW_PROFILE: AccountProfile = {
  id: 'default',
  accountName: 'My Account',
  startingBalance: 0,
  currentBalance: 0,
  highWaterMark: 0,
  currency: 'USD',
  ddMode: 'static',
  dailyDdLimit: 5,
  maxDdLimit: 10,
  updatedAt: new Date(0).toISOString(),
};

const DEFAULT_PREVIEW_RSS: RssFeedSource[] = [
  {
    id: 'rss_forexlive',
    url: 'https://www.forexlive.com/feed/news',
    label: 'ForexLive',
    category: 'forex',
    isEnabled: true,
    pollIntervalS: 600,
    lastFetchedAt: null,
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'rss_fxstreet',
    url: 'https://www.fxstreet.com/rss/news',
    label: 'FXStreet',
    category: 'forex',
    isEnabled: true,
    pollIntervalS: 600,
    lastFetchedAt: null,
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'rss_cointelegraph',
    url: 'https://cointelegraph.com/rss',
    label: 'CoinTelegraph',
    category: 'crypto',
    isEnabled: true,
    pollIntervalS: 600,
    lastFetchedAt: null,
    createdAt: new Date(0).toISOString(),
  },
];

function recomputePreviewProfile(
  profile: AccountProfile,
  trades: TradeRecord[],
): AccountProfile {
  const ordered = [...trades].sort((a, b) =>
    (a.exitTime ?? a.entryTime ?? a.createdAt).localeCompare(
      b.exitTime ?? b.entryTime ?? b.createdAt,
    ),
  );
  let bal = profile.startingBalance;
  let hwm = profile.startingBalance;
  for (const t of ordered) {
    bal += normalizeTradePnl(t.outcome, t.pnlDollars) ?? 0;
    if (bal > hwm) hwm = bal;
  }
  const updated: AccountProfile = {
    ...profile,
    currentBalance: bal,
    highWaterMark: hwm,
    updatedAt: new Date().toISOString(),
  };
  writePreviewJson(PREVIEW_PROFILE_KEY, updated);
  return updated;
}

let cachedAttachmentsDir: string | null = null;
const previewBlobUrls = new Map<string, string>();

function bytesToDataUrl(bytes: number[], mimeType: string): string {
  const arr = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  const b64 = typeof globalThis.btoa === 'function' ? globalThis.btoa(binary) : '';
  return `data:${mimeType};base64,${b64}`;
}

function readPreviewJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writePreviewJson(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore storage quota failures
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function getPreviewMonitor(): MonitorInfo {
  const width = typeof window !== 'undefined' ? window.screen.availWidth || 1920 : 1920;
  const height = typeof window !== 'undefined' ? window.screen.availHeight || 1040 : 1040;
  const scaleFactor = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return {
    id: 'BROWSER_PREVIEW',
    friendlyName: `Browser Preview — ${width}×${height}`,
    x: 0,
    y: 0,
    width,
    height,
    scaleFactor,
    isPrimary: true,
  };
}

function buildPreviewDockResponse(
  edge: DockEdge,
  monitor: MonitorInfo,
  collapsedThickness: number,
  expandedSize: number,
): DockAppliedResponse {
  const axis = edge === 'top' || edge === 'bottom' ? monitor.height : monitor.width;
  const maxExpandedSize = Math.max(1, Math.round(axis * 0.6));
  const minExpandedSize = Math.min(260, maxExpandedSize);
  const clamped = Math.max(minExpandedSize, Math.min(maxExpandedSize, expandedSize));
  const strip = Math.max(2, Math.min(24, collapsedThickness));

  const collapsed =
    edge === 'left'
      ? { x: 0, y: 0, width: strip, height: monitor.height }
      : edge === 'right'
        ? { x: monitor.width - strip, y: 0, width: strip, height: monitor.height }
        : edge === 'top'
          ? { x: 0, y: 0, width: monitor.width, height: strip }
          : { x: 0, y: monitor.height - strip, width: monitor.width, height: strip };

  const expanded =
    edge === 'left'
      ? { x: 0, y: 0, width: clamped, height: monitor.height }
      : edge === 'right'
        ? { x: monitor.width - clamped, y: 0, width: clamped, height: monitor.height }
        : edge === 'top'
          ? { x: 0, y: 0, width: monitor.width, height: clamped }
          : { x: 0, y: monitor.height - clamped, width: monitor.width, height: clamped };

  return {
    monitorId: monitor.id,
    edge,
    fellBackToPrimary: false,
    geometry: {
      collapsed,
      expanded,
      clampedExpandedSize: clamped,
      minExpandedSize,
      maxExpandedSize,
    },
  };
}

export const tauriBridge = {
  async getMonitors(): Promise<MonitorInfo[]> {
    if (!isTauriRuntime()) return [getPreviewMonitor()];
    return invoke<MonitorInfo[]>('get_monitors');
  },

  async applyDockBounds(params: {
    edge: DockEdge;
    monitorId: string | null;
    collapsedThickness: number;
    expandedSize: number;
    expanded: boolean;
    allowFocus?: boolean;
  }): Promise<DockAppliedResponse> {
    if (!isTauriRuntime()) {
      return buildPreviewDockResponse(
        params.edge,
        getPreviewMonitor(),
        params.collapsedThickness,
        params.expandedSize,
      );
    }
    return invoke<DockAppliedResponse>('apply_dock_bounds', {
      edge: params.edge,
      monitorId: params.monitorId,
      collapsedThickness: params.collapsedThickness,
      expandedSize: params.expandedSize,
      expanded: params.expanded,
      allowFocus: params.allowFocus ?? false,
    });
  },

  async prepareExpandBounds(params: {
    edge: DockEdge;
    monitorId: string | null;
    collapsedThickness: number;
    expandedSize: number;
  }): Promise<DockAppliedResponse> {
    if (!isTauriRuntime()) {
      return buildPreviewDockResponse(
        params.edge,
        getPreviewMonitor(),
        params.collapsedThickness,
        params.expandedSize,
      );
    }
    return invoke<DockAppliedResponse>('prepare_expand_bounds', {
      edge: params.edge,
      monitorId: params.monitorId,
      collapsedThickness: params.collapsedThickness,
      expandedSize: params.expandedSize,
    });
  },

  async commitCollapseBounds(params: {
    edge: DockEdge;
    monitorId: string | null;
    collapsedThickness: number;
    expandedSize: number;
  }): Promise<DockAppliedResponse> {
    if (!isTauriRuntime()) {
      return buildPreviewDockResponse(
        params.edge,
        getPreviewMonitor(),
        params.collapsedThickness,
        params.expandedSize,
      );
    }
    return invoke<DockAppliedResponse>('commit_collapse_bounds', {
      edge: params.edge,
      monitorId: params.monitorId,
      collapsedThickness: params.collapsedThickness,
      expandedSize: params.expandedSize,
    });
  },

  async resizeDockedPanel(params: {
    edge: DockEdge;
    monitorId: string | null;
    collapsedThickness: number;
    newSize: number;
  }): Promise<DockAppliedResponse> {
    if (!isTauriRuntime()) {
      return buildPreviewDockResponse(
        params.edge,
        getPreviewMonitor(),
        params.collapsedThickness,
        params.newSize,
      );
    }
    return invoke<DockAppliedResponse>('resize_docked_panel', {
      edge: params.edge,
      monitorId: params.monitorId,
      collapsedThickness: params.collapsedThickness,
      newSize: params.newSize,
    });
  },

  async setFocusable(focusable: boolean, focusNow = false): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke('set_focusable', { focusable, focusNow });
  },

  async startDockDrag(): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke('start_dock_drag');
  },

  async resolveDragSnap(params: {
    collapsedThickness: number;
    expandedSize: number;
    keepExpanded: boolean;
  }): Promise<DockSnapResult> {
    if (!isTauriRuntime()) {
      const m = getPreviewMonitor();
      const resp = buildPreviewDockResponse(
        DEFAULT_SETTINGS.edge,
        m,
        params.collapsedThickness,
        params.expandedSize,
      );
      return { monitorId: m.id, edge: resp.edge, geometry: resp.geometry };
    }
    return invoke<DockSnapResult>('resolve_drag_snap', params);
  },

  async setPanelFullscreen(params: {
    fullscreen: boolean;
    edge: DockEdge;
    monitorId: string | null;
    collapsedThickness: number;
    expandedSize: number;
    restoreExpanded: boolean;
  }): Promise<DockAppliedResponse | null> {
    if (!isTauriRuntime()) {
      if (params.fullscreen) return null;
      return buildPreviewDockResponse(
        params.edge,
        getPreviewMonitor(),
        params.collapsedThickness,
        params.expandedSize,
      );
    }
    return invoke<DockAppliedResponse | null>('set_panel_fullscreen', params);
  },

  async enforceAlwaysOnTop(): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke('enforce_always_on_top');
  },

  async quitApp(): Promise<void> {
    if (!isTauriRuntime()) {
      try {
        window.close();
      } catch {
        // ignore browser preview close restrictions
      }
      return;
    }
    await invoke('quit_app');
  },

  // --- SQLite Settings & Layout ---
  async getAllSettings(): Promise<Record<string, string>> {
    if (!isTauriRuntime()) {
      try {
        const raw = localStorage.getItem(PREVIEW_SETTINGS_KEY);
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
      } catch {
        return {};
      }
    }
    return invoke<Record<string, string>>('get_all_settings');
  },

  async setSettingsBatch(entries: Array<{ key: string; valueJson: string }>): Promise<void> {
    if (!isTauriRuntime()) {
      try {
        const existing = await this.getAllSettings();
        for (const e of entries) existing[e.key] = e.valueJson;
        localStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify(existing));
      } catch {
        // ignore storage errors in test/preview
      }
      return;
    }
    await invoke('set_settings_batch', { entries });
  },

  async getWidgetLayout(): Promise<WidgetLayoutItem[]> {
    if (!isTauriRuntime()) {
      try {
        const raw = localStorage.getItem(PREVIEW_LAYOUT_KEY);
        return raw ? (JSON.parse(raw) as WidgetLayoutItem[]) : DEFAULT_WIDGET_LAYOUT;
      } catch {
        return DEFAULT_WIDGET_LAYOUT;
      }
    }
    return invoke<WidgetLayoutItem[]>('get_widget_layout');
  },

  async saveWidgetLayout(items: WidgetLayoutItem[]): Promise<void> {
    if (!isTauriRuntime()) {
      try {
        localStorage.setItem(PREVIEW_LAYOUT_KEY, JSON.stringify(items));
      } catch {
        // ignore
      }
      return;
    }
    await invoke('save_widget_layout', { items });
  },

  async getDbStatus(): Promise<DbStatus> {
    if (!isTauriRuntime()) {
      return {
        dbPath: 'Browser Preview (localStorage fallback)',
        appDataDir: 'N/A (Tauri runtime not attached)',
        journalMode: 'WAL (mock)',
        schemaVersion: 1,
      };
    }
    return invoke<DbStatus>('get_db_status');
  },

  // --- Daily Bias CRUD ---
  async getDailyBiases(date: string): Promise<DailyBiasEntry[]> {
    if (!isTauriRuntime()) {
      try {
        const raw = localStorage.getItem(PREVIEW_BIAS_KEY);
        const all: DailyBiasEntry[] = raw ? (JSON.parse(raw) as DailyBiasEntry[]) : [];
        return all
          .filter((entry) => entry.date === date)
          .sort((a, b) => a.pair.localeCompare(b.pair));
      } catch {
        return [];
      }
    }
    return invoke<DailyBiasEntry[]>('get_daily_biases', { date });
  },

  async listRecentDailyBias(pair: string, limit = 10): Promise<DailyBiasEntry[]> {
    const normPair = pair.trim().toUpperCase();
    if (!isTauriRuntime()) {
      try {
        const raw = localStorage.getItem(PREVIEW_BIAS_KEY);
        const all: DailyBiasEntry[] = raw ? (JSON.parse(raw) as DailyBiasEntry[]) : [];
        return all
          .filter((entry) => entry.pair === normPair)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, limit);
      } catch {
        return [];
      }
    }
    return invoke<DailyBiasEntry[]>('list_recent_daily_bias', { pair: normPair, limit });
  },

  async upsertDailyBias(payload: UpsertDailyBiasPayload): Promise<DailyBiasEntry> {
    if (!isTauriRuntime()) {
      const nowIso = new Date().toISOString();
      const normPair = payload.pair.trim().toUpperCase();
      let all: DailyBiasEntry[] = [];
      try {
        const raw = localStorage.getItem(PREVIEW_BIAS_KEY);
        all = raw ? (JSON.parse(raw) as DailyBiasEntry[]) : [];
      } catch {
        all = [];
      }
      const idx = all.findIndex((e) => e.pair === normPair && e.date === payload.date);
      const record: DailyBiasEntry =
        idx >= 0
          ? {
              ...all[idx],
              ...payload,
              pair: normPair,
              updatedAt: nowIso,
            }
          : {
              id: payload.id || generateUlid(),
              pair: normPair,
              date: payload.date,
              biasDaily: payload.biasDaily,
              bias4h: payload.bias4h,
              bias15m: payload.bias15m,
              pdh: payload.pdh,
              pdl: payload.pdl,
              asianHigh: payload.asianHigh,
              asianLow: payload.asianLow,
              dolNotes: payload.dolNotes,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
      if (idx >= 0) {
        all[idx] = record;
      } else {
        all.push(record);
      }
      try {
        localStorage.setItem(PREVIEW_BIAS_KEY, JSON.stringify(all));
      } catch {
        // ignore storage errors
      }
      return record;
    }
    return invoke<DailyBiasEntry>('upsert_daily_bias', {
      input: {
        id: payload.id || generateUlid(),
        pair: payload.pair,
        date: payload.date,
        biasDaily: payload.biasDaily,
        bias4h: payload.bias4h,
        bias15m: payload.bias15m,
        pdh: payload.pdh,
        pdl: payload.pdl,
        asianHigh: payload.asianHigh,
        asianLow: payload.asianLow,
        dolNotes: payload.dolNotes,
      },
    });
  },

  async deleteDailyBias(pair: string, date: string): Promise<void> {
    if (!isTauriRuntime()) {
      try {
        const normPair = pair.trim().toUpperCase();
        const raw = localStorage.getItem(PREVIEW_BIAS_KEY);
        const all: DailyBiasEntry[] = raw ? (JSON.parse(raw) as DailyBiasEntry[]) : [];
        const filtered = all.filter((e) => !(e.pair === normPair && e.date === date));
        localStorage.setItem(PREVIEW_BIAS_KEY, JSON.stringify(filtered));
      } catch {
        // ignore
      }
      return;
    }
    await invoke('delete_daily_bias', { pair, date });
  },

  // --- App Paths & Attachment Asset Resolution ---
  async getAppPaths(): Promise<{ appDataDir: string; attachmentsDir: string; backupsDir: string }> {
    if (!isTauriRuntime()) {
      cachedAttachmentsDir = 'preview-attachments';
      return {
        appDataDir: 'preview-appdata',
        attachmentsDir: 'preview-attachments',
        backupsDir: 'preview-backups',
      };
    }
    const paths = await invoke<{ appDataDir: string; attachmentsDir: string; backupsDir: string }>(
      'get_app_paths',
    );
    cachedAttachmentsDir = paths.attachmentsDir;
    return paths;
  },

  resolveAttachmentSrc(
    relativePath: string | null | undefined,
    absoluteFallback?: string | null,
  ): string | null {
    if (!relativePath) return null;
    if (relativePath.startsWith('blob:') || relativePath.startsWith('http')) {
      return relativePath;
    }
    if (!isTauriRuntime()) {
      const cached = previewBlobUrls.get(relativePath);
      if (cached) return cached;
      const stored = readPreviewJson<Array<AttachmentItem & { previewUrl?: string }>>(
        PREVIEW_ATTACHMENTS_KEY,
        [],
      );
      const hit = stored.find((a) => a.relativePath === relativePath);
      return hit?.previewUrl ?? null;
    }
    const base = (cachedAttachmentsDir ?? '').replace(/\\/g, '/').replace(/\/$/, '');
    const rel = relativePath.replace(/\\/g, '/').replace(/^\//, '');
    const abs = base ? `${base}/${rel}` : absoluteFallback?.replace(/\\/g, '/') || rel;
    return convertFileSrc(abs);
  },

  // --- Quick Notes (FTS5 search) ---
  async listNotes(filters?: {
    query?: string;
    pair?: string | null;
    session?: string | null;
  }): Promise<NoteItem[]> {
    if (!isTauriRuntime()) {
      const notes = readPreviewJson<NoteItem[]>(PREVIEW_NOTES_KEY, []);
      const q = (filters?.query ?? '').trim().toLowerCase();
      const tokens = q.split(/\s+/).filter(Boolean);
      const pair = filters?.pair?.trim().toUpperCase() || null;
      const session = filters?.session?.trim() || null;

      return notes
        .filter((n) => {
          if (pair && (n.pair ?? '').toUpperCase() !== pair) return false;
          if (session && (n.session ?? '') !== session) return false;
          if (tokens.length > 0) {
            const hay = `${n.title} ${n.bodyText} ${n.tags.join(' ')}`.toLowerCase();
            return tokens.every((t) => hay.includes(t));
          }
          return true;
        })
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.updatedAt.localeCompare(a.updatedAt);
        });
    }
    return invoke<NoteItem[]>('list_notes', {
      query: filters?.query ?? null,
      pair: filters?.pair ?? null,
      session: filters?.session ?? null,
    });
  },

  async upsertNote(payload: UpsertNotePayload): Promise<NoteItem> {
    if (!isTauriRuntime()) {
      const nowIso = new Date().toISOString();
      const notes = readPreviewJson<NoteItem[]>(PREVIEW_NOTES_KEY, []);
      const id = payload.id || generateUlid();
      const idx = notes.findIndex((n) => n.id === id);
      const record: NoteItem = {
        id,
        title: payload.title,
        bodyJson: payload.bodyJson,
        bodyText: payload.bodyText,
        canvasJson: payload.canvasJson,
        tags: payload.tags,
        pair: payload.pair ? payload.pair.trim().toUpperCase() : null,
        session: payload.session ? payload.session.trim() : null,
        isPinned: payload.isPinned,
        createdAt: idx >= 0 ? notes[idx].createdAt : nowIso,
        updatedAt: nowIso,
      };
      if (idx >= 0) notes[idx] = record;
      else notes.unshift(record);
      writePreviewJson(PREVIEW_NOTES_KEY, notes);
      return record;
    }
    return invoke<NoteItem>('upsert_note', {
      input: {
        ...payload,
        id: payload.id || generateUlid(),
      },
    });
  },

  async deleteNote(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const notes = readPreviewJson<NoteItem[]>(PREVIEW_NOTES_KEY, []);
      writePreviewJson(
        PREVIEW_NOTES_KEY,
        notes.filter((n) => n.id !== id),
      );
      const atts = readPreviewJson<AttachmentItem[]>(PREVIEW_ATTACHMENTS_KEY, []);
      writePreviewJson(
        PREVIEW_ATTACHMENTS_KEY,
        atts.filter((a) => a.ownerId !== id),
      );
      return;
    }
    await invoke('delete_note', { id });
  },

  // --- Strategies & Checklists ---
  async listStrategies(): Promise<StrategyItem[]> {
    if (!isTauriRuntime()) {
      const list = readPreviewJson<StrategyItem[]>(PREVIEW_STRATEGIES_KEY, []);
      return list.sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt.localeCompare(a.updatedAt));
    }
    return invoke<StrategyItem[]>('list_strategies');
  },

  async upsertStrategy(payload: UpsertStrategyPayload): Promise<StrategyItem> {
    if (!isTauriRuntime()) {
      const nowIso = new Date().toISOString();
      const list = readPreviewJson<StrategyItem[]>(PREVIEW_STRATEGIES_KEY, []);
      const id = payload.id || generateUlid();
      const idx = list.findIndex((s) => s.id === id);
      const record: StrategyItem = {
        id,
        name: payload.name.trim(),
        description: payload.description,
        bodyJson: payload.bodyJson,
        canvasJson: payload.canvasJson,
        tags: payload.tags,
        isActive: payload.isActive,
        sortOrder: payload.sortOrder,
        checklist: payload.checklist.map((r, i) => ({
          id: r.id || generateUlid(),
          strategyId: id,
          name: r.name.trim(),
          description: r.description,
          sortOrder: i,
          isRequired: r.isRequired,
          createdAt: nowIso,
        })),
        createdAt: idx >= 0 ? list[idx].createdAt : nowIso,
        updatedAt: nowIso,
      };
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      writePreviewJson(PREVIEW_STRATEGIES_KEY, list);
      return record;
    }
    return invoke<StrategyItem>('upsert_strategy', {
      input: {
        ...payload,
        id: payload.id || generateUlid(),
      },
    });
  },

  async deleteStrategy(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const list = readPreviewJson<StrategyItem[]>(PREVIEW_STRATEGIES_KEY, []);
      writePreviewJson(
        PREVIEW_STRATEGIES_KEY,
        list.filter((s) => s.id !== id),
      );
      return;
    }
    await invoke('delete_strategy', { id });
  },

  // --- Attachments ---
  async saveAttachment(payload: SaveAttachmentPayload): Promise<AttachmentItem> {
    if (!isTauriRuntime()) {
      const id = generateUlid();
      const ext = payload.mimeType.includes('jpeg')
        ? 'jpg'
        : payload.mimeType.includes('webp')
          ? 'webp'
          : 'png';
      const rel = `${payload.ownerType}/${payload.ownerId}/${id}.${ext}`;
      const previewUrl = bytesToDataUrl(payload.bytes, payload.mimeType || 'image/png');
      previewBlobUrls.set(rel, previewUrl);
      const record: AttachmentItem & { previewUrl?: string } = {
        id,
        ownerId: payload.ownerId,
        relativePath: rel,
        absolutePath: rel,
        mimeType: payload.mimeType || 'image/png',
        width: payload.width ?? null,
        height: payload.height ?? null,
        sizeBytes: payload.bytes.length,
        createdAt: new Date().toISOString(),
        previewUrl,
      };
      const existing = readPreviewJson<Array<AttachmentItem & { previewUrl?: string }>>(
        PREVIEW_ATTACHMENTS_KEY,
        [],
      );
      existing.unshift(record);
      writePreviewJson(PREVIEW_ATTACHMENTS_KEY, existing);
      return record;
    }
    return invoke<AttachmentItem>('save_attachment', {
      input: {
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        bytes: payload.bytes,
        mimeType: payload.mimeType,
        width: payload.width ?? null,
        height: payload.height ?? null,
      },
    });
  },

  async listAttachments(ownerType: AttachmentOwnerType, ownerId: string): Promise<AttachmentItem[]> {
    if (!isTauriRuntime()) {
      const existing = readPreviewJson<Array<AttachmentItem & { previewUrl?: string }>>(
        PREVIEW_ATTACHMENTS_KEY,
        [],
      );
      return existing.filter(
        (a) => a.ownerId === ownerId && a.relativePath.startsWith(`${ownerType}/`),
      );
    }
    return invoke<AttachmentItem[]>('list_attachments', { ownerType, ownerId });
  },

  async deleteAttachment(ownerType: AttachmentOwnerType, id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const existing = readPreviewJson<Array<AttachmentItem & { previewUrl?: string }>>(
        PREVIEW_ATTACHMENTS_KEY,
        [],
      );
      writePreviewJson(
        PREVIEW_ATTACHMENTS_KEY,
        existing.filter((a) => a.id !== id),
      );
      return;
    }
    await invoke('delete_attachment', { ownerType, id });
  },

  // --- Trade Journal, Ongoing Trades & Account Profile ---
  async getAccountProfile(): Promise<AccountProfile> {
    if (!isTauriRuntime()) {
      return readPreviewJson<AccountProfile>(PREVIEW_PROFILE_KEY, DEFAULT_PREVIEW_PROFILE);
    }
    return invoke<AccountProfile>('get_account_profile');
  },

  async updateAccountProfile(payload: UpdateAccountProfilePayload): Promise<AccountProfile> {
    if (!isTauriRuntime()) {
      const cur = readPreviewJson<AccountProfile>(PREVIEW_PROFILE_KEY, DEFAULT_PREVIEW_PROFILE);
      const trades = readPreviewJson<TradeRecord[]>(PREVIEW_TRADES_KEY, []);
      return recomputePreviewProfile(
        {
          ...cur,
          accountName: payload.accountName.trim(),
          startingBalance: Math.max(0, payload.startingBalance),
          currency: payload.currency.trim().toUpperCase(),
          ddMode: payload.ddMode,
          dailyDdLimit: payload.dailyDdLimit,
          maxDdLimit: payload.maxDdLimit,
        },
        trades,
      );
    }
    return invoke<AccountProfile>('update_account_profile', { input: payload });
  },

  async listTrades(): Promise<TradeRecord[]> {
    if (!isTauriRuntime()) {
      const trades = readPreviewJson<TradeRecord[]>(PREVIEW_TRADES_KEY, []);
      return trades.sort((a, b) =>
        (b.exitTime ?? b.entryTime ?? b.createdAt).localeCompare(
          a.exitTime ?? a.entryTime ?? a.createdAt,
        ),
      );
    }
    return invoke<TradeRecord[]>('list_trades');
  },

  async upsertTrade(payload: UpsertTradePayload): Promise<TradeRecord> {
    if (!isTauriRuntime()) {
      const nowIso = new Date().toISOString();
      const id = payload.id || generateUlid();
      const trades = readPreviewJson<TradeRecord[]>(PREVIEW_TRADES_KEY, []);
      const idx = trades.findIndex((t) => t.id === id);
      const record: TradeRecord = {
        id,
        pair: payload.pair.trim().toUpperCase(),
        direction: payload.direction,
        entryPrice: payload.entryPrice,
        stopLoss: payload.stopLoss,
        takeProfit: payload.takeProfit,
        lotSize: payload.lotSize,
        outcome: payload.outcome,
        pnlDollars: normalizeTradePnl(payload.outcome, payload.pnlDollars),
        rMultiple: normalizeTradeR(payload.outcome, payload.rMultiple),
        strategyId: payload.strategyId,
        notes: payload.notes,
        screenshotPath: payload.screenshotPath,
        checklistSnapshot: payload.checklistSnapshot,
        setupGrade: payload.setupGrade,
        entryTime: payload.entryTime ?? nowIso,
        exitTime: payload.exitTime,
        session: payload.session,
        createdAt: idx >= 0 ? trades[idx].createdAt : nowIso,
        updatedAt: nowIso,
      };
      if (idx >= 0) trades[idx] = record;
      else trades.unshift(record);
      writePreviewJson(PREVIEW_TRADES_KEY, trades);
      const curProfile = readPreviewJson<AccountProfile>(
        PREVIEW_PROFILE_KEY,
        DEFAULT_PREVIEW_PROFILE,
      );
      recomputePreviewProfile(curProfile, trades);
      return record;
    }
    return invoke<TradeRecord>('upsert_trade', { input: payload });
  },

  async deleteTrade(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const trades = readPreviewJson<TradeRecord[]>(PREVIEW_TRADES_KEY, []);
      const filtered = trades.filter((t) => t.id !== id);
      writePreviewJson(PREVIEW_TRADES_KEY, filtered);
      const curProfile = readPreviewJson<AccountProfile>(
        PREVIEW_PROFILE_KEY,
        DEFAULT_PREVIEW_PROFILE,
      );
      recomputePreviewProfile(curProfile, filtered);
      return;
    }
    await invoke('delete_trade', { id });
  },

  async listOngoingTrades(): Promise<OngoingTradeRecord[]> {
    if (!isTauriRuntime()) {
      const rows = readPreviewJson<OngoingTradeRecord[]>(PREVIEW_ONGOING_KEY, []);
      return rows.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    }
    return invoke<OngoingTradeRecord[]>('list_ongoing_trades');
  },

  async upsertOngoingTrade(payload: UpsertOngoingTradePayload): Promise<OngoingTradeRecord> {
    if (!isTauriRuntime()) {
      const nowIso = new Date().toISOString();
      const id = payload.id || generateUlid();
      const rows = readPreviewJson<OngoingTradeRecord[]>(PREVIEW_ONGOING_KEY, []);
      const idx = rows.findIndex((r) => r.id === id);
      const record: OngoingTradeRecord = {
        id,
        pair: payload.pair.trim().toUpperCase(),
        direction: payload.direction,
        entryPrice: payload.entryPrice,
        stopLoss: payload.stopLoss,
        takeProfit: payload.takeProfit,
        lotSize: payload.lotSize,
        status: payload.status ?? 'running',
        notes: payload.notes,
        strategyId: payload.strategyId,
        openedAt: payload.openedAt ?? (idx >= 0 ? rows[idx].openedAt : nowIso),
        updatedAt: nowIso,
      };
      if (idx >= 0) rows[idx] = record;
      else rows.unshift(record);
      writePreviewJson(PREVIEW_ONGOING_KEY, rows);
      return record;
    }
    return invoke<OngoingTradeRecord>('upsert_ongoing_trade', { input: payload });
  },

  async deleteOngoingTrade(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const rows = readPreviewJson<OngoingTradeRecord[]>(PREVIEW_ONGOING_KEY, []);
      writePreviewJson(
        PREVIEW_ONGOING_KEY,
        rows.filter((r) => r.id !== id),
      );
      return;
    }
    await invoke('delete_ongoing_trade', { id });
  },

  async closeOngoingToJournal(payload: CloseOngoingTradePayload): Promise<TradeRecord> {
    if (!isTauriRuntime()) {
      const ongoing = readPreviewJson<OngoingTradeRecord[]>(PREVIEW_ONGOING_KEY, []);
      const found = ongoing.find((r) => r.id === payload.ongoingId);
      if (!found) {
        throw new Error('Ongoing trade not found');
      }
      const nowIso = new Date().toISOString();
      const trade = await this.upsertTrade({
        pair: found.pair,
        direction: found.direction,
        entryPrice: found.entryPrice,
        stopLoss: found.stopLoss,
        takeProfit: found.takeProfit,
        lotSize: found.lotSize,
        outcome: payload.outcome,
        pnlDollars: payload.pnlDollars,
        rMultiple: payload.rMultiple,
        strategyId: found.strategyId,
        notes: payload.notes ?? found.notes,
        screenshotPath: payload.screenshotPath,
        checklistSnapshot: payload.checklistSnapshot,
        setupGrade: payload.setupGrade,
        entryTime: found.openedAt,
        exitTime: payload.exitTime ?? nowIso,
        session: payload.session,
      });
      await this.deleteOngoingTrade(found.id);
      return trade;
    }
    return invoke<TradeRecord>('close_ongoing_to_journal', { input: payload });
  },

  async listEquitySnapshots(): Promise<EquitySnapshotRecord[]> {
    if (!isTauriRuntime()) {
      return readPreviewJson<EquitySnapshotRecord[]>(PREVIEW_SNAPSHOTS_KEY, []).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    }
    return invoke<EquitySnapshotRecord[]>('list_equity_snapshots');
  },

  async upsertEquitySnapshot(
    payload: UpsertEquitySnapshotPayload,
  ): Promise<EquitySnapshotRecord> {
    if (!isTauriRuntime()) {
      const rows = readPreviewJson<EquitySnapshotRecord[]>(PREVIEW_SNAPSHOTS_KEY, []);
      const idx = rows.findIndex((r) => r.date === payload.date);
      const record: EquitySnapshotRecord = {
        id: idx >= 0 ? rows[idx].id : generateUlid(),
        date: payload.date,
        balance: payload.balance,
        dailyPnl: payload.dailyPnl,
        dailyDrawdown: payload.dailyDrawdown,
        maxDrawdown: payload.maxDrawdown,
        winCount: payload.winCount,
        lossCount: payload.lossCount,
        notes: payload.notes,
        createdAt: idx >= 0 ? rows[idx].createdAt : new Date().toISOString(),
      };
      if (idx >= 0) rows[idx] = record;
      else rows.push(record);
      writePreviewJson(PREVIEW_SNAPSHOTS_KEY, rows);
      return record;
    }
    return invoke<EquitySnapshotRecord>('upsert_equity_snapshot', { input: payload });
  },

  // --- Cached Economic Calendar & News (SQLite read-only + Rust background fetchers) ---
  async getEconomicEvents(filters?: {
    countries?: string[];
    impacts?: string[];
  }): Promise<EconomicEventItem[]> {
    if (!isTauriRuntime()) {
      const events = readPreviewJson<EconomicEventItem[]>(PREVIEW_EVENTS_KEY, []);
      const cf = filters?.countries?.map((c) => c.toUpperCase()) ?? [];
      const imf = filters?.impacts?.map((i) => i.toLowerCase()) ?? [];
      return events
        .filter(
          (e) =>
            (cf.length === 0 || cf.includes(e.country.toUpperCase())) &&
            (imf.length === 0 || imf.includes(e.impact.toLowerCase())),
        )
        .sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime));
    }
    return invoke<EconomicEventItem[]>('get_economic_events', {
      countries: filters?.countries ?? null,
      impacts: filters?.impacts ?? null,
    });
  },

  async addManualEconomicEvent(payload: ManualEventPayload): Promise<EconomicEventItem> {
    if (!isTauriRuntime()) {
      const nowIso = new Date().toISOString();
      const events = readPreviewJson<EconomicEventItem[]>(PREVIEW_EVENTS_KEY, []);
      const record: EconomicEventItem = {
        id: generateUlid(),
        provider: 'manual',
        title: payload.title.trim(),
        country: payload.country.trim().toUpperCase(),
        eventDatetime: payload.eventDatetime,
        impact: payload.impact,
        forecast: payload.forecast,
        previous: payload.previous,
        actual: null,
        fetchedAt: nowIso,
        expiresAt: nowIso,
      };
      events.push(record);
      writePreviewJson(PREVIEW_EVENTS_KEY, events);
      return record;
    }
    return invoke<EconomicEventItem>('add_manual_economic_event', { input: payload });
  },

  async deleteEconomicEvent(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const events = readPreviewJson<EconomicEventItem[]>(PREVIEW_EVENTS_KEY, []);
      writePreviewJson(
        PREVIEW_EVENTS_KEY,
        events.filter((e) => e.id !== id),
      );
      return;
    }
    await invoke('delete_economic_event', { id });
  },

  async getNewsItems(filters?: {
    categories?: string[];
    limit?: number;
  }): Promise<NewsArticleItem[]> {
    if (!isTauriRuntime()) {
      const rows = readPreviewJson<NewsArticleItem[]>(PREVIEW_NEWS_KEY, []);
      const cf = filters?.categories?.map((c) => c.toLowerCase()) ?? [];
      return rows
        .filter((r) => cf.length === 0 || cf.includes(r.category.toLowerCase()))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, filters?.limit ?? 100);
    }
    return invoke<NewsArticleItem[]>('get_news_items', {
      categories: filters?.categories ?? null,
      limit: filters?.limit ?? null,
    });
  },

  async listRssFeeds(): Promise<RssFeedSource[]> {
    if (!isTauriRuntime()) {
      const raw = localStorage.getItem(PREVIEW_RSS_KEY);
      if (!raw) {
        writePreviewJson(PREVIEW_RSS_KEY, DEFAULT_PREVIEW_RSS);
        return DEFAULT_PREVIEW_RSS;
      }
      return readPreviewJson<RssFeedSource[]>(PREVIEW_RSS_KEY, DEFAULT_PREVIEW_RSS);
    }
    return invoke<RssFeedSource[]>('list_rss_feeds');
  },

  async upsertRssFeed(payload: UpsertRssFeedPayload): Promise<RssFeedSource> {
    if (!isTauriRuntime()) {
      const feeds = await this.listRssFeeds();
      const id = payload.id || generateUlid();
      const idx = feeds.findIndex((f) => f.id === id);
      const record: RssFeedSource = {
        id,
        url: payload.url.trim(),
        label: payload.label.trim(),
        category: payload.category,
        isEnabled: payload.isEnabled,
        pollIntervalS: payload.pollIntervalS ?? 600,
        lastFetchedAt: idx >= 0 ? feeds[idx].lastFetchedAt : null,
        createdAt: idx >= 0 ? feeds[idx].createdAt : new Date().toISOString(),
      };
      if (idx >= 0) feeds[idx] = record;
      else feeds.push(record);
      writePreviewJson(PREVIEW_RSS_KEY, feeds);
      return record;
    }
    return invoke<RssFeedSource>('upsert_rss_feed', { input: payload });
  },

  async deleteRssFeed(id: string): Promise<void> {
    if (!isTauriRuntime()) {
      const feeds = await this.listRssFeeds();
      writePreviewJson(
        PREVIEW_RSS_KEY,
        feeds.filter((f) => f.id !== id),
      );
      return;
    }
    await invoke('delete_rss_feed', { id });
  },

  async getFetchMetadata(): Promise<FetchMetadataEntry[]> {
    if (!isTauriRuntime()) {
      return readPreviewJson<FetchMetadataEntry[]>(PREVIEW_META_KEY, []);
    }
    return invoke<FetchMetadataEntry[]>('get_fetch_metadata');
  },

  async triggerMarketSync(force = false): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke('trigger_market_sync', { force });
  },

  async onMarketDataUpdated(cb: () => void): Promise<UnlistenFn> {
    if (!isTauriRuntime()) return () => {};
    return listen('data-updated', cb);
  },

  // --- OS Credential Manager (DPAPI) ---
  async setSecret(key: string, value: string): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke('set_secret', { key, value });
  },

  async hasSecret(key: string): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    return invoke<boolean>('has_secret', { key });
  },

  async deleteSecret(key: string): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke('delete_secret', { key });
  },

  async openExternalUrl(url: string): Promise<void> {
    if (!isTauriRuntime()) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    await openUrl(url);
  },

  async launchScreenSnip(): Promise<void> {
    if (!isTauriRuntime()) {
      window.open('ms-screenclip:', '_blank', 'noopener,noreferrer');
      return;
    }
    await invoke('launch_screen_snip');
  },

  // --- Backup Export / Import ---
  async exportBackup(): Promise<BackupExportResponse> {
    if (!isTauriRuntime()) {
      const snapshot: Record<string, string | null> = {};
      for (const k of [
        PREVIEW_SETTINGS_KEY,
        PREVIEW_LAYOUT_KEY,
        PREVIEW_BIAS_KEY,
        PREVIEW_NOTES_KEY,
        PREVIEW_STRATEGIES_KEY,
        PREVIEW_ATTACHMENTS_KEY,
        PREVIEW_PROFILE_KEY,
        PREVIEW_TRADES_KEY,
        PREVIEW_ONGOING_KEY,
        PREVIEW_SNAPSHOTS_KEY,
        PREVIEW_RSS_KEY,
      ]) {
        snapshot[k] = localStorage.getItem(k);
      }
      const payload = {
        manifest: {
          appIdentifier: 'com.icttrading.panel',
          appVersion: '0.1.0',
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          tableCounts: { localStorageKeys: Object.values(snapshot).filter(Boolean).length },
          attachmentCount: 0,
        },
        database: snapshot,
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const bytes = Array.from(new TextEncoder().encode(jsonStr));
      return {
        filePath: 'Browser Download',
        filename: `ict_panel_backup_${new Date().toISOString().slice(0, 10)}.json`,
        bytes,
        manifest: payload.manifest,
      };
    }
    return invoke<BackupExportResponse>('export_backup_zip');
  },

  async importBackup(
    bytes: number[],
    mode: BackupRestoreMode,
  ): Promise<BackupImportSummary> {
    if (!isTauriRuntime()) {
      const text = new TextDecoder().decode(new Uint8Array(bytes));
      const parsed = JSON.parse(text) as {
        manifest?: { schemaVersion?: number };
        database?: Record<string, string | null>;
      };
      if (!parsed.manifest || parsed.manifest.schemaVersion !== 1 || !parsed.database) {
        throw new Error('Invalid backup archive format');
      }
      let restored = 0;
      for (const [k, v] of Object.entries(parsed.database)) {
        if (v !== null && v !== undefined) {
          localStorage.setItem(k, v);
          restored += 1;
        }
      }
      return {
        mode,
        tablesRestored: restored,
        rowsRestored: restored,
        attachmentsRestored: 0,
      };
    }
    return invoke<BackupImportSummary>('import_backup_zip', { bytes, mode });
  },

  async openBackupsFolder(): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke('open_backups_folder');
  },

  // --- Global Hotkeys & Desktop Notifications ---
  async syncGlobalHotkeys(
    config: HotkeyConfig,
    onAction: (action: HotkeyActionId) => void,
  ): Promise<Partial<Record<HotkeyActionId, string>>> {
    if (!isTauriRuntime()) return {};
    try {
      await unregisterAllGlobalShortcuts();
    } catch {
      // ignore if none previously registered
    }
    if (!config.enabled) return {};

    const conflicts: Partial<Record<HotkeyActionId, string>> = {};
    const entries: Array<[HotkeyActionId, string]> = [
      ['togglePanel', config.togglePanel],
      ['toggleFullscreen', config.toggleFullscreen],
      ['screenSnip', config.screenSnip],
      ['togglePin', config.togglePin],
    ];

    for (const [action, accel] of entries) {
      const clean = accel.trim();
      if (!clean) continue;
      try {
        await registerGlobalShortcut(clean, (ev) => {
          if (ev.state === 'Pressed') {
            onAction(action);
          }
        });
      } catch (err) {
        conflicts[action] =
          err instanceof Error
            ? `Conflict registering ${clean}: ${err.message}`
            : `Conflict: ${clean} may already be claimed by another app`;
      }
    }
    return conflicts;
  },

  async unregisterAllHotkeys(): Promise<void> {
    if (!isTauriRuntime()) return;
    try {
      await unregisterAllGlobalShortcuts();
    } catch {
      // ignore
    }
  },

  async sendDesktopNotification(title: string, body: string): Promise<void> {
    if (!isTauriRuntime()) return;
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === 'granted';
      }
      if (granted) {
        sendNotification({ title, body });
      }
    } catch {
      // ignore OS notification failures silently
    }
  },

  async onDisplayMetricsChanged(cb: () => void): Promise<UnlistenFn> {
    if (!isTauriRuntime()) return () => {};
    return listen('display-metrics-changed', cb);
  },

  async onDockDragReleased(cb: () => void): Promise<UnlistenFn> {
    if (!isTauriRuntime()) return () => {};
    return listen('dock-drag-released', cb);
  },

  async onTrayAction(cb: (action: 'togglePanel' | 'togglePin') => void): Promise<UnlistenFn> {
    if (!isTauriRuntime()) return () => {};
    const unlistenToggle = await listen('tray-toggle-panel', () => cb('togglePanel'));
    const unlistenPin = await listen('tray-toggle-pin', () => cb('togglePin'));
    return () => {
      unlistenToggle();
      unlistenPin();
    };
  },

  // --- Separate Floating Note / Strategy Viewer Window ---
  async openFloatingViewer(payload: FloatingViewerPayload): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    await invoke('open_floating_viewer', { payloadJson: JSON.stringify(payload) });
    return true;
  },

  async getFloatingViewerPayload(): Promise<FloatingViewerPayload | null> {
    if (!isTauriRuntime()) return null;
    const raw = await invoke<string | null>('get_floating_viewer_payload');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as FloatingViewerPayload;
    } catch {
      return null;
    }
  },

  async closeFloatingViewer(): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke('close_floating_viewer');
  },

  async requestViewerEdit(kind: 'note' | 'strategy', id: string): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke('request_viewer_edit', { kind, id });
  },

  async onViewerPayloadUpdated(cb: (payload: FloatingViewerPayload) => void): Promise<UnlistenFn> {
    if (!isTauriRuntime()) return () => {};
    return listen<string>('viewer-payload-updated', (ev) => {
      try {
        cb(JSON.parse(ev.payload) as FloatingViewerPayload);
      } catch {
        // ignore malformed payload
      }
    });
  },

  async onViewerRequestEdit(
    cb: (req: { kind: 'note' | 'strategy'; id: string }) => void,
  ): Promise<UnlistenFn> {
    if (!isTauriRuntime()) return () => {};
    return listen<{ kind: 'note' | 'strategy'; id: string }>('viewer-request-edit', (ev) => {
      if (ev.payload?.kind && ev.payload?.id) {
        cb(ev.payload);
      }
    });
  },
};
