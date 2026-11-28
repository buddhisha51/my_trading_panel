import { tauriBridge } from './tauriBridge';
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
  listAccountProfiles(): Promise<AccountProfile[]>;
  getAccountProfile(accountId?: string): Promise<AccountProfile>;
  createAccountProfile(payload: CreateAccountProfilePayload): Promise<AccountProfile>;
  updateAccountProfile(payload: UpdateAccountProfilePayload): Promise<AccountProfile>;
  deleteAccountProfile(accountId: string, forceCascade?: boolean): Promise<void>;
  listTrades(accountId?: string): Promise<TradeRecord[]>;
  recordManualTrade(payload: UpsertTradePayload): Promise<TradeRecord>;
  importTradesCsvRows(accountId: string, rows: UpsertTradePayload[]): Promise<CsvImportSummary>;
  deleteTrade(id: string): Promise<void>;
  listOngoingTrades(accountId?: string): Promise<OngoingTradeRecord[]>;
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
  listEquitySnapshots(accountId?: string): Promise<EquitySnapshotRecord[]>;
  recordEquitySnapshot(payload: UpsertEquitySnapshotPayload): Promise<EquitySnapshotRecord>;
}

export class ManualTradeIngestionService implements ITradeIngestionService {
  readonly sourceName = 'Manual Journal';

  async listAccountProfiles(): Promise<AccountProfile[]> {
    return tauriBridge.listAccountProfiles();
  }

  async getAccountProfile(accountId = 'default'): Promise<AccountProfile> {
    return tauriBridge.getAccountProfile(accountId);
  }

  async createAccountProfile(payload: CreateAccountProfilePayload): Promise<AccountProfile> {
    return tauriBridge.createAccountProfile(payload);
  }

  async updateAccountProfile(payload: UpdateAccountProfilePayload): Promise<AccountProfile> {
    return tauriBridge.updateAccountProfile(payload);
  }

  async deleteAccountProfile(accountId: string, forceCascade = false): Promise<void> {
    return tauriBridge.deleteAccountProfile(accountId, forceCascade);
  }

  async listTrades(accountId = 'default'): Promise<TradeRecord[]> {
    return tauriBridge.listTrades(accountId);
  }

  async recordManualTrade(payload: UpsertTradePayload): Promise<TradeRecord> {
    return tauriBridge.upsertTrade(payload);
  }

  async importTradesCsvRows(
    accountId: string,
    rows: UpsertTradePayload[],
  ): Promise<CsvImportSummary> {
    return tauriBridge.importTradesCsvRows(accountId, rows);
  }

  async deleteTrade(id: string): Promise<void> {
    return tauriBridge.deleteTrade(id);
  }

  async listOngoingTrades(accountId = 'default'): Promise<OngoingTradeRecord[]> {
    return tauriBridge.listOngoingTrades(accountId);
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
      accountId: trade.accountId,
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
      accountId: trade.accountId,
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

  async listEquitySnapshots(accountId = 'default'): Promise<EquitySnapshotRecord[]> {
    return tauriBridge.listEquitySnapshots(accountId);
  }

  async recordEquitySnapshot(
    payload: UpsertEquitySnapshotPayload,
  ): Promise<EquitySnapshotRecord> {
    return tauriBridge.upsertEquitySnapshot(payload);
  }
}

export const tradeIngestionService: ITradeIngestionService =
  new ManualTradeIngestionService();
