import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { tauriBridge } from '../services/tauriBridge';
import type {
  AttachmentItem,
  StrategyItem,
  UpsertStrategyPayload,
} from '../types/notes';

interface StrategiesState {
  strategies: StrategyItem[];
  loading: boolean;
  saving: boolean;
  /** Runtime live execution checklist state keyed by strategyId -> checked rule IDs */
  checkedRuleIdsByStrategy: Record<string, string[]>;
  attachmentsByStrategyId: Record<string, AttachmentItem[]>;

  loadStrategies: () => Promise<void>;
  saveStrategy: (payload: UpsertStrategyPayload) => Promise<StrategyItem>;
  deleteStrategy: (id: string) => Promise<void>;
  toggleChecklistExecution: (strategyId: string, ruleId: string) => void;
  resetChecklistExecution: (strategyId: string) => void;
  loadStrategyAttachments: (strategyId: string) => Promise<AttachmentItem[]>;
  attachFileToStrategy: (
    strategyDraft: UpsertStrategyPayload & { id: string },
    fileBytes: number[],
    mimeType: string,
  ) => Promise<AttachmentItem>;
  removeStrategyAttachment: (strategyId: string, attachmentId: string) => Promise<void>;
}

export const useStrategiesStore = create<StrategiesState>()(
  immer((set, get) => ({
    strategies: [],
    loading: false,
    saving: false,
    checkedRuleIdsByStrategy: {},
    attachmentsByStrategyId: {},

    loadStrategies: async () => {
      set((s) => {
        s.loading = true;
      });
      try {
        const list = await tauriBridge.listStrategies();
        const attachmentEntries = await Promise.all(
          list.map(async (st) => {
            try {
              const items = await tauriBridge.listAttachments('strategies', st.id);
              return [st.id, items] as const;
            } catch {
              return [st.id, [] as AttachmentItem[]] as const;
            }
          }),
        );
        set((s) => {
          s.strategies = list;
          for (const [strategyId, items] of attachmentEntries) {
            s.attachmentsByStrategyId[strategyId] = items;
          }
          s.loading = false;
        });
      } catch {
        set((s) => {
          s.loading = false;
        });
      }
    },

    saveStrategy: async (payload) => {
      set((s) => {
        s.saving = true;
      });
      try {
        const saved = await tauriBridge.upsertStrategy(payload);
        await get().loadStrategies();
        return saved;
      } finally {
        set((s) => {
          s.saving = false;
        });
      }
    },

    deleteStrategy: async (id) => {
      await tauriBridge.deleteStrategy(id);
      set((s) => {
        s.strategies = s.strategies.filter((st) => st.id !== id);
        delete s.checkedRuleIdsByStrategy[id];
        delete s.attachmentsByStrategyId[id];
      });
    },

    toggleChecklistExecution: (strategyId, ruleId) => {
      set((s) => {
        const current = new Set(s.checkedRuleIdsByStrategy[strategyId] ?? []);
        if (current.has(ruleId)) current.delete(ruleId);
        else current.add(ruleId);
        s.checkedRuleIdsByStrategy[strategyId] = Array.from(current);
      });
    },

    resetChecklistExecution: (strategyId) => {
      set((s) => {
        s.checkedRuleIdsByStrategy[strategyId] = [];
      });
    },

    loadStrategyAttachments: async (strategyId) => {
      const list = await tauriBridge.listAttachments('strategies', strategyId);
      set((s) => {
        s.attachmentsByStrategyId[strategyId] = list;
      });
      return list;
    },

    attachFileToStrategy: async (strategyDraft, fileBytes, mimeType) => {
      if (!get().strategies.some((st) => st.id === strategyDraft.id)) {
        await get().saveStrategy(strategyDraft);
      }
      const saved = await tauriBridge.saveAttachment({
        ownerType: 'strategies',
        ownerId: strategyDraft.id,
        bytes: fileBytes,
        mimeType,
      });
      set((s) => {
        const cur = s.attachmentsByStrategyId[strategyDraft.id] ?? [];
        s.attachmentsByStrategyId[strategyDraft.id] = [saved, ...cur];
      });
      return saved;
    },

    removeStrategyAttachment: async (strategyId, attachmentId) => {
      await tauriBridge.deleteAttachment('strategies', attachmentId);
      set((s) => {
        const cur = s.attachmentsByStrategyId[strategyId] ?? [];
        s.attachmentsByStrategyId[strategyId] = cur.filter((a) => a.id !== attachmentId);
      });
    },
  })),
);
