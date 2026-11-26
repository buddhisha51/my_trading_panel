import { DateTime } from 'luxon';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { tauriBridge } from '../services/tauriBridge';
import type { DailyBiasEntry, UpsertDailyBiasPayload } from '../types/dailyBias';
import { NY_ZONE } from '../utils/killzoneEngine';

export function getTodayNyDateString(now: DateTime = DateTime.utc()): string {
  return now.setZone(NY_ZONE).toISODate() ?? '2026-01-01';
}

interface DailyBiasState {
  selectedDate: string;
  entriesByPair: Record<string, DailyBiasEntry>;
  loading: boolean;
  savingPair: string | null;

  loadDate: (date: string) => Promise<void>;
  setDate: (date: string) => Promise<void>;
  upsertBias: (payload: UpsertDailyBiasPayload) => Promise<DailyBiasEntry>;
  clearBias: (pair: string, date: string) => Promise<void>;
}

export const useDailyBiasStore = create<DailyBiasState>()(
  immer((set, get) => ({
    selectedDate: getTodayNyDateString(),
    entriesByPair: {},
    loading: false,
    savingPair: null,

    loadDate: async (date) => {
      set((s) => {
        s.loading = true;
      });
      try {
        const rows = await tauriBridge.getDailyBiases(date);
        const map: Record<string, DailyBiasEntry> = {};
        for (const r of rows) {
          map[r.pair] = r;
        }
        set((s) => {
          s.entriesByPair = map;
          s.selectedDate = date;
          s.loading = false;
        });
      } catch {
        set((s) => {
          s.loading = false;
        });
      }
    },

    setDate: async (date) => {
      await get().loadDate(date);
    },

    upsertBias: async (payload) => {
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

    clearBias: async (pair, date) => {
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
