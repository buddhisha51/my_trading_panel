import { AlertOctagon, Camera, Plus, Settings2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useJournalStore } from '../../stores/journalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStrategiesStore } from '../../stores/strategiesStore';
import {
  PROP_FIRM_PRESETS,
  type TradeDirection,
  type TradeOutcome,
} from '../../types/journal';
import type { DrawdownMode } from '../../types/settings';
import { normalizeTradePnl, normalizeTradeR } from '../../utils/drawdownEngine';
import { evaluateSetupChecklist, gradeColor, type SetupGrade } from '../../utils/strategyGrade';

export function TradeJournalWidget() {
  const watchlistPairs = useSettingsStore((s) => s.settings.watchlistPairs);

  const profile = useJournalStore((s) => s.profile);
  const trades = useJournalStore((s) => s.trades);
  const metrics = useJournalStore((s) => s.metrics);
  const saving = useJournalStore((s) => s.saving);
  const hydrateJournal = useJournalStore((s) => s.hydrateJournal);
  const updateProfile = useJournalStore((s) => s.updateProfile);
  const recordTrade = useJournalStore((s) => s.recordTrade);
  const deleteTrade = useJournalStore((s) => s.deleteTrade);
  const saveTodaySnapshot = useJournalStore((s) => s.saveTodaySnapshot);

  const strategies = useStrategiesStore((s) => s.strategies);
  const checkedRuleIdsByStrategy = useStrategiesStore((s) => s.checkedRuleIdsByStrategy);
  const loadStrategies = useStrategiesStore((s) => s.loadStrategies);

  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [filterPair, setFilterPair] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');

  // Account setup state
  const [accName, setAccName] = useState(profile.accountName);
  const [startBal, setStartBal] = useState(String(profile.startingBalance || 10000));
  const [currency, setCurrency] = useState(profile.currency || 'USD');
  const [ddMode, setDdMode] = useState<DrawdownMode>(profile.ddMode);
  const [dailyLimit, setDailyLimit] = useState(
    profile.dailyDdLimit !== null ? String(profile.dailyDdLimit) : '5',
  );
  const [maxLimit, setMaxLimit] = useState(
    profile.maxDdLimit !== null ? String(profile.maxDdLimit) : '10',
  );

  // Manual Trade form state
  const [pair, setPair] = useState(watchlistPairs[0] || 'EURUSD');
  const [direction, setDirection] = useState<TradeDirection>('long');
  const [outcome, setOutcome] = useState<TradeOutcome>('win');
  const [pnlText, setPnlText] = useState('');
  const [rText, setRText] = useState('');
  const [lotsText, setLotsText] = useState('0.50');
  const [strategyId, setStrategyId] = useState('');
  const [session, setSession] = useState('NY AM');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    void hydrateJournal();
    void loadStrategies();
  }, [hydrateJournal, loadStrategies]);

  useEffect(() => {
    setAccName(profile.accountName);
    if (profile.startingBalance > 0) setStartBal(String(profile.startingBalance));
    setCurrency(profile.currency || 'USD');
    setDdMode(profile.ddMode);
    setDailyLimit(profile.dailyDdLimit !== null ? String(profile.dailyDdLimit) : '');
    setMaxLimit(profile.maxDdLimit !== null ? String(profile.maxDdLimit) : '');
  }, [profile]);

  const needsSetup = profile.startingBalance <= 0 && !showProfileEdit;

  const filteredTrades = useMemo(
    () =>
      trades.filter((t) => {
        if (filterPair && t.pair !== filterPair) return false;
        if (filterOutcome && t.outcome !== filterOutcome) return false;
        return true;
      }),
    [filterOutcome, filterPair, trades],
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const bal = Number(startBal);
    if (!Number.isFinite(bal) || bal <= 0) return;
    await updateProfile({
      accountName: accName.trim() || 'My Account',
      startingBalance: bal,
      currency: currency.trim().toUpperCase() || 'USD',
      ddMode,
      dailyDdLimit: dailyLimit.trim() ? Number(dailyLimit) : null,
      maxDdLimit: maxLimit.trim() ? Number(maxLimit) : null,
    });
    setShowProfileEdit(false);
  };

  const handleLogTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawPnl = outcome === 'breakeven' && !pnlText.trim() ? 0 : Number(pnlText);
    if (!Number.isFinite(rawPnl)) return;
    const pnl = normalizeTradePnl(outcome, rawPnl) ?? 0;
    const rawR = rText.trim() ? Number(rText) : null;
    const normalizedR =
      rawR !== null && Number.isFinite(rawR) ? normalizeTradeR(outcome, rawR) : null;

    let snapshotJson: string | null = null;
    let grade: string | null = null;
    if (strategyId) {
      const strat = strategies.find((s) => s.id === strategyId);
      if (strat && strat.checklist.length > 0) {
        const checked = new Set(checkedRuleIdsByStrategy[strat.id] ?? []);
        const evalRes = evaluateSetupChecklist(strat.checklist, checked);
        grade = evalRes.grade;
        snapshotJson = JSON.stringify(
          strat.checklist.map((c) => ({
            id: c.id,
            name: c.name,
            checked: checked.has(c.id),
            isRequired: c.isRequired,
          })),
        );
      }
    }

    const nowIso = new Date().toISOString();
    await recordTrade({
      pair,
      direction,
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      lotSize: lotsText.trim() ? Number(lotsText) : null,
      outcome,
      pnlDollars: pnl,
      rMultiple: normalizedR,
      strategyId: strategyId || null,
      notes: notes.trim() || null,
      screenshotPath: null,
      checklistSnapshot: snapshotJson,
      setupGrade: grade,
      entryTime: nowIso,
      exitTime: nowIso,
      session: session || null,
    });

    setPnlText('');
    setRText('');
    setNotes('');
    setShowTradeForm(false);
  };

  // Responsive SVG equity polyline coords
  const svgPoints = useMemo(() => {
    const pts = metrics.equityCurve;
    if (pts.length <= 1) {
      return { line: '0,24 220,24', baseY: 24 };
    }
    const vals = pts.map((p) => p.balance);
    const minVal = Math.min(...vals, metrics.startingBalance);
    const maxVal = Math.max(...vals, metrics.startingBalance);
    const span = Math.max(1, maxVal - minVal);
    const w = 220;
    const h = 48;
    const pad = 4;

    const toY = (v: number) => h - pad - ((v - minVal) / span) * (h - pad * 2);
    const coords = pts.map((p, idx) => {
      const x = (idx / (pts.length - 1)) * w;
      const y = toY(p.balance);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return {
      line: coords.join(' '),
      baseY: toY(metrics.startingBalance),
    };
  }, [metrics.equityCurve, metrics.startingBalance]);

  if (needsSetup || showProfileEdit) {
    return (
      <form
        onSubmit={(e) => void handleSaveProfile(e)}
        className="space-y-2 rounded-md border border-blue-500/35 bg-slate-950/90 p-2.5 text-[11px]"
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-100">
            Account &amp; Drawdown Thresholds
          </span>
          {profile.startingBalance > 0 && (
            <button
              type="button"
              onClick={() => setShowProfileEdit(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <input
            type="text"
            value={accName}
            onChange={(e) => setAccName(e.target.value)}
            placeholder="Account Name"
            className="col-span-2 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
          />
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            placeholder="USD"
            className="rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-100"
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <label className="space-y-0.5">
            <span className="text-[10px] text-slate-400">Starting Bal</span>
            <input
              type="number"
              step="any"
              required
              value={startBal}
              onChange={(e) => setStartBal(e.target.value)}
              className="w-full rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] text-slate-400">Daily DD %</span>
            <input
              type="number"
              step="0.1"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              className="w-full rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] text-slate-400">Max DD %</span>
            <input
              type="number"
              step="0.1"
              value={maxLimit}
              onChange={(e) => setMaxLimit(e.target.value)}
              className="w-full rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-1 text-[10px]">
          <span className="text-slate-400">DD Mode:</span>
          <div className="grid flex-1 grid-cols-2 gap-1">
            {(['static', 'trailing'] as DrawdownMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDdMode(m)}
                className={`rounded border py-0.5 capitalize ${
                  ddMode === m
                    ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                {m} DD
              </button>
            ))}
          </div>
        </div>

        {/* Optional One-Click Prop Firm Presets */}
        <div className="flex flex-wrap gap-1">
          {PROP_FIRM_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setDailyLimit(String(p.dailyDdLimit));
                setMaxLimit(String(p.maxDdLimit));
                setDdMode(p.ddMode);
              }}
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[9px] text-slate-300 hover:border-slate-700"
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded bg-blue-600 py-1 text-[11px] font-semibold text-white hover:bg-blue-500"
        >
          Save Account Profile
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-2.5 text-[11px]">
      {/* Drawdown Breach / Warning Banner */}
      {(metrics.dailyDdBreached ||
        metrics.maxDdBreached ||
        metrics.dailyDdWarning ||
        metrics.maxDdWarning) && (
        <div
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-medium ${
            metrics.dailyDdBreached || metrics.maxDdBreached
              ? 'border-rose-500/70 bg-rose-500/15 text-rose-200'
              : 'border-amber-500/60 bg-amber-500/15 text-amber-200'
          }`}
        >
          <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
          <span>
            {metrics.dailyDdBreached
              ? `Daily DD limit reached (${metrics.dailyDrawdownPct.toFixed(2)}% / ${profile.dailyDdLimit}%)`
              : metrics.maxDdBreached
                ? `Max ${profile.ddMode} DD limit reached (${metrics.maxDrawdownPct.toFixed(2)}% / ${profile.maxDdLimit}%)`
                : `Approaching DD threshold (${Math.max(metrics.dailyDrawdownPct, metrics.maxDrawdownPct).toFixed(2)}%)`}
          </span>
        </div>
      )}

      {/* Account Balance + Equity Sparkline Card */}
      <div className="space-y-2 rounded-md border border-slate-800 bg-slate-950/80 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] text-slate-400">
              {profile.accountName} ({profile.ddMode} DD)
            </div>
            <div className="font-mono text-base font-bold text-slate-50">
              ${metrics.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void saveTodaySnapshot(null)}
              title="Save today's equity snapshot"
              className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <Camera className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setShowProfileEdit(true)}
              title="Edit account balance & drawdown thresholds"
              className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <Settings2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setShowTradeForm((v) => !v)}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-500"
            >
              <Plus className="h-3 w-3" />
              Log
            </button>
          </div>
        </div>

        {/* SVG Equity Curve */}
        <svg viewBox="0 0 220 48" className="h-11 w-full overflow-visible rounded bg-slate-900/70">
          <line
            x1="0"
            y1={svgPoints.baseY}
            x2="220"
            y2={svgPoints.baseY}
            stroke="#475569"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          <polyline
            fill="none"
            stroke={metrics.netPnl >= 0 ? '#10B981' : '#EF4444'}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={svgPoints.line}
          />
        </svg>

        {/* Key Stats Row */}
        <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
          <div className="rounded bg-slate-900/80 p-1">
            <div className="text-[9px] text-slate-500">Net P/L</div>
            <div className={metrics.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {metrics.netPnl >= 0 ? '+' : '-'}${Math.abs(metrics.netPnl).toFixed(0)}
            </div>
          </div>
          <div className="rounded bg-slate-900/80 p-1">
            <div className="text-[9px] text-slate-500">Win %</div>
            <div className="text-slate-200">{metrics.winRatePct.toFixed(0)}%</div>
          </div>
          <div className="rounded bg-slate-900/80 p-1">
            <div className="text-[9px] text-slate-500">Avg R</div>
            <div className="text-blue-300">
              {metrics.avgRMultiple !== null ? `${metrics.avgRMultiple.toFixed(2)}R` : '--'}
            </div>
          </div>
          <div className="rounded bg-slate-900/80 p-1">
            <div className="text-[9px] text-slate-500">Daily DD</div>
            <div
              className={
                metrics.dailyDdBreached
                  ? 'text-rose-400'
                  : metrics.dailyDdWarning
                    ? 'text-amber-300'
                    : 'text-slate-200'
              }
            >
              {metrics.dailyDrawdownPct.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Log Manual Trade Form */}
      {showTradeForm && (
        <form
          onSubmit={(e) => void handleLogTrade(e)}
          className="space-y-1.5 rounded-md border border-blue-500/40 bg-slate-950/90 p-2"
        >
          <div className="grid grid-cols-3 gap-1">
            <input
              type="text"
              value={pair}
              onChange={(e) => setPair(e.target.value.toUpperCase())}
              placeholder="Pair"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] uppercase text-slate-100"
            />
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as TradeDirection)}
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as TradeOutcome)}
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
            >
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="breakeven">Breakeven</option>
              <option value="partial">Partial</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <input
              type="number"
              step="any"
              required={outcome !== 'breakeven'}
              value={pnlText}
              onChange={(e) => setPnlText(e.target.value)}
              placeholder={
                outcome === 'loss'
                  ? 'Loss ($) e.g. 150'
                  : outcome === 'breakeven'
                    ? 'P/L ($) e.g. 0'
                    : 'Profit ($) e.g. 150'
              }
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <input
              type="number"
              step="any"
              value={rText}
              onChange={(e) => setRText(e.target.value)}
              placeholder={outcome === 'loss' ? 'R e.g. -1' : 'R e.g. 2.5'}
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <input
              type="number"
              step="any"
              value={lotsText}
              onChange={(e) => setLotsText(e.target.value)}
              placeholder="Lots"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-1">
            <select
              aria-label="Trade Strategy Link"
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
            >
              <option value="">Link Playbook (Optional)</option>
              {strategies.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={session}
              onChange={(e) => setSession(e.target.value)}
              placeholder="Session (e.g. NY AM)"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
            />
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Setup notes / execution lessons..."
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-100"
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded bg-blue-600 py-1 text-[10px] font-semibold text-white hover:bg-blue-500"
          >
            Save Trade Entry
          </button>
        </form>
      )}

      {/* Filter Bar */}
      {trades.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={filterPair}
            onChange={(e) => setFilterPair(e.target.value)}
            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-1 font-mono text-[10px] text-slate-300"
          >
            <option value="">All Pairs ({trades.length})</option>
            {Array.from(new Set(trades.map((t) => t.pair))).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-300"
          >
            <option value="">All Outcomes</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
            <option value="partial">Partial</option>
          </select>
        </div>
      )}

      {/* Closed Trades List */}
      {filteredTrades.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 px-3 py-3 text-center text-[10px] text-slate-500">
          No logged trades yet. Click &ldquo;+ Log&rdquo; or close an ongoing position.
        </div>
      ) : (
        <div className="space-y-1">
          {filteredTrades.slice(0, 25).map((tr) => {
            const stratName = tr.strategyId
              ? strategies.find((s) => s.id === tr.strategyId)?.name
              : null;
            const pnl = normalizeTradePnl(tr.outcome, tr.pnlDollars) ?? 0;
            const rVal = normalizeTradeR(tr.outcome, tr.rMultiple);
            const grade = tr.setupGrade as SetupGrade | null;
            return (
              <div
                key={tr.id}
                className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/75 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-slate-100">{tr.pair}</span>
                    <span
                      className={`text-[9px] font-bold uppercase ${
                        tr.direction === 'long' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {tr.direction}
                    </span>
                    {grade && (
                      <span
                        className="rounded px-1 py-0.5 font-mono text-[9px] font-bold"
                        style={{
                          backgroundColor: `${gradeColor(grade)}22`,
                          color: gradeColor(grade),
                        }}
                      >
                        {grade}
                      </span>
                    )}
                    {stratName && (
                      <span className="truncate text-[9px] text-slate-400">{stratName}</span>
                    )}
                  </div>
                  {tr.notes && (
                    <p className="truncate text-[9px] text-slate-500">{tr.notes}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
                  {rVal !== null && (
                    <span className="text-slate-400">
                      {rVal >= 0 ? '+' : ''}
                      {rVal.toFixed(1)}R
                    </span>
                  )}
                  <span className={pnl >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
                    {pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void deleteTrade(tr.id)}
                    title="Delete trade"
                    className="rounded p-0.5 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
