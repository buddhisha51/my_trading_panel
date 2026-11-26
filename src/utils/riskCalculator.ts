import {
  DEFAULT_CONVERSION_RATES,
  type ConversionRates,
  type InstrumentSpec,
  type RiskCalculatorInput,
  type RiskCalculatorResult,
} from '../types/risk';

/**
 * Computes the effective USD dollar value of 1 tick/pip per 1.00 standard lot.
 * Handles USD-quote FX, USD-base FX (`USDCAD`, `USDCHF`), JPY crosses (`USDJPY`, `EURJPY`, `GBPJPY`),
 * cross pairs (`EURGBP`), metals (`XAUUSD`), indices (`NAS100`, `US30`, `SPX500`), and custom broker specs.
 */
export function computeEffectiveTickValuePerLot(
  spec: InstrumentSpec,
  entryPrice: number | null,
  rates: Partial<ConversionRates> = {},
): number {
  const resolved: ConversionRates = { ...DEFAULT_CONVERSION_RATES, ...rates };
  const safeEntry = entryPrice && entryPrice > 0 ? entryPrice : null;

  switch (spec.conversionMode) {
    case 'fixed_usd':
      return spec.tickValuePerLot;
    case 'inverse_entry': {
      if (spec.symbol.endsWith('JPY')) {
        const denom = safeEntry ?? resolved.usdJpy;
        return spec.tickValuePerLot / Math.max(1, denom);
      }
      if (spec.symbol.endsWith('CAD')) {
        const denom = safeEntry ?? resolved.usdCad;
        return spec.tickValuePerLot / Math.max(0.1, denom);
      }
      if (spec.symbol.endsWith('CHF')) {
        const denom = safeEntry ?? resolved.usdChf;
        return spec.tickValuePerLot / Math.max(0.1, denom);
      }
      return spec.tickValuePerLot / Math.max(0.0001, safeEntry ?? 1);
    }
    case 'inverse_usdjpy':
      return spec.tickValuePerLot / Math.max(1, resolved.usdJpy);
    case 'inverse_usdcad':
      return spec.tickValuePerLot / Math.max(0.1, resolved.usdCad);
    case 'inverse_usdchf':
      return spec.tickValuePerLot / Math.max(0.1, resolved.usdChf);
    case 'multiply_gbpusd':
      return spec.tickValuePerLot * Math.max(0.1, resolved.gbpUsd);
  }
}

export function calculatePositionSize(
  input: RiskCalculatorInput,
): RiskCalculatorResult {
  const {
    equity,
    riskMode,
    riskPercent,
    riskDollars,
    entryPrice,
    stopLoss,
    takeProfit,
    spec,
    conversionRates,
  } = input;

  const effectiveTickValuePerLot = computeEffectiveTickValuePerLot(
    spec,
    entryPrice,
    conversionRates,
  );

  const emptyBase: Omit<RiskCalculatorResult, 'valid' | 'error'> = {
    warning: null,
    direction: null,
    riskDollars: 0,
    riskPercent: 0,
    effectiveTickValuePerLot,
    slPriceDelta: 0,
    slTicks: 0,
    rawLotSize: 0,
    roundedLotSize: 0,
    tpPriceDelta: null,
    tpTicks: null,
    rewardDollars: null,
    rrRatio: null,
    rMultiple: null,
  };

  if (!Number.isFinite(equity) || equity <= 0) {
    return { ...emptyBase, valid: false, error: 'Enter positive account equity.' };
  }

  const computedRiskDollars =
    riskMode === 'percent' ? equity * (riskPercent / 100) : riskDollars;
  const computedRiskPercent =
    riskMode === 'percent' ? riskPercent : (riskDollars / equity) * 100;

  if (!Number.isFinite(computedRiskDollars) || computedRiskDollars <= 0) {
    return { ...emptyBase, valid: false, error: 'Risk amount must be greater than $0.' };
  }

  if (
    entryPrice === null ||
    stopLoss === null ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopLoss) ||
    entryPrice <= 0 ||
    stopLoss <= 0
  ) {
    return {
      ...emptyBase,
      riskDollars: computedRiskDollars,
      riskPercent: computedRiskPercent,
      valid: false,
      error: 'Enter valid Entry and Stop Loss prices.',
    };
  }

  const slPriceDelta = Math.abs(entryPrice - stopLoss);
  if (slPriceDelta <= 0 || spec.tickSize <= 0) {
    return {
      ...emptyBase,
      riskDollars: computedRiskDollars,
      riskPercent: computedRiskPercent,
      valid: false,
      error: 'Stop Loss must differ from Entry price.',
    };
  }

  const direction: 'long' | 'short' = entryPrice > stopLoss ? 'long' : 'short';
  const slTicks = slPriceDelta / spec.tickSize;
  const riskPerStandardLot = slTicks * effectiveTickValuePerLot;

  if (!Number.isFinite(riskPerStandardLot) || riskPerStandardLot <= 0) {
    return {
      ...emptyBase,
      valid: false,
      error: 'Invalid instrument tick specification.',
    };
  }

  const rawLotSize = computedRiskDollars / riskPerStandardLot;
  // Tiny 1e-9 epsilon prevents IEEE-754 ULP drift (e.g. 0.8999999999999999) from dropping 0.90 -> 0.89.
  const roundedLotSize = Math.floor(rawLotSize * 100 + 1e-9) / 100;

  let warning: string | null = null;
  if (roundedLotSize < 0.01) {
    warning = 'Below 0.01 micro-lot minimum — reduce SL distance or increase risk.';
  } else if (computedRiskPercent > 3) {
    warning = `High single-trade risk (${computedRiskPercent.toFixed(1)}% of equity).`;
  }

  let tpPriceDelta: number | null = null;
  let tpTicks: number | null = null;
  let rewardDollars: number | null = null;
  let rrRatio: number | null = null;
  let rMultiple: number | null = null;

  if (takeProfit !== null && Number.isFinite(takeProfit) && takeProfit > 0) {
    const validTpSide =
      direction === 'long' ? takeProfit > entryPrice : takeProfit < entryPrice;
    if (!validTpSide) {
      warning =
        direction === 'long'
          ? 'Long setup expects Take Profit above Entry.'
          : 'Short setup expects Take Profit below Entry.';
    } else {
      tpPriceDelta = Math.abs(takeProfit - entryPrice);
      tpTicks = tpPriceDelta / spec.tickSize;
      rMultiple = tpPriceDelta / slPriceDelta;
      rrRatio = rMultiple;
      rewardDollars = rawLotSize * tpTicks * effectiveTickValuePerLot;
    }
  }

  return {
    valid: true,
    error: null,
    warning,
    direction,
    riskDollars: computedRiskDollars,
    riskPercent: computedRiskPercent,
    effectiveTickValuePerLot,
    slPriceDelta,
    slTicks,
    rawLotSize,
    roundedLotSize,
    tpPriceDelta,
    tpTicks,
    rewardDollars,
    rrRatio,
    rMultiple,
  };
}

export function suggestTakeProfitForR(
  entryPrice: number,
  stopLoss: number,
  rTarget: number,
  decimals: number,
): number | null {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss) || entryPrice === stopLoss) {
    return null;
  }
  const delta = Math.abs(entryPrice - stopLoss) * rTarget;
  const tp = entryPrice > stopLoss ? entryPrice + delta : entryPrice - delta;
  if (tp <= 0) return null;
  const safeDecimals = Math.max(0, Math.min(8, Math.round(decimals)));
  return Number(tp.toFixed(safeDecimals));
}

/**
 * Pluralizes unit names cleanly (e.g. `tick ($0.01)` -> `ticks ($0.01)`, `pip` -> `pips`).
 */
export function formatTickPlural(tickLabel: string, count: number): string {
  const isSingular = Math.abs(count - 1) < 1e-6;
  if (isSingular) return tickLabel;
  if (tickLabel.startsWith('tick (')) {
    return tickLabel.replace(/^tick \(/, 'ticks (');
  }
  if (tickLabel.endsWith('s')) return tickLabel;
  return `${tickLabel}s`;
}
