import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Minus,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import {
  formatBiasPeriodMeta,
  getTodayNyDateString,
  useDailyBiasStore,
} from '../../stores/dailyBiasStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { BiasDirection, DailyBiasEntry } from '../../types/dailyBias';

function parseNullableNum(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function getBiasSummaryBadge(
  entry: DailyBiasEntry | undefined,
  pair: string,
  weeklyBias: BiasDirection | null = null,
  monthlyBias: BiasDirection | null = null,
): { text: string; color: string } {
  const dirs = [
    monthlyBias,
    weeklyBias,
    entry?.biasDaily ?? null,
    entry?.bias4h ?? null,
    entry?.bias15m ?? null,
  ];
  const nonNull = dirs.filter(Boolean) as BiasDirection[];
  if (nonNull.length === 0) return { text: pair, color: '#64748b' };

  const dailyDirs = [entry?.biasDaily, entry?.bias4h, entry?.bias15m].filter(
    Boolean,
  ) as BiasDirection[];
  const allBull = nonNull.length >= 2 && nonNull.every((d) => d === 'bullish');
  const allBear = nonNull.length >= 2 && nonNull.every((d) => d === 'bearish');
  if (allBull) return { text: `${pair} BULL`, color: '#10b981' };
  if (allBear) return { text: `${pair} BEAR`, color: '#ef4444' };

  const shortTag = (d: BiasDirection | null | undefined) =>
    d === 'bullish' ? 'B' : d === 'bearish' ? 'S' : d === 'range' ? 'R' : '–';
  const badgeDirs =
    monthlyBias || weeklyBias ? dirs : [entry?.biasDaily, entry?.bias4h, entry?.bias15m];
  if (dailyDirs.length === 0 && !monthlyBias && !weeklyBias) {
    return { text: pair, color: '#64748b' };
  }
  return {
    text: `${pair} ${badgeDirs.map(shortTag).join('/')}`,
    color: '#94a3b8',
  };
}

export function DailyBiasWidget() {
  const watchlistPairs = useSettingsStore((s) => s.settings.watchlistPairs);
  const selectedPair = useSettingsStore((s) => s.settings.selectedBiasPair);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const selectedDate = useDailyBiasStore((s) => s.selectedDate);
  const entriesByPair = useDailyBiasStore((s) => s.entriesByPair);
  const weeklyByPair = useDailyBiasStore((s) => s.weeklyByPair);
  const monthlyByPair = useDailyBiasStore((s) => s.monthlyByPair);
  const savingPair = useDailyBiasStore((s) => s.savingPair);
  const loadDate = useDailyBiasStore((s) => s.loadDate);
  const setDate = useDailyBiasStore((s) => s.setDate);
  const upsertBias = useDailyBiasStore((s) => s.upsertBias);
  const upsertPeriodBias = useDailyBiasStore((s) => s.upsertPeriodBias);
  const clearBias = useDailyBiasStore((s) => s.clearBias);

  const [addingPair, setAddingPair] = useState(false);
  const [newPairText, setNewPairText] = useState('');
  const [viewMode, setViewMode] = useState<'pair' | 'matrix'>('pair');

  const entry = entriesByPair[selectedPair];
  const weeklyBias = weeklyByPair[selectedPair]?.biasDaily ?? null;
  const monthlyBias = monthlyByPair[selectedPair]?.biasDaily ?? null;
  const periodMeta = formatBiasPeriodMeta(selectedDate);

  const [pdhDraft, setPdhDraft] = useState('');
  const [pdlDraft, setPdlDraft] = useState('');
  const [asianHighDraft, setAsianHighDraft] = useState('');
  const [asianLowDraft, setAsianLowDraft] = useState('');
  const [dolNotesDraft, setDolNotesDraft] = useState('');

  useEffect(() => {
    void loadDate(selectedDate);
  }, [loadDate, selectedDate]);

  useEffect(() => {
    setPdhDraft(entry?.pdh !== null && entry?.pdh !== undefined ? String(entry.pdh) : '');
    setPdlDraft(entry?.pdl !== null && entry?.pdl !== undefined ? String(entry.pdl) : '');
    setAsianHighDraft(
      entry?.asianHigh !== null && entry?.asianHigh !== undefined
        ? String(entry.asianHigh)
        : '',
    );
    setAsianLowDraft(
      entry?.asianLow !== null && entry?.asianLow !== undefined
        ? String(entry.asianLow)
        : '',
    );
    setDolNotesDraft(entry?.dolNotes ?? '');
  }, [entry, selectedPair, selectedDate]);

  const commitUpsert = async (
    overrides: Partial<{
      biasDaily: BiasDirection | null;
      bias4h: BiasDirection | null;
      bias15m: BiasDirection | null;
      pdh: number | null;
      pdl: number | null;
      asianHigh: number | null;
      asianLow: number | null;
      dolNotes: string | null;
    }> = {},
  ) => {
    await upsertBias({
      id: entry?.id,
      pair: selectedPair,
      date: selectedDate,
      biasDaily: overrides.biasDaily !== undefined ? overrides.biasDaily : entry?.biasDaily ?? null,
      bias4h: overrides.bias4h !== undefined ? overrides.bias4h : entry?.bias4h ?? null,
      bias15m: overrides.bias15m !== undefined ? overrides.bias15m : entry?.bias15m ?? null,
      pdh: overrides.pdh !== undefined ? overrides.pdh : parseNullableNum(pdhDraft),
      pdl: overrides.pdl !== undefined ? overrides.pdl : parseNullableNum(pdlDraft),
      asianHigh:
        overrides.asianHigh !== undefined
          ? overrides.asianHigh
          : parseNullableNum(asianHighDraft),
      asianLow:
        overrides.asianLow !== undefined
          ? overrides.asianLow
          : parseNullableNum(asianLowDraft),
      dolNotes:
        overrides.dolNotes !== undefined
          ? overrides.dolNotes
          : dolNotesDraft.trim() || null,
    });
  };

  const toggleTfBias = (
    tf: 'biasDaily' | 'bias4h' | 'bias15m',
    dir: BiasDirection,
  ) => {
    const current = entry?.[tf] ?? null;
    const next = current === dir ? null : dir;
    void commitUpsert({ [tf]: next });
  };

  const togglePeriodBias = (scope: 'monthly' | 'weekly', dir: BiasDirection) => {
    const current = scope === 'monthly' ? monthlyBias : weeklyBias;
    const next = current === dir ? null : dir;
    void upsertPeriodBias(scope, selectedPair, next);
  };

  const shiftDate = (days: number) => {
    const parsed = DateTime.fromISO(selectedDate);
    if (!parsed.isValid) return;
    const next = parsed.plus({ days }).toISODate();
    if (next) void setDate(next);
  };

  const handleAddPair = () => {
    const clean = newPairText.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '');
    if (!clean) {
      setAddingPair(false);
      return;
    }
    const nextList = watchlistPairs.includes(clean)
      ? watchlistPairs
      : [...watchlistPairs, clean];
    void updateSettings({ watchlistPairs: nextList, selectedBiasPair: clean });
    setNewPairText('');
    setAddingPair(false);
  };

  const handleRemovePair = (pairToRemove: string) => {
    if (watchlistPairs.length <= 1) return;
    const nextList = watchlistPairs.filter((p) => p !== pairToRemove);
    const nextSelected =
      selectedPair === pairToRemove ? nextList[0] : selectedPair;
    void updateSettings({
      watchlistPairs: nextList,
      selectedBiasPair: nextSelected,
    });
  };

  const htfRows: Array<{
    scope: 'monthly' | 'weekly';
    label: string;
    hint: string;
    value: BiasDirection | null;
  }> = [
    { scope: 'monthly', label: 'MN', hint: periodMeta.monthLabel, value: monthlyBias },
    { scope: 'weekly', label: 'W1', hint: periodMeta.weekRangeLabel, value: weeklyBias },
  ];

  const tfRows: Array<{
    key: 'biasDaily' | 'bias4h' | 'bias15m';
    label: string;
    value: BiasDirection | null;
  }> = [
    { key: 'biasDaily', label: 'D1', value: entry?.biasDaily ?? null },
    { key: 'bias4h', label: 'H4', value: entry?.bias4h ?? null },
    { key: 'bias15m', label: 'H1', value: entry?.bias15m ?? null },
  ];

  const todayNy = getTodayNyDateString();

  const cycleDirection = (cur: BiasDirection | null | undefined): BiasDirection | null => {
    const order: Array<BiasDirection | null> = [null, 'bullish', 'bearish', 'range'];
    const idx = order.indexOf(cur ?? null);
    return order[(idx + 1) % order.length];
  };

  const cycleMatrixCell = (
    pair: string,
    tf: 'monthly' | 'weekly' | 'biasDaily' | 'bias4h' | 'bias15m',
    current: BiasDirection | null | undefined,
  ) => {
    const next = cycleDirection(current);
    if (tf === 'monthly' || tf === 'weekly') {
      void upsertPeriodBias(tf, pair, next);
      return;
    }
    const existing = entriesByPair[pair];
    void upsertBias({
      id: existing?.id,
      pair,
      date: selectedDate,
      biasDaily: tf === 'biasDaily' ? next : existing?.biasDaily ?? null,
      bias4h: tf === 'bias4h' ? next : existing?.bias4h ?? null,
      bias15m: tf === 'bias15m' ? next : existing?.bias15m ?? null,
      pdh: existing?.pdh ?? null,
      pdl: existing?.pdl ?? null,
      asianHigh: existing?.asianHigh ?? null,
      asianLow: existing?.asianLow ?? null,
      dolNotes: existing?.dolNotes ?? null,
    });
  };

  const biasChipStyle = (d: BiasDirection | null | undefined) => {
    if (d === 'bullish') {
      return { text: 'B', cls: 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300' };
    }
    if (d === 'bearish') {
      return { text: 'S', cls: 'border-rose-500/60 bg-rose-500/20 text-rose-300' };
    }
    if (d === 'range') {
      return { text: 'R', cls: 'border-amber-500/60 bg-amber-500/20 text-amber-300' };
    }
    return { text: '–', cls: 'border-slate-800 bg-slate-900 text-slate-500 hover:text-slate-300' };
  };

  return (
    <div className="space-y-2.5 text-[11px]">
      {/* Date Strip & Mode Toggle */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="rounded border border-slate-800 bg-slate-950 p-1 text-slate-400 hover:text-slate-200"
            title="Previous day"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) void setDate(e.target.value);
            }}
            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-200"
          />
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="rounded border border-slate-800 bg-slate-950 p-1 text-slate-400 hover:text-slate-200"
            title="Next day"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'pair' ? 'matrix' : 'pair'))}
            title={viewMode === 'pair' ? 'Switch to Multi-Pair Matrix View' : 'Switch to Pair Detail View'}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              viewMode === 'matrix'
                ? 'border-blue-500/60 bg-blue-500/20 text-blue-300'
                : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {viewMode === 'matrix' ? <List className="h-3 w-3" /> : <LayoutGrid className="h-3 w-3" />}
            {viewMode === 'matrix' ? 'Pair View' : 'Matrix'}
          </button>
          {selectedDate !== todayNy && (
            <button
              type="button"
              onClick={() => void setDate(todayNy)}
              className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300 hover:bg-blue-500/25"
            >
              Today
            </button>
          )}
          {viewMode === 'pair' && entry && (
            <button
              type="button"
              onClick={() => void clearBias(selectedPair, selectedDate)}
              title="Clear bias entry for this pair & day"
              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {viewMode === 'matrix' && (
        <div className="space-y-1.5 rounded-md border border-slate-800 bg-slate-950/75 p-2">
          <div className="flex items-center justify-between text-[9px] text-slate-400">
            <span>Top-Down Watchlist Matrix (click cell to cycle)</span>
            <span className="font-mono">{periodMeta.monthLabel}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center font-mono text-[10px]">
              <thead>
                <tr className="border-b border-slate-800 text-[9px] text-slate-500">
                  <th className="py-1 text-left font-medium">Pair</th>
                  <th className="py-1 font-medium text-blue-300/80">MN</th>
                  <th className="py-1 font-medium text-blue-300/80">W1</th>
                  <th className="py-1 font-medium">D1</th>
                  <th className="py-1 font-medium">H4</th>
                  <th className="py-1 font-medium">H1</th>
                  <th className="py-1 text-right font-medium">PDH/PDL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {watchlistPairs.map((pair) => {
                  const row = entriesByPair[pair];
                  const mDir = monthlyByPair[pair]?.biasDaily ?? null;
                  const wDir = weeklyByPair[pair]?.biasDaily ?? null;
                  const cells: Array<{
                    tf: 'monthly' | 'weekly' | 'biasDaily' | 'bias4h' | 'bias15m';
                    val: BiasDirection | null | undefined;
                    label: string;
                  }> = [
                    { tf: 'monthly', val: mDir, label: 'MN' },
                    { tf: 'weekly', val: wDir, label: 'W1' },
                    { tf: 'biasDaily', val: row?.biasDaily, label: 'D1' },
                    { tf: 'bias4h', val: row?.bias4h, label: 'H4' },
                    { tf: 'bias15m', val: row?.bias15m, label: 'H1' },
                  ];
                  return (
                    <tr key={pair} className="hover:bg-slate-900/50">
                      <td className="py-1 pr-1 text-left">
                        <button
                          type="button"
                          onClick={() => {
                            void updateSettings({ selectedBiasPair: pair });
                            setViewMode('pair');
                          }}
                          className={`font-semibold hover:underline ${
                            pair === selectedPair ? 'text-blue-300' : 'text-slate-200'
                          }`}
                        >
                          {pair}
                        </button>
                      </td>
                      {cells.map((c) => {
                        const st = biasChipStyle(c.val);
                        return (
                          <td key={c.tf} className="px-0.5 py-1">
                            <button
                              type="button"
                              aria-label={`${pair} ${c.label}`}
                              title={`${pair} ${c.label}: ${c.val ?? 'unset'} (click to cycle)`}
                              onClick={() => cycleMatrixCell(pair, c.tf, c.val)}
                              className={`h-5 w-6 rounded border text-[9px] font-bold transition-colors ${st.cls}`}
                            >
                              {st.text}
                            </button>
                          </td>
                        );
                      })}
                      <td className="py-1 pl-1 text-right text-[9px] text-slate-400">
                        {row?.pdh || row?.pdl ? `${row.pdh ?? '–'}/${row.pdl ?? '–'}` : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'pair' && (
        <>

      {/* Pair Pills */}
      <div className="flex flex-wrap items-center gap-1">
        {watchlistPairs.map((pair) => {
          const isSelected = selectedPair === pair;
          return (
            <div
              key={pair}
              className={`inline-flex items-center rounded border font-mono text-[10px] font-medium transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => void updateSettings({ selectedBiasPair: pair })}
                className="px-2 py-0.5"
              >
                {pair}
              </button>
              {watchlistPairs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemovePair(pair);
                  }}
                  aria-label={`Remove ${pair}`}
                  title={`Remove ${pair} from watchlist`}
                  className="mr-0.5 rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          );
        })}

        {addingPair ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddPair();
            }}
            className="flex items-center gap-1"
          >
            <input
              autoFocus
              type="text"
              value={newPairText}
              onChange={(e) => setNewPairText(e.target.value)}
              onBlur={handleAddPair}
              placeholder="PAIR"
              className="w-16 rounded border border-blue-500 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-100"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingPair(true)}
            title="Add pair to watchlist"
            className="inline-flex items-center gap-0.5 rounded border border-dashed border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400 hover:border-slate-500 hover:text-slate-200"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* MN / W1 (Period-Scoped) + D1 / H4 / H1 (Daily) Directional Bias Matrix */}
      <div className="space-y-1 rounded-md border border-slate-800 bg-slate-950/60 p-2">
        <div className="flex items-center justify-between text-[9px] text-slate-500 pb-0.5">
          <span>HTF Scope: {periodMeta.monthLabel}</span>
          <span className="font-mono">{periodMeta.weekRangeLabel}</span>
        </div>
        {htfRows.map((row) => (
          <div key={row.scope} className="flex items-center justify-between gap-2">
            <span
              className="w-7 font-mono text-[10px] font-semibold text-blue-300/90"
              title={`${row.label} bias (${row.hint})`}
            >
              {row.label}
            </span>
            <div className="grid flex-1 grid-cols-3 gap-1">
              <button
                type="button"
                aria-label={`${row.label} Bull`}
                onClick={() => togglePeriodBias(row.scope, 'bullish')}
                className={`inline-flex items-center justify-center gap-1 rounded border py-1 text-[10px] font-medium transition-colors ${
                  row.value === 'bullish'
                    ? 'border-emerald-500/70 bg-emerald-500/20 text-emerald-300'
                    : 'border-slate-800 bg-slate-900/70 text-slate-500 hover:text-slate-300'
                }`}
              >
                <TrendingUp className="h-3 w-3" />
                Bull
              </button>
              <button
                type="button"
                aria-label={`${row.label} Bear`}
                onClick={() => togglePeriodBias(row.scope, 'bearish')}
                className={`inline-flex items-center justify-center gap-1 rounded border py-1 text-[10px] font-medium transition-colors ${
                  row.value === 'bearish'
                    ? 'border-rose-500/70 bg-rose-500/20 text-rose-300'
                    : 'border-slate-800 bg-slate-900/70 text-slate-500 hover:text-slate-300'
                }`}
              >
                <TrendingDown className="h-3 w-3" />
                Bear
              </button>
              <button
                type="button"
                aria-label={`${row.label} Range`}
                onClick={() => togglePeriodBias(row.scope, 'range')}
                className={`inline-flex items-center justify-center gap-1 rounded border py-1 text-[10px] font-medium transition-colors ${
                  row.value === 'range'
                    ? 'border-amber-500/70 bg-amber-500/20 text-amber-300'
                    : 'border-slate-800 bg-slate-900/70 text-slate-500 hover:text-slate-300'
                }`}
              >
                <Minus className="h-3 w-3" />
                Range
              </button>
            </div>
          </div>
        ))}

        <div className="my-1 border-t border-slate-800/80 pt-1" />

        {tfRows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-2">
            <span className="w-7 font-mono text-[10px] font-semibold text-slate-400">
              {row.label}
            </span>
            <div className="grid flex-1 grid-cols-3 gap-1">
              <button
                type="button"
                aria-label={`${row.label} Bull`}
                onClick={() => toggleTfBias(row.key, 'bullish')}
                className={`inline-flex items-center justify-center gap-1 rounded border py-1 text-[10px] font-medium transition-colors ${
                  row.value === 'bullish'
                    ? 'border-emerald-500/70 bg-emerald-500/20 text-emerald-300'
                    : 'border-slate-800 bg-slate-900/70 text-slate-500 hover:text-slate-300'
                }`}
              >
                <TrendingUp className="h-3 w-3" />
                Bull
              </button>
              <button
                type="button"
                onClick={() => toggleTfBias(row.key, 'bearish')}
                className={`inline-flex items-center justify-center gap-1 rounded border py-1 text-[10px] font-medium transition-colors ${
                  row.value === 'bearish'
                    ? 'border-rose-500/70 bg-rose-500/20 text-rose-300'
                    : 'border-slate-800 bg-slate-900/70 text-slate-500 hover:text-slate-300'
                }`}
              >
                <TrendingDown className="h-3 w-3" />
                Bear
              </button>
              <button
                type="button"
                onClick={() => toggleTfBias(row.key, 'range')}
                className={`inline-flex items-center justify-center gap-1 rounded border py-1 text-[10px] font-medium transition-colors ${
                  row.value === 'range'
                    ? 'border-amber-500/60 bg-amber-500/20 text-amber-300'
                    : 'border-slate-800 bg-slate-900/70 text-slate-500 hover:text-slate-300'
                }`}
              >
                <Minus className="h-3 w-3" />
                Range
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Key Liquidity Levels */}
      <div className="grid grid-cols-2 gap-1.5">
        <label className="space-y-0.5">
          <span className="text-[10px] text-slate-400">PDH</span>
          <input
            type="number"
            step="any"
            value={pdhDraft}
            onChange={(e) => setPdhDraft(e.target.value)}
            onBlur={() => void commitUpsert()}
            placeholder="Prev Day High"
            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-100 placeholder:text-slate-600"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-slate-400">PDL</span>
          <input
            type="number"
            step="any"
            value={pdlDraft}
            onChange={(e) => setPdlDraft(e.target.value)}
            onBlur={() => void commitUpsert()}
            placeholder="Prev Day Low"
            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-100 placeholder:text-slate-600"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-slate-400">Asian High</span>
          <input
            type="number"
            step="any"
            value={asianHighDraft}
            onChange={(e) => setAsianHighDraft(e.target.value)}
            onBlur={() => void commitUpsert()}
            placeholder="Asian High"
            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-100 placeholder:text-slate-600"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-slate-400">Asian Low</span>
          <input
            type="number"
            step="any"
            value={asianLowDraft}
            onChange={(e) => setAsianLowDraft(e.target.value)}
            onBlur={() => void commitUpsert()}
            placeholder="Asian Low"
            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-100 placeholder:text-slate-600"
          />
        </label>
      </div>

      {/* Draw On Liquidity Notes */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>Draw on Liquidity / Narrative</span>
          {savingPair === selectedPair && (
            <span className="text-blue-400">Saving...</span>
          )}
        </div>
        <textarea
          rows={2}
          value={dolNotesDraft}
          onChange={(e) => setDolNotesDraft(e.target.value)}
          onBlur={() => void commitUpsert()}
          placeholder="BSL/SSL targets, FVG magnet, session plan..."
          className="w-full resize-none rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-600"
        />
      </div>
        </>
      )}
    </div>
  );
}
