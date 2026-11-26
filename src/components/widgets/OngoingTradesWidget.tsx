import { CheckCircle2, Plus, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useJournalStore } from '../../stores/journalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStrategiesStore } from '../../stores/strategiesStore';
import type {
  OngoingStatus,
  OngoingTradeRecord,
  TradeDirection,
  TradeOutcome,
} from '../../types/journal';
import { normalizeTradePnl, normalizeTradeR } from '../../utils/drawdownEngine';
import { evaluateSetupChecklist } from '../../utils/strategyGrade';

const STATUS_BADGE: Record<OngoingStatus, { label: string; cls: string }> = {
  running: { label: 'Running', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  moved_to_be: { label: 'BE Set', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  partials_taken: { label: 'Partials', cls: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
  pending: { label: 'Pending', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
};

const SESSION_OPTS = ['', 'Asian', 'London Open', 'NY AM', 'London Close', 'NY PM'];

export function OngoingTradesWidget() {
  const watchlistPairs = useSettingsStore((s) => s.settings.watchlistPairs);

  const ongoingTrades = useJournalStore((s) => s.ongoingTrades);
  const saving = useJournalStore((s) => s.saving);
  const hydrateJournal = useJournalStore((s) => s.hydrateJournal);
  const openOngoingTrade = useJournalStore((s) => s.openOngoingTrade);
  const cycleOngoingStatus = useJournalStore((s) => s.cycleOngoingStatus);
  const deleteOngoingTrade = useJournalStore((s) => s.deleteOngoingTrade);
  const closeOngoingToJournal = useJournalStore((s) => s.closeOngoingToJournal);

  const strategies = useStrategiesStore((s) => s.strategies);
  const checkedRuleIdsByStrategy = useStrategiesStore((s) => s.checkedRuleIdsByStrategy);
  const loadStrategies = useStrategiesStore((s) => s.loadStrategies);

  const [showAddForm, setShowAddForm] = useState(false);
  const [pair, setPair] = useState(watchlistPairs[0] || 'EURUSD');
  const [direction, setDirection] = useState<TradeDirection>('long');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [lotSize, setLotSize] = useState('0.50');
  const [strategyId, setStrategyId] = useState('');
  const [notes, setNotes] = useState('');

  const [closingTrade, setClosingTrade] = useState<OngoingTradeRecord | null>(null);
  const [closeOutcome, setCloseOutcome] = useState<TradeOutcome>('win');
  const [closePnl, setClosePnl] = useState('');
  const [closeR, setCloseR] = useState('');
  const [closeSession, setCloseSession] = useState('NY AM');
  const [closeNotes, setCloseNotes] = useState('');

  useEffect(() => {
    void hydrateJournal();
    void loadStrategies();
  }, [hydrateJournal, loadStrategies]);

  const handleOpenTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const entry = Number(entryPrice);
    if (!Number.isFinite(entry) || entry <= 0) return;

    await openOngoingTrade({
      pair,
      direction,
      entryPrice: entry,
      stopLoss: stopLoss.trim() ? Number(stopLoss) : null,
      takeProfit: takeProfit.trim() ? Number(takeProfit) : null,
      lotSize: lotSize.trim() ? Number(lotSize) : null,
      status: 'running',
      strategyId: strategyId || null,
      notes: notes.trim() || null,
    });

    setEntryPrice('');
    setStopLoss('');
    setTakeProfit('');
    setNotes('');
    setShowAddForm(false);
  };

  const handleConfirmClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingTrade) return;
    const rawPnl =
      closeOutcome === 'breakeven' && !closePnl.trim() ? 0 : Number(closePnl);
    if (!Number.isFinite(rawPnl)) return;
    const pnl = normalizeTradePnl(closeOutcome, rawPnl) ?? 0;
    const rawR = closeR.trim() ? Number(closeR) : null;
    const normalizedR =
      rawR !== null && Number.isFinite(rawR)
        ? normalizeTradeR(closeOutcome, rawR)
        : null;

    let snapshotJson: string | null = null;
    let grade: string | null = null;
    if (closingTrade.strategyId) {
      const strat = strategies.find((s) => s.id === closingTrade.strategyId);
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

    await closeOngoingToJournal({
      ongoingId: closingTrade.id,
      outcome: closeOutcome,
      pnlDollars: pnl,
      rMultiple: normalizedR,
      notes: closeNotes.trim() || closingTrade.notes,
      screenshotPath: null,
      checklistSnapshot: snapshotJson,
      setupGrade: grade,
      exitTime: new Date().toISOString(),
      session: closeSession || null,
    });

    setClosingTrade(null);
    setClosePnl('');
    setCloseR('');
    setCloseNotes('');
  };

  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          {ongoingTrades.length} active position{ongoingTrades.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-500"
        >
          {showAddForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showAddForm ? 'Cancel' : 'Open Pos'}
        </button>
      </div>

      {/* Add Ongoing Position Form */}
      {showAddForm && (
        <form
          onSubmit={(e) => void handleOpenTrade(e)}
          className="space-y-1.5 rounded-md border border-blue-500/40 bg-slate-950/90 p-2"
        >
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="text"
              value={pair}
              onChange={(e) => setPair(e.target.value.toUpperCase())}
              placeholder="Pair (e.g. EURUSD)"
              className="rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] uppercase text-slate-100"
            />
            <div className="grid grid-cols-2 gap-1">
              {(['long', 'short'] as TradeDirection[]).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setDirection(dir)}
                  className={`rounded border py-1 text-[10px] font-semibold uppercase ${
                    direction === dir
                      ? dir === 'long'
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                        : 'border-rose-500 bg-rose-500/20 text-rose-300'
                      : 'border-slate-800 bg-slate-900 text-slate-400'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1">
            <input
              type="number"
              step="any"
              required
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="Entry*"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <input
              type="number"
              step="any"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="SL"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <input
              type="number"
              step="any"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="TP"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <input
              type="number"
              step="any"
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              placeholder="Lots"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
            >
              <option value="">No linked playbook</option>
              {strategies.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Plan / BE trigger notes"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded bg-blue-600 py-1 text-[10px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Track Active Position
          </button>
        </form>
      )}

      {/* Close Trade -> Journal Modal Sheet */}
      {closingTrade && (
        <form
          onSubmit={(e) => void handleConfirmClose(e)}
          className="space-y-2 rounded-md border border-emerald-500/40 bg-slate-950/95 p-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-300">
              Close {closingTrade.pair} ({closingTrade.direction.toUpperCase()}) → Journal
            </span>
            <button
              type="button"
              onClick={() => setClosingTrade(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {(['win', 'loss', 'breakeven', 'partial'] as TradeOutcome[]).map((out) => (
              <button
                key={out}
                type="button"
                onClick={() => setCloseOutcome(out)}
                className={`rounded border py-1 text-[10px] font-medium capitalize ${
                  closeOutcome === out
                    ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                {out}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <input
              type="number"
              step="any"
              required={closeOutcome !== 'breakeven'}
              value={closePnl}
              onChange={(e) => setClosePnl(e.target.value)}
              placeholder={
                closeOutcome === 'loss'
                  ? 'Loss ($) e.g. 150'
                  : closeOutcome === 'breakeven'
                    ? 'P/L ($) e.g. 0'
                    : 'Profit ($) e.g. 250'
              }
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <input
              type="number"
              step="any"
              value={closeR}
              onChange={(e) => setCloseR(e.target.value)}
              placeholder={closeOutcome === 'loss' ? 'R e.g. -1' : 'R-Multiple e.g. 2.5'}
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <select
              value={closeSession}
              onChange={(e) => setCloseSession(e.target.value)}
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
            >
              {SESSION_OPTS.map((s) => (
                <option key={s || 'any'} value={s}>
                  {s || 'Session'}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder="Closing notes / execution review..."
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-100"
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded bg-emerald-600 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500"
          >
            Move to Trade Journal &amp; Update Equity
          </button>
        </form>
      )}

      {/* Active Trade Cards */}
      {ongoingTrades.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 px-3 py-3 text-center text-[10px] text-slate-500">
          No open positions tracked.
        </div>
      ) : (
        <div className="space-y-1.5">
          {ongoingTrades.map((tr) => {
            const st = STATUS_BADGE[tr.status] ?? STATUS_BADGE.running;
            const stratName = tr.strategyId
              ? strategies.find((s) => s.id === tr.strategyId)?.name
              : null;
            return (
              <div
                key={tr.id}
                className="space-y-1 rounded-md border border-slate-800 bg-slate-950/75 p-2"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-slate-100">{tr.pair}</span>
                    <span
                      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        tr.direction === 'long'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {tr.direction === 'long' ? (
                        <TrendingUp className="h-2.5 w-2.5" />
                      ) : (
                        <TrendingDown className="h-2.5 w-2.5" />
                      )}
                      {tr.direction}
                    </span>
                    {tr.lotSize !== null && (
                      <span className="font-mono text-[10px] text-slate-400">
                        {tr.lotSize}L
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void cycleOngoingStatus(tr)}
                      title="Click to cycle position status"
                      className={`rounded border px-1.5 py-0.5 text-[9px] font-medium ${st.cls}`}
                    >
                      {st.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setClosingTrade(tr);
                        setCloseNotes(tr.notes ?? '');
                      }}
                      title="Close trade to Journal"
                      className="inline-flex items-center gap-0.5 rounded bg-emerald-600/25 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300 hover:bg-emerald-600/40"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteOngoingTrade(tr.id)}
                      title="Remove active trade"
                      className="rounded p-0.5 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-400">
                  <span>E: {tr.entryPrice}</span>
                  {tr.stopLoss !== null && <span className="text-rose-400">SL: {tr.stopLoss}</span>}
                  {tr.takeProfit !== null && (
                    <span className="text-emerald-400">TP: {tr.takeProfit}</span>
                  )}
                  {stratName && (
                    <span className="font-sans text-[9px] text-blue-300">• {stratName}</span>
                  )}
                </div>
                {tr.notes && <p className="text-[10px] text-slate-400">{tr.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
