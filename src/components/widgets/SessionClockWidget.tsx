import { Globe2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  formatCountdown,
  formatHmTime,
  NY_ZONE,
} from '../../utils/killzoneEngine';
import {
  getActiveSessionOverlap,
  getCurrentSessions,
  isFxWeekendClosed,
} from '../../utils/sessionEngine';
import { formatZoneClock } from '../../utils/timezone';

interface SessionClockWidgetProps {
  now: DateTime;
}

export function getSessionWidgetBadge(now: DateTime): {
  text: string;
  color: string;
  active: boolean;
} {
  if (isFxWeekendClosed(now)) {
    return { text: 'Closed', color: '#64748b', active: false };
  }
  const sessions = getCurrentSessions(now, NY_ZONE);
  const overlap = getActiveSessionOverlap(sessions);
  if (overlap) {
    return { text: overlap.label.replace(' Peak Overlap', ''), color: overlap.color, active: true };
  }
  const openCount = sessions.filter((s) => s.isOpen).length;
  return {
    text: `${openCount}/4 Open`,
    color: openCount > 0 ? '#3b82f6' : '#64748b',
    active: openCount > 0,
  };
}

export function SessionClockWidget({ now }: SessionClockWidgetProps) {
  const displayTimezone = useSettingsStore((s) => s.settings.displayTimezone);
  const timeFormat = useSettingsStore((s) => s.settings.timeFormat);
  const timelineAxisMode = useSettingsStore((s) => s.settings.timelineAxisMode);

  const axisTimezone = timelineAxisMode === 'local' ? displayTimezone : NY_ZONE;

  const statuses = useMemo(
    () => getCurrentSessions(now, displayTimezone, axisTimezone),
    [now, displayTimezone, axisTimezone],
  );
  const overlap = useMemo(() => getActiveSessionOverlap(statuses), [statuses]);
  const weekend = isFxWeekendClosed(now);

  const axisDayStart = now.setZone(axisTimezone).startOf('day');
  const axisDayEnd = axisDayStart.plus({ days: 1 });
  const nowAxisPct = Math.min(
    100,
    Math.max(
      0,
      ((now.toMillis() - axisDayStart.toMillis()) /
        Math.max(1, axisDayEnd.toMillis() - axisDayStart.toMillis())) *
        100,
    ),
  );

  return (
    <div className="space-y-2.5 text-[11px]">
      {/* Overlap / Status Banner */}
      <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/65 px-2.5 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-slate-300">
          <Globe2 className="h-3.5 w-3.5 text-blue-400" />
          {weekend
            ? 'FX Weekend Break'
            : overlap
              ? overlap.label
              : `${statuses.filter((s) => s.isOpen).length} of 4 Desks Open`}
        </span>
        <span className="font-mono text-[10px] text-slate-500">
          Axis: {timelineAxisMode === 'ny' ? 'NY' : 'Local'}
        </span>
      </div>

      {/* 4 Major Financial Center Clocks */}
      <div className="grid grid-cols-2 gap-1.5">
        {statuses.map((st) => {
          const def = st.definition;
          return (
            <div
              key={def.id}
              className={`rounded-md border p-2 transition-colors ${
                st.isOpen
                  ? 'border-slate-700 bg-slate-950/90'
                  : 'border-slate-800/80 bg-slate-950/40 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: st.isOpen ? def.color : '#475569',
                      boxShadow: st.isOpen ? `0 0 6px ${def.color}` : 'none',
                    }}
                  />
                  <span className="font-semibold text-slate-100">{def.name}</span>
                </div>
                <span className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[9px] text-slate-400">
                  {st.localNow.offsetNameShort}
                </span>
              </div>

              <div className="mt-1 font-mono text-xs font-medium text-slate-100">
                {formatZoneClock(now, def.ianaTimezone, timeFormat)}
              </div>

              <div className="mt-1 flex items-center justify-between text-[9px] text-slate-400">
                <span>
                  {formatHmTime(st.displayOpen, timeFormat)}–
                  {formatHmTime(st.displayClose, timeFormat)}
                </span>
                <span
                  className="font-mono"
                  style={{ color: st.isOpen ? def.color : '#64748b' }}
                >
                  {st.isOpen
                    ? `-${formatCountdown(st.msToClose)}`
                    : `+${formatCountdown(st.msToOpen)}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 24h Session Overlap Matrix */}
      <div className="space-y-1 rounded-md border border-slate-800 bg-slate-950/75 p-2">
        {statuses.map((st) => (
          <div key={st.definition.id} className="flex items-center gap-1.5">
            <span className="w-7 shrink-0 font-mono text-[9px] text-slate-400">
              {st.definition.shortLabel}
            </span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-slate-900">
              {st.axisSegments.map((seg, idx) => (
                <div
                  key={idx}
                  style={{
                    left: `${seg.leftPct}%`,
                    width: `${seg.widthPct}%`,
                    backgroundColor: st.definition.color,
                    opacity: st.isOpen ? 0.9 : 0.4,
                  }}
                  className="absolute top-0 bottom-0 rounded-sm"
                />
              ))}
              <div
                style={{ left: `${nowAxisPct}%` }}
                className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-white/90"
              />
            </div>
          </div>
        ))}
        <div className="flex justify-between pl-8 font-mono text-[9px] text-slate-500">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h}>{String(h).padStart(2, '0')}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
