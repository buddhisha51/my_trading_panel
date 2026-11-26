import { AlertTriangle, Check, Copy, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { InstrumentSpec } from '../../types/risk';
import {
  calculatePositionSize,
  formatTickPlural,
  suggestTakeProfitForR,
} from '../../utils/riskCalculator';

function getInitialPricesForSymbol(symbol: string): { entry: string; sl: string; tp: string } {
  switch (symbol.toUpperCase()) {
    case 'EURUSD':
      return { entry: '1.08500', sl: '1.08350', tp: '1.08950' };
    case 'XAUUSD':
      return { entry: '2650.00', sl: '2642.00', tp: '2674.00' };
    case 'USDJPY':
      return { entry: '150.000', sl: '149.700', tp: '150.900' };
    case 'GBPJPY':
      return { entry: '192.500', sl: '192.250', tp: '193.000' };
    case 'NAS100':
      return { entry: '20500', sl: '20475', tp: '20550' };
    default:
      return { entry: '', sl: '', tp: '' };
  }
}

function countDecimals(text: string): number {
  const dotIdx = text.indexOf('.');
  if (dotIdx < 0) return 0;
  return text.slice(dotIdx + 1).replace(/[^0-9]/g, '').length;
}

export function RiskCalculatorWidget() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const specs = settings.instrumentSpecs;
  const activeSpec =
    specs.find((s) => s.symbol === settings.selectedInstrument) ?? specs[0];

  const [initialPrices] = useState(() => getInitialPricesForSymbol(activeSpec.symbol));
  const [entryText, setEntryText] = useState(initialPrices.entry);
  const [slText, setSlText] = useState(initialPrices.sl);
  const [tpText, setTpText] = useState(initialPrices.tp);
  const [equityText, setEquityText] = useState(() => String(settings.riskEquity));
  const [riskPctText, setRiskPctText] = useState(() => String(settings.riskPercent));
  const [riskDollarText, setRiskDollarText] = useState(() => String(settings.riskDollars));
  const [tickSizeText, setTickSizeText] = useState(() => String(activeSpec.tickSize));
  const [contractText, setContractText] = useState(() => String(activeSpec.contractSize));
  const [tickValText, setTickValText] = useState(() => String(activeSpec.tickValuePerLot));
  const [usdJpyText, setUsdJpyText] = useState(() => String(settings.conversionRates.usdJpy));
  const [gbpUsdText, setGbpUsdText] = useState(() => String(settings.conversionRates.gbpUsd));

  const [showSpecEditor, setShowSpecEditor] = useState(false);
  const [copiedLots, setCopiedLots] = useState(false);
  const [customSymbolDraft, setCustomSymbolDraft] = useState('');

  useEffect(() => {
    setEquityText((prev) =>
      Number(prev) === settings.riskEquity && prev !== '' ? prev : String(settings.riskEquity),
    );
  }, [settings.riskEquity]);

  useEffect(() => {
    setRiskPctText((prev) =>
      Number(prev) === settings.riskPercent && prev !== '' ? prev : String(settings.riskPercent),
    );
  }, [settings.riskPercent]);

  useEffect(() => {
    setRiskDollarText((prev) =>
      Number(prev) === settings.riskDollars && prev !== '' ? prev : String(settings.riskDollars),
    );
  }, [settings.riskDollars]);

  useEffect(() => {
    setTickSizeText(String(activeSpec.tickSize));
    setContractText(String(activeSpec.contractSize));
    setTickValText(String(activeSpec.tickValuePerLot));
  }, [activeSpec.symbol, activeSpec.tickSize, activeSpec.contractSize, activeSpec.tickValuePerLot]);

  useEffect(() => {
    setUsdJpyText((prev) =>
      Number(prev) === settings.conversionRates.usdJpy && prev !== ''
        ? prev
        : String(settings.conversionRates.usdJpy),
    );
  }, [settings.conversionRates.usdJpy]);

  useEffect(() => {
    setGbpUsdText((prev) =>
      Number(prev) === settings.conversionRates.gbpUsd && prev !== ''
        ? prev
        : String(settings.conversionRates.gbpUsd),
    );
  }, [settings.conversionRates.gbpUsd]);

  const entryNum = entryText.trim() ? Number(entryText) : null;
  const slNum = slText.trim() ? Number(slText) : null;
  const tpNum = tpText.trim() ? Number(tpText) : null;
  const liveEquity = equityText.trim() ? Number(equityText) : 0;
  const liveRiskPct = riskPctText.trim() ? Number(riskPctText) : 0;
  const liveRiskDollars = riskDollarText.trim() ? Number(riskDollarText) : 0;

  const result = useMemo(
    () =>
      calculatePositionSize({
        equity: Number.isFinite(liveEquity) ? liveEquity : 0,
        riskMode: settings.riskMode,
        riskPercent: Number.isFinite(liveRiskPct) ? liveRiskPct : 0,
        riskDollars: Number.isFinite(liveRiskDollars) ? liveRiskDollars : 0,
        entryPrice: entryNum !== null && Number.isFinite(entryNum) ? entryNum : null,
        stopLoss: slNum !== null && Number.isFinite(slNum) ? slNum : null,
        takeProfit: tpNum !== null && Number.isFinite(tpNum) ? tpNum : null,
        spec: activeSpec,
        conversionRates: settings.conversionRates,
      }),
    [
      activeSpec,
      entryNum,
      liveEquity,
      liveRiskDollars,
      liveRiskPct,
      settings.conversionRates,
      settings.riskMode,
      slNum,
      tpNum,
    ],
  );

  const handleInstrumentChange = (symbol: string) => {
    void updateSettings({ selectedInstrument: symbol });
    // Clear stale prices when switching between completely different price scales (e.g. EURUSD -> XAUUSD)
    setEntryText('');
    setSlText('');
    setTpText('');
  };

  const handleApplyRTarget = (r: number) => {
    if (
      entryNum === null ||
      slNum === null ||
      !Number.isFinite(entryNum) ||
      !Number.isFinite(slNum) ||
      entryNum <= 0 ||
      slNum <= 0 ||
      entryNum === slNum
    ) {
      return;
    }
    const precision = Math.max(
      activeSpec.decimals,
      countDecimals(entryText),
      countDecimals(slText),
    );
    const suggested = suggestTakeProfitForR(entryNum, slNum, r, precision);
    if (suggested !== null) {
      setTpText(String(suggested));
    }
  };

  const handleUpdateActiveSpec = (patch: Partial<InstrumentSpec>) => {
    const nextSpecs = specs.map((s) =>
      s.symbol === activeSpec.symbol ? { ...s, ...patch } : s,
    );
    void updateSettings({ instrumentSpecs: nextSpecs });
  };

  const handleAddCustomInstrument = () => {
    const clean = customSymbolDraft.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '');
    if (!clean) return;
    if (specs.some((s) => s.symbol === clean)) {
      void updateSettings({ selectedInstrument: clean });
      setCustomSymbolDraft('');
      return;
    }
    const created: InstrumentSpec = {
      symbol: clean,
      label: `${clean} (Custom)`,
      instrumentClass: 'custom',
      tickSize: 0.01,
      tickLabel: 'tick',
      contractSize: 1,
      tickValuePerLot: 1,
      decimals: 2,
      conversionMode: 'fixed_usd',
    };
    void updateSettings({
      instrumentSpecs: [...specs, created],
      selectedInstrument: clean,
    });
    setCustomSymbolDraft('');
  };

  const handleRemoveActiveInstrument = () => {
    if (specs.length <= 1 || activeSpec.instrumentClass !== 'custom') return;
    const nextSpecs = specs.filter((s) => s.symbol !== activeSpec.symbol);
    void updateSettings({
      instrumentSpecs: nextSpecs,
      selectedInstrument: nextSpecs[0].symbol,
    });
  };

  const handleCopyLots = () => {
    if (!result.valid) return;
    void navigator.clipboard?.writeText(result.roundedLotSize.toFixed(2));
    setCopiedLots(true);
    window.setTimeout(() => setCopiedLots(false), 1500);
  };

  return (
    <div className="space-y-2.5 text-[11px]">
      {/* Instrument + Spec Toggle */}
      <div className="flex items-center gap-1.5">
        <select
          aria-label="Instrument"
          value={activeSpec.symbol}
          onChange={(e) => handleInstrumentChange(e.target.value)}
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-100"
        >
          {specs.map((s) => (
            <option key={s.symbol} value={s.symbol}>
              {s.symbol} — {s.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setShowSpecEditor((v) => !v)}
          title="Customize broker contract / tick specification"
          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors ${showSpecEditor
            ? 'border-blue-500 bg-blue-500/20 text-blue-300'
            : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600'
            }`}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Spec
        </button>
      </div>

      {/* Collapsible Broker Tick Spec Customizer */}
      {showSpecEditor && (
        <div className="space-y-2 rounded-md border border-blue-500/30 bg-slate-950/90 p-2 text-[10px]">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-semibold">{activeSpec.symbol} Contract Spec</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-500">
                ${result.effectiveTickValuePerLot.toFixed(2)}/{activeSpec.tickLabel}/lot
              </span>
              {activeSpec.instrumentClass === 'custom' && specs.length > 1 && (
                <button
                  type="button"
                  onClick={handleRemoveActiveInstrument}
                  aria-label={`Remove ${activeSpec.symbol}`}
                  title={`Remove custom symbol ${activeSpec.symbol}`}
                  className="inline-flex items-center gap-0.5 rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <label className="space-y-0.5">
              <span className="text-slate-400">Tick Size</span>
              <input
                type="number"
                step="any"
                value={tickSizeText}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTickSizeText(raw);
                  const val = Number(raw);
                  if (raw.trim() && Number.isFinite(val) && val > 0) {
                    handleUpdateActiveSpec({ tickSize: val });
                  }
                }}
                onBlur={() => {
                  const val = Number(tickSizeText);
                  if (!tickSizeText.trim() || !Number.isFinite(val) || val <= 0) {
                    setTickSizeText(String(activeSpec.tickSize));
                  }
                }}
                className="w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-slate-100"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-slate-400">Contract</span>
              <input
                type="number"
                step="any"
                value={contractText}
                onChange={(e) => {
                  const raw = e.target.value;
                  setContractText(raw);
                  const val = Number(raw);
                  if (raw.trim() && Number.isFinite(val) && val > 0) {
                    handleUpdateActiveSpec({ contractSize: val });
                  }
                }}
                onBlur={() => {
                  const val = Number(contractText);
                  if (!contractText.trim() || !Number.isFinite(val) || val <= 0) {
                    setContractText(String(activeSpec.contractSize));
                  }
                }}
                className="w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-slate-100"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-slate-400">Tick Val ($)</span>
              <input
                type="number"
                step="any"
                value={tickValText}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTickValText(raw);
                  const val = Number(raw);
                  if (raw.trim() && Number.isFinite(val) && val > 0) {
                    handleUpdateActiveSpec({ tickValuePerLot: val });
                  }
                }}
                onBlur={() => {
                  const val = Number(tickValText);
                  if (!tickValText.trim() || !Number.isFinite(val) || val <= 0) {
                    setTickValText(String(activeSpec.tickValuePerLot));
                  }
                }}
                className="w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-slate-100"
              />
            </label>
          </div>

          {(activeSpec.conversionMode === 'inverse_usdjpy' ||
            activeSpec.conversionMode === 'multiply_gbpusd') && (
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                {activeSpec.conversionMode === 'inverse_usdjpy' && (
                  <label className="space-y-0.5">
                    <span className="text-slate-400">USDJPY Ref Rate</span>
                    <input
                      type="number"
                      step="0.1"
                      value={usdJpyText}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setUsdJpyText(raw);
                        const val = Number(raw);
                        if (raw.trim() && Number.isFinite(val) && val > 0) {
                          void updateSettings({
                            conversionRates: { ...settings.conversionRates, usdJpy: val },
                          });
                        }
                      }}
                      onBlur={() => {
                        const val = Number(usdJpyText);
                        if (!usdJpyText.trim() || !Number.isFinite(val) || val <= 0) {
                          setUsdJpyText(String(settings.conversionRates.usdJpy));
                        }
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-slate-100"
                    />
                  </label>
                )}
                {activeSpec.conversionMode === 'multiply_gbpusd' && (
                  <label className="space-y-0.5">
                    <span className="text-slate-400">GBPUSD Ref Rate</span>
                    <input
                      type="number"
                      step="0.001"
                      value={gbpUsdText}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setGbpUsdText(raw);
                        const val = Number(raw);
                        if (raw.trim() && Number.isFinite(val) && val > 0) {
                          void updateSettings({
                            conversionRates: { ...settings.conversionRates, gbpUsd: val },
                          });
                        }
                      }}
                      onBlur={() => {
                        const val = Number(gbpUsdText);
                        if (!gbpUsdText.trim() || !Number.isFinite(val) || val <= 0) {
                          setGbpUsdText(String(settings.conversionRates.gbpUsd));
                        }
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-slate-100"
                    />
                  </label>
                )}
              </div>
            )}

          {/* Add Custom Symbol */}
          <div className="flex gap-1 border-t border-slate-800 pt-1.5">
            <input
              type="text"
              value={customSymbolDraft}
              onChange={(e) => setCustomSymbolDraft(e.target.value)}
              placeholder="Add custom symbol (e.g. BTCUSD)"
              className="flex-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono uppercase text-slate-100 placeholder:normal-case placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={handleAddCustomInstrument}
              className="inline-flex items-center gap-0.5 rounded bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-500"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
        </div>
      )}

      {/* Equity & Risk Row */}
      <div className="grid grid-cols-2 gap-1.5">
        <label className="space-y-0.5">
          <span className="text-[10px] text-slate-400">Equity ($)</span>
          <input
            type="number"
            step="any"
            value={equityText}
            onChange={(e) => {
              const raw = e.target.value;
              setEquityText(raw);
              const v = Number(raw);
              if (raw.trim() && Number.isFinite(v) && v > 0) {
                void updateSettings({ riskEquity: v });
              }
            }}
            placeholder="10000"
            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100"
          />
        </label>

        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Risk ({settings.riskMode === 'percent' ? '%' : '$'})</span>
            <button
              type="button"
              onClick={() =>
                void updateSettings({
                  riskMode: settings.riskMode === 'percent' ? 'dollars' : 'percent',
                })
              }
              className="text-blue-400 hover:underline"
            >
              Use {settings.riskMode === 'percent' ? '$' : '%'}
            </button>
          </div>
          {settings.riskMode === 'percent' ? (
            <input
              type="number"
              step="0.1"
              min="0"
              value={riskPctText}
              onChange={(e) => {
                const raw = e.target.value;
                setRiskPctText(raw);
                const v = Number(raw);
                if (raw.trim() && Number.isFinite(v) && v > 0) {
                  void updateSettings({ riskPercent: v });
                }
              }}
              placeholder="1.0"
              className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100"
            />
          ) : (
            <input
              type="number"
              step="any"
              min="0"
              value={riskDollarText}
              onChange={(e) => {
                const raw = e.target.value;
                setRiskDollarText(raw);
                const v = Number(raw);
                if (raw.trim() && Number.isFinite(v) && v > 0) {
                  void updateSettings({ riskDollars: v });
                }
              }}
              placeholder="100"
              className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100"
            />
          )}
        </div>
      </div>

      {/* Risk % Presets */}
      {settings.riskMode === 'percent' && (
        <div className="flex items-center gap-1">
          {[0.25, 0.5, 1, 2].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => {
                setRiskPctText(String(pct));
                void updateSettings({ riskPercent: pct });
              }}
              className={`flex-1 rounded border py-0.5 font-mono text-[10px] transition-colors ${settings.riskPercent === pct && riskPctText.trim() !== ''
                ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      )}

      {/* Entry / SL / TP Prices */}
      <div className="grid grid-cols-3 gap-1.5">
        <label className="space-y-0.5">
          <span className="text-[10px] text-slate-400">Entry</span>
          <input
            type="number"
            step="any"
            value={entryText}
            onChange={(e) => setEntryText(e.target.value)}
            placeholder="0.00"
            className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-slate-100"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-rose-400">Stop Loss</span>
          <input
            type="number"
            step="any"
            value={slText}
            onChange={(e) => setSlText(e.target.value)}
            placeholder="0.00"
            className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-slate-100"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-emerald-400">Take Profit</span>
          <input
            type="number"
            step="any"
            value={tpText}
            onChange={(e) => setTpText(e.target.value)}
            placeholder="Optional"
            className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-slate-100"
          />
        </label>
      </div>

      {/* Quick R-Target Auto-Fill */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-500">Quick TP Target:</span>
        <div className="flex gap-1">
          {[2, 3, 5].map((r) => {
            const canApply =
              entryNum !== null &&
              slNum !== null &&
              Number.isFinite(entryNum) &&
              Number.isFinite(slNum) &&
              entryNum > 0 &&
              slNum > 0 &&
              entryNum !== slNum;
            const isActiveTarget =
              result.valid &&
              result.rMultiple !== null &&
              Math.abs(result.rMultiple - r) < 0.01;
            return (
              <button
                key={r}
                type="button"
                onClick={() => handleApplyRTarget(r)}
                disabled={!canApply}
                className={`rounded border px-1.5 py-0.5 font-mono transition-colors disabled:opacity-40 ${isActiveTarget
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300'
                  }`}
              >
                1:{r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Output Summary Card */}
      {result.valid ? (
        <div className="space-y-1.5 rounded-md border border-slate-700/80 bg-slate-950/90 p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-slate-50">
                {result.roundedLotSize.toFixed(2)} lots
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${result.direction === 'long'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
                  }`}
              >
                {result.direction}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyLots}
              title="Copy lot size"
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
            >
              {copiedLots ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1 border-t border-slate-800/80 pt-1.5 font-mono text-[10px]">
            <div>
              <div className="text-[9px] text-slate-500">Risk</div>
              <div className="text-rose-300">
                -${result.riskDollars.toFixed(2)} ({result.riskPercent.toFixed(2)}%)
              </div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500">SL Dist</div>
              <div className="text-slate-200">
                {result.slTicks.toFixed(1)} {formatTickPlural(activeSpec.tickLabel, result.slTicks)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500">1 Lot / {activeSpec.tickLabel}</div>
              <div className="text-slate-200">${result.effectiveTickValuePerLot.toFixed(2)}</div>
            </div>
          </div>

          {result.rrRatio !== null && result.rewardDollars !== null && (
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5 font-mono text-[10px]">
              <span className="text-emerald-300">
                Reward: +${result.rewardDollars.toFixed(2)}
              </span>
              <span className="font-semibold text-blue-300">
                R:R 1 : {result.rrRatio.toFixed(2)} (+{result.rMultiple?.toFixed(2)}R)
              </span>
            </div>
          )}

          {result.warning && (
            <div className="flex items-start gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{result.warning}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-[10px] text-slate-400">
          {result.error}
        </div>
      )}
    </div>
  );
}
