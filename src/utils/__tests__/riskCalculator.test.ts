import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTRUMENT_SPECS } from '../../types/risk';
import { calculatePositionSize, suggestTakeProfitForR } from '../riskCalculator';

const specOf = (symbol: string) =>
  DEFAULT_INSTRUMENT_SPECS.find((s) => s.symbol === symbol)!;

describe('riskCalculator', () => {
  it('computes EURUSD lot size, R:R and reward accurately', () => {
    const res = calculatePositionSize({
      equity: 10000,
      riskMode: 'percent',
      riskPercent: 1,
      riskDollars: 100,
      entryPrice: 1.085,
      stopLoss: 1.0835, // 15 pips
      takeProfit: 1.0895, // 45 pips = 3R
      spec: specOf('EURUSD'),
    });

    expect(res.valid).toBe(true);
    expect(res.direction).toBe('long');
    expect(res.riskDollars).toBeCloseTo(100, 4);
    expect(res.slTicks).toBeCloseTo(15, 4);
    expect(res.rawLotSize).toBeCloseTo(100 / (15 * 10), 4); // 0.6667
    expect(res.roundedLotSize).toBe(0.66);
    expect(res.rMultiple).toBeCloseTo(3.0, 4);
    expect(res.rewardDollars).toBeCloseTo(300, 2);
  });

  it('computes JPY crosses using inverse USDJPY quote conversion', () => {
    // At USDJPY = 150, 1 pip (0.01) per 1 lot GBPJPY = 1000 / 150 = $6.6667
    // 25 pip SL * $6.6667 = $166.6667 risk per lot; $150 risk => 0.90 lots exact
    const res = calculatePositionSize({
      equity: 15000,
      riskMode: 'dollars',
      riskPercent: 1,
      riskDollars: 150,
      entryPrice: 192.5,
      stopLoss: 192.75, // Short, 25 pips
      takeProfit: 192.0, // 50 pips = 2R
      spec: specOf('GBPJPY'),
      conversionRates: { usdJpy: 150 },
    });

    expect(res.valid).toBe(true);
    expect(res.direction).toBe('short');
    expect(res.effectiveTickValuePerLot).toBeCloseTo(1000 / 150, 4);
    expect(res.roundedLotSize).toBe(0.9);
    expect(res.rMultiple).toBeCloseTo(2.0, 4);
  });

  it('computes XAUUSD (Gold) and US Indices (NAS100) accurately', () => {
    const gold = calculatePositionSize({
      equity: 20000,
      riskMode: 'dollars',
      riskPercent: 1,
      riskDollars: 100,
      entryPrice: 2650.0,
      stopLoss: 2645.0, // $5.00 move = 500 ticks ($0.01) @ $1/tick = $500/lot
      takeProfit: 2665.0,
      spec: specOf('XAUUSD'),
    });
    expect(gold.valid).toBe(true);
    expect(gold.roundedLotSize).toBe(0.2);
    expect(gold.rMultiple).toBeCloseTo(3.0, 4);

    const nas = calculatePositionSize({
      equity: 50000,
      riskMode: 'percent',
      riskPercent: 0.5, // $250 risk
      riskDollars: 250,
      entryPrice: 20500,
      stopLoss: 20475, // 25 pts
      takeProfit: 20550, // 50 pts = 2R
      spec: specOf('NAS100'),
    });
    expect(nas.valid).toBe(true);
    expect(nas.roundedLotSize).toBe(10); // $250 / ($1 * 25 pts) = 10 contracts
  });

  it('validates invalid SL, TP side warnings, and R-target auto-fill', () => {
    const badTp = calculatePositionSize({
      equity: 10000,
      riskMode: 'percent',
      riskPercent: 1,
      riskDollars: 100,
      entryPrice: 1.1,
      stopLoss: 1.098,
      takeProfit: 1.099, // Wrong side for long setup
      spec: specOf('EURUSD'),
    });
    expect(badTp.valid).toBe(true);
    expect(badTp.warning).toContain('above Entry');
    expect(badTp.rrRatio).toBeNull();

    expect(suggestTakeProfitForR(1.1, 1.098, 3, 5)).toBe(1.106);
  });
});
