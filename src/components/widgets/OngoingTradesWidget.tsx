import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Pencil,
  Plus,
  Radio,
  ShieldAlert,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { useJournalStore } from '../../stores/journalStore';
import { useMarketStore } from '../../stores/marketStore';
import { useNotesStore } from '../../stores/notesStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStrategiesStore } from '../../stores/strategiesStore';
import { useViewerStore } from '../../stores/viewerStore';
import type {
  OngoingStatus,
  OngoingTradeRecord,
  TradeDirection,
  TradeOutcome,
} from '../../types/journal';
import { getOngoingRiskSummary, inspectOngoingTradeRisk } from '../../utils/alertEngine';
import { getImminentNewsForPair } from '../../utils/calendarAlerts';
import { normalizeTradePnl, normalizeTradeR } from '../../utils/drawdownEngine';
import { evaluateSetupChecklist } from '../../utils/strategyGrade';
import {
  formatElapsedDuration,
  formatEntryTimestamp,
  toZoneDateTimeLocalInput,
} from '../../utils/timezone';

const STATUS_BADGE: Record<OngoingStatus, { label: string; cls: string }> = {
  running: { label: 'Running', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  moved_to_be: { label: 'BE Set', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  partials_taken: { label: 'Partials', cls: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
  pending: { label: 'Pending', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
};

const SESSION_OPTS = ['', 'Asian', 'London Open', 'NY AM', 'London Close', 'NY PM'];

export function OngoingTradesWidget() {
  const watchlistPairs = useSettingsStore((s) => s.settings.watchlistPairs);
  const displayTimezone = useSettingsStore((s) => s.settings.displayTimezone);
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat);
  const notificationsEnabled = useSettingsStore((s) => s.settings.notificationsEnabled);
  const volatilityThresholdMin = useSettingsStore((s) => s.settings.volatilityThresholdMin);

  const ongoingTrades = useJournalStore((s) => s.ongoingTrades);
  const saving = useJournalStore((s) => s.saving);
  const hydrateJournal = useJournalStore((s) => s.hydrateJournal);
  const openOngoingTrade = useJournalStore((s) => s.openOngoingTrade);
  const cycleOngoingStatus = useJournalStore((s) => s.cycleOngoingStatus);
  const updateOngoingRisk = useJournalStore((s) => s.updateOngoingRisk);
  const deleteOngoingTrade = useJournalStore((s) => s.deleteOngoingTrade);
  const closeOngoingToJournal = useJournalStore((s) => s.closeOngoingToJournal);

  const events = useMarketStore((s) => s.events);
  const notesList = useNotesStore((s) => s.notes);
  const triggerEditRequest = useViewerStore((s) => s.triggerEditRequest);
  const triggerNoteLinkRequest = useViewerStore((s) => s.triggerNoteLinkRequest);

  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [editSlDraft, setEditSlDraft] = useState('');
  const [editTpDraft, setEditTpDraft] = useState('');

  const strategies = useStrategiesStore((s) => s.strategies);
  const checkedRuleIdsByStrategy = useStrategiesStore((s) => s.checkedRuleIdsByStrategy);
  const loadStrategies = useStrategiesStore((s) => s.loadStrategies);

  const [now, setNow] = useState(() => DateTime.utc());
  const [showAddForm, setShowAddForm] = useState(false);
  const [pair, setPair] = useState(watchlistPairs[0] || 'EURUSD');
  const [direction, setDirection] = useState<TradeDirection>('long');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [lotSize, setLotSize] = useState('0.50');
  const [entryTimeInput, setEntryTimeInput] = useState(() =>
    toZoneDateTimeLocalInput(DateTime.utc(), displayTimezone),
  );
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

  useEffect(() => {
    if (ongoingTrades.length === 0) return;
    setNow(DateTime.utc());
    const id = window.setInterval(() => setNow(DateTime.utc()), 1000);
    return () => window.clearInterval(id);
  }, [ongoingTrades.length]);

  const handleOpenTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const entry = Number(entryPrice);
    if (!Number.isFinite(entry) || entry <= 0) return;

    const parsedEntry = entryTimeInput.trim()
      ? DateTime.fromFormat(entryTimeInput.trim(), "yyyy-MM-dd'T'HH:mm", {
          zone: displayTimezone,
        })
      : null;
    const openedAtIso =
      parsedEntry && parsedEntry.isValid
        ? (parsedEntry.toUTC().toISO() ?? new Date().toISOString())
        : new Date().toISOString();

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
      openedAt: openedAtIso,
    });

    setEntryPrice('');
    setStopLoss('');
    setTakeProfit('');
    setEntryTimeInput(toZoneDateTimeLocalInput(DateTime.utc(), displayTimezone));
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

  const startEditingRisk = (trade: OngoingTradeRecord) => {
    setEditingRiskId(trade.id);
    setEditSlDraft(trade.stopLoss !== null ? String(trade.stopLoss) : '');
    setEditTpDraft(trade.takeProfit !== null ? String(trade.takeProfit) : '');
  };

  const handleSaveRisk = async (e: React.FormEvent, trade: OngoingTradeRecord) => {
    e.preventDefault();
    const parsedSl = editSlDraft.trim() ? Number(editSlDraft) : null;
    const parsedTp = editTpDraft.trim() ? Number(editTpDraft) : null;
    await updateOngoingRisk(trade, {
      stopLoss: parsedSl !== null && Number.isFinite(parsedSl) && parsedSl > 0 ? parsedSl : null,
      takeProfit: parsedTp !== null && Number.isFinite(parsedTp) && parsedTp > 0 ? parsedTp : null,
    });
    setEditingRiskId(null);
  };

  const riskSummary = getOngoingRiskSummary(ongoingTrades, now);
  const firstUnprotectedTrade = ongoingTrades.find(
    (t) => inspectOngoingTradeRisk(t).needsAttention,
  );
  const nextReminderMin =
    riskSummary.soonestNextReminderMs !== null
      ? Math.max(1, Math.ceil(riskSummary.soonestNextReminderMs / 60_000))
      : null;

  return (
    <div className="space-y-2 text-[11px]">
      {riskSummary.unprotectedCount > 0 && (
        <div
          role="alert"
          className={`flex items-start justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[10px] ${
            riskSummary.missingSlCount > 0
              ? 'border-rose-500/45 bg-rose-500/12 text-rose-200'
              : 'border-amber-500/45 bg-amber-500/12 text-amber-200'
          }`}
        >
          <div className="flex min-w-0 items-start gap-1.5">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 leading-snug">
              <div className="font-semibold">
                {riskSummary.unprotectedCount}{' '}
                {riskSummary.unprotectedCount === 1 ? 'position' : 'positions'} missing{' '}
                {riskSummary.missingSlCount > 0 && riskSummary.missingTpCount > 0
                  ? 'SL / TP'
                  : riskSummary.missingSlCount > 0
                    ? 'Stop Loss'
                    : 'Take Profit'}
              </div>
              <div className="text-[9px] opacity-85">
                {notificationsEnabled
                  ? `15m market check reminder active${nextReminderMin ? ` • next in ~${nextReminderMin}m` : ''}`
                  : '15m alerts paused in Settings → Keys'}
              </div>
            </div>
          </div>
          {firstUnprotectedTrade && (
            <button
              type="button"
              onClick={() => startEditingRisk(firstUnprotectedTrade)}
              className="shrink-0 rounded border border-current/30 bg-slate-950/60 px-1.5 py-0.5 text-[9px] font-semibold hover:bg-slate-900"
            >
              Set SL/TP
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          {ongoingTrades.length} active position{ongoingTrades.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() =>
            setShowAddForm((v) => {
              const next = !v;
              if (next) {
                setEntryTimeInput(toZoneDateTimeLocalInput(DateTime.utc(), displayTimezone));
              }
              return next;
            })
          }
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
            <label className="flex flex-col gap-0.5">
              <span className="text-[9px] text-slate-400">Entry Time</span>
              <input
                type="datetime-local"
                aria-label="Entry Time"
                value={entryTimeInput}
                onChange={(e) => setEntryTimeInput(e.target.value)}
                className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-200"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[9px] text-slate-400">Playbook</span>
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
            </label>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Plan / BE trigger notes"
            className="w-full rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-200"
          />

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
            const entryFmt = formatEntryTimestamp(tr.openedAt, displayTimezone, timeFormat, now);
            const elapsedText = formatElapsedDuration(tr.openedAt, now);
            const risk = inspectOngoingTradeRisk(tr);
            const newsAlert = getImminentNewsForPair(
              tr.pair,
              events,
              now,
              volatilityThresholdMin || 15,
            );
            const linkedNote = notesList.find((n) => n.ongoingTradeId === tr.id);
            const isEditingRisk = editingRiskId === tr.id;
            return (
              <div
                key={tr.id}
                className={`space-y-1 rounded-md border bg-slate-950/75 p-2 ${
                  risk.severity === 'critical'
                    ? 'border-rose-500/45'
                    : risk.severity === 'warning' || newsAlert
                      ? 'border-amber-500/40'
                      : 'border-slate-800'
                }`}
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
                    {newsAlert && (
                      <span
                        title={newsAlert.message}
                        className="inline-flex items-center gap-0.5 rounded border border-rose-500/45 bg-rose-500/15 px-1 py-0.5 font-mono text-[8px] font-bold text-rose-300"
                      >
                        <Radio className="h-2.5 w-2.5" />
                        NEWS {Math.max(1, Math.round(newsAlert.minutesUntil))}m
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (linkedNote) {
                          triggerEditRequest('note', linkedNote.id);
                        } else {
                          triggerNoteLinkRequest({
                            ongoingTradeId: tr.id,
                            pair: tr.pair,
                            suggestedTitle: `${tr.pair} ${tr.direction.toUpperCase()} Plan`,
                          });
                        }
                      }}
                      title={linkedNote ? `Open linked note: ${linkedNote.title}` : 'Create linked note for this trade'}
                      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] font-medium ${
                        linkedNote
                          ? 'border-blue-500/45 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25'
                          : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <FileText className="h-2.5 w-2.5" />
                      {linkedNote ? 'Note' : '+Note'}
                    </button>
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
                  {tr.stopLoss !== null ? (
                    <span className="text-rose-400">SL: {tr.stopLoss}</span>
                  ) : (
                    <span className="rounded bg-rose-500/15 px-1 text-[9px] font-semibold text-rose-300">
                      SL: —
                    </span>
                  )}
                  {tr.takeProfit !== null ? (
                    <span className="text-emerald-400">TP: {tr.takeProfit}</span>
                  ) : (
                    <span className="rounded bg-amber-500/15 px-1 text-[9px] font-semibold text-amber-300">
                      TP: —
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      isEditingRisk ? setEditingRiskId(null) : startEditingRisk(tr)
                    }
                    title="Edit SL / TP"
                    aria-label={`Edit SL/TP for ${tr.pair}`}
                    className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  {stratName && (
                    <span className="font-sans text-[9px] text-blue-300">• {stratName}</span>
                  )}
                </div>
                {risk.needsAttention && !isEditingRisk && (
                  <div
                    className={`flex items-center justify-between gap-1.5 rounded border px-1.5 py-1 text-[9px] ${
                      risk.severity === 'critical'
                        ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                        : 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                    }`}
                  >
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="truncate">{risk.warningMessage}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => startEditingRisk(tr)}
                      className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 font-semibold text-slate-100 hover:bg-slate-800"
                    >
                      Fix
                    </button>
                  </div>
                )}
                {isEditingRisk && (
                  <form
                    onSubmit={(e) => void handleSaveRisk(e, tr)}
                    className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-1 rounded border border-blue-500/40 bg-slate-900/90 p-1.5"
                  >
                    <input
                      type="number"
                      step="any"
                      aria-label={`Stop Loss for ${tr.pair}`}
                      value={editSlDraft}
                      onChange={(e) => setEditSlDraft(e.target.value)}
                      placeholder="Stop Loss"
                      className="min-w-0 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-100"
                    />
                    <input
                      type="number"
                      step="any"
                      aria-label={`Take Profit for ${tr.pair}`}
                      value={editTpDraft}
                      onChange={(e) => setEditTpDraft(e.target.value)}
                      placeholder="Take Profit"
                      className="min-w-0 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded bg-blue-600 px-2 py-0.5 text-[9px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingRiskId(null)}
                      className="rounded border border-slate-700 px-1.5 py-0.5 text-[9px] text-slate-300 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </form>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                  <span className="inline-flex items-center gap-1" title={`Entered: ${entryFmt.full}`}>
                    <Clock className="h-2.5 w-2.5 text-slate-500" />
                    <span>Entry:</span>
                    <span className="font-mono text-slate-300">{entryFmt.short}</span>
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900/90 px-1.5 py-0.5 font-mono text-[9px] font-medium text-sky-300"
                    title="Time elapsed since entry"
                  >
                    Ran: {elapsedText}
                  </span>
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
