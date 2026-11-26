import { DateTime } from 'luxon';
import type {
  ActiveKillzone,
  KillzoneDefinition,
  TimelineBarSegment,
} from '../types/time';

export const NY_ZONE = 'America/New_York';

/** Converts Luxon weekday (1=Mon..7=Sun) to Sunday=0..Saturday=6 convention. */
export function toSundayZeroWeekday(dt: DateTime): number {
  return dt.weekday % 7;
}

interface NyCandidateInterval {
  start: DateTime;
  end: DateTime;
}

/**
 * Resolves candidate NY intervals across yesterday, today, and tomorrow so overnight-wrapping
 * killzones (e.g. 20:00-02:00 checked at 01:00 AM) match yesterday's started window cleanly.
 */
export function buildCandidateIntervals(
  kz: KillzoneDefinition,
  nyNow: DateTime,
): NyCandidateInterval[] {
  const nyToday = nyNow.startOf('day');
  const baseDays = [
    nyToday.minus({ days: 1 }),
    nyToday,
    nyToday.plus({ days: 1 }),
  ];

  return baseDays
    .filter((day) => kz.daysActive.includes(toSundayZeroWeekday(day)))
    .map((day) => {
      const start = day.set({
        hour: kz.startHour,
        minute: kz.startMinute,
        second: 0,
        millisecond: 0,
      });
      let end = day.set({
        hour: kz.endHour,
        minute: kz.endMinute,
        second: 0,
        millisecond: 0,
      });
      if (end <= start) {
        end = end.plus({ days: 1 });
      }
      return { start, end };
    });
}

/**
 * Computes active status, countdowns, progress percentage, and user-timezone
 * projections for all enabled Killzone, Silver Bullet, and Macro windows.
 */
export function getCurrentKillzones(
  now: DateTime,
  userTimezone: string,
  zones: KillzoneDefinition[],
): ActiveKillzone[] {
  const nyNow = now.setZone(NY_ZONE);
  const targetZone = DateTime.local().setZone(userTimezone).isValid
    ? userTimezone
    : NY_ZONE;

  return zones
    .filter((kz) => kz.enabled)
    .map((kz) => {
      const candidates = buildCandidateIntervals(kz, nyNow);
      const activeInterval = candidates.find(
        (c) => nyNow >= c.start && nyNow < c.end,
      );
      const nextInterval = candidates.find((c) => c.start > nyNow);

      const reference =
        activeInterval ??
        nextInterval ??
        candidates[0] ?? {
          start: nyNow.startOf('day').set({
            hour: kz.startHour,
            minute: kz.startMinute,
            second: 0,
            millisecond: 0,
          }),
          end: nyNow.startOf('day').set({
            hour: kz.endHour,
            minute: kz.endMinute,
            second: 0,
            millisecond: 0,
          }),
        };

      const isActive = Boolean(activeInterval);
      const totalMs = Math.max(
        1,
        reference.end.toMillis() - reference.start.toMillis(),
      );
      const elapsedMs = isActive
        ? Math.max(0, nyNow.toMillis() - reference.start.toMillis())
        : 0;
      const progressPct = isActive
        ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))
        : 0;

      return {
        ...kz,
        isActive,
        startUtc: reference.start.toUTC(),
        endUtc: reference.end.toUTC(),
        nyStart: reference.start,
        nyEnd: reference.end,
        displayStart: reference.start.setZone(targetZone),
        displayEnd: reference.end.setZone(targetZone),
        msToStart:
          !isActive && nextInterval
            ? Math.max(0, nextInterval.start.toMillis() - nyNow.toMillis())
            : null,
        msToEnd: activeInterval
          ? Math.max(0, activeInterval.end.toMillis() - nyNow.toMillis())
          : null,
        progressPct,
      };
    });
}

export interface NyMidnightInfo {
  todayMidnightNy: DateTime;
  todayMidnightDisplay: DateTime;
  nextMidnightNy: DateTime;
  msToNextMidnight: number;
  /** Marker position across [0..100]% of axisTimezone's current 24h day */
  axisMarkerPct: number;
}

export function getNyMidnightInfo(
  now: DateTime,
  userTimezone: string,
  axisTimezone: string = NY_ZONE,
): NyMidnightInfo {
  const nyNow = now.setZone(NY_ZONE);
  const targetZone = DateTime.local().setZone(userTimezone).isValid
    ? userTimezone
    : NY_ZONE;
  const axisZone = DateTime.local().setZone(axisTimezone).isValid
    ? axisTimezone
    : NY_ZONE;

  const todayMidnightNy = nyNow.startOf('day');
  const nextMidnightNy = todayMidnightNy.plus({ days: 1 });

  const axisDayStart = now.setZone(axisZone).startOf('day');
  const axisDayEnd = axisDayStart.plus({ days: 1 });
  const axisSpanMs = Math.max(1, axisDayEnd.toMillis() - axisDayStart.toMillis());

  // Use today's NY midnight if within axis day, else next NY midnight
  const markerTarget =
    todayMidnightNy.toMillis() >= axisDayStart.toMillis() &&
    todayMidnightNy.toMillis() < axisDayEnd.toMillis()
      ? todayMidnightNy
      : nextMidnightNy;

  const rawPct =
    ((markerTarget.toMillis() - axisDayStart.toMillis()) / axisSpanMs) * 100;
  const axisMarkerPct = Math.min(100, Math.max(0, rawPct));

  return {
    todayMidnightNy,
    todayMidnightDisplay: todayMidnightNy.setZone(targetZone),
    nextMidnightNy,
    msToNextMidnight: Math.max(0, nextMidnightNy.toMillis() - nyNow.toMillis()),
    axisMarkerPct,
  };
}

/**
 * Projects all enabled zones onto the 24-hour bar of `axisTimezone` for the current date,
 * clipping midnight-wrapping intervals seamlessly into visible bar segments.
 */
export function buildTimelineSegments(
  zones: KillzoneDefinition[],
  now: DateTime,
  axisTimezone: string = NY_ZONE,
): { segments: TimelineBarSegment[]; nowMarkerPct: number } {
  const axisZone = DateTime.local().setZone(axisTimezone).isValid
    ? axisTimezone
    : NY_ZONE;
  const nyNow = now.setZone(NY_ZONE);
  const axisNow = now.setZone(axisZone);
  const axisDayStart = axisNow.startOf('day');
  const axisDayEnd = axisDayStart.plus({ days: 1 });
  const axisStartMs = axisDayStart.toMillis();
  const axisEndMs = axisDayEnd.toMillis();
  const axisSpanMs = Math.max(1, axisEndMs - axisStartMs);

  const nowMarkerPct = Math.min(
    100,
    Math.max(0, ((now.toMillis() - axisStartMs) / axisSpanMs) * 100),
  );

  const segments: TimelineBarSegment[] = [];

  for (const kz of zones) {
    if (!kz.enabled) continue;
    const candidates = buildCandidateIntervals(kz, nyNow);

    for (const cand of candidates) {
      const sMs = cand.start.toMillis();
      const eMs = cand.end.toMillis();
      if (eMs <= axisStartMs || sMs >= axisEndMs) continue;

      const clippedStart = Math.max(sMs, axisStartMs);
      const clippedEnd = Math.min(eMs, axisEndMs);
      if (clippedEnd <= clippedStart) continue;

      const isActive =
        nyNow.toMillis() >= sMs && nyNow.toMillis() < eMs;

      segments.push({
        zone: kz,
        leftPct: ((clippedStart - axisStartMs) / axisSpanMs) * 100,
        widthPct: ((clippedEnd - clippedStart) / axisSpanMs) * 100,
        isActive,
      });
    }
  }

  return { segments, nowMarkerPct };
}

export function formatCountdown(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '--';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const secs = totalSec % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return `${days}d ${remH}h`;
  }
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function formatHmTime(dt: DateTime, format: '12h' | '24h'): string {
  if (!dt.isValid) return '--:--';
  return format === '12h' ? dt.toFormat('h:mm a') : dt.toFormat('HH:mm');
}
