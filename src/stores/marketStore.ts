import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { tauriBridge } from '../services/tauriBridge';
import type {
  EconomicEventItem,
  FetchMetadataEntry,
  ManualEventPayload,
  NewsArticleItem,
  RssFeedSource,
  UpsertRssFeedPayload,
} from '../types/market';

interface MarketState {
  events: EconomicEventItem[];
  news: NewsArticleItem[];
  rssFeeds: RssFeedSource[];
  metadata: FetchMetadataEntry[];
  loading: boolean;
  syncing: boolean;

  loadMarketData: () => Promise<void>;
  refreshMarketSync: (force?: boolean) => Promise<void>;
  addManualEvent: (payload: ManualEventPayload) => Promise<EconomicEventItem>;
  deleteManualEvent: (id: string) => Promise<void>;
  saveRssFeed: (payload: UpsertRssFeedPayload) => Promise<RssFeedSource>;
  deleteRssFeed: (id: string) => Promise<void>;
}

export const useMarketStore = create<MarketState>()(
  immer((set, get) => ({
    events: [],
    news: [],
    rssFeeds: [],
    metadata: [],
    loading: false,
    syncing: false,

    loadMarketData: async () => {
      set((s) => {
        s.loading = true;
      });
      try {
        const [events, news, rssFeeds, metadata] = await Promise.all([
          tauriBridge.getEconomicEvents(),
          tauriBridge.getNewsItems({ limit: 120 }),
          tauriBridge.listRssFeeds(),
          tauriBridge.getFetchMetadata(),
        ]);
        set((s) => {
          s.events = events;
          s.news = news;
          s.rssFeeds = rssFeeds;
          s.metadata = metadata;
          s.loading = false;
        });
      } catch {
        set((s) => {
          s.loading = false;
        });
      }
    },

    refreshMarketSync: async (force = false) => {
      set((s) => {
        s.syncing = true;
      });
      try {
        await tauriBridge.triggerMarketSync(force);
        await get().loadMarketData();
      } finally {
        set((s) => {
          s.syncing = false;
        });
      }
    },

    addManualEvent: async (payload) => {
      const created = await tauriBridge.addManualEconomicEvent(payload);
      await get().loadMarketData();
      return created;
    },

    deleteManualEvent: async (id) => {
      await tauriBridge.deleteEconomicEvent(id);
      await get().loadMarketData();
    },

    saveRssFeed: async (payload) => {
      const saved = await tauriBridge.upsertRssFeed(payload);
      await get().loadMarketData();
      return saved;
    },

    deleteRssFeed: async (id) => {
      await tauriBridge.deleteRssFeed(id);
      await get().loadMarketData();
    },
  })),
);
