import { tauriBridge } from './tauriBridge';
import type {
  AccountProfile,
  CloseOngoingTradePayload,
  EquitySnapshotRecord,
  OngoingStatus,
  OngoingTradeRecord,
  TradeRecord,
  UpdateAccountProfilePayload,
  UpsertEquitySnapshotPayload,
  UpsertOngoingTradePayload,
  UpsertTradePayload,
} from '../types/journal';

/**
 * Broker/trade ingestion boundary (§1 Approved Decisions #4).
 * v1 binds manually via `ManualTradeIngestionService`; a future MetaTrader 5 / cTrader bridge
 * can swap or compose this interface without changing UI or analytics consumers.
 */
export interface ITradeIngestionService {
  readonly sourceName: string;
  getAccountProfile(): Promise<AccountProfile>;
  updateAccountProfile(payload: UpdateAccountProfilePayload): Promise<AccountProfile>;
  listTrades(): Promise<TradeRecord[]>;
  recordManualTrade(payload: UpsertTradePayload): Promise<TradeRecord>;
  deleteTrade(id: string): Promise<void>;
  listOngoingTrades(): Promise<OngoingTradeRecord[]>;
  openTrade(payload: UpsertOngoingTradePayload): Promise<OngoingTradeRecord>;
  updateOngoingStatus(
    trade: OngoingTradeRecord,
    status: OngoingStatus,
  ): Promise<OngoingTradeRecord>;
  updateOngoingRisk(
    trade: OngoingTradeRecord,
    patch: { stopLoss: number | null; takeProfit: number | null },
  ): Promise<OngoingTradeRecord>;
  deleteOngoingTrade(id: string): Promise<void>;
  closeOngoingToJournal(payload: CloseOngoingTradePayload): Promise<TradeRecord>;
  listEquitySnapshots(): Promise<EquitySnapshotRecord[]>;
  recordEquitySnapshot(payload: UpsertEquitySnapshotPayload): Promise<EquitySnapshotRecord>;
}

export class ManualTradeIngestionService implements ITradeIngestionService {
  readonly sourceName = 'Manual Journal';

  async getAccountProfile(): Promise<AccountProfile> {
    return tauriBridge.getAccountProfile();
  }

  async updateAccountProfile(payload: UpdateAccountProfilePayload): Promise<AccountProfile> {
    return tauriBridge.updateAccountProfile(payload);
  }

  async listTrades(): Promise<TradeRecord[]> {
    return tauriBridge.listTrades();
  }

  async recordManualTrade(payload: UpsertTradePayload): Promise<TradeRecord> {
    return tauriBridge.upsertTrade(payload);
  }

  async deleteTrade(id: string): Promise<void> {
    return tauriBridge.deleteTrade(id);
  }

  async listOngoingTrades(): Promise<OngoingTradeRecord[]> {
    return tauriBridge.listOngoingTrades();
  }

  async openTrade(payload: UpsertOngoingTradePayload): Promise<OngoingTradeRecord> {
    return tauriBridge.upsertOngoingTrade(payload);
  }

  async updateOngoingStatus(
    trade: OngoingTradeRecord,
    status: OngoingStatus,
  ): Promise<OngoingTradeRecord> {
    return tauriBridge.upsertOngoingTrade({
      id: trade.id,
      pair: trade.pair,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      lotSize: trade.lotSize,
      status,
      notes: trade.notes,
      strategyId: trade.strategyId,
      openedAt: trade.openedAt,
    });
  }

  async updateOngoingRisk(
    trade: OngoingTradeRecord,
    patch: { stopLoss: number | null; takeProfit: number | null },
  ): Promise<OngoingTradeRecord> {
    return tauriBridge.upsertOngoingTrade({
      id: trade.id,
      pair: trade.pair,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      stopLoss: patch.stopLoss,
      takeProfit: patch.takeProfit,
      lotSize: trade.lotSize,
      status: trade.status,
      notes: trade.notes,
      strategyId: trade.strategyId,
      openedAt: trade.openedAt,
    });
  }

  async deleteOngoingTrade(id: string): Promise<void> {
    return tauriBridge.deleteOngoingTrade(id);
  }

  async closeOngoingToJournal(payload: CloseOngoingTradePayload): Promise<TradeRecord> {
    return tauriBridge.closeOngoingToJournal(payload);
  }

  async listEquitySnapshots(): Promise<EquitySnapshotRecord[]> {
    return tauriBridge.listEquitySnapshots();
  }

  async recordEquitySnapshot(
    payload: UpsertEquitySnapshotPayload,
  ): Promise<EquitySnapshotRecord> {
    return tauriBridge.upsertEquitySnapshot(payload);
  }
}

export const tradeIngestionService: ITradeIngestionService =
  new ManualTradeIngestionService();
