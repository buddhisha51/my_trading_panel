import { describe, expect, it } from 'vitest';
import { createInstrumentFromPreset, DEFAULT_INSTRUMENT_SPECS } from '../../types/risk';
import {
  calculatePositionSize,
  deriveTickValueFromSpec,
  detectPriceScaleMismatch,
  formatContractMathReadout,
} from '../riskCalculator';

describe('riskCalculator: custom presets, contract math, scale detection & micro-lot precision', () => {
  it('creates BTCUSD crypto_1unit preset cleanly and computes non-zero lots (fixing 0.00 lot bug)', () => {
    const btc = createInstrumentFromPreset('BTCUSD', 'crypto_1unit');
    expect(btc.symbol).toBe('BTCUSD');
    expect(btc.tickSize).toBe(1);
    expect(btc.contractSize).toBe(1);
    expect(btc.tickValuePerLot).toBe(1);

    const result = calculatePositionSize({
      equity: 10_000,
      riskMode: 'percent',
      riskPercent: 1,
      riskDollars: 100,
      entryPrice: 90_000,
      stopLoss: 89_500,
      takeProfit: 91_000,
      spec: btc,
    });

    expect(result.valid).toBe(true);
    expect(result.rawLotSize).toBeCloseTo(0.2, 4);
  });

  it('derives tickValuePerLot from contractSize and tickSize and formats readable math', () => {
    const eurusd = DEFAULT_INSTRUMENT_SPECS.find((s) => s.symbol === 'EURUSD')!;
    // 5-digit broker tickSize 0.00001 on 100,000 FX contract -> $1 per 0.00001 move
    const derivedFx = deriveTickValueFromSpec(100_000, 0.00001, eurusd);
    expect(derivedFx).toBe(1);

    const xau = DEFAULT_INSTRUMENT_SPECS.find((s) => s.symbol === 'XAUUSD')!;
    const readout = formatContractMathReadout(xau, 1);
    expect(readout).toContain('per 1.00 move');
    expect(readout).toContain('per 1.00 lot');
  });

  it('detects price-scale mismatch when Gold, JPY, or Index prices are typed under EURUSD', () => {
    const eurusd = DEFAULT_INSTRUMENT_SPECS.find((s) => s.symbol === 'EURUSD')!;

    const goldMatch = detectPriceScaleMismatch(2650, 2640, eurusd, DEFAULT_INSTRUMENT_SPECS);
    expect(goldMatch?.suggestedSymbol).toBe('XAUUSD');

    const nasMatch = detectPriceScaleMismatch(20500, 20450, eurusd, DEFAULT_INSTRUMENT_SPECS);
    expect(nasMatch?.suggestedSymbol).toBe('NAS100');

    const jpyMatch = detectPriceScaleMismatch(152.5, 151.8, eurusd, DEFAULT_INSTRUMENT_SPECS);
    expect(jpyMatch?.suggestedSymbol).toBe('USDJPY');
  });

  it('exposes rawLotSize and minRiskForMicroLot when equity is tiny for 0.01 standard lot', () => {
    const xau = DEFAULT_INSTRUMENT_SPECS.find((s) => s.symbol === 'XAUUSD')!;
    const result = calculatePositionSize({
      equity: 500,
      riskMode: 'percent',
      riskPercent: 1, // $5 budget, while 0.01 lot over $10 SL = $10 min risk -> raw ~0.005 lot
      riskDollars: 5,
      entryPrice: 2650,
      stopLoss: 2640,
      takeProfit: null,
      spec: xau,
    });

    expect(result.valid).toBe(true);
    expect(result.rawLotSize).toBeGreaterThan(0);
    expect(result.rawLotSize).toBeCloseTo(0.005, 3);
    expect(result.minRiskForMicroLot).toBeCloseTo(10, 2);
  });
});
