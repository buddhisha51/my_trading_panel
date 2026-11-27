import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { getTodayNyDateString, useDailyBiasStore } from '../../stores/dailyBiasStore';
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
): { text: string; color: string } {
  if (!entry) return { text: pair, color: '#64748b' };
  const dirs = [entry.biasDaily, entry.bias4h, entry.bias15m].filter(
    Boolean,
  ) as BiasDirection[];
  if (dirs.length === 0) return { text: pair, color: '#64748b' };

  const allBull = dirs.length >= 2 && dirs.every((d) => d === 'bullish');
  const allBear = dirs.length >= 2 && dirs.every((d) => d === 'bearish');
  if (allBull) return { text: `${pair} BULL`, color: '#10b981' };
  if (allBear) return { text: `${pair} BEAR`, color: '#ef4444' };

  const shortTag = (d: BiasDirection | null) =>
    d === 'bullish' ? 'B' : d === 'bearish' ? 'S' : d === 'range' ? 'R' : '–';
  return {
    text: `${pair} ${shortTag(entry.biasDaily)}/${shortTag(entry.bias4h)}/${shortTag(entry.bias15m)}`,
    color: '#94a3b8',
  };
}

export function DailyBiasWidget() {
  const watchlistPairs = useSettingsStore((s) => s.settings.watchlistPairs);
  const selectedPair = useSettingsStore((s) => s.settings.selectedBiasPair);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const selectedDate = useDailyBiasStore((s) => s.selectedDate);
  const entriesByPair = useDailyBiasStore((s) => s.entriesByPair);
  const savingPair = useDailyBiasStore((s) => s.savingPair);
  const loadDate = useDailyBiasStore((s) => s.loadDate);
  const setDate = useDailyBiasStore((s) => s.setDate);
  const upsertBias = useDailyBiasStore((s) => s.upsertBias);
  const clearBias = useDailyBiasStore((s) => s.clearBias);

  const [addingPair, setAddingPair] = useState(false);
  const [newPairText, setNewPairText] = useState('');

  const entry = entriesByPair[selectedPair];

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

  return (
    <div className="space-y-2.5 text-[11px]">
      {/* Date Strip */}
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
          {selectedDate !== todayNy && (
            <button
              type="button"
              onClick={() => void setDate(todayNy)}
              className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300 hover:bg-blue-500/25"
            >
              Today
            </button>
          )}
          {entry && (
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

      {/* D1 / H4 / H1 Directional Bias Matrix */}
      <div className="space-y-1 rounded-md border border-slate-800 bg-slate-950/60 p-2">
        {tfRows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-2">
            <span className="w-7 font-mono text-[10px] font-semibold text-slate-400">
              {row.label}
            </span>
            <div className="grid flex-1 grid-cols-3 gap-1">
              <button
                type="button"
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
    </div>
  );
}
