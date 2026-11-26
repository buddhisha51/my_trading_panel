import { Clock3, MoonStar, Sparkles } from 'lucide-react';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ActiveKillzone } from '../../types/time';
import {
  buildTimelineSegments,
  formatCountdown,
  formatHmTime,
  getCurrentKillzones,
  getNyMidnightInfo,
  NY_ZONE,
} from '../../utils/killzoneEngine';
import { isFxWeekendClosed } from '../../utils/sessionEngine';

interface KillzoneTimelineWidgetProps {
  now: DateTime;
}

export function getKillzoneWidgetBadge(
  now: DateTime,
  killzones = useSettingsStore.getState().settings.killzones,
  showSilverBullets = true,
  showMacros = true,
): { text: string; color: string; active: boolean } {
  if (isFxWeekendClosed(now)) {
    return { text: 'Weekend', color: '#64748b', active: false };
  }
  const filtered = killzones.filter(
    (z) =>
      z.kind === 'killzone' ||
      (z.kind === 'silver_bullet' && showSilverBullets) ||
      (z.kind === 'macro' && showMacros),
  );
  const resolved = getCurrentKillzones(now, NY_ZONE, filtered);
  const activePrimary =
    resolved.find((z) => z.isActive && z.kind === 'killzone') ??
    resolved.find((z) => z.isActive);
  if (activePrimary) {
    return {
      text: `${activePrimary.label.split(' ')[0]} • ${formatCountdown(activePrimary.msToEnd)}`,
      color: activePrimary.color,
      active: true,
    };
  }
  const next = resolved
    .filter((z) => z.msToStart !== null)
    .sort((a, b) => (a.msToStart ?? Infinity) - (b.msToStart ?? Infinity))[0];
  if (next) {
    return {
      text: `Next ${formatCountdown(next.msToStart)}`,
      color: '#94a3b8',
      active: false,
    };
  }
  return { text: 'Standby', color: '#64748b', active: false };
}

export function KillzoneTimelineWidget({ now }: KillzoneTimelineWidgetProps) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

  const axisTimezone =
    settings.timelineAxisMode === 'local' ? settings.displayTimezone : NY_ZONE;

  const visibleDefinitions = useMemo(
    () =>
      settings.killzones.filter((z) => {
        if (z.kind === 'silver_bullet' && !settings.showSilverBullets) return false;
        if (z.kind === 'macro' && !settings.showMacros) return false;
        return true;
      }),
    [settings.killzones, settings.showSilverBullets, settings.showMacros],
  );

  const activeZones = useMemo(
    () => getCurrentKillzones(now, settings.displayTimezone, visibleDefinitions),
    [now, settings.displayTimezone, visibleDefinitions],
  );

  const primaryTrackDefs = useMemo(
    () => visibleDefinitions.filter((z) => z.kind === 'killzone'),
    [visibleDefinitions],
  );
  const overlayTrackDefs = useMemo(
    () => visibleDefinitions.filter((z) => z.kind !== 'killzone'),
    [visibleDefinitions],
  );

  const primaryTimeline = useMemo(
    () => buildTimelineSegments(primaryTrackDefs, now, axisTimezone),
    [primaryTrackDefs, now, axisTimezone],
  );
  const overlayTimeline = useMemo(
    () => buildTimelineSegments(overlayTrackDefs, now, axisTimezone),
    [overlayTrackDefs, now, axisTimezone],
  );

  const midnightInfo = useMemo(
    () => getNyMidnightInfo(now, settings.displayTimezone, axisTimezone),
    [now, settings.displayTimezone, axisTimezone],
  );

  const weekend = isFxWeekendClosed(now);

  const activePrimary: ActiveKillzone | undefined = activeZones.find(
    (z) => z.isActive && z.kind === 'killzone',
  );
  const activeOverlays = activeZones.filter(
    (z) => z.isActive && z.kind !== 'killzone',
  );

  const nextUpcoming = useMemo(
    () =>
      activeZones
        .filter((z) => !z.isActive && z.msToStart !== null)
        .sort((a, b) => (a.msToStart ?? Infinity) - (b.msToStart ?? Infinity))
        .slice(0, 4),
    [activeZones],
  );

  const inspectedZone = hoveredZoneId
    ? activeZones.find((z) => z.id === hoveredZoneId) ?? null
    : null;

  const axisHours = [0, 4, 8, 12, 16, 20, 24];

  return (
    <div className="space-y-2.5 text-[11px]">
      {/* Active Window Callout */}
      {weekend ? (
        <div className="flex items-center justify-between rounded-md border border-slate-700/80 bg-slate-950/60 px-2.5 py-1.5 text-slate-400">
          <span>Weekend Market Closure</span>
          <span className="font-mono text-[10px]">
            {nextUpcoming[0] ? `Opens in ${formatCountdown(nextUpcoming[0].msToStart)}` : 'Closed'}
          </span>
        </div>
      ) : activePrimary ? (
        <div
          className="space-y-1.5 rounded-md border px-2.5 py-2"
          style={{
            borderColor: `${activePrimary.color}55`,
            backgroundColor: `${activePrimary.color}14`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full animate-pulse"
                style={{ backgroundColor: activePrimary.color }}
              />
              <span className="truncate font-semibold text-slate-100">
                {activePrimary.label}
              </span>
            </div>
            <span
              className="shrink-0 font-mono text-[10px] font-semibold"
              style={{ color: activePrimary.color }}
            >
              -{formatCountdown(activePrimary.msToEnd)}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${activePrimary.progressPct}%`,
                backgroundColor: activePrimary.color,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>
              NY {formatHmTime(activePrimary.nyStart, settings.timeFormat)}–
              {formatHmTime(activePrimary.nyEnd, settings.timeFormat)}
            </span>
            {settings.displayTimezone !== NY_ZONE && (
              <span>
                Local {formatHmTime(activePrimary.displayStart, settings.timeFormat)}–
                {formatHmTime(activePrimary.displayEnd, settings.timeFormat)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-1.5">
          <span className="text-slate-400">Between Killzones</span>
          {nextUpcoming[0] && (
            <span className="font-mono text-[10px] text-amber-300">
              {nextUpcoming[0].label} in {formatCountdown(nextUpcoming[0].msToStart)}
            </span>
          )}
        </div>
      )}

      {/* Active Silver Bullet / ICT Macro Pills */}
      {!weekend && activeOverlays.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeOverlays.map((ov) => (
            <span
              key={ov.id}
              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                borderColor: `${ov.color}66`,
                backgroundColor: `${ov.color}1F`,
                color: ov.color,
              }}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {ov.label} ({formatCountdown(ov.msToEnd)})
            </span>
          ))}
        </div>
      )}

      {/* Quick Overlay Toggles + Axis Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() =>
              void updateSettings({ showSilverBullets: !settings.showSilverBullets })
            }
            className={`rounded border px-1.5 py-0.5 transition-colors ${
              settings.showSilverBullets
                ? 'border-teal-500/40 bg-teal-500/15 text-teal-300'
                : 'border-slate-800 bg-slate-950/60 text-slate-500'
            }`}
          >
            SB
          </button>
          <button
            type="button"
            onClick={() => void updateSettings({ showMacros: !settings.showMacros })}
            className={`rounded border px-1.5 py-0.5 transition-colors ${
              settings.showMacros
                ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                : 'border-slate-800 bg-slate-950/60 text-slate-500'
            }`}
          >
            Macros
          </button>
          <button
            type="button"
            onClick={() =>
              void updateSettings({ showNyMidnight: !settings.showNyMidnight })
            }
            className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 transition-colors ${
              settings.showNyMidnight
                ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
                : 'border-slate-800 bg-slate-950/60 text-slate-500'
            }`}
          >
            <MoonStar className="h-2.5 w-2.5" />
            00:00
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            void updateSettings({
              timelineAxisMode: settings.timelineAxisMode === 'ny' ? 'local' : 'ny',
            })
          }
          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:border-slate-600"
          title="Switch 24h chart axis between New York and Local timezone"
        >
          <Clock3 className="h-2.5 w-2.5 text-blue-400" />
          {settings.timelineAxisMode === 'ny' ? 'NY Axis' : 'Local Axis'}
        </button>
      </div>

      {/* 24-Hour Interactive Timeline */}
      <div className="space-y-1 rounded-md border border-slate-800 bg-slate-950/75 p-2">
        {/* Killzones Track */}
        <div className="relative h-5 w-full overflow-hidden rounded bg-slate-900">
          {primaryTimeline.segments.map((seg, i) => (
            <div
              key={`${seg.zone.id}-${i}`}
              onMouseEnter={() => setHoveredZoneId(seg.zone.id)}
              onMouseLeave={() => setHoveredZoneId(null)}
              title={`${seg.zone.label} (NY ${String(seg.zone.startHour).padStart(2, '0')}:${String(seg.zone.startMinute).padStart(2, '0')}–${String(seg.zone.endHour).padStart(2, '0')}:${String(seg.zone.endMinute).padStart(2, '0')})`}
              style={{
                left: `${seg.leftPct}%`,
                width: `${seg.widthPct}%`,
                backgroundColor: seg.zone.color,
                opacity: seg.isActive ? 0.95 : 0.45,
              }}
              className={`absolute top-0.5 bottom-0.5 rounded-sm transition-opacity ${
                seg.isActive ? 'ring-1 ring-white/80' : 'hover:opacity-80'
              }`}
            />
          ))}

          {/* NY Midnight vertical line */}
          {settings.showNyMidnight && (
            <div
              title={`NY Midnight Open (Local ${formatHmTime(midnightInfo.todayMidnightDisplay, settings.timeFormat)})`}
              style={{ left: `${midnightInfo.axisMarkerPct}%` }}
              className="pointer-events-none absolute top-0 bottom-0 w-px border-l border-dashed border-violet-400/90"
            />
          )}

          {/* Live Current Time Cursor */}
          <div
            style={{ left: `${primaryTimeline.nowMarkerPct}%` }}
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-white shadow-[0_0_6px_#fff]"
          />
        </div>

        {/* Silver Bullet & Macro Track */}
        {(settings.showSilverBullets || settings.showMacros) && (
          <div className="relative h-2.5 w-full overflow-hidden rounded bg-slate-900/90">
            {overlayTimeline.segments.map((seg, i) => (
              <div
                key={`${seg.zone.id}-ov-${i}`}
                onMouseEnter={() => setHoveredZoneId(seg.zone.id)}
                onMouseLeave={() => setHoveredZoneId(null)}
                title={seg.zone.label}
                style={{
                  left: `${seg.leftPct}%`,
                  width: `${Math.max(1.2, seg.widthPct)}%`,
                  backgroundColor: seg.zone.color,
                  opacity: seg.isActive ? 1 : 0.6,
                }}
                className="absolute top-0 bottom-0 rounded-[1px]"
              />
            ))}
            <div
              style={{ left: `${primaryTimeline.nowMarkerPct}%` }}
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-white/80"
            />
          </div>
        )}

        {/* Hour Ticks */}
        <div className="flex justify-between font-mono text-[9px] text-slate-500">
          {axisHours.map((h) => (
            <span key={h}>{String(h).padStart(2, '0')}</span>
          ))}
        </div>

        {inspectedZone && (
          <div className="flex items-center justify-between border-t border-slate-800/80 pt-1 text-[10px]">
            <span className="font-medium text-slate-200">{inspectedZone.label}</span>
            <span className="font-mono text-slate-400">
              {formatHmTime(inspectedZone.displayStart, settings.timeFormat)}–
              {formatHmTime(inspectedZone.displayEnd, settings.timeFormat)}
            </span>
          </div>
        )}
      </div>

      {/* NY Midnight + Next Windows */}
      {settings.showNyMidnight && (
        <div className="flex items-center justify-between px-0.5 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <MoonStar className="h-3 w-3 text-violet-400" />
            NY Midnight Open ({formatHmTime(midnightInfo.todayMidnightDisplay, settings.timeFormat)} local)
          </span>
          <span className="font-mono text-violet-300">
            in {formatCountdown(midnightInfo.msToNextMidnight)}
          </span>
        </div>
      )}

      {nextUpcoming.length > 0 && (
        <div className="space-y-1 border-t border-slate-800/70 pt-1.5">
          {nextUpcoming.slice(0, 3).map((kz) => (
            <div
              key={kz.id}
              className="flex items-center justify-between text-[10px] text-slate-300"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: kz.color }}
                />
                <span className="truncate">{kz.label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 font-mono text-slate-400">
                <span>{formatHmTime(kz.displayStart, settings.timeFormat)}</span>
                <span className="text-slate-500">in {formatCountdown(kz.msToStart)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
