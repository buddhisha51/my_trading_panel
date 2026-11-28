import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Link2,
  Plus,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useJournalStore } from '../../stores/journalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStrategiesStore } from '../../stores/strategiesStore';
import {
  createInstrumentFromPreset,
  CUSTOM_INSTRUMENT_PRESETS,
  type CustomInstrumentPresetId,
  type InstrumentSpec,
} from '../../types/risk';
import {
  calculatePositionSize,
  deriveTickValueFromSpec,
  detectPriceScaleMismatch,
  formatContractMathReadout,
  formatTickPlural,
  suggestTakeProfitForR,
} from '../../utils/riskCalculator';

function getInitialPricesForSymbol(symbol: string): { entry: string; sl: string; tp: string } {
  switch (symbol.toUpperCase()) {
    case 'EURUSD':
      return { entry: '1.08500', sl: '1.08350', tp: '1.08950' };
    case 'GBPUSD':
      return { entry: '1.27500', sl: '1.27350', tp: '1.27950' };
    case 'AUDUSD':
      return { entry: '0.66500', sl: '0.66350', tp: '0.66950' };
    case 'NZDUSD':
      return { entry: '0.60500', sl: '0.60350', tp: '0.60950' };
    case 'XAUUSD':
      return { entry: '2650.00', sl: '2642.00', tp: '2674.00' };
    case 'USDJPY':
      return { entry: '150.000', sl: '149.700', tp: '150.900' };
    case 'GBPJPY':
      return { entry: '192.500', sl: '192.250', tp: '193.000' };
    case 'EURJPY':
      return { entry: '164.500', sl: '164.250', tp: '165.000' };
    case 'NAS100':
      return { entry: '20500', sl: '20475', tp: '20550' };
    case 'US30':
      return { entry: '43500', sl: '43450', tp: '43650' };
    case 'SPX500':
      return { entry: '5950', sl: '5940', tp: '5980' };
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
  const hydrated = useSettingsStore((s) => s.hydrated);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const profile = useJournalStore((s) => s.profile);
  const metrics = useJournalStore((s) => s.metrics);
  const openOngoingTrade = useJournalStore((s) => s.openOngoingTrade);
  const journalSaving = useJournalStore((s) => s.saving);
  const strategies = useStrategiesStore((s) => s.strategies);

  const specs = settings.instrumentSpecs;
  const activeSpec =
    specs.find((s) => s.symbol === settings.selectedInstrument) ?? specs[0];

  const pricesTouchedRef = useRef(false);
  const lastHydratedAppliedRef = useRef(false);
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
  const [linkContractMath, setLinkContractMath] = useState(true);

  const [showSpecEditor, setShowSpecEditor] = useState(false);
  const [copiedLots, setCopiedLots] = useState(false);
  const [trackedMsg, setTrackedMsg] = useState<string | null>(null);
  const [trackStrategyId, setTrackStrategyId] = useState('');
  const [customSymbolDraft, setCustomSymbolDraft] = useState('');
  const [customPresetId, setCustomPresetId] = useState<CustomInstrumentPresetId>('crypto_1unit');

  const hasSyncedAccountBalance = profile.startingBalance > 0;
  const autoSyncActive = Boolean(settings.riskAutoSyncBalance && hasSyncedAccountBalance);

  // Sync sample prices once SQLite finishes hydrating if the user hasn't typed anything yet
  useEffect(() => {
    if (!hydrated || lastHydratedAppliedRef.current) return;
    lastHydratedAppliedRef.current = true;
    if (!pricesTouchedRef.current) {
      const next = getInitialPricesForSymbol(activeSpec.symbol);
      if (next.entry) {
        setEntryText(next.entry);
        setSlText(next.sl);
        setTpText(next.tp);
      }
    }
  }, [activeSpec.symbol, hydrated]);

  // Keep Equity synced to active journal account balance while Auto-Sync is active
  useEffect(() => {
    if (autoSyncActive) {
      const formatted = String(Number(metrics.currentBalance.toFixed(2)));
      setEquityText((prev) => (Number(prev) === metrics.currentBalance && prev !== '' ? prev : formatted));
    }
  }, [autoSyncActive, metrics.currentBalance, profile.id]);

  useEffect(() => {
    if (autoSyncActive) return;
    setEquityText((prev) =>
      Number(prev) === settings.riskEquity && prev !== '' ? prev : String(settings.riskEquity),
    );
  }, [autoSyncActive, settings.riskEquity]);

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

  const scaleSuggestion = useMemo(
    () => detectPriceScaleMismatch(entryNum, slNum, activeSpec, specs),
    [activeSpec, entryNum, slNum, specs],
  );

  const contractReadout = useMemo(
    () => formatContractMathReadout(activeSpec, result.effectiveTickValuePerLot),
    [activeSpec, result.effectiveTickValuePerLot],
  );

  const maxTradesReached =
    settings.maxTradesPerDay !== null &&
    settings.maxTradesPerDay > 0 &&
    metrics.todayTradeCount >= settings.maxTradesPerDay;
  const lossStreakReached =
    settings.maxConsecutiveLosses !== null &&
    settings.maxConsecutiveLosses > 0 &&
    metrics.consecutiveLosses >= settings.maxConsecutiveLosses;

  const handleInstrumentChange = (symbol: string, preserveTypedPrices = false) => {
    void updateSettings({ selectedInstrument: symbol });
    if (!preserveTypedPrices) {
      pricesTouchedRef.current = true;
      const sample = getInitialPricesForSymbol(symbol);
      setEntryText(sample.entry);
      setSlText(sample.sl);
      setTpText(sample.tp);
    }
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
      pricesTouchedRef.current = true;
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
    const created = createInstrumentFromPreset(clean, customPresetId);
    void updateSettings({
      instrumentSpecs: [...specs, created],
      selectedInstrument: clean,
    });
    setCustomSymbolDraft('');
    setEntryText('');
    setSlText('');
    setTpText('');
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
    const text =
      result.roundedLotSize >= 0.01
        ? result.roundedLotSize.toFixed(2)
        : result.rawLotSize.toFixed(4);
    void navigator.clipboard?.writeText(text);
    setCopiedLots(true);
    window.setTimeout(() => setCopiedLots(false), 1500);
  };

  const handleTrackOngoingTrade = async () => {
    if (!result.valid || !result.direction || !entryNum || !slNum) return;
    const lotToSave =
      result.roundedLotSize >= 0.01
        ? result.roundedLotSize
        : Number(result.rawLotSize.toFixed(4));
    await openOngoingTrade({
      accountId: profile.id,
      pair: activeSpec.symbol,
      direction: result.direction,
      entryPrice: entryNum,
      stopLoss: slNum,
      takeProfit: tpNum && Number.isFinite(tpNum) && tpNum > 0 ? tpNum : null,
      lotSize: lotToSave > 0 ? lotToSave : null,
      status: 'running',
      strategyId: trackStrategyId || null,
      notes: `Calc risk ${result.riskPercent.toFixed(2)}% ($${result.riskDollars.toFixed(2)})`,
    });
    setTrackedMsg(`Tracked ${activeSpec.symbol} ${result.direction.toUpperCase()}`);
    window.setTimeout(() => setTrackedMsg(null), 2200);
  };

  return (
    <div className="space-y-2.5 text-[11px]">
      {(metrics.dailyDdBreached ||
        metrics.maxDdBreached ||
        maxTradesReached ||
        lossStreakReached) && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-md border border-rose-500/45 bg-rose-500/12 px-2 py-1.5 text-[10px] text-rose-200"
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
          <div className="space-y-0.5 leading-snug">
            {metrics.dailyDdBreached && <div>Daily Drawdown limit reached ({metrics.dailyDrawdownPct.toFixed(1)}%).</div>}
            {metrics.maxDdBreached && <div>Max Drawdown limit reached ({metrics.maxDrawdownPct.toFixed(1)}%).</div>}
            {maxTradesReached && (
              <div>
                Daily trade cap reached ({metrics.todayTradeCount}/{settings.maxTradesPerDay} trades today).
              </div>
            )}
            {lossStreakReached && (
              <div>
                Consecutive loss cooldown ({metrics.consecutiveLosses}/{settings.maxConsecutiveLosses} losses).
              </div>
            )}
          </div>
        </div>
      )}

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
          <div className="flex items-center justify-between gap-1 text-slate-300">
            <span className="font-semibold">{activeSpec.symbol} Contract Spec</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-sky-300">
                {contractReadout}
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
                    if (linkContractMath && activeSpec.conversionMode === 'fixed_usd') {
                      const nextTv = deriveTickValueFromSpec(
                        activeSpec.contractSize,
                        val,
                        activeSpec,
                        settings.conversionRates,
                      );
                      setTickValText(String(nextTv));
                      handleUpdateActiveSpec({ tickSize: val, tickValuePerLot: nextTv });
                    } else {
                      handleUpdateActiveSpec({ tickSize: val });
                    }
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
                    if (linkContractMath && activeSpec.conversionMode === 'fixed_usd') {
                      const nextTv = deriveTickValueFromSpec(
                        val,
                        activeSpec.tickSize,
                        activeSpec,
                        settings.conversionRates,
                      );
                      setTickValText(String(nextTv));
                      handleUpdateActiveSpec({ contractSize: val, tickValuePerLot: nextTv });
                    } else {
                      handleUpdateActiveSpec({ contractSize: val });
                    }
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

          <label className="flex cursor-pointer items-center justify-between text-[9px] text-slate-400">
            <span>Auto-sync Tick Val = Contract × Tick Size</span>
            <input
              type="checkbox"
              checked={linkContractMath}
              onChange={(e) => setLinkContractMath(e.target.checked)}
              className="h-3 w-3 accent-blue-500"
            />
          </label>

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

          {/* Add Custom Symbol with Broker Preset */}
          <div className="space-y-1 border-t border-slate-800 pt-1.5">
            <div className="grid grid-cols-[1fr_auto] gap-1">
              <input
                type="text"
                value={customSymbolDraft}
                onChange={(e) => setCustomSymbolDraft(e.target.value)}
                placeholder="Add custom symbol (e.g. BTCUSD)"
                className="min-w-0 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono uppercase text-slate-100 placeholder:normal-case placeholder:text-slate-500"
              />
              <select
                aria-label="Custom symbol preset"
                value={customPresetId}
                onChange={(e) => setCustomPresetId(e.target.value as CustomInstrumentPresetId)}
                className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[9px] text-slate-200"
              >
                {CUSTOM_INSTRUMENT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddCustomInstrument}
              className="inline-flex w-full items-center justify-center gap-1 rounded bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-500"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
        </div>
      )}

      {/* Equity & Risk Row */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <label htmlFor="rc-equity-input">Equity ($)</label>
            {hasSyncedAccountBalance &&
              (autoSyncActive ? (
                <span
                  title={`Auto-synced to ${profile.accountName}`}
                  className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-0.2 text-[9px] text-emerald-300"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  Synced
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void updateSettings({ riskAutoSyncBalance: true });
                    setEquityText(String(Number(metrics.currentBalance.toFixed(2))));
                  }}
                  title={`Re-sync to ${profile.accountName} ($${metrics.currentBalance.toFixed(2)})`}
                  className="inline-flex items-center gap-0.5 text-[9px] text-blue-400 hover:underline"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  Sync Bal
                </button>
              ))}
          </div>
          <input
            id="rc-equity-input"
            type="number"
            step="any"
            value={equityText}
            onChange={(e) => {
              const raw = e.target.value;
              setEquityText(raw);
              const v = Number(raw);
              if (settings.riskAutoSyncBalance && hasSyncedAccountBalance) {
                void updateSettings({
                  riskAutoSyncBalance: false,
                  ...(raw.trim() && Number.isFinite(v) && v > 0 ? { riskEquity: v } : {}),
                });
              } else if (raw.trim() && Number.isFinite(v) && v > 0) {
                void updateSettings({ riskEquity: v });
              }
            }}
            placeholder="10000"
            className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100"
          />
        </div>

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
            onChange={(e) => {
              pricesTouchedRef.current = true;
              setEntryText(e.target.value);
            }}
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
            onChange={(e) => {
              pricesTouchedRef.current = true;
              setSlText(e.target.value);
            }}
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
            onChange={(e) => {
              pricesTouchedRef.current = true;
              setTpText(e.target.value);
            }}
            placeholder="Optional"
            className="w-full rounded border border-slate-800 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-slate-100"
          />
        </label>
      </div>

      {/* Price-Scale Mismatch Warning */}
      {scaleSuggestion && (
        <div className="flex items-center justify-between gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
          <span className="min-w-0 truncate">{scaleSuggestion.reason}</span>
          <button
            type="button"
            onClick={() => handleInstrumentChange(scaleSuggestion.suggestedSymbol, true)}
            className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold text-amber-200 hover:bg-amber-500/35"
          >
            Switch to {scaleSuggestion.suggestedSymbol}
          </button>
        </div>
      )}

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
                {result.roundedLotSize >= 0.01
                  ? `${result.roundedLotSize.toFixed(2)} lots`
                  : `${result.rawLotSize.toFixed(4)} lots`}
              </span>
              {result.roundedLotSize < 0.01 && (
                <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold text-amber-300">
                  &lt; 0.01 min
                </span>
              )}
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
              <div className="text-[9px] text-slate-500">Per 1.00 Lot</div>
              <div className="text-slate-200">${result.riskPerStandardLot.toFixed(2)} risk</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-slate-400">
            <span>Contract: {contractReadout}</span>
            {result.roundedLotSize >= 0.01 && (
              <span className="font-mono text-slate-500">Exact {result.rawLotSize.toFixed(4)}</span>
            )}
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

          {/* 1-Click Send to Ongoing Trades */}
          <div className="flex items-center gap-1 border-t border-slate-800/80 pt-1.5">
            {strategies.length > 0 && (
              <select
                aria-label="Link playbook to trade"
                value={trackStrategyId}
                onChange={(e) => setTrackStrategyId(e.target.value)}
                className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300"
              >
                <option value="">No Playbook</option>
                {strategies.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={journalSaving}
              onClick={() => void handleTrackOngoingTrade()}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-blue-600/90 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {trackedMsg ?? 'Track Trade'}
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-[10px] text-slate-400">
          {result.error}
        </div>
      )}
    </div>
  );
}
