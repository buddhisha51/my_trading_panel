export type InstrumentClass =
  | 'usd_quote_fx'
  | 'usd_base_fx'
  | 'cross_fx'
  | 'jpy_cross'
  | 'metal'
  | 'index'
  | 'custom';

export interface InstrumentSpec {
  symbol: string;
  label: string;
  instrumentClass: InstrumentClass;
  /** Minimum price increment used for pip/tick math (e.g. 0.0001 for EURUSD, 0.01 for USDJPY/XAUUSD, 1.0 for NAS100) */
  tickSize: number;
  /** Human-readable unit name ("pip", "0.01 move", "point") */
  tickLabel: string;
  /** Contract size per 1.00 lot */
  contractSize: number;
  /** USD value of 1 tick per 1.00 lot (or base formula denominator when quote_to_usd applies) */
  tickValuePerLot: number;
  /** Pricing decimal places */
  decimals: number;
  /** Optional dynamic FX conversion mode */
  conversionMode: 'fixed_usd' | 'inverse_entry' | 'inverse_usdjpy' | 'inverse_usdcad' | 'inverse_usdchf' | 'multiply_gbpusd';
}

export const DEFAULT_INSTRUMENT_SPECS: InstrumentSpec[] = [
  {
    symbol: 'EURUSD',
    label: 'EUR/USD',
    instrumentClass: 'usd_quote_fx',
    tickSize: 0.0001,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 10,
    decimals: 5,
    conversionMode: 'fixed_usd',
  },
  {
    symbol: 'GBPUSD',
    label: 'GBP/USD',
    instrumentClass: 'usd_quote_fx',
    tickSize: 0.0001,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 10,
    decimals: 5,
    conversionMode: 'fixed_usd',
  },
  {
    symbol: 'AUDUSD',
    label: 'AUD/USD',
    instrumentClass: 'usd_quote_fx',
    tickSize: 0.0001,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 10,
    decimals: 5,
    conversionMode: 'fixed_usd',
  },
  {
    symbol: 'NZDUSD',
    label: 'NZD/USD',
    instrumentClass: 'usd_quote_fx',
    tickSize: 0.0001,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 10,
    decimals: 5,
    conversionMode: 'fixed_usd',
  },
  {
    symbol: 'USDJPY',
    label: 'USD/JPY',
    instrumentClass: 'jpy_cross',
    tickSize: 0.01,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 1000, // 1,000 JPY / USDJPY rate
    decimals: 3,
    conversionMode: 'inverse_entry',
  },
  {
    symbol: 'EURJPY',
    label: 'EUR/JPY',
    instrumentClass: 'jpy_cross',
    tickSize: 0.01,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 1000, // 1,000 JPY / USDJPY rate
    decimals: 3,
    conversionMode: 'inverse_usdjpy',
  },
  {
    symbol: 'GBPJPY',
    label: 'GBP/JPY',
    instrumentClass: 'jpy_cross',
    tickSize: 0.01,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 1000, // 1,000 JPY / USDJPY rate
    decimals: 3,
    conversionMode: 'inverse_usdjpy',
  },
  {
    symbol: 'USDCAD',
    label: 'USD/CAD',
    instrumentClass: 'usd_base_fx',
    tickSize: 0.0001,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 10,
    decimals: 5,
    conversionMode: 'inverse_entry',
  },
  {
    symbol: 'USDCHF',
    label: 'USD/CHF',
    instrumentClass: 'usd_base_fx',
    tickSize: 0.0001,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 10,
    decimals: 5,
    conversionMode: 'inverse_entry',
  },
  {
    symbol: 'EURGBP',
    label: 'EUR/GBP',
    instrumentClass: 'cross_fx',
    tickSize: 0.0001,
    tickLabel: 'pip',
    contractSize: 100000,
    tickValuePerLot: 10,
    decimals: 5,
    conversionMode: 'multiply_gbpusd',
  },
  {
    symbol: 'XAUUSD',
    label: 'XAU/USD (Gold)',
    instrumentClass: 'metal',
    tickSize: 0.01,
    tickLabel: 'tick ($0.01)',
    contractSize: 100,
    tickValuePerLot: 1,
    decimals: 2,
    conversionMode: 'fixed_usd',
  },
  {
    symbol: 'NAS100',
    label: 'NAS100 (US100)',
    instrumentClass: 'index',
    tickSize: 1,
    tickLabel: 'pt',
    contractSize: 1,
    tickValuePerLot: 1,
    decimals: 2,
    conversionMode: 'fixed_usd',
  },
  {
    symbol: 'US30',
    label: 'US30 (Dow)',
    instrumentClass: 'index',
    tickSize: 1,
    tickLabel: 'pt',
    contractSize: 1,
    tickValuePerLot: 1,
    decimals: 2,
    conversionMode: 'fixed_usd',
  },
  {
    symbol: 'SPX500',
    label: 'SPX500 (US500)',
    instrumentClass: 'index',
    tickSize: 1,
    tickLabel: 'pt',
    contractSize: 1,
    tickValuePerLot: 1,
    decimals: 2,
    conversionMode: 'fixed_usd',
  },
];

export type RiskInputMode = 'percent' | 'dollars';

export interface ConversionRates {
  usdJpy: number;
  usdCad: number;
  usdChf: number;
  gbpUsd: number;
}

export const DEFAULT_CONVERSION_RATES: ConversionRates = {
  usdJpy: 152.0,
  usdCad: 1.4,
  usdChf: 0.88,
  gbpUsd: 1.27,
};

export interface RiskCalculatorInput {
  equity: number;
  riskMode: RiskInputMode;
  riskPercent: number;
  riskDollars: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  spec: InstrumentSpec;
  conversionRates?: Partial<ConversionRates>;
}

export interface RiskCalculatorResult {
  valid: boolean;
  error: string | null;
  warning: string | null;
  direction: 'long' | 'short' | null;
  riskDollars: number;
  riskPercent: number;
  effectiveTickValuePerLot: number;
  slPriceDelta: number;
  slTicks: number;
  rawLotSize: number;
  roundedLotSize: number;
  tpPriceDelta: number | null;
  tpTicks: number | null;
  rewardDollars: number | null;
  rrRatio: number | null;
  rMultiple: number | null;
}

export function cloneDefaultInstrumentSpecs(): InstrumentSpec[] {
  return DEFAULT_INSTRUMENT_SPECS.map((s) => ({ ...s }));
}
