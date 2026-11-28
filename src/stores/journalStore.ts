import { DateTime } from 'luxon';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { tradeIngestionService } from '../services/tradeIngestionService';
import type {
  AccountProfile,
  CloseOngoingTradePayload,
  CreateAccountProfilePayload,
  CsvImportSummary,
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
import { useSettingsStore } from './settingsStore';

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
  activeAccountId: string;
  profiles: AccountProfile[];
  profile: AccountProfile;
  trades: TradeRecord[];
  ongoingTrades: OngoingTradeRecord[];
  snapshots: EquitySnapshotRecord[];
  metrics: AccountMetrics;
  loading: boolean;
  saving: boolean;

  hydrateJournal: (accountId?: string) => Promise<void>;
  switchAccount: (accountId: string) => Promise<void>;
  createAccountProfile: (payload: CreateAccountProfilePayload) => Promise<AccountProfile>;
  updateProfile: (payload: UpdateAccountProfilePayload) => Promise<AccountProfile>;
  deleteAccountProfile: (accountId: string, forceCascade?: boolean) => Promise<void>;
  recordTrade: (payload: UpsertTradePayload) => Promise<TradeRecord>;
  importTradesCsvRows: (rows: UpsertTradePayload[]) => Promise<CsvImportSummary>;
  deleteTrade: (id: string) => Promise<void>;
  openOngoingTrade: (payload: UpsertOngoingTradePayload) => Promise<OngoingTradeRecord>;
  cycleOngoingStatus: (trade: OngoingTradeRecord) => Promise<void>;
  updateOngoingRisk: (
    trade: OngoingTradeRecord,
    patch: { stopLoss: number | null; takeProfit: number | null },
  ) => Promise<void>;
  deleteOngoingTrade: (id: string) => Promise<void>;
  closeOngoingToJournal: (payload: CloseOngoingTradePayload) => Promise<TradeRecord>;
  saveTodaySnapshot: (notes?: string | null) => Promise<EquitySnapshotRecord>;
}

export const useJournalStore = create<JournalState>()(
  immer((set, get) => ({
    activeAccountId: 'default',
    profiles: [INITIAL_PROFILE],
    profile: INITIAL_PROFILE,
    trades: [],
    ongoingTrades: [],
    snapshots: [],
    metrics: computeAccountMetrics(INITIAL_PROFILE, []),
    loading: false,
    saving: false,

    hydrateJournal: async (explicitAccountId) => {
      set((s) => {
        s.loading = true;
      });
      try {
        const preferredId =
          explicitAccountId ||
          useSettingsStore.getState().settings.activeAccountId ||
          get().activeAccountId ||
          'default';

        const profiles = await tradeIngestionService.listAccountProfiles();
        const activeProfile =
          profiles.find((p) => p.id === preferredId) ??
          profiles.find((p) => p.id === 'default') ??
          profiles[0] ??
          INITIAL_PROFILE;
        const resolvedId = activeProfile.id || 'default';

        const [trades, ongoingTrades, snapshots] = await Promise.all([
          tradeIngestionService.listTrades(resolvedId),
          tradeIngestionService.listOngoingTrades(resolvedId),
          tradeIngestionService.listEquitySnapshots(resolvedId),
        ]);
        const metrics = computeAccountMetrics(activeProfile, trades);
        set((s) => {
          s.activeAccountId = resolvedId;
          s.profiles = profiles;
          s.profile = activeProfile;
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

    switchAccount: async (accountId) => {
      const target = accountId || 'default';
      await useSettingsStore.getState().updateSettings({ activeAccountId: target });
      await get().hydrateJournal(target);
    },

    createAccountProfile: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const created = await tradeIngestionService.createAccountProfile(payload);
        await useSettingsStore.getState().updateSettings({ activeAccountId: created.id });
        await get().hydrateJournal(created.id);
        return created;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    updateProfile: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const accId = payload.id || get().activeAccountId || 'default';
        const updated = await tradeIngestionService.updateAccountProfile({
          ...payload,
          id: accId,
        });
        const metrics = computeAccountMetrics(updated, get().trades);
        set((s) => {
          s.profile = updated;
          s.profiles = s.profiles.map((p) => (p.id === updated.id ? updated : p));
          s.metrics = metrics;
        });
        return updated;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    deleteAccountProfile: async (accountId, forceCascade = false) => {
      await tradeIngestionService.deleteAccountProfile(accountId, forceCascade);
      const nextId = get().activeAccountId === accountId ? 'default' : get().activeAccountId;
      await useSettingsStore.getState().updateSettings({ activeAccountId: nextId });
      await get().hydrateJournal(nextId);
    },

    recordTrade: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const accId = payload.accountId || get().activeAccountId || 'default';
        const saved = await tradeIngestionService.recordManualTrade({
          ...payload,
          accountId: accId,
        });
        await get().hydrateJournal(accId);
        return saved;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    importTradesCsvRows: async (rows) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const accId = get().activeAccountId || 'default';
        const summary = await tradeIngestionService.importTradesCsvRows(accId, rows);
        await get().hydrateJournal(accId);
        return summary;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    deleteTrade: async (id) => {
      await tradeIngestionService.deleteTrade(id);
      await get().hydrateJournal(get().activeAccountId);
    },

    openOngoingTrade: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const accId = payload.accountId || get().activeAccountId || 'default';
        const saved = await tradeIngestionService.openTrade({
          ...payload,
          accountId: accId,
        });
        await get().hydrateJournal(accId);
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
      await get().hydrateJournal(get().activeAccountId);
    },

    updateOngoingRisk: async (trade, patch) => {
      set((s) => {
        s.saving = true;
      });
      try {
        await tradeIngestionService.updateOngoingRisk(trade, patch);
        await get().hydrateJournal(get().activeAccountId);
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    deleteOngoingTrade: async (id) => {
      await tradeIngestionService.deleteOngoingTrade(id);
      await get().hydrateJournal(get().activeAccountId);
    },

    closeOngoingToJournal: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const closed = await tradeIngestionService.closeOngoingToJournal(payload);
        await get().hydrateJournal(get().activeAccountId);
        return closed;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    saveTodaySnapshot: async (notes = null) => {
      const accId = get().activeAccountId || 'default';
      const m = get().metrics;
      const snap = await tradeIngestionService.recordEquitySnapshot({
        accountId: accId,
        date: getTodayNyDateString(DateTime.utc()),
        balance: m.currentBalance,
        dailyPnl: m.dailyPnl,
        dailyDrawdown: m.dailyDrawdownPct,
        maxDrawdown: m.maxDrawdownPct,
        winCount: m.winCount,
        lossCount: m.lossCount,
        notes,
      });
      await get().hydrateJournal(accId);
      return snap;
    },
  })),
);
