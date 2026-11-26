import { AlertTriangle, CalendarPlus, Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { useMarketStore } from '../../stores/marketStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  SUPPORTED_CALENDAR_CURRENCIES,
  type EventImpact,
} from '../../types/market';
import {
  evaluateFeedResilience,
  expandCalendarTokensToCurrencies,
  formatEventTimes,
  getNextHighImpactEvent,
  getUpcomingHighImpactAlerts,
} from '../../utils/calendarAlerts';
import { formatCountdown } from '../../utils/killzoneEngine';

interface EconomicCalendarWidgetProps {
  now: DateTime;
}

export function EconomicCalendarWidget({ now }: EconomicCalendarWidgetProps) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const events = useMarketStore((s) => s.events);
  const metadata = useMarketStore((s) => s.metadata);
  const syncing = useMarketStore((s) => s.syncing);
  const loadMarketData = useMarketStore((s) => s.loadMarketData);
  const refreshMarketSync = useMarketStore((s) => s.refreshMarketSync);
  const addManualEvent = useMarketStore((s) => s.addManualEvent);
  const deleteManualEvent = useMarketStore((s) => s.deleteManualEvent);

  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualCountry, setManualCountry] = useState('USD');
  const [manualImpact, setManualImpact] = useState<EventImpact>('high');
  const [manualDatetimeLocal, setManualDatetimeLocal] = useState(() =>
    DateTime.local().plus({ hours: 1 }).toFormat("yyyy-MM-dd'T'HH:mm"),
  );
  const [manualForecast, setManualForecast] = useState('');
  const [addingFilter, setAddingFilter] = useState(false);
  const [newFilterText, setNewFilterText] = useState('');
  const [editingFilter, setEditingFilter] = useState<string | null>(null);
  const [editFilterText, setEditFilterText] = useState('');

  const filterOptions = settings.calendarFilterOptions?.length
    ? settings.calendarFilterOptions
    : [...SUPPORTED_CALENDAR_CURRENCIES];

  useEffect(() => {
    void loadMarketData();
  }, [loadMarketData]);

  const filteredEvents = useMemo(() => {
    const curSet = expandCalendarTokensToCurrencies(settings.calendarCurrencies);
    const impSet = new Set(settings.calendarImpacts);
    const nowMs = now.toMillis();

    return events.filter((e) => {
      if (curSet.size > 0 && !curSet.has(e.country.toUpperCase())) return false;
      if (impSet.size > 0 && !impSet.has(e.impact)) return false;
      if (upcomingOnly) {
        const dtMs = DateTime.fromISO(e.eventDatetime, { zone: 'utc' }).toMillis();
        // Keep events from the last 15 minutes + future events
        if (Number.isFinite(dtMs) && dtMs < nowMs - 15 * 60 * 1000) return false;
      }
      return true;
    });
  }, [events, now, settings.calendarCurrencies, settings.calendarImpacts, upcomingOnly]);

  const volatilityAlerts = useMemo(
    () =>
      getUpcomingHighImpactAlerts(
        filteredEvents,
        now,
        settings.volatilityThresholdMin || 15,
      ),
    [filteredEvents, now, settings.volatilityThresholdMin],
  );

  const nextRedFolder = useMemo(
    () => getNextHighImpactEvent(filteredEvents, now),
    [filteredEvents, now],
  );

  const resilience = useMemo(
    () => evaluateFeedResilience(metadata, 'faireconomy', events.length > 0, now),
    [events.length, metadata, now],
  );

  const toggleCurrency = (cur: string) => {
    const exists = settings.calendarCurrencies.includes(cur);
    const next = exists
      ? settings.calendarCurrencies.filter((c) => c !== cur)
      : [...settings.calendarCurrencies, cur];
    void updateSettings({ calendarCurrencies: next });
  };

  const handleAddFilterChip = () => {
    const clean = newFilterText.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    setAddingFilter(false);
    setNewFilterText('');
    if (!clean) return;
    const nextOptions = filterOptions.includes(clean)
      ? filterOptions
      : [...filterOptions, clean];
    const nextActive = settings.calendarCurrencies.includes(clean)
      ? settings.calendarCurrencies
      : [...settings.calendarCurrencies, clean];
    void updateSettings({
      calendarFilterOptions: nextOptions,
      calendarCurrencies: nextActive,
    });
  };

  const handleSaveEditFilter = (oldChip: string) => {
    const clean = editFilterText.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    setEditingFilter(null);
    setEditFilterText('');
    if (!clean || clean === oldChip) return;
    const nextOptions = Array.from(
      new Set(filterOptions.map((item) => (item === oldChip ? clean : item))),
    );
    const nextActive = Array.from(
      new Set(
        settings.calendarCurrencies.map((item) => (item === oldChip ? clean : item)),
      ),
    );
    void updateSettings({
      calendarFilterOptions: nextOptions,
      calendarCurrencies: nextActive,
    });
  };

  const handleRemoveFilterChip = (chip: string) => {
    if (filterOptions.length <= 1) return;
    const nextOptions = filterOptions.filter((item) => item !== chip);
    const nextActive = settings.calendarCurrencies.filter((item) => item !== chip);
    void updateSettings({
      calendarFilterOptions: nextOptions,
      calendarCurrencies: nextActive,
    });
  };

  const toggleImpact = (imp: EventImpact) => {
    const exists = settings.calendarImpacts.includes(imp);
    const next = exists
      ? settings.calendarImpacts.filter((i) => i !== imp)
      : [...settings.calendarImpacts, imp];
    void updateSettings({ calendarImpacts: next });
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    const utcIso =
      DateTime.fromISO(manualDatetimeLocal).toUTC().toISO() ?? new Date().toISOString();
    await addManualEvent({
      title: manualTitle.trim(),
      country: manualCountry,
      eventDatetime: utcIso,
      impact: manualImpact,
      forecast: manualForecast.trim() || null,
      previous: null,
    });
    setManualTitle('');
    setManualForecast('');
    setShowManualForm(false);
  };

  return (
    <div className="space-y-2 text-[11px]">
      {/* Imminent ICT High-Volatility Alert Banner */}
      {volatilityAlerts.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-md border border-rose-500/70 bg-rose-500/15 px-2 py-1.5 text-[10px] font-semibold text-rose-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400 animate-pulse" />
          <span>{volatilityAlerts[0].message}</span>
        </div>
      )}

      {/* Next Red Folder Countdown & Actions */}
      <div className="flex items-center justify-between gap-1.5 rounded-md border border-slate-800 bg-slate-950/75 px-2 py-1.5">
        <div className="min-w-0">
          {nextRedFolder ? (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
              <span className="truncate font-medium text-slate-200">
                {nextRedFolder.event.country}: {nextRedFolder.event.title}
              </span>
              <span className="shrink-0 font-mono text-rose-300">
                in {formatCountdown(nextRedFolder.msUntil)}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-slate-400">No upcoming Red Folder</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            title="Add manual calendar event"
            className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800"
          >
            {showManualForm ? <X className="h-3 w-3" /> : <CalendarPlus className="h-3 w-3" />}
          </button>
          <button
            type="button"
            disabled={syncing}
            onClick={() => void refreshMarketSync(true)}
            title="Refresh backend SQLite calendar cache"
            className="rounded border border-slate-800 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Resilience / Rate-Limit Status Badge */}
      {resilience.label && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
          {resilience.label}
        </div>
      )}

      {/* Manual Event Fallback Form */}
      {showManualForm && (
        <form
          onSubmit={(e) => void handleCreateManual(e)}
          className="space-y-1.5 rounded-md border border-blue-500/35 bg-slate-950/90 p-2"
        >
          <input
            type="text"
            required
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Event title (e.g. FOMC Rate Decision)"
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-100"
          />
          <div className="grid grid-cols-3 gap-1">
            <select
              value={manualCountry}
              onChange={(e) => setManualCountry(e.target.value)}
              className="rounded border border-slate-800 bg-slate-900 px-1 py-1 font-mono text-[10px] text-slate-100"
            >
              {SUPPORTED_CALENDAR_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={manualImpact}
              onChange={(e) => setManualImpact(e.target.value as EventImpact)}
              className="rounded border border-slate-800 bg-slate-900 px-1 py-1 text-[10px] text-slate-100"
            >
              <option value="high">High (Red)</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input
              type="text"
              value={manualForecast}
              onChange={(e) => setManualForecast(e.target.value)}
              placeholder="Forecast"
              className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-100"
            />
          </div>
          <div className="flex gap-1.5">
            <input
              type="datetime-local"
              value={manualDatetimeLocal}
              onChange={(e) => setManualDatetimeLocal(e.target.value)}
              className="flex-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] text-slate-100"
            />
            <button
              type="submit"
              className="rounded bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-500"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {/* Currency / Pair & Impact Filter Chips */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          {filterOptions.map((c) => {
            const active = settings.calendarCurrencies.includes(c);
            const isEditing = editingFilter === c;
            if (isEditing) {
              return (
                <form
                  key={c}
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveEditFilter(c);
                  }}
                  className="inline-flex items-center gap-0.5"
                >
                  <input
                    autoFocus
                    type="text"
                    value={editFilterText}
                    onChange={(e) => setEditFilterText(e.target.value)}
                    onBlur={() => handleSaveEditFilter(c)}
                    className="w-16 rounded border border-blue-500 bg-slate-950 px-1 py-0.5 font-mono text-[9px] uppercase text-slate-100"
                    aria-label={`Edit filter ${c}`}
                  />
                  <button
                    type="submit"
                    className="rounded p-0.5 text-emerald-400 hover:bg-slate-800"
                    title="Save"
                  >
                    <Check className="h-2.5 w-2.5" />
                  </button>
                </form>
              );
            }

            return (
              <div
                key={c}
                className={`inline-flex items-center rounded border font-mono text-[9px] transition-colors ${
                  active
                    ? 'border-blue-500/60 bg-blue-500/20 text-blue-300'
                    : 'border-slate-800 bg-slate-950/50 text-slate-500 hover:text-slate-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleCurrency(c)}
                  onDoubleClick={() => {
                    setEditingFilter(c);
                    setEditFilterText(c);
                  }}
                  title="Click to toggle filter • Double-click to edit"
                  className="px-1.5 py-0.5"
                >
                  {c}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingFilter(c);
                    setEditFilterText(c);
                  }}
                  aria-label={`Edit ${c}`}
                  title={`Edit ${c}`}
                  className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                >
                  <Pencil className="h-2 w-2" />
                </button>
                {filterOptions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFilterChip(c);
                    }}
                    aria-label={`Remove ${c}`}
                    title={`Remove ${c}`}
                    className="mr-0.5 rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                  >
                    <X className="h-2 w-2" />
                  </button>
                )}
              </div>
            );
          })}

          {addingFilter ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddFilterChip();
              }}
              className="inline-flex items-center gap-1"
            >
              <input
                autoFocus
                type="text"
                value={newFilterText}
                onChange={(e) => setNewFilterText(e.target.value)}
                onBlur={handleAddFilterChip}
                placeholder="EURUSD / CNY"
                aria-label="Add currency or pair"
                className="w-24 rounded border border-blue-500 bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-100 placeholder:normal-case"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingFilter(true)}
              title="Add currency or trading pair (e.g. EURUSD, XAUUSD, CNY)"
              aria-label="Add calendar currency or pair"
              className="rounded border border-dashed border-slate-700 px-1.5 py-0.5 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 text-[9px]">
          <div className="flex gap-1">
            {(['high', 'medium', 'low'] as EventImpact[]).map((imp) => {
              const active = settings.calendarImpacts.includes(imp);
              return (
                <button
                  key={imp}
                  type="button"
                  onClick={() => toggleImpact(imp)}
                  className={`rounded border px-1.5 py-0.5 capitalize ${
                    active
                      ? imp === 'high'
                        ? 'border-rose-500/60 bg-rose-500/20 text-rose-300'
                        : imp === 'medium'
                          ? 'border-amber-500/60 bg-amber-500/20 text-amber-300'
                          : 'border-slate-600 bg-slate-800 text-slate-200'
                      : 'border-slate-800 bg-slate-950/50 text-slate-500'
                  }`}
                >
                  {imp === 'high' ? 'Red Folder' : imp}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setUpcomingOnly((v) => !v)}
            className="text-slate-400 hover:text-slate-200"
          >
            {upcomingOnly ? 'Upcoming' : 'All Week'}
          </button>
        </div>
      </div>

      {/* Event Rows */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 px-3 py-3 text-center text-[10px] text-slate-500">
          No matching cached events. Click &ldquo;+&rdquo; to add manual news or sync when online.
        </div>
      ) : (
        <div className="space-y-1">
          {filteredEvents.slice(0, 30).map((ev) => {
            const times = formatEventTimes(
              ev.eventDatetime,
              settings.displayTimezone,
              settings.timeFormat,
            );
            const dotColor =
              ev.impact === 'high'
                ? '#EF4444'
                : ev.impact === 'medium'
                  ? '#F59E0B'
                  : '#64748B';
            return (
              <div
                key={ev.id}
                className="flex items-start justify-between gap-2 rounded border border-slate-800 bg-slate-950/75 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: dotColor }}
                    />
                    <span className="rounded bg-slate-900 px-1 py-0.5 font-mono text-[9px] font-bold text-slate-300">
                      {ev.country}
                    </span>
                    <span className="truncate font-medium text-slate-100" title={ev.title}>
                      {ev.title}
                    </span>
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[9px] text-slate-400">
                    <span>
                      {times.dayLabel} • {times.localLabel}
                    </span>
                    <span className="text-amber-300/80">(NY {times.nyLabel})</span>
                    {ev.forecast && <span>F: {ev.forecast}</span>}
                    {ev.previous && <span>P: {ev.previous}</span>}
                  </div>
                </div>

                {ev.provider === 'manual' && (
                  <button
                    type="button"
                    onClick={() => void deleteManualEvent(ev.id)}
                    className="shrink-0 rounded p-0.5 text-slate-500 hover:text-rose-400"
                    title="Delete manual event"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
