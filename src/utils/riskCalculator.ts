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
    riskPerStandardLot: 0,
    minRiskForMicroLot: 0,
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
  const minRiskForMicroLot = riskPerStandardLot * 0.01;

  let warning: string | null = null;
  if (roundedLotSize < 0.01) {
    warning = `Exact size is ${rawLotSize.toFixed(4)} lots (< 0.01 min). Need >= $${minRiskForMicroLot.toFixed(2)} risk or tighter SL for 0.01 lots.`;
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
    riskPerStandardLot,
    minRiskForMicroLot,
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

/**
 * Derives nominal USD tick value for 1.00 lot from `contractSize * tickSize`
 * with quote currency adjustments where applicable.
 */
export function deriveTickValueFromSpec(
  contractSize: number,
  tickSize: number,
  spec: InstrumentSpec,
  rates: Partial<ConversionRates> = {},
): number {
  const base = Math.max(0, contractSize) * Math.max(0, tickSize);
  if (base <= 0) return spec.tickValuePerLot;
  const resolved: ConversionRates = { ...DEFAULT_CONVERSION_RATES, ...rates };
  if (spec.conversionMode === 'fixed_usd') return base;
  if (spec.conversionMode === 'inverse_entry' || spec.conversionMode === 'inverse_usdjpy') {
    return base; // stored nominal (e.g. 1000 JPY = 100,000 * 0.01) before USD division
  }
  if (spec.conversionMode === 'multiply_gbpusd') {
    return base; // stored GBP nominal before GBPUSD multiply
  }
  if (spec.conversionMode === 'inverse_usdcad') return base / Math.max(0.1, resolved.usdCad);
  if (spec.conversionMode === 'inverse_usdchf') return base / Math.max(0.1, resolved.usdChf);
  return base;
}

/**
 * Produces a concise human-readable broker contract math readout (e.g. "$10.00 / pip per 1.00 lot"
 * or "$100.00 / 1.00 move ($1.00 / tick) per 1.00 lot").
 */
export function formatContractMathReadout(
  spec: InstrumentSpec,
  effectiveTickValuePerLot: number,
): string {
  const tickStr = `$${effectiveTickValuePerLot.toFixed(2)}/${spec.tickLabel}`;
  if (spec.tickSize > 0 && spec.tickSize < 1) {
    const perUnitMove = effectiveTickValuePerLot / spec.tickSize;
    if (perUnitMove >= 1 && spec.instrumentClass !== 'usd_quote_fx' && spec.instrumentClass !== 'usd_base_fx' && spec.instrumentClass !== 'cross_fx') {
      return `$${perUnitMove.toFixed(2)} per 1.00 move (${tickStr}) per 1.00 lot`;
    }
  }
  return `${tickStr} per 1.00 lot`;
}

export interface PriceScaleMismatchSuggestion {
  suggestedSymbol: string;
  reason: string;
}

/**
 * Detects obvious price-scale mismatches (e.g. entering Gold `2650` or Index `20500` prices
 * while `EURUSD` with `0.0001` pip size is selected, which inflates SL ticks 100x-10000x to 0.00 lots).
 */
export function detectPriceScaleMismatch(
  entryPrice: number | null,
  stopLoss: number | null,
  activeSpec: InstrumentSpec,
  allSpecs: InstrumentSpec[],
): PriceScaleMismatchSuggestion | null {
  if (entryPrice === null || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  const sl = stopLoss && Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : entryPrice;
  const avgPrice = (entryPrice + sl) / 2;

  const hasSymbol = (sym: string) => allSpecs.some((s) => s.symbol === sym);

  // FX micro-pip scale (`tickSize <= 0.001`) given large Metal/Index/JPY prices
  if (activeSpec.tickSize <= 0.001 && avgPrice >= 50) {
    if (avgPrice >= 5000 && hasSymbol('NAS100')) {
      return {
        suggestedSymbol: 'NAS100',
        reason: `Price ${avgPrice.toFixed(0)} looks like an Index scale while ${activeSpec.symbol} uses ${activeSpec.tickSize} ticks.`,
      };
    }
    if (avgPrice >= 400 && hasSymbol('XAUUSD')) {
      return {
        suggestedSymbol: 'XAUUSD',
        reason: `Price ${avgPrice.toFixed(2)} looks like XAUUSD (Gold) scale while ${activeSpec.symbol} uses ${activeSpec.tickSize} pips.`,
      };
    }
    if (avgPrice >= 50 && avgPrice < 400 && hasSymbol('USDJPY')) {
      return {
        suggestedSymbol: 'USDJPY',
        reason: `Price ${avgPrice.toFixed(2)} looks like a JPY cross while ${activeSpec.symbol} uses ${activeSpec.tickSize} pips.`,
      };
    }
  }

  // Metal / Index scale (`tickSize >= 0.01`, non-JPY) given < 10 FX decimal price
  if (
    (activeSpec.instrumentClass === 'index' || activeSpec.instrumentClass === 'metal') &&
    avgPrice < 10 &&
    hasSymbol('EURUSD')
  ) {
    return {
      suggestedSymbol: 'EURUSD',
      reason: `Price ${avgPrice.toFixed(4)} looks like a major FX pair while ${activeSpec.symbol} is selected.`,
    };
  }

  return null;
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
