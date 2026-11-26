import { DateTime } from 'luxon';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { tradeIngestionService } from '../services/tradeIngestionService';
import type {
  AccountProfile,
  CloseOngoingTradePayload,
  EquitySnapshotRecord,
  OngoingStatus,
  OngoingTradeRecord,
  TradeRecord,
  UpdateAccountProfilePayload,
  UpsertOngoingTradePayload,
  UpsertTradePayload,
} from '../types/journal';
import { computeAccountMetrics, type AccountMetrics } from '../utils/drawdownEngine';
import { getTodayNyDateString } from './dailyBiasStore';

const INITIAL_PROFILE: AccountProfile = {
  id: 'default',
  accountName: 'My Account',
  startingBalance: 0,
  currentBalance: 0,
  highWaterMark: 0,
  currency: 'USD',
  ddMode: 'static',
  dailyDdLimit: 5,
  maxDdLimit: 10,
  updatedAt: '',
};

interface JournalState {
  profile: AccountProfile;
  trades: TradeRecord[];
  ongoingTrades: OngoingTradeRecord[];
  snapshots: EquitySnapshotRecord[];
  metrics: AccountMetrics;
  loading: boolean;
  saving: boolean;

  hydrateJournal: () => Promise<void>;
  updateProfile: (payload: UpdateAccountProfilePayload) => Promise<AccountProfile>;
  recordTrade: (payload: UpsertTradePayload) => Promise<TradeRecord>;
  deleteTrade: (id: string) => Promise<void>;
  openOngoingTrade: (payload: UpsertOngoingTradePayload) => Promise<OngoingTradeRecord>;
  cycleOngoingStatus: (trade: OngoingTradeRecord) => Promise<void>;
  deleteOngoingTrade: (id: string) => Promise<void>;
  closeOngoingToJournal: (payload: CloseOngoingTradePayload) => Promise<TradeRecord>;
  saveTodaySnapshot: (notes?: string | null) => Promise<EquitySnapshotRecord>;
}

export const useJournalStore = create<JournalState>()(
  immer((set, get) => ({
    profile: INITIAL_PROFILE,
    trades: [],
    ongoingTrades: [],
    snapshots: [],
    metrics: computeAccountMetrics(INITIAL_PROFILE, []),
    loading: false,
    saving: false,

    hydrateJournal: async () => {
      set((s) => {
        s.loading = true;
      });
      try {
        const [profile, trades, ongoingTrades, snapshots] = await Promise.all([
          tradeIngestionService.getAccountProfile(),
          tradeIngestionService.listTrades(),
          tradeIngestionService.listOngoingTrades(),
          tradeIngestionService.listEquitySnapshots(),
        ]);
        const metrics = computeAccountMetrics(profile, trades);
        set((s) => {
          s.profile = profile;
          s.trades = trades;
          s.ongoingTrades = ongoingTrades;
          s.snapshots = snapshots;
          s.metrics = metrics;
          s.loading = false;
        });
      } catch {
        set((s) => {
          s.loading = false;
        });
      }
    },

    updateProfile: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const updated = await tradeIngestionService.updateAccountProfile(payload);
        const metrics = computeAccountMetrics(updated, get().trades);
        set((s) => {
          s.profile = updated;
          s.metrics = metrics;
        });
        return updated;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    recordTrade: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const saved = await tradeIngestionService.recordManualTrade(payload);
        await get().hydrateJournal();
        return saved;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    deleteTrade: async (id) => {
      await tradeIngestionService.deleteTrade(id);
      await get().hydrateJournal();
    },

    openOngoingTrade: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const saved = await tradeIngestionService.openTrade(payload);
        await get().hydrateJournal();
        return saved;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    cycleOngoingStatus: async (trade) => {
      const order: OngoingStatus[] = ['running', 'moved_to_be', 'partials_taken', 'pending'];
      const next = order[(order.indexOf(trade.status) + 1) % order.length];
      await tradeIngestionService.updateOngoingStatus(trade, next);
      await get().hydrateJournal();
    },

    deleteOngoingTrade: async (id) => {
      await tradeIngestionService.deleteOngoingTrade(id);
      await get().hydrateJournal();
    },

    closeOngoingToJournal: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const closed = await tradeIngestionService.closeOngoingToJournal(payload);
        await get().hydrateJournal();
        return closed;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    saveTodaySnapshot: async (notes = null) => {
      const m = get().metrics;
      const snap = await tradeIngestionService.recordEquitySnapshot({
        date: getTodayNyDateString(DateTime.utc()),
        balance: m.currentBalance,
        dailyPnl: m.dailyPnl,
        dailyDrawdown: m.dailyDrawdownPct,
        maxDrawdown: m.maxDrawdownPct,
        winCount: m.winCount,
        lossCount: m.lossCount,
        notes,
      });
      await get().hydrateJournal();
      return snap;
    },
  })),
);
