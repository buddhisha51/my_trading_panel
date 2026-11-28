import type { DrawdownMode } from './settings';
import type { SetupGrade } from '../utils/strategyGrade';

export type TradeDirection = 'long' | 'short';
export type TradeOutcome = 'win' | 'loss' | 'breakeven' | 'partial';
export type OngoingStatus = 'running' | 'moved_to_be' | 'partials_taken' | 'pending';

export interface ChecklistSnapshotItem {
  id: string;
  name: string;
  checked: boolean;
  isRequired: boolean;
}

export interface TradeRecord {
  id: string;
  accountId?: string;
  pair: string;
  direction: TradeDirection;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  lotSize: number | null;
  outcome: TradeOutcome | null;
  pnlDollars: number | null;
  rMultiple: number | null;
  strategyId: string | null;
  notes: string | null;
  screenshotPath: string | null;
  checklistSnapshot: string | null;
  setupGrade: SetupGrade | string | null;
  entryTime: string | null;
  exitTime: string | null;
  session: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTradePayload {
  id?: string;
  accountId?: string;
  pair: string;
  direction: TradeDirection;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  lotSize: number | null;
  outcome: TradeOutcome | null;
  pnlDollars: number | null;
  rMultiple: number | null;
  strategyId: string | null;
  notes: string | null;
  screenshotPath: string | null;
  checklistSnapshot: string | null;
  setupGrade: string | null;
  entryTime: string | null;
  exitTime: string | null;
  session: string | null;
}

export interface OngoingTradeRecord {
  id: string;
  accountId?: string;
  pair: string;
  direction: TradeDirection;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  lotSize: number | null;
  status: OngoingStatus;
  notes: string | null;
  strategyId: string | null;
  openedAt: string;
  updatedAt: string;
}

export interface UpsertOngoingTradePayload {
  id?: string;
  accountId?: string;
  pair: string;
  direction: TradeDirection;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  lotSize: number | null;
  status?: OngoingStatus;
  notes: string | null;
  strategyId: string | null;
  openedAt?: string | null;
}

export interface CloseOngoingTradePayload {
  ongoingId: string;
  outcome: TradeOutcome;
  pnlDollars: number;
  rMultiple: number | null;
  notes: string | null;
  screenshotPath: string | null;
  checklistSnapshot: string | null;
  setupGrade: string | null;
  exitTime: string | null;
  session: string | null;
}

export interface AccountProfile {
  id: string;
  accountName: string;
  startingBalance: number;
  currentBalance: number;
  highWaterMark: number;
  currency: string;
  ddMode: DrawdownMode;
  dailyDdLimit: number | null;
  maxDdLimit: number | null;
  updatedAt: string;
}

export interface UpdateAccountProfilePayload {
  id?: string;
  accountName: string;
  startingBalance: number;
  currency: string;
  ddMode: DrawdownMode;
  dailyDdLimit: number | null;
  maxDdLimit: number | null;
}

export interface CreateAccountProfilePayload {
  accountName: string;
  startingBalance: number;
  currency: string;
  ddMode: DrawdownMode;
  dailyDdLimit: number | null;
  maxDdLimit: number | null;
}

export interface CsvImportSummary {
  importedCount: number;
  skippedDuplicates: number;
  trades: TradeRecord[];
}

export interface EquitySnapshotRecord {
  id: string;
  accountId?: string;
  date: string;
  balance: number;
  dailyPnl: number;
  dailyDrawdown: number | null;
  maxDrawdown: number | null;
  winCount: number;
  lossCount: number;
  notes: string | null;
  createdAt: string;
}

export interface UpsertEquitySnapshotPayload {
  accountId?: string;
  date: string;
  balance: number;
  dailyPnl: number;
  dailyDrawdown: number | null;
  maxDrawdown: number | null;
  winCount: number;
  lossCount: number;
  notes: string | null;
}

export const PROP_FIRM_PRESETS: Array<{
  label: string;
  dailyDdLimit: number;
  maxDdLimit: number;
  ddMode: DrawdownMode;
}> = [
  { label: '5% / 10% Static', dailyDdLimit: 5, maxDdLimit: 10, ddMode: 'static' },
  { label: '5% / 10% Trailing', dailyDdLimit: 5, maxDdLimit: 10, ddMode: 'trailing' },
  { label: '4% / 8% Static', dailyDdLimit: 4, maxDdLimit: 8, ddMode: 'static' },
  { label: '3% / 6% Trailing', dailyDdLimit: 3, maxDdLimit: 6, ddMode: 'trailing' },
];
