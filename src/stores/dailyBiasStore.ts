import { DateTime } from 'luxon';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { tauriBridge } from '../services/tauriBridge';
import type { BiasDirection, DailyBiasEntry, UpsertDailyBiasPayload } from '../types/dailyBias';
import { NY_ZONE } from '../utils/killzoneEngine';

export function getTodayNyDateString(now: DateTime = DateTime.utc()): string {
  return now.setZone(NY_ZONE).toISODate() ?? '2026-01-01';
}

function parseBiasDate(dateStr: string): DateTime {
  const parsed = DateTime.fromISO(dateStr, { zone: NY_ZONE });
  return parsed.isValid ? parsed : DateTime.utc().setZone(NY_ZONE);
}

/** ISO week key (`W:YYYY-MM-DD`, anchored to Monday of that week) for weekly bias scoping. */
export function getWeekBiasKey(dateStr: string): string {
  const monday = parseBiasDate(dateStr).startOf('week').toISODate() ?? dateStr;
  return `W:${monday}`;
}

/** Calendar month key (`M:YYYY-MM`) for monthly bias scoping. */
export function getMonthBiasKey(dateStr: string): string {
  return `M:${parseBiasDate(dateStr).toFormat('yyyy-MM')}`;
}

export function formatBiasPeriodMeta(dateStr: string): {
  weekRangeLabel: string;
  monthLabel: string;
} {
  const dt = parseBiasDate(dateStr);
  const mon = dt.startOf('week');
  const sun = dt.endOf('week');
  const weekRangeLabel = mon.hasSame(sun, 'month')
    ? `${mon.toFormat('MMM dd')}–${sun.toFormat('dd')}`
    : `${mon.toFormat('MMM dd')}–${sun.toFormat('MMM dd')}`;
  return {
    weekRangeLabel,
    monthLabel: dt.toFormat('MMM yyyy'),
  };
}

let activeLoadSeq = 0;

interface DailyBiasState {
  selectedDate: string;
  entriesByPair: Record<string, DailyBiasEntry>;
  weeklyByPair: Record<string, DailyBiasEntry>;
  monthlyByPair: Record<string, DailyBiasEntry>;
  loading: boolean;
  savingPair: string | null;

  loadDate: (date: string) => Promise<void>;
  setDate: (date: string) => Promise<void>;
  upsertBias: (payload: UpsertDailyBiasPayload) => Promise<DailyBiasEntry>;
  upsertPeriodBias: (
    scope: 'weekly' | 'monthly',
    pair: string,
    dir: BiasDirection | null,
  ) => Promise<DailyBiasEntry>;
  clearBias: (pair: string, date: string) => Promise<void>;
}

export const useDailyBiasStore = create<DailyBiasState>()(
  immer((set, get) => ({
    selectedDate: getTodayNyDateString(),
    entriesByPair: {},
    weeklyByPair: {},
    monthlyByPair: {},
    loading: false,
    savingPair: null,

    loadDate: async (date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const loadSeq = ++activeLoadSeq;
      const weekKey = getWeekBiasKey(date);
      const monthKey = getMonthBiasKey(date);

      set((s) => {
        s.selectedDate = date;
        s.loading = true;
      });
      try {
        const [dailyRows, weeklyRows, monthlyRows] = await Promise.all([
          tauriBridge.getDailyBiases(date),
          tauriBridge.getDailyBiases(weekKey),
          tauriBridge.getDailyBiases(monthKey),
        ]);
        if (loadSeq !== activeLoadSeq) return;

        const toMap = (rows: DailyBiasEntry[]) => {
          const map: Record<string, DailyBiasEntry> = {};
          for (const r of rows) map[r.pair] = r;
          return map;
        };

        set((s) => {
          s.entriesByPair = toMap(dailyRows);
          s.weeklyByPair = toMap(weeklyRows);
          s.monthlyByPair = toMap(monthlyRows);
          s.selectedDate = date;
          s.loading = false;
        });
      } catch {
        if (loadSeq === activeLoadSeq) {
          set((s) => {
            s.loading = false;
          });
        }
      }
    },

    setDate: async (date) => {
      await get().loadDate(date);
    },

    upsertBias: async (payload) => {
      activeLoadSeq += 1;
      const normPair = payload.pair.trim().toUpperCase();
      set((s) => {
        s.savingPair = normPair;
      });
      try {
        const saved = await tauriBridge.upsertDailyBias({
          ...payload,
          pair: normPair,
        });
        if (saved.date === get().selectedDate) {
          set((s) => {
            s.entriesByPair[normPair] = saved;
          });
        }
        return saved;
      } finally {
        set((s) => {
          s.savingPair = null;
        });
      }
    },

    upsertPeriodBias: async (scope, pair, dir) => {
      activeLoadSeq += 1;
      const normPair = pair.trim().toUpperCase();
      const selectedDate = get().selectedDate;
      const periodKey =
        scope === 'weekly' ? getWeekBiasKey(selectedDate) : getMonthBiasKey(selectedDate);
      const existing =
        scope === 'weekly' ? get().weeklyByPair[normPair] : get().monthlyByPair[normPair];

      set((s) => {
        s.savingPair = normPair;
      });
      try {
        const saved = await tauriBridge.upsertDailyBias({
          id: existing?.id,
          pair: normPair,
          date: periodKey,
          biasDaily: dir,
          bias4h: null,
          bias15m: null,
          pdh: null,
          pdl: null,
          asianHigh: null,
          asianLow: null,
          dolNotes: null,
        });
        const curDate = get().selectedDate;
        const expectedKey =
          scope === 'weekly' ? getWeekBiasKey(curDate) : getMonthBiasKey(curDate);
        if (saved.date === expectedKey) {
          set((s) => {
            if (scope === 'weekly') s.weeklyByPair[normPair] = saved;
            else s.monthlyByPair[normPair] = saved;
          });
        }
        return saved;
      } finally {
        set((s) => {
          s.savingPair = null;
        });
      }
    },

    clearBias: async (pair, date) => {
      activeLoadSeq += 1;
      const normPair = pair.trim().toUpperCase();
      await tauriBridge.deleteDailyBias(normPair, date);
      set((s) => {
        if (s.selectedDate === date) {
          delete s.entriesByPair[normPair];
        }
      });
    },
  })),
);
