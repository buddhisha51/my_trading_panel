import {
  AlertOctagon,
  BarChart3,
  Camera,
  Download,
  FileText,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useJournalStore } from '../../stores/journalStore';
import { useNotesStore } from '../../stores/notesStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStrategiesStore } from '../../stores/strategiesStore';
import { useViewerStore } from '../../stores/viewerStore';
import {
  PROP_FIRM_PRESETS,
  type ChecklistSnapshotItem,
  type TradeDirection,
  type TradeOutcome,
  type TradeRecord,
} from '../../types/journal';
import type { DrawdownMode } from '../../types/settings';
import {
  computeGroupedPerformanceStats,
  normalizeTradePnl,
  normalizeTradeR,
} from '../../utils/drawdownEngine';
import { evaluateSetupChecklist, gradeColor, type SetupGrade } from '../../utils/strategyGrade';
import { exportTradesToCsv, parseBrokerTradesCsv, type CsvParseResult } from '../../utils/tradeCsv';

export function TradeJournalWidget() {
  const watchlistPairs = useSettingsStore((s) => s.settings.watchlistPairs);

  const profile = useJournalStore((s) => s.profile);
  const profiles = useJournalStore((s) => s.profiles);
  const trades = useJournalStore((s) => s.trades);
  const metrics = useJournalStore((s) => s.metrics);
  const saving = useJournalStore((s) => s.saving);
  const hydrateJournal = useJournalStore((s) => s.hydrateJournal);
  const switchAccount = useJournalStore((s) => s.switchAccount);
  const createAccountProfile = useJournalStore((s) => s.createAccountProfile);
  const updateProfile = useJournalStore((s) => s.updateProfile);
  const deleteAccountProfile = useJournalStore((s) => s.deleteAccountProfile);
  const recordTrade = useJournalStore((s) => s.recordTrade);
  const importTradesCsvRows = useJournalStore((s) => s.importTradesCsvRows);
  const deleteTrade = useJournalStore((s) => s.deleteTrade);
  const saveTodaySnapshot = useJournalStore((s) => s.saveTodaySnapshot);

  const strategies = useStrategiesStore((s) => s.strategies);
  const checkedRuleIdsByStrategy = useStrategiesStore((s) => s.checkedRuleIdsByStrategy);
  const loadStrategies = useStrategiesStore((s) => s.loadStrategies);
  const notesList = useNotesStore((s) => s.notes);
  const triggerEditRequest = useViewerStore((s) => s.triggerEditRequest);
  const triggerNoteLinkRequest = useViewerStore((s) => s.triggerNoteLinkRequest);

  const safeProfiles = profiles && profiles.length > 0 ? profiles : [profile];

  const [journalTab, setJournalTab] = useState<'log' | 'stats'>('log');
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [creatingNewAccount, setCreatingNewAccount] = useState(false);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [editingTrade, setEditingTrade] = useState<TradeRecord | null>(null);
  const [filterPair, setFilterPair] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(25);
  const [deleteAccConfirm, setDeleteAccConfirm] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvParseResult | null>(null);
  const [csvStatusMsg, setCsvStatusMsg] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  // Account setup / edit state
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

  // Manual Trade form state (also reused when editing an existing closed trade)
  const [pair, setPair] = useState(watchlistPairs[0] || 'EURUSD');
  const [direction, setDirection] = useState<TradeDirection>('long');
  const [outcome, setOutcome] = useState<TradeOutcome>('win');
  const [pnlText, setPnlText] = useState('');
  const [rText, setRText] = useState('');
  const [lotsText, setLotsText] = useState('0.50');
  const [entryText, setEntryText] = useState('');
  const [slText, setSlText] = useState('');
  const [tpText, setTpText] = useState('');
  const [strategyId, setStrategyId] = useState('');
  const [session, setSession] = useState('NY AM');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    void hydrateJournal();
    void loadStrategies();
  }, [hydrateJournal, loadStrategies]);

  useEffect(() => {
    if (creatingNewAccount) return;
    setAccName(profile.accountName);
    if (profile.startingBalance > 0) setStartBal(String(profile.startingBalance));
    setCurrency(profile.currency || 'USD');
    setDdMode(profile.ddMode);
    setDailyLimit(profile.dailyDdLimit !== null ? String(profile.dailyDdLimit) : '');
    setMaxLimit(profile.maxDdLimit !== null ? String(profile.maxDdLimit) : '');
  }, [creatingNewAccount, profile]);

  const needsSetup = profile.startingBalance <= 0 && !showProfileEdit && !creatingNewAccount;

  const filteredTrades = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trades.filter((t) => {
      if (filterPair && t.pair !== filterPair) return false;
      if (filterOutcome && t.outcome !== filterOutcome) return false;
      if (q) {
        const hay = `${t.pair} ${t.session ?? ''} ${t.notes ?? ''} ${t.setupGrade ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filterOutcome, filterPair, searchQuery, trades]);

  const strategyNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of strategies) map[s.id] = s.name;
    return map;
  }, [strategies]);

  const statsBySession = useMemo(
    () =>
      computeGroupedPerformanceStats(
        trades,
        (t) => t.session?.trim() || 'Unspecified',
      ),
    [trades],
  );
  const statsByPlaybook = useMemo(
    () =>
      computeGroupedPerformanceStats(
        trades,
        (t) => t.strategyId || '__none__',
        (k) => (k === '__none__' ? 'No Playbook' : strategyNamesById[k] ?? 'Archived Playbook'),
      ),
    [strategyNamesById, trades],
  );
  const statsByGrade = useMemo(
    () =>
      computeGroupedPerformanceStats(
        trades,
        (t) => t.setupGrade || 'Ungraded',
      ),
    [trades],
  );

  const openEditTradeForm = (tr: TradeRecord) => {
    setEditingTrade(tr);
    setPair(tr.pair);
    setDirection(tr.direction);
    setOutcome((tr.outcome as TradeOutcome) || 'win');
    setPnlText(tr.pnlDollars !== null ? String(tr.pnlDollars) : '');
    setRText(tr.rMultiple !== null ? String(tr.rMultiple) : '');
    setLotsText(tr.lotSize !== null ? String(tr.lotSize) : '');
    setEntryText(tr.entryPrice !== null ? String(tr.entryPrice) : '');
    setSlText(tr.stopLoss !== null ? String(tr.stopLoss) : '');
    setTpText(tr.takeProfit !== null ? String(tr.takeProfit) : '');
    setStrategyId(tr.strategyId ?? '');
    setSession(tr.session ?? '');
    setNotes(tr.notes ?? '');
    setShowTradeForm(true);
  };

  const resetTradeForm = () => {
    setEditingTrade(null);
    setPnlText('');
    setRText('');
    setEntryText('');
    setSlText('');
    setTpText('');
    setNotes('');
    setShowTradeForm(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const bal = Number(startBal);
    if (!Number.isFinite(bal) || bal <= 0) return;
    const payload = {
      accountName: accName.trim() || 'My Account',
      startingBalance: bal,
      currency: currency.trim().toUpperCase() || 'USD',
      ddMode,
      dailyDdLimit: dailyLimit.trim() ? Number(dailyLimit) : null,
      maxDdLimit: maxLimit.trim() ? Number(maxLimit) : null,
    };
    if (creatingNewAccount) {
      await createAccountProfile(payload);
      setCreatingNewAccount(false);
    } else {
      await updateProfile({ id: profile.id, ...payload });
    }
    setShowProfileEdit(false);
  };

  const handleLogOrEditTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawPnl = outcome === 'breakeven' && !pnlText.trim() ? 0 : Number(pnlText);
    if (!Number.isFinite(rawPnl)) return;
    const pnl = normalizeTradePnl(outcome, rawPnl) ?? 0;
    const rawR = rText.trim() ? Number(rText) : null;
    const normalizedR =
      rawR !== null && Number.isFinite(rawR) ? normalizeTradeR(outcome, rawR) : null;

    let snapshotJson: string | null = editingTrade?.checklistSnapshot ?? null;
    let grade: string | null = editingTrade?.setupGrade ? String(editingTrade.setupGrade) : null;
    if (strategyId && (!editingTrade || editingTrade.strategyId !== strategyId)) {
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

    const numOrNull = (txt: string) => {
      const n = txt.trim() ? Number(txt) : null;
      return n !== null && Number.isFinite(n) ? n : null;
    };

    const nowIso = new Date().toISOString();
    await recordTrade({
      id: editingTrade?.id,
      accountId: profile.id,
      pair,
      direction,
      entryPrice: numOrNull(entryText),
      stopLoss: numOrNull(slText),
      takeProfit: numOrNull(tpText),
      lotSize: numOrNull(lotsText),
      outcome,
      pnlDollars: pnl,
      rMultiple: normalizedR,
      strategyId: strategyId || null,
      notes: notes.trim() || null,
      screenshotPath: editingTrade?.screenshotPath ?? null,
      checklistSnapshot: snapshotJson,
      setupGrade: grade,
      entryTime: editingTrade?.entryTime ?? nowIso,
      exitTime: editingTrade?.exitTime ?? nowIso,
      session: session || null,
    });

    resetTradeForm();
  };

  const handleExportCsv = () => {
    const csv = exportTradesToCsv(filteredTrades, profile.accountName, strategyNamesById);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeAcc = profile.accountName.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'account';
    a.href = url;
    a.download = `trades_${safeAcc}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setCsvStatusMsg(`Exported ${filteredTrades.length} trades to CSV.`);
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

  if (needsSetup || showProfileEdit || creatingNewAccount) {
    return (
      <form
        onSubmit={(e) => void handleSaveProfile(e)}
        className="space-y-2 rounded-md border border-blue-500/35 bg-slate-950/90 p-2.5 text-[11px]"
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-100">
            {creatingNewAccount ? 'New Trading Account' : 'Account & Drawdown Thresholds'}
          </span>
          {(profile.startingBalance > 0 || creatingNewAccount) && (
            <button
              type="button"
              onClick={() => {
                setShowProfileEdit(false);
                setCreatingNewAccount(false);
              }}
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
          {creatingNewAccount ? 'Create Account' : 'Save Account Profile'}
        </button>
      </form>
    );
  }

  let parsedEditingSnapshot: ChecklistSnapshotItem[] = [];
  if (editingTrade?.checklistSnapshot) {
    try {
      const rawSnap = JSON.parse(editingTrade.checklistSnapshot);
      if (Array.isArray(rawSnap)) parsedEditingSnapshot = rawSnap;
    } catch {
      // ignore malformed snapshot
    }
  }

  return (
    <div className="space-y-2.5 text-[11px]">
      {/* Account Switcher Bar */}
      <div className="flex items-center justify-between gap-1">
        <select
          aria-label="Active Trading Account"
          value={profile.id}
          onChange={(e) => {
            setDeleteAccConfirm(null);
            void switchAccount(e.target.value);
          }}
          className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] font-medium text-slate-200"
        >
          {safeProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.accountName} ({p.ddMode} DD)
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            setCreatingNewAccount(true);
            setAccName('Funded 50K');
            setStartBal('50000');
          }}
          title="Add another trading / prop account"
          className="inline-flex items-center gap-0.5 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
        >
          <Plus className="h-3 w-3" />
          Acc
        </button>

        {profile.id !== 'default' && (
          <button
            type="button"
            onClick={() => setDeleteAccConfirm(deleteAccConfirm ? null : profile.id)}
            title="Delete this custom account"
            className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-400 hover:text-rose-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {deleteAccConfirm === profile.id && (
        <div className="flex items-center justify-between gap-2 rounded border border-rose-500/45 bg-rose-500/12 px-2 py-1 text-[10px] text-rose-200">
          <span>Delete &ldquo;{profile.accountName}&rdquo; and its trades?</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                void deleteAccountProfile(profile.id, true);
                setDeleteAccConfirm(null);
              }}
              className="rounded bg-rose-600 px-2 py-0.5 text-[9px] font-semibold text-white hover:bg-rose-500"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setDeleteAccConfirm(null)}
              className="rounded border border-slate-700 px-1.5 py-0.5 text-[9px] text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
              onClick={() => {
                if (showTradeForm) resetTradeForm();
                else setShowTradeForm(true);
              }}
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

      {/* Sub-Tabs + CSV Export / Import Actions */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="grid grid-cols-2 gap-1 rounded border border-slate-800 bg-slate-950 p-0.5">
          <button
            type="button"
            onClick={() => setJournalTab('log')}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
              journalTab === 'log'
                ? 'bg-blue-600/25 text-blue-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListChecks className="h-3 w-3" />
            Log ({trades.length})
          </button>
          <button
            type="button"
            onClick={() => setJournalTab('stats')}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
              journalTab === 'stats'
                ? 'bg-blue-600/25 text-blue-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="h-3 w-3" />
            Stats
          </button>
        </div>

        <div className="flex items-center gap-1">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void file.text().then((raw) => {
                setCsvStatusMsg(null);
                setCsvPreview(parseBrokerTradesCsv(raw));
              });
            }}
          />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            title="Import MT5 / cTrader / Prop CSV trade history"
            className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
          >
            <Upload className="h-3 w-3" />
            Import
          </button>
          {trades.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              title="Export filtered trades to CSV"
              className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
            >
              <Download className="h-3 w-3" />
              CSV
            </button>
          )}
        </div>
      </div>

      {/* CSV Import Preview Card */}
      {csvPreview && (
        <div className="space-y-1.5 rounded-md border border-blue-500/40 bg-slate-950/90 p-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-blue-300">
              CSV Preview ({csvPreview.parsedRows.length} trades ready)
            </span>
            <button
              type="button"
              onClick={() => setCsvPreview(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {csvPreview.warnings.map((w) => (
            <div key={w} className="text-rose-300">
              {w}
            </div>
          ))}
          {csvPreview.skippedRows > 0 && (
            <div className="text-slate-400">
              Skipped {csvPreview.skippedRows} non-trade / deposit lines (delimiter:{' '}
              {csvPreview.delimiter === '\t' ? 'TAB' : csvPreview.delimiter}).
            </div>
          )}
          {csvPreview.parsedRows.slice(0, 3).map((r, i) => (
            <div
              key={`${r.pair}-${i}`}
              className="flex justify-between rounded bg-slate-900/70 px-1.5 py-0.5 font-mono text-[9px] text-slate-300"
            >
              <span>
                {r.pair} {r.direction.toUpperCase()} {r.lotSize ?? ''}L
              </span>
              <span className={(r.pnlDollars ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {(r.pnlDollars ?? 0) >= 0 ? '+' : '-'}${Math.abs(r.pnlDollars ?? 0).toFixed(2)}
              </span>
            </div>
          ))}
          {csvPreview.parsedRows.length > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void importTradesCsvRows(csvPreview.parsedRows).then((sum) => {
                  setCsvPreview(null);
                  setCsvStatusMsg(
                    `Imported ${sum.importedCount} trades (${sum.skippedDuplicates} duplicates skipped).`,
                  );
                })
              }
              className="w-full rounded bg-blue-600 py-1 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Import {csvPreview.parsedRows.length} Trades
            </button>
          )}
        </div>
      )}

      {csvStatusMsg && (
        <div className="flex items-center justify-between rounded bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
          <span>{csvStatusMsg}</span>
          <button type="button" onClick={() => setCsvStatusMsg(null)} className="text-emerald-200">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Log / Edit Trade Form */}
      {showTradeForm && (
        <form
          onSubmit={(e) => void handleLogOrEditTrade(e)}
          className="space-y-1.5 rounded-md border border-blue-500/40 bg-slate-950/90 p-2"
        >
          <div className="flex items-center justify-between text-[10px] font-semibold text-blue-300">
            <span>{editingTrade ? `Edit Trade (${editingTrade.pair})` : 'Log Trade Entry'}</span>
            <button type="button" onClick={resetTradeForm} className="text-slate-400 hover:text-white">
              <X className="h-3 w-3" />
            </button>
          </div>

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

          <div className="grid grid-cols-3 gap-1">
            <input
              type="number"
              step="any"
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              placeholder="Entry (opt)"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <input
              type="number"
              step="any"
              value={slText}
              onChange={(e) => setSlText(e.target.value)}
              placeholder="SL (opt)"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <input
              type="number"
              step="any"
              value={tpText}
              onChange={(e) => setTpText(e.target.value)}
              placeholder="TP (opt)"
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

          {parsedEditingSnapshot.length > 0 && (
            <div className="space-y-0.5 rounded border border-slate-800 bg-slate-900/70 p-1.5 text-[9px] text-slate-300">
              <div className="font-semibold text-slate-400">Stored Setup Checklist</div>
              {parsedEditingSnapshot.map((item) => (
                <div key={item.id} className="flex items-center gap-1">
                  <span className={item.checked ? 'text-emerald-400' : 'text-slate-500'}>
                    {item.checked ? '✓' : '○'}
                  </span>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded bg-blue-600 py-1 text-[10px] font-semibold text-white hover:bg-blue-500"
          >
            {editingTrade ? 'Update Trade Entry' : 'Save Trade Entry'}
          </button>
        </form>
      )}

      {journalTab === 'stats' ? (
        <div className="space-y-2">
          {[
            { title: 'Performance by Session', rows: statsBySession },
            { title: 'Performance by Playbook', rows: statsByPlaybook },
            { title: 'Performance by Setup Grade', rows: statsByGrade },
          ].map((sec) => (
            <div
              key={sec.title}
              className="space-y-1 rounded-md border border-slate-800 bg-slate-950/75 p-2"
            >
              <div className="text-[10px] font-semibold text-slate-300">{sec.title}</div>
              {sec.rows.length === 0 ? (
                <div className="text-[9px] text-slate-500">No trades logged yet.</div>
              ) : (
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-800 text-[9px] text-slate-500">
                      <th className="py-0.5 text-left font-normal">Group</th>
                      <th className="py-0.5 text-right font-normal">Trades</th>
                      <th className="py-0.5 text-right font-normal">Win%</th>
                      <th className="py-0.5 text-right font-normal">Avg R</th>
                      <th className="py-0.5 text-right font-normal">Net P/L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {sec.rows.map((r) => (
                      <tr key={r.key}>
                        <td className="py-0.5 font-sans text-slate-200">{r.label}</td>
                        <td className="py-0.5 text-right text-slate-400">{r.trades}</td>
                        <td className="py-0.5 text-right text-slate-300">
                          {r.winRatePct.toFixed(0)}%
                        </td>
                        <td className="py-0.5 text-right text-blue-300">
                          {r.avgR !== null ? `${r.avgR.toFixed(2)}R` : '–'}
                        </td>
                        <td
                          className={`py-0.5 text-right ${
                            r.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {r.netPnl >= 0 ? '+' : '-'}${Math.abs(r.netPnl).toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Filter + Search Bar */}
          {trades.length > 0 && (
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notes, session, grade..."
                  className="w-full rounded border border-slate-800 bg-slate-950 py-1 pl-6 pr-2 text-[10px] text-slate-200"
                />
              </div>
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
            </div>
          )}

          {/* Closed Trades List */}
          {filteredTrades.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-800 px-3 py-3 text-center text-[10px] text-slate-500">
              No logged trades yet. Click &ldquo;+ Log&rdquo; or close an ongoing position.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTrades.slice(0, visibleLimit).map((tr) => {
                const stratName = tr.strategyId
                  ? strategies.find((s) => s.id === tr.strategyId)?.name
                  : null;
                const pnl = normalizeTradePnl(tr.outcome, tr.pnlDollars) ?? 0;
                const rVal = normalizeTradeR(tr.outcome, tr.rMultiple);
                const grade = tr.setupGrade as SetupGrade | null;
                const linkedNote = notesList.find((n) => n.tradeId === tr.id);
                return (
                  <div
                    key={tr.id}
                    className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/75 px-2 py-1.5"
                  >
                    <div
                      onClick={() => openEditTradeForm(tr)}
                      title="Click to inspect / edit trade"
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
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
                        {tr.session && (
                          <span className="rounded bg-slate-900 px-1 py-0.5 text-[8px] text-slate-400">
                            {tr.session}
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

                    <div className="flex shrink-0 items-center gap-1 font-mono text-[10px]">
                      {rVal !== null && (
                        <span className="text-slate-400">
                          {rVal >= 0 ? '+' : ''}
                          {rVal.toFixed(1)}R
                        </span>
                      )}
                      <span
                        className={
                          pnl >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'
                        }
                      >
                        {pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditTradeForm(tr)}
                        title="Edit trade details"
                        aria-label={`Edit trade ${tr.pair}`}
                        className="rounded p-0.5 text-slate-500 hover:text-slate-200"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (linkedNote) {
                            triggerEditRequest('note', linkedNote.id);
                          } else {
                            triggerNoteLinkRequest({
                              tradeId: tr.id,
                              pair: tr.pair,
                              session: tr.session,
                              suggestedTitle: `${tr.pair} ${tr.direction.toUpperCase()} Review`,
                            });
                          }
                        }}
                        title={linkedNote ? `Open linked note: ${linkedNote.title}` : 'Link a Quick Note'}
                        aria-label={`Note for trade ${tr.pair}`}
                        className={`rounded p-0.5 ${
                          linkedNote
                            ? 'text-blue-400 hover:text-blue-300'
                            : 'text-slate-500 hover:text-blue-300'
                        }`}
                      >
                        <FileText className="h-3 w-3" />
                      </button>
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

              {filteredTrades.length > visibleLimit && (
                <button
                  type="button"
                  onClick={() => setVisibleLimit((v) => v + 25)}
                  className="w-full rounded border border-slate-800 bg-slate-950 py-1 text-[10px] text-slate-300 hover:bg-slate-900"
                >
                  Show More ({filteredTrades.length - visibleLimit} remaining)
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
