import { DateTime } from 'luxon';
import type { AccountProfile, TradeOutcome, TradeRecord } from '../types/journal';
import { NY_ZONE } from './killzoneEngine';

/**
 * Enforces consistent PnL sign semantics:
 * - `loss` trades always reduce equity (`<= 0`, even if entered as a positive amount like `150`).
 * - `win` trades always add to equity (`>= 0`).
 * - `breakeven` / `partial` preserve explicit signs (so small fees `-5` or positive partials work).
 */
export function normalizeTradePnl(
  outcome: TradeOutcome | null | undefined,
  pnl: number | null | undefined,
): number | null {
  if (pnl === null || pnl === undefined || !Number.isFinite(pnl)) return null;
  if (outcome === 'loss') return pnl === 0 ? 0 : -Math.abs(pnl);
  if (outcome === 'win') return Math.abs(pnl);
  return pnl;
}

/**
 * Enforces consistent R-multiple sign semantics matching trade outcome.
 */
export function normalizeTradeR(
  outcome: TradeOutcome | null | undefined,
  rMultiple: number | null | undefined,
): number | null {
  if (rMultiple === null || rMultiple === undefined || !Number.isFinite(rMultiple)) return null;
  if (outcome === 'loss') return rMultiple === 0 ? 0 : -Math.abs(rMultiple);
  if (outcome === 'win') return Math.abs(rMultiple);
  return rMultiple;
}

export interface EquityPoint {
  index: number;
  label: string;
  balance: number;
  pnl: number;
}

export interface AccountMetrics {
  startingBalance: number;
  currentBalance: number;
  highWaterMark: number;
  netPnl: number;
  netReturnPct: number;
  dailyPnl: number;
  dailyDrawdownPct: number;
  maxDrawdownPct: number;
  dailyDdBreached: boolean;
  dailyDdWarning: boolean;
  maxDdBreached: boolean;
  maxDdWarning: boolean;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  partialCount: number;
  winRatePct: number;
  avgRMultiple: number | null;
  profitFactor: number | null;
  equityCurve: EquityPoint[];
}

function tradeTimestampKey(t: TradeRecord): string {
  return t.exitTime ?? t.entryTime ?? t.createdAt;
}

function tradeNyDate(t: TradeRecord): string | null {
  const raw = tradeTimestampKey(t);
  const dt = DateTime.fromISO(raw, { zone: 'utc' });
  if (!dt.isValid) {
    // SQLite datetime('now') produces 'YYYY-MM-DD HH:MM:SS' in UTC
    const sqlDt = DateTime.fromSQL(raw, { zone: 'utc' });
    return sqlDt.isValid ? sqlDt.setZone(NY_ZONE).toISODate() : null;
  }
  return dt.setZone(NY_ZONE).toISODate();
}

/**
 * Pure portfolio/drawdown analytics engine.
 * Computes running balance, trailing High-Water Mark, static vs trailing max drawdown,
 * NY-day daily drawdown, win rate, avg R, profit factor, and chronological equity curve points.
 */
export function computeAccountMetrics(
  profile: AccountProfile,
  trades: TradeRecord[],
  now: DateTime = DateTime.utc(),
): AccountMetrics {
  const startingBalance = Math.max(0, profile.startingBalance || 0);
  const todayNy = now.setZone(NY_ZONE).toISODate() ?? '';

  const sorted = [...trades].sort((a, b) =>
    tradeTimestampKey(a).localeCompare(tradeTimestampKey(b)),
  );

  let running = startingBalance;
  let peak = startingBalance;
  let worstTrailingDdPct = 0;
  let worstStaticDdPct = 0;

  let dailyPnl = 0;
  let winCount = 0;
  let lossCount = 0;
  let breakevenCount = 0;
  let partialCount = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let rSum = 0;
  let rCount = 0;

  const equityCurve: EquityPoint[] = [
    { index: 0, label: 'Start', balance: startingBalance, pnl: 0 },
  ];

  sorted.forEach((tr, idx) => {
    const pnl = normalizeTradePnl(tr.outcome, tr.pnlDollars) ?? 0;
    const normalizedR = normalizeTradeR(tr.outcome, tr.rMultiple);
    running += pnl;
    if (running > peak) {
      peak = running;
    }

    if (pnl > 0) grossProfit += pnl;
    else if (pnl < 0) grossLoss += Math.abs(pnl);

    if (tr.outcome === 'win') winCount += 1;
    else if (tr.outcome === 'loss') lossCount += 1;
    else if (tr.outcome === 'breakeven') breakevenCount += 1;
    else if (tr.outcome === 'partial') partialCount += 1;

    if (normalizedR !== null && Number.isFinite(normalizedR)) {
      rSum += normalizedR;
      rCount += 1;
    }

    if (tradeNyDate(tr) === todayNy) {
      dailyPnl += pnl;
    }

    if (peak > 0 && running < peak) {
      const dd = ((peak - running) / peak) * 100;
      if (dd > worstTrailingDdPct) worstTrailingDdPct = dd;
    }
    if (startingBalance > 0 && running < startingBalance) {
      const sdd = ((startingBalance - running) / startingBalance) * 100;
      if (sdd > worstStaticDdPct) worstStaticDdPct = sdd;
    }

    equityCurve.push({
      index: idx + 1,
      label: tr.pair,
      balance: running,
      pnl,
    });
  });

  const currentBalance = running;
  const highWaterMark = peak;
  const netPnl = currentBalance - startingBalance;
  const netReturnPct = startingBalance > 0 ? (netPnl / startingBalance) * 100 : 0;

  const dailyStartBalance = currentBalance - dailyPnl;
  const dailyDrawdownPct =
    dailyPnl < 0 && dailyStartBalance > 0
      ? (Math.abs(dailyPnl) / dailyStartBalance) * 100
      : 0;

  const currentTrailingDdPct =
    highWaterMark > 0 && currentBalance < highWaterMark
      ? ((highWaterMark - currentBalance) / highWaterMark) * 100
      : 0;
  const currentStaticDdPct =
    startingBalance > 0 && currentBalance < startingBalance
      ? ((startingBalance - currentBalance) / startingBalance) * 100
      : 0;

  const maxDrawdownPct =
    profile.ddMode === 'trailing'
      ? Math.max(currentTrailingDdPct, worstTrailingDdPct)
      : Math.max(currentStaticDdPct, worstStaticDdPct);

  const dailyDdLimit = profile.dailyDdLimit;
  const maxDdLimit = profile.maxDdLimit;

  const dailyDdBreached =
    dailyDdLimit !== null && dailyDdLimit > 0 && dailyDrawdownPct >= dailyDdLimit;
  const dailyDdWarning =
    dailyDdLimit !== null && dailyDdLimit > 0 && dailyDrawdownPct >= dailyDdLimit * 0.75;
  const maxDdBreached =
    maxDdLimit !== null && maxDdLimit > 0 && maxDrawdownPct >= maxDdLimit;
  const maxDdWarning =
    maxDdLimit !== null && maxDdLimit > 0 && maxDrawdownPct >= maxDdLimit * 0.75;

  const decidedCount = winCount + lossCount + partialCount + breakevenCount;
  const winRatePct = decidedCount > 0 ? ((winCount + partialCount) / decidedCount) * 100 : 0;
  const avgRMultiple = rCount > 0 ? rSum / rCount : null;
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null;

  return {
    startingBalance,
    currentBalance,
    highWaterMark,
    netPnl,
    netReturnPct,
    dailyPnl,
    dailyDrawdownPct,
    maxDrawdownPct,
    dailyDdBreached,
    dailyDdWarning,
    maxDdBreached,
    maxDdWarning,
    totalTrades: sorted.length,
    winCount,
    lossCount,
    breakevenCount,
    partialCount,
    winRatePct,
    avgRMultiple,
    profitFactor,
    equityCurve,
  };
}
