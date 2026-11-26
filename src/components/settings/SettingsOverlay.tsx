import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  Clock,
  Database,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
  Keyboard,
  KeyRound,
  Monitor,
  Palette,
  Plus,
  RotateCcw,
  Rss,
  Sliders,
  Star,
  Timer,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import { usePreservedScroll } from '../../hooks/usePreservedScroll';
import { tauriBridge } from '../../services/tauriBridge';
import { useDailyBiasStore } from '../../stores/dailyBiasStore';
import { useDockStore } from '../../stores/dockStore';
import { useJournalStore } from '../../stores/journalStore';
import { useMarketStore } from '../../stores/marketStore';
import { useNotesStore } from '../../stores/notesStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStrategiesStore } from '../../stores/strategiesStore';
import type { BackupRestoreMode } from '../../types/backup';
import {
  cloneDefaultCanvasToolSettings,
  type FibLevelConfig,
} from '../../types/canvas';
import type { DockEdge } from '../../types/dock';
import {
  DEFAULT_HOTKEYS,
  GLOBAL_HOTKEY_META,
  type HotkeyActionId,
} from '../../types/hotkeys';
import type { NewsCategory } from '../../types/market';
import {
  WIDGET_CATALOG,
  type StatusIndicatorMode,
  type WidgetId,
  type WidgetLayoutItem,
} from '../../types/settings';
import { cloneDefaultKillzones, type KillzoneDefinition } from '../../types/time';
import {
  clampExpandedSize,
  getMonitorAxisLength,
  isHorizontalEdge,
  MAX_COLLAPSED_THICKNESS,
  MIN_COLLAPSED_THICKNESS,
  percentToSize,
  sizeToPercent,
} from '../../utils/dockMath';
import {
  formatAcceleratorForDisplay,
  keyboardEventToAccelerator,
} from '../../utils/hotkeyUtils';
import { formatZoneClock, getZoneAbbreviation, NY_TIMEZONE } from '../../utils/timezone';

export type SettingsTab = 'dock' | 'appearance' | 'time' | 'zones' | 'keys' | 'widgets';

function toTimeInputValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

interface SortableWidgetManagerRowProps {
  item: WidgetLayoutItem;
  idx: number;
  total: number;
  resizeAxis: 'vertical' | 'horizontal';
  onMove: (id: WidgetId, dir: 'up' | 'down') => void;
  onToggleVisibility: (id: WidgetId) => void;
  onResizeDimension: (id: WidgetId, size: number | null) => void;
}

function SortableWidgetManagerRow({
  item,
  idx,
  total,
  resizeAxis,
  onMove,
  onToggleVisibility,
  onResizeDimension,
}: SortableWidgetManagerRowProps) {
  const meta = WIDGET_CATALOG.find((w) => w.id === item.widgetId);
  const currentValue =
    resizeAxis === 'horizontal' ? (item.customWidth ?? null) : item.customHeight;
  const dimensionLabel = resizeAxis === 'horizontal' ? 'width' : 'height';
  const [sizeDraft, setSizeDraft] = useState(
    currentValue !== null ? String(currentValue) : '',
  );

  useEffect(() => {
    setSizeDraft(currentValue !== null ? String(currentValue) : '');
  }, [currentValue]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.widgetId });

  if (!meta) return null;

  const commitSizeDraft = () => {
    const trimmed = sizeDraft.trim();
    if (!trimmed) {
      if (currentValue !== null) onResizeDimension(item.widgetId, null);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      onResizeDimension(item.widgetId, parsed);
    } else {
      setSizeDraft(currentValue !== null ? String(currentValue) : '');
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/80 px-2 py-2"
    >
      <div className="flex min-w-0 items-center gap-1.5 pr-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          className="cursor-grab rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-200">{meta.title}</div>
          <div className="text-[10px] text-slate-500">Milestone {meta.milestone}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <div className="mr-1 flex items-center gap-0.5 rounded border border-slate-800 bg-slate-950 px-1 py-0.5">
          <input
            type="text"
            inputMode="numeric"
            aria-label={`${meta.title} ${dimensionLabel} (px)`}
            placeholder="Auto"
            title={`Widget ${dimensionLabel} in px (leave blank for Auto)`}
            value={sizeDraft}
            onChange={(e) => setSizeDraft(e.target.value)}
            onBlur={commitSizeDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitSizeDraft();
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="w-10 bg-transparent text-center font-mono text-[10px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
          {currentValue !== null ? (
            <button
              type="button"
              onClick={() => onResizeDimension(item.widgetId, null)}
              title={`Reset widget ${dimensionLabel} to Auto`}
              aria-label={`Reset ${meta.title} ${dimensionLabel} to Auto`}
              className="rounded px-0.5 font-mono text-[9px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              ×
            </button>
          ) : (
            <span className="font-mono text-[9px] text-slate-600">px</span>
          )}
        </div>
        <button
          type="button"
          disabled={idx === 0}
          onClick={() => onMove(item.widgetId, 'up')}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 disabled:opacity-30"
          title="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={idx === total - 1}
          onClick={() => onMove(item.widgetId, 'down')}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 disabled:opacity-30"
          title="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onToggleVisibility(item.widgetId)}
          className={`rounded p-1 ${item.isVisible
              ? 'text-emerald-400 hover:bg-slate-800'
              : 'text-slate-500 hover:bg-slate-800'
            }`}
          title={item.isVisible ? 'Hide widget' : 'Show widget'}
        >
          {item.isVisible ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

const ACCENT_SWATCHES = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];

interface CanvasFibLevelsEditorProps {
  title: string;
  sectionId: 'ote' | 'fib';
  primaryColorLabel: string;
  primaryColor: string;
  onChangePrimaryColor: (hex: string) => void;
  secondaryColorLabel: string;
  secondaryColor: string;
  onChangeSecondaryColor: (hex: string) => void;
  bandOpacity: number;
  onChangeBandOpacity: (opacity: number) => void;
  levels: FibLevelConfig[];
  onChangeLevels: (next: FibLevelConfig[]) => void;
  onReset: () => void;
}

function CanvasFibLevelsEditor({
  title,
  sectionId,
  primaryColorLabel,
  primaryColor,
  onChangePrimaryColor,
  secondaryColorLabel,
  secondaryColor,
  onChangeSecondaryColor,
  bandOpacity,
  onChangeBandOpacity,
  levels,
  onChangeLevels,
  onReset,
}: CanvasFibLevelsEditorProps) {
  const [ratioDrafts, setRatioDrafts] = useState<string[]>(() =>
    levels.map((l) => String(l.ratio)),
  );

  useEffect(() => {
    setRatioDrafts(levels.map((l) => String(l.ratio)));
  }, [levels]);

  const updateLevel = (idx: number, patch: Partial<FibLevelConfig>) => {
    onChangeLevels(levels.map((lvl, i) => (i === idx ? { ...lvl, ...patch } : lvl)));
  };

  return (
    <div className="space-y-2 rounded border border-slate-800 bg-slate-950/70 p-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-200">{title}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              onChangeLevels([
                ...levels,
                { ratio: 0.5, label: '0.5', isHighlight: false },
              ])
            }
            className="inline-flex items-center gap-0.5 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-blue-300 hover:bg-slate-800"
          >
            <Plus className="h-2.5 w-2.5" />
            Add Level
          </button>
          <button
            type="button"
            onClick={onReset}
            title={`Reset ${title} defaults`}
            aria-label={`Reset ${title}`}
            className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <label className="space-y-0.5">
          <span className="text-slate-400">{primaryColorLabel}</span>
          <div className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1 py-0.5">
            <input
              type="color"
              aria-label={`${sectionId} ${primaryColorLabel}`}
              value={primaryColor}
              onChange={(e) => onChangePrimaryColor(e.target.value)}
              className="h-4 w-5 cursor-pointer bg-transparent"
            />
            <span className="truncate font-mono text-[9px] text-slate-300">{primaryColor}</span>
          </div>
        </label>
        <label className="space-y-0.5">
          <span className="text-slate-400">{secondaryColorLabel}</span>
          <div className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1 py-0.5">
            <input
              type="color"
              aria-label={`${sectionId} ${secondaryColorLabel}`}
              value={secondaryColor}
              onChange={(e) => onChangeSecondaryColor(e.target.value)}
              className="h-4 w-5 cursor-pointer bg-transparent"
            />
            <span className="truncate font-mono text-[9px] text-slate-300">{secondaryColor}</span>
          </div>
        </label>
        <label className="space-y-0.5">
          <span className="text-slate-400">
            Band Opacity ({Math.round(bandOpacity * 100)}%)
          </span>
          <input
            type="range"
            aria-label={`${sectionId} Band Opacity`}
            min={0.05}
            max={0.5}
            step={0.02}
            value={bandOpacity}
            onChange={(e) => onChangeBandOpacity(Number(e.target.value))}
            className="mt-1 w-full accent-blue-500"
          />
        </label>
      </div>

      <div className="space-y-1">
        {levels.map((lvl, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              aria-label={`${sectionId} level ${idx + 1} ratio`}
              value={ratioDrafts[idx] ?? String(lvl.ratio)}
              onChange={(e) => {
                const raw = e.target.value;
                setRatioDrafts((prev) => prev.map((v, i) => (i === idx ? raw : v)));
                const parsed = Number(raw);
                if (raw.trim() && raw.trim() !== '-' && Number.isFinite(parsed)) {
                  updateLevel(idx, { ratio: parsed });
                }
              }}
              onBlur={() => {
                const raw = ratioDrafts[idx] ?? '';
                const parsed = Number(raw);
                if (!raw.trim() || !Number.isFinite(parsed)) {
                  setRatioDrafts((prev) =>
                    prev.map((v, i) => (i === idx ? String(lvl.ratio) : v)),
                  );
                }
              }}
              placeholder="0.62"
              className="w-16 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-100"
            />
            <input
              type="text"
              aria-label={`${sectionId} level ${idx + 1} label`}
              value={lvl.label}
              onChange={(e) => updateLevel(idx, { label: e.target.value })}
              placeholder="Label"
              className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-100"
            />
            <button
              type="button"
              onClick={() => updateLevel(idx, { isHighlight: !lvl.isHighlight })}
              title="Toggle Sweet-Spot / Highlight"
              aria-label={`Toggle highlight ${sectionId} level ${idx + 1}`}
              aria-pressed={lvl.isHighlight}
              className={`rounded border p-1 ${
                lvl.isHighlight
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-slate-800 bg-slate-900 text-slate-500 hover:text-slate-300'
              }`}
            >
              <Star className="h-2.5 w-2.5" fill={lvl.isHighlight ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              disabled={levels.length <= 1}
              onClick={() => onChangeLevels(levels.filter((_, i) => i !== idx))}
              title="Delete level"
              aria-label={`Delete ${sectionId} level ${idx + 1}`}
              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 disabled:opacity-30"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Frankfurt',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

interface SettingsOverlayProps {
  initialTab?: SettingsTab;
}

export function SettingsOverlay({ initialTab = 'dock' }: SettingsOverlayProps) {
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
    const [finnhubDraft, setFinnhubDraft] = useState('');
    const [secretStatusMsg, setSecretStatusMsg] = useState<string | null>(null);
    const [rssLabel, setRssLabel] = useState('');
    const [rssUrl, setRssUrl] = useState('');
    const [rssCategory, setRssCategory] = useState<NewsCategory>('forex');
    const [recordingHotkey, setRecordingHotkey] = useState<HotkeyActionId | null>(null);
    const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>('merge');
    const [backupStatusMsg, setBackupStatusMsg] = useState<string | null>(null);
    const [backupErrorMsg, setBackupErrorMsg] = useState<string | null>(null);
    const backupInputRef = useRef<HTMLInputElement | null>(null);
    const contentScrollRef = usePreservedScroll<HTMLDivElement>(`settings-overlay:${activeTab}`);
    const [now, setNow] = useState(() => DateTime.utc());

    useEffect(() => {
      setActiveTab(initialTab);
    }, [initialTab]);

    const hydrate = useSettingsStore((s) => s.hydrate);
    const hydrateJournal = useJournalStore((s) => s.hydrateJournal);
    const loadNotes = useNotesStore((s) => s.loadNotes);
    const loadStrategies = useStrategiesStore((s) => s.loadStrategies);
    const loadBiasDate = useDailyBiasStore((s) => s.loadDate);
    const selectedBiasDate = useDailyBiasStore((s) => s.selectedDate);
    const hotkeyConflicts = useDockStore((s) => s.hotkeyConflicts);
    const setHotkeysOpen = useDockStore((s) => s.setHotkeysOpen);

    const rssFeeds = useMarketStore((s) => s.rssFeeds);
    const loadMarketData = useMarketStore((s) => s.loadMarketData);
    const saveRssFeed = useMarketStore((s) => s.saveRssFeed);
    const deleteRssFeed = useMarketStore((s) => s.deleteRssFeed);

    const settings = useSettingsStore((s) => s.settings);
    const widgetLayout = useSettingsStore((s) => s.widgetLayout);
    const dbStatus = useSettingsStore((s) => s.dbStatus);
    const finnhubKeyConfigured = useSettingsStore((s) => s.finnhubKeyConfigured);
    const updateSettings = useSettingsStore((s) => s.updateSettings);
    const toggleWidgetVisibility = useSettingsStore((s) => s.toggleWidgetVisibility);
    const setWidgetHeight = useSettingsStore((s) => s.setWidgetHeight);
    const setWidgetWidth = useSettingsStore((s) => s.setWidgetWidth);
    const moveWidget = useSettingsStore((s) => s.moveWidget);
    const reorderWidgets = useSettingsStore((s) => s.reorderWidgets);
    const saveFinnhubKey = useSettingsStore((s) => s.saveFinnhubKey);
    const resetDefaults = useSettingsStore((s) => s.resetDefaults);

    const dndSensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

    const updateZone = (id: string, patch: Partial<KillzoneDefinition>) => {
      const next = settings.killzones.map((z) => (z.id === id ? { ...z, ...patch } : z));
      void updateSettings({ killzones: next });
    };

    const handleWidgetReorderEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        void reorderWidgets(active.id as WidgetId, over.id as WidgetId);
      }
    };

    const monitors = useDockStore((s) => s.monitors);
    const activeMonitorId = useDockStore((s) => s.activeMonitorId);
    const refreshMonitors = useDockStore((s) => s.refreshMonitors);
    const dockToMonitorEdge = useDockStore((s) => s.dockToMonitorEdge);
    const resizePanel = useDockStore((s) => s.resizePanel);
    const reapplyBounds = useDockStore((s) => s.reapplyBounds);
    const setSettingsOpen = useDockStore((s) => s.setSettingsOpen);

    useEffect(() => {
      void refreshMonitors();
      void loadMarketData();
      const id = window.setInterval(() => setNow(DateTime.utc()), 1000);
      return () => window.clearInterval(id);
    }, [loadMarketData, refreshMonitors]);

    const activeMonitor =
      monitors.find((m) => m.id === (activeMonitorId ?? settings.monitorId)) ??
      monitors.find((m) => m.isPrimary) ??
      monitors[0];

    const axisLength = getMonitorAxisLength(settings.edge, activeMonitor);
    const maxAllowedPx = Math.max(260, Math.round(axisLength * 0.6));
    const currentPercent = sizeToPercent(settings.edge, activeMonitor, settings.expandedSize);

    const timezoneOptions = Array.from(
      new Set([settings.displayTimezone, ...COMMON_TIMEZONES]),
    ).sort();

    const handleSaveFinnhub = async () => {
      await saveFinnhubKey(finnhubDraft);
      setFinnhubDraft('');
      setSecretStatusMsg(
        finnhubDraft.trim()
          ? 'Saved securely in Windows Credential Manager.'
          : 'Removed Finnhub key from Credential Manager.',
      );
    };

    return (
      <div
        data-lock-open="true"
        className="absolute inset-0 z-40 flex flex-col bg-slate-950/98 text-slate-100 backdrop-blur-lg"
      >
        {/* Overlay Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 px-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-semibold tracking-wide">Panel Settings</span>
          </div>
          <button
            type="button"
            onClick={() => void setSettingsOpen(false)}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close Settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <nav className="grid shrink-0 grid-cols-6 border-b border-slate-800 bg-slate-900/70 text-[10px] font-medium">
            {(
              [
                { id: 'dock', label: 'Dock', icon: Monitor },
                { id: 'appearance', label: 'Theme', icon: Palette },
                { id: 'time', label: 'Time', icon: Clock },
                { id: 'zones', label: 'Zones', icon: Timer },
                { id: 'keys', label: 'Keys', icon: Keyboard },
                { id: 'widgets', label: 'Widgets', icon: Database },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center justify-center gap-1 border-b-2 py-2.5 transition-colors ${activeTab === id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div
            key={activeTab}
            ref={contentScrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-xs"
          >
            {activeTab === 'dock' && (
              <>
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-200">Target Display (Work Area)</h3>
                    <button
                      type="button"
                      onClick={() => void refreshMonitors()}
                      className="text-[11px] text-blue-400 hover:underline"
                    >
                      Refresh Displays
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {monitors.map((m) => {
                      const selected = m.id === activeMonitor?.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => void dockToMonitorEdge(m.id, settings.edge)}
                          className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left transition-colors ${selected
                              ? 'border-blue-500 bg-blue-500/10 text-slate-100'
                              : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                            }`}
                        >
                          <div>
                            <div className="font-medium text-slate-200">{m.friendlyName}</div>
                            <div className="text-[10px] text-slate-400">
                              Work Area: {m.width}×{m.height} @ ({m.x}, {m.y}) • DPI{' '}
                              {Math.round(m.scaleFactor * 100)}%
                            </div>
                          </div>
                          {m.isPrimary && (
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-blue-300">
                              Primary
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="font-semibold text-slate-200">Docked Edge</h3>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['left', 'right', 'top', 'bottom'] as DockEdge[]).map((edgeOption) => (
                      <button
                        key={edgeOption}
                        type="button"
                        onClick={() => void dockToMonitorEdge(activeMonitor?.id ?? null, edgeOption)}
                        className={`rounded-md border py-1.5 text-center text-[11px] font-medium capitalize transition-colors ${settings.edge === edgeOption
                            ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                      >
                        {edgeOption}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200">
                      Expanded {isHorizontalEdge(settings.edge) ? 'Height' : 'Width'}
                    </span>
                    <span className="font-mono text-[11px] text-blue-300">
                      {settings.expandedSize}px ({currentPercent}%)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={260}
                    max={maxAllowedPx}
                    value={settings.expandedSize}
                    onChange={(e) => {
                      const val = clampExpandedSize(settings.edge, activeMonitor, Number(e.target.value));
                      void resizePanel(val);
                    }}
                    className="w-full accent-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="space-y-1">
                      <span className="text-[10px] text-slate-400">Pixels (px)</span>
                      <input
                        type="number"
                        min={260}
                        max={maxAllowedPx}
                        value={settings.expandedSize}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!Number.isNaN(val) && val >= 200) {
                            void resizePanel(clampExpandedSize(settings.edge, activeMonitor, val));
                          }
                        }}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-slate-400">Monitor % (max 60%)</span>
                      <input
                        type="number"
                        min={15}
                        max={60}
                        step={0.5}
                        value={currentPercent}
                        onChange={(e) => {
                          const pct = Number(e.target.value);
                          if (!Number.isNaN(pct) && pct > 0) {
                            void resizePanel(percentToSize(settings.edge, activeMonitor, pct));
                          }
                        }}
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100"
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Edge Strip Thickness</span>
                      <span className="font-mono text-slate-400">{settings.collapsedThickness}px</span>
                    </div>
                    <input
                      type="range"
                      min={MIN_COLLAPSED_THICKNESS}
                      max={MAX_COLLAPSED_THICKNESS}
                      value={settings.collapsedThickness}
                      onChange={(e) => {
                        void updateSettings({ collapsedThickness: Number(e.target.value) }).then(() =>
                          reapplyBounds(),
                        );
                      }}
                      className="w-full accent-blue-500"
                    />
                  </label>

                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Hover Open Debounce</span>
                      <span className="font-mono text-slate-400">{settings.hoverOpenDelayMs} ms</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1200}
                      step={50}
                      value={settings.hoverOpenDelayMs}
                      onChange={(e) =>
                        void updateSettings({ hoverOpenDelayMs: Number(e.target.value) })
                      }
                      className="w-full accent-blue-500"
                    />
                  </label>

                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Hover Close Debounce</span>
                      <span className="font-mono text-slate-400">{settings.hoverCloseDelayMs} ms</span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={2000}
                      step={50}
                      value={settings.hoverCloseDelayMs}
                      onChange={(e) =>
                        void updateSettings({ hoverCloseDelayMs: Number(e.target.value) })
                      }
                      className="w-full accent-blue-500"
                    />
                  </label>

                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">CSS Slide Transition</span>
                      <span className="font-mono text-slate-400">
                        {settings.animationDurationMs} ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={450}
                      step={20}
                      value={settings.animationDurationMs}
                      onChange={(e) =>
                        void updateSettings({ animationDurationMs: Number(e.target.value) })
                      }
                      className="w-full accent-blue-500"
                    />
                  </label>
                </section>
              </>
            )}

            {activeTab === 'appearance' && (
              <>
                <section className="space-y-2">
                  <h3 className="font-semibold text-slate-200">Accent Color</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {ACCENT_SWATCHES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Accent ${color}`}
                        onClick={() => void updateSettings({ accentColor: color })}
                        style={{ backgroundColor: color }}
                        className={`h-7 w-7 rounded-full border-2 transition-transform ${settings.accentColor.toLowerCase() === color.toLowerCase()
                            ? 'scale-110 border-white'
                            : 'border-transparent opacity-80 hover:opacity-100'
                          }`}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.accentColor}
                      onChange={(e) => void updateSettings({ accentColor: e.target.value })}
                      className="h-7 w-9 cursor-pointer rounded border border-slate-700 bg-transparent"
                      title="Custom accent color"
                    />
                  </div>
                </section>

                <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Panel Surface Opacity</span>
                      <span className="font-mono text-slate-400">
                        {Math.round(settings.panelOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.45}
                      max={1}
                      step={0.01}
                      value={settings.panelOpacity}
                      onChange={(e) => void updateSettings({ panelOpacity: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </label>

                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Edge Strip Opacity</span>
                      <span className="font-mono text-slate-400">
                        {Math.round(settings.stripOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.15}
                      max={1}
                      step={0.05}
                      value={settings.stripOpacity}
                      onChange={(e) => void updateSettings({ stripOpacity: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between pt-1">
                    <span className="text-slate-300">Edge Strip Base Color</span>
                    <input
                      type="color"
                      value={settings.stripColor}
                      onChange={(e) => void updateSettings({ stripColor: e.target.value })}
                      className="h-7 w-10 cursor-pointer rounded border border-slate-700 bg-transparent"
                    />
                  </label>
                </section>

                <section className="space-y-2">
                  <h3 className="font-semibold text-slate-200">Edge Strip Status Indicator</h3>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'killzone', label: 'Killzone' },
                        { id: 'session', label: 'Session' },
                        { id: 'none', label: 'Hidden' },
                      ] as Array<{ id: StatusIndicatorMode; label: string }>
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => void updateSettings({ statusIndicator: opt.id })}
                        className={`rounded-md border py-1.5 text-[11px] font-medium ${settings.statusIndicator === opt.id
                            ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                            : 'border-slate-800 bg-slate-900 text-slate-400'
                          }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}

            {activeTab === 'time' && (
              <>
                <section className="space-y-2">
                  <label className="block space-y-1">
                    <span className="font-semibold text-slate-200">Display Timezone</span>
                    <select
                      value={settings.displayTimezone}
                      onChange={(e) => void updateSettings({ displayTimezone: e.target.value })}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
                    >
                      {timezoneOptions.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>

                <section className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void updateSettings({ timeFormat: '24h' })}
                    className={`rounded-md border py-2 text-xs font-medium ${settings.timeFormat === '24h'
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                      }`}
                  >
                    24-Hour Clock
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateSettings({ timeFormat: '12h' })}
                    className={`rounded-md border py-2 text-xs font-medium ${settings.timeFormat === '12h'
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                      }`}
                  >
                    12-Hour (AM/PM)
                  </button>
                </section>

                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="text-slate-200">Dual Clock (Show NY Time)</span>
                    <input
                      type="checkbox"
                      checked={settings.showDualNyClock}
                      onChange={(e) => void updateSettings({ showDualNyClock: e.target.checked })}
                      className="h-4 w-4 accent-blue-500"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="text-slate-200">Automatic DST Handling (IANA)</span>
                    <input
                      type="checkbox"
                      checked={settings.autoDst}
                      onChange={(e) => void updateSettings({ autoDst: e.target.checked })}
                      className="h-4 w-4 accent-blue-500"
                    />
                  </label>
                </section>

                <section className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/80 p-3 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Local ({settings.displayTimezone}):</span>
                    <span className="text-slate-100">
                      {formatZoneClock(now, settings.displayTimezone, settings.timeFormat)}{' '}
                      {getZoneAbbreviation(now, settings.displayTimezone)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">New York (Killzone Ref):</span>
                    <span className="text-amber-300">
                      {formatZoneClock(now, NY_TIMEZONE, settings.timeFormat)}{' '}
                      {getZoneAbbreviation(now, NY_TIMEZONE)}
                    </span>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'zones' && (
              <>
                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">Timeline Overlays</span>
                    <button
                      type="button"
                      onClick={() => void updateSettings({ killzones: cloneDefaultKillzones() })}
                      className="text-[10px] text-amber-400 hover:underline"
                    >
                      Reset ICT Defaults
                    </button>
                  </div>
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="text-slate-300">Silver Bullet Windows</span>
                    <input
                      type="checkbox"
                      checked={settings.showSilverBullets}
                      onChange={(e) => void updateSettings({ showSilverBullets: e.target.checked })}
                      className="h-4 w-4 accent-blue-500"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="text-slate-300">ICT Macro Windows</span>
                    <input
                      type="checkbox"
                      checked={settings.showMacros}
                      onChange={(e) => void updateSettings({ showMacros: e.target.checked })}
                      className="h-4 w-4 accent-blue-500"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="text-slate-300">NY Midnight Open Line (00:00 NY)</span>
                    <input
                      type="checkbox"
                      checked={settings.showNyMidnight}
                      onChange={(e) => void updateSettings({ showNyMidnight: e.target.checked })}
                      className="h-4 w-4 accent-blue-500"
                    />
                  </label>
                </section>

                <section className="space-y-1.5">
                  <h3 className="font-semibold text-slate-200">
                    Killzone, Silver Bullet &amp; Macro Times (America/New_York)
                  </h3>
                  {settings.killzones.map((kz) => (
                    <div
                      key={kz.id}
                      className="space-y-1.5 rounded-md border border-slate-800 bg-slate-900/80 p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={kz.enabled}
                            onChange={(e) => updateZone(kz.id, { enabled: e.target.checked })}
                            className="h-3.5 w-3.5 accent-blue-500"
                          />
                          <input
                            type="text"
                            value={kz.label}
                            onChange={(e) => updateZone(kz.id, { label: e.target.value })}
                            className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[11px] font-medium text-slate-100"
                          />
                        </div>
                        <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase text-slate-400">
                          {kz.kind === 'silver_bullet' ? 'SB' : kz.kind}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            value={toTimeInputValue(kz.startHour, kz.startMinute)}
                            onChange={(e) => {
                              const [hh, mm] = e.target.value.split(':').map(Number);
                              if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
                                updateZone(kz.id, { startHour: hh, startMinute: mm });
                              }
                            }}
                            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-slate-200"
                          />
                          <span className="text-slate-500">to</span>
                          <input
                            type="time"
                            value={toTimeInputValue(kz.endHour, kz.endMinute)}
                            onChange={(e) => {
                              const [hh, mm] = e.target.value.split(':').map(Number);
                              if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
                                updateZone(kz.id, { endHour: hh, endMinute: mm });
                              }
                            }}
                            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-slate-200"
                          />
                        </div>
                        <input
                          type="color"
                          value={kz.color}
                          onChange={(e) => updateZone(kz.id, { color: e.target.value })}
                          className="h-5 w-7 cursor-pointer rounded border border-slate-700 bg-transparent"
                          title="Zone color"
                        />
                      </div>
                    </div>
                  ))}
                </section>
              </>
            )}

            {activeTab === 'keys' && (
              <>
                {/* Global Hotkey Configuration */}
                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                      <Keyboard className="h-3.5 w-3.5 text-blue-400" />
                      Global Hotkeys
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void setHotkeysOpen(true)}
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        Open Cheat Sheet
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateSettings({ hotkeys: { ...DEFAULT_HOTKEYS } })}
                        className="text-[10px] text-amber-400 hover:underline"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-300">Enable System-Wide Global Shortcuts</span>
                    <input
                      type="checkbox"
                      checked={settings.hotkeys.enabled}
                      onChange={(e) =>
                        void updateSettings({
                          hotkeys: { ...settings.hotkeys, enabled: e.target.checked },
                        })
                      }
                      className="h-4 w-4 accent-blue-500"
                    />
                  </label>

                  <div className="space-y-1.5">
                    {GLOBAL_HOTKEY_META.map((meta) => {
                      const isRec = recordingHotkey === meta.id;
                      const currentVal = settings.hotkeys[meta.id];
                      const conflict = hotkeyConflicts[meta.id];
                      return (
                        <div
                          key={meta.id}
                          className="space-y-1 rounded border border-slate-800 bg-slate-950/75 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-slate-200">{meta.title}</div>
                              <div className="text-[10px] text-slate-400">{meta.description}</div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setRecordingHotkey(isRec ? null : meta.id)}
                              onBlur={() => setRecordingHotkey(null)}
                              onKeyDown={(e) => {
                                if (!isRec) return;
                                e.preventDefault();
                                e.stopPropagation();
                                if (e.key === 'Escape') {
                                  setRecordingHotkey(null);
                                  return;
                                }
                                const accel = keyboardEventToAccelerator(e.nativeEvent);
                                if (accel) {
                                  void updateSettings({
                                    hotkeys: { ...settings.hotkeys, [meta.id]: accel },
                                  });
                                  setRecordingHotkey(null);
                                }
                              }}
                              className={`shrink-0 rounded border px-2 py-1 font-mono text-[10px] font-semibold transition-colors ${isRec
                                  ? 'border-blue-500 bg-blue-500/20 text-blue-200 animate-pulse'
                                  : 'border-slate-700 bg-slate-900 text-amber-300 hover:border-slate-600'
                                }`}
                              title="Click then press your new modifier + key combo"
                            >
                              {isRec
                                ? 'Press keys...'
                                : formatAcceleratorForDisplay(currentVal)}
                            </button>
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

                {/* Desktop Notifications */}
                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Bell className="h-3.5 w-3.5 text-amber-400" />
                    Alerts &amp; Notifications
                  </div>
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="text-slate-300">
                      Desktop Toast Alerts (Killzone opens &amp; &le;15m Red Folder news)
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.notificationsEnabled}
                      onChange={(e) =>
                        void updateSettings({ notificationsEnabled: e.target.checked })
                      }
                      className="h-4 w-4 accent-blue-500"
                    />
                  </label>
                </section>

                {/* Full Backup Export / Import (.zip) */}
                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
                      <Database className="h-3.5 w-3.5 text-emerald-400" />
                      Full Backup &amp; Restore (.zip)
                    </span>
                    <button
                      type="button"
                      onClick={() => void tauriBridge.openBackupsFolder()}
                      className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline"
                    >
                      <FolderOpen className="h-3 w-3" />
                      Backups Folder
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-400">
                    Packages your SQLite database (notes, playbooks, trades, bias, settings) plus
                    all chart screenshots into a portable archive.
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setBackupErrorMsg(null);
                        setBackupStatusMsg(null);
                        void tauriBridge
                          .exportBackup()
                          .then((res) => {
                            try {
                              const blob = new Blob([new Uint8Array(res.bytes)], {
                                type: res.filename.endsWith('.zip')
                                  ? 'application/zip'
                                  : 'application/json',
                              });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = res.filename;
                              a.click();
                              URL.revokeObjectURL(url);
                            } catch {
                              // Headless fallback
                            }
                            setBackupStatusMsg(
                              `Exported ${res.filename} (${res.manifest.attachmentCount} attachments).`,
                            );
                          })
                          .catch((err) =>
                            setBackupErrorMsg(err instanceof Error ? err.message : String(err)),
                          );
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export Backup
                    </button>

                    <input
                      ref={backupInputRef}
                      type="file"
                      accept=".zip,.json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setBackupErrorMsg(null);
                        setBackupStatusMsg(null);
                        void file
                          .arrayBuffer()
                          .then((buf) =>
                            tauriBridge.importBackup(Array.from(new Uint8Array(buf)), restoreMode),
                          )
                          .then(async (summary) => {
                            await Promise.all([
                              hydrate(),
                              hydrateJournal(),
                              loadNotes(),
                              loadStrategies(),
                              loadMarketData(),
                              loadBiasDate(selectedBiasDate),
                            ]);
                            setBackupStatusMsg(
                              `Restored (${summary.mode}): ${summary.rowsRestored} rows across ${summary.tablesRestored} tables, ${summary.attachmentsRestored} screenshots.`,
                            );
                          })
                          .catch((err) =>
                            setBackupErrorMsg(err instanceof Error ? err.message : String(err)),
                          );
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => backupInputRef.current?.click()}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Import ({restoreMode})
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Restore strategy:</span>
                    <div className="flex gap-1">
                      {(['merge', 'replace'] as BackupRestoreMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setRestoreMode(m)}
                          className={`rounded border px-2 py-0.5 capitalize ${restoreMode === m
                              ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400'
                            }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {backupStatusMsg && (
                    <p className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
                      {backupStatusMsg}
                    </p>
                  )}
                  {backupErrorMsg && (
                    <p className="rounded bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300">
                      {backupErrorMsg}
                    </p>
                  )}
                </section>
              </>
            )}

            {activeTab === 'widgets' && (
              <>
                <section className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-200">Widget Order &amp; Visibility</h3>
                    <span className="text-[10px] text-slate-500">Drag handle or arrows</span>
                  </div>
                  <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleWidgetReorderEnd}
                  >
                    <SortableContext
                      items={widgetLayout.map((w) => w.widgetId)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {widgetLayout.map((item, idx) => (
                          <SortableWidgetManagerRow
                            key={item.widgetId}
                            item={item}
                            idx={idx}
                            total={widgetLayout.length}
                            resizeAxis={isHorizontalEdge(settings.edge) ? 'horizontal' : 'vertical'}
                            onMove={(id, dir) => void moveWidget(id, dir)}
                            onToggleVisibility={(id) => void toggleWidgetVisibility(id)}
                            onResizeDimension={(id, size) =>
                              void (isHorizontalEdge(settings.edge)
                                ? setWidgetWidth(id, size)
                                : setWidgetHeight(id, size))
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </section>

                {/* Canvas OTE & Fibonacci Ranges & Colors */}
                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                      <Sliders className="h-3.5 w-3.5 text-blue-400" />
                      Canvas Tools: OTE &amp; Fib Ranges / Colors
                    </span>
                  </div>

                  <CanvasFibLevelsEditor
                    title="OTE Tool"
                    sectionId="ote"
                    primaryColorLabel="Band Color"
                    primaryColor={settings.canvasTools.oteColor}
                    onChangePrimaryColor={(oteColor) =>
                      void updateSettings({
                        canvasTools: { ...settings.canvasTools, oteColor },
                      })
                    }
                    secondaryColorLabel="Sweet Spot Color"
                    secondaryColor={settings.canvasTools.oteSweetSpotColor}
                    onChangeSecondaryColor={(oteSweetSpotColor) =>
                      void updateSettings({
                        canvasTools: { ...settings.canvasTools, oteSweetSpotColor },
                      })
                    }
                    bandOpacity={settings.canvasTools.oteBandOpacity}
                    onChangeBandOpacity={(oteBandOpacity) =>
                      void updateSettings({
                        canvasTools: { ...settings.canvasTools, oteBandOpacity },
                      })
                    }
                    levels={settings.canvasTools.oteLevels}
                    onChangeLevels={(oteLevels) =>
                      void updateSettings({
                        canvasTools: { ...settings.canvasTools, oteLevels },
                      })
                    }
                    onReset={() => {
                      const d = cloneDefaultCanvasToolSettings();
                      void updateSettings({
                        canvasTools: {
                          ...settings.canvasTools,
                          oteColor: d.oteColor,
                          oteSweetSpotColor: d.oteSweetSpotColor,
                          oteBandOpacity: d.oteBandOpacity,
                          oteLevels: d.oteLevels,
                        },
                      });
                    }}
                  />

                  <CanvasFibLevelsEditor
                    title="Fib Retracement Tool"
                    sectionId="fib"
                    primaryColorLabel="Base Color"
                    primaryColor={settings.canvasTools.fibColor}
                    onChangePrimaryColor={(fibColor) =>
                      void updateSettings({
                        canvasTools: { ...settings.canvasTools, fibColor },
                      })
                    }
                    secondaryColorLabel="Highlight / Pocket"
                    secondaryColor={settings.canvasTools.fibHighlightColor}
                    onChangeSecondaryColor={(fibHighlightColor) =>
                      void updateSettings({
                        canvasTools: { ...settings.canvasTools, fibHighlightColor },
                      })
                    }
                    bandOpacity={settings.canvasTools.fibBandOpacity}
                    onChangeBandOpacity={(fibBandOpacity) =>
                      void updateSettings({
                        canvasTools: { ...settings.canvasTools, fibBandOpacity },
                      })
                    }
                    levels={settings.canvasTools.fibLevels}
                    onChangeLevels={(fibLevels) =>
                      void updateSettings({
                        canvasTools: { ...settings.canvasTools, fibLevels },
                      })
                    }
                    onReset={() => {
                      const d = cloneDefaultCanvasToolSettings();
                      void updateSettings({
                        canvasTools: {
                          ...settings.canvasTools,
                          fibColor: d.fibColor,
                          fibHighlightColor: d.fibHighlightColor,
                          fibBandOpacity: d.fibBandOpacity,
                          fibLevels: d.fibLevels,
                        },
                      });
                    }}
                  />
                </section>

                {/* Optional Finnhub Key via Windows Credential Manager */}
                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                      <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                      Optional Finnhub Key (DPAPI)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {finnhubKeyConfigured ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="password"
                      value={finnhubDraft}
                      onChange={(e) => setFinnhubDraft(e.target.value)}
                      placeholder="Paste Finnhub API key (blank to clear)"
                      className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveFinnhub()}
                      className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500"
                    >
                      Save
                    </button>
                  </div>
                  {secretStatusMsg && (
                    <p className="text-[10px] text-emerald-400">{secretStatusMsg}</p>
                  )}
                </section>

                {/* Custom RSS News Sources */}
                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                      <Rss className="h-3.5 w-3.5 text-orange-400" />
                      News Sources &amp; Custom RSS Feeds
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {rssFeeds.filter((f) => f.isEnabled).length}/{rssFeeds.length} active
                    </span>
                  </div>

                  <div className="space-y-1">
                    {rssFeeds.map((feed) => (
                      <div
                        key={feed.id}
                        className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 px-2 py-1"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={feed.isEnabled}
                            onChange={(e) =>
                              void saveRssFeed({
                                id: feed.id,
                                url: feed.url,
                                label: feed.label,
                                category: feed.category,
                                isEnabled: e.target.checked,
                                pollIntervalS: feed.pollIntervalS,
                              })
                            }
                            className="h-3.5 w-3.5 accent-blue-500"
                          />
                          <span className="truncate font-medium text-slate-200">{feed.label}</span>
                          <span className="rounded bg-slate-800 px-1 py-0.5 text-[9px] uppercase text-slate-400">
                            {feed.category}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => void deleteRssFeed(feed.id)}
                          title="Remove RSS feed"
                          className="rounded p-0.5 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-1 pt-1">
                    <input
                      type="text"
                      value={rssLabel}
                      onChange={(e) => setRssLabel(e.target.value)}
                      placeholder="Label (e.g. ZeroHedge)"
                      className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-100"
                    />
                    <input
                      type="url"
                      value={rssUrl}
                      onChange={(e) => setRssUrl(e.target.value)}
                      placeholder="https://.../rss"
                      className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-100"
                    />
                    <div className="flex gap-1">
                      <select
                        value={rssCategory}
                        onChange={(e) => setRssCategory(e.target.value as NewsCategory)}
                        className="flex-1 rounded border border-slate-700 bg-slate-950 px-1 py-1 text-[10px] text-slate-100"
                      >
                        <option value="forex">Forex</option>
                        <option value="crypto">Crypto</option>
                        <option value="macro">Macro</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!rssLabel.trim() || !rssUrl.trim()) return;
                          void saveRssFeed({
                            label: rssLabel.trim(),
                            url: rssUrl.trim(),
                            category: rssCategory,
                            isEnabled: true,
                          }).then(() => {
                            setRssLabel('');
                            setRssUrl('');
                          });
                        }}
                        className="inline-flex items-center rounded bg-blue-600 px-1.5 py-1 text-white hover:bg-blue-500"
                        title="Add custom RSS feed"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </section>

                {/* SQLite Status */}
                <section className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-[10px] text-slate-400">
                  <div className="font-semibold text-slate-300">Local SQLite Engine</div>
                  <div>Journal Mode: {dbStatus?.journalMode ?? 'WAL'}</div>
                  <div>Schema Version: v{dbStatus?.schemaVersion ?? 1}</div>
                  <div className="truncate" title={dbStatus?.dbPath}>
                    DB: {dbStatus?.dbPath ?? 'Initializing...'}
                  </div>
                </section>

                <button
                  type="button"
                  onClick={() => void resetDefaults()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Panel Defaults
                </button>
              </>
            )}
          </div>
      </div>
    );
  }
