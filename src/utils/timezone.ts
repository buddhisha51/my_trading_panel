import { DateTime } from 'luxon';
import type { StatusIndicatorMode, TimeFormat } from '../types/settings';
import { DEFAULT_ALL_KILLZONES, type KillzoneDefinition } from '../types/time';
import { getCurrentKillzones, NY_ZONE } from './killzoneEngine';
import { getActiveSessionOverlap, getCurrentSessions, isFxWeekendClosed } from './sessionEngine';

export const NY_TIMEZONE = NY_ZONE;

export interface StatusLight {
  label: string;
  color: string;
  isActive: boolean;
}

export function formatZoneClock(
  now: DateTime,
  timezone: string,
  format: TimeFormat,
): string {
  const dt = now.setZone(timezone);
  if (!dt.isValid) return '--:--:--';
  return format === '12h' ? dt.toFormat('hh:mm:ss a') : dt.toFormat('HH:mm:ss');
}

export function getZoneAbbreviation(now: DateTime, timezone: string): string {
  const dt = now.setZone(timezone);
  if (!dt.isValid) return timezone;
  return `${dt.offsetNameShort ?? ''} (UTC${dt.toFormat('ZZ')})`;
}

/**
 * Computes the live indicator dot/pill for EdgeStrip and PanelContainer header,
 * reading live from the DST-aware Killzone & Session engines and custom user config.
 */
export function getStatusIndicatorLight(
  now: DateTime,
  mode: StatusIndicatorMode,
  zones: KillzoneDefinition[] = DEFAULT_ALL_KILLZONES,
): StatusLight {
  if (mode === 'none') {
    return { label: 'Indicator hidden', color: '#64748b', isActive: false };
  }

  if (isFxWeekendClosed(now)) {
    return { label: 'Market Closed (Weekend)', color: '#475569', isActive: false };
  }

  if (mode === 'killzone') {
    const active = getCurrentKillzones(now, NY_TIMEZONE, zones).filter((z) => z.isActive);
    const primary =
      active.find((z) => z.kind === 'killzone') ??
      active.find((z) => z.kind === 'silver_bullet') ??
      active[0];

    if (primary) {
      const startStr = `${String(primary.startHour).padStart(2, '0')}:${String(primary.startMinute).padStart(2, '0')}`;
      const endStr = `${String(primary.endHour).padStart(2, '0')}:${String(primary.endMinute).padStart(2, '0')}`;
      return {
        label: `${primary.label} (NY ${startStr}–${endStr})`,
        color: primary.color,
        isActive: true,
      };
    }

    return { label: 'Between Killzones', color: '#64748b', isActive: false };
  }

  const sessions = getCurrentSessions(now, NY_TIMEZONE);
  const overlap = getActiveSessionOverlap(sessions);
  if (overlap) {
    return { label: overlap.label, color: overlap.color, isActive: true };
  }
  const open = sessions.find((s) => s.isOpen);
  if (open) {
    return {
      label: `${open.definition.name} Session Active`,
      color: open.definition.color,
      isActive: true,
    };
  }
  return { label: 'Between FX Sessions', color: '#64748b', isActive: false };
}

/**
 * Parses either an ISO-8601 UTC timestamp (e.g. `2026-11-27T09:40:12.000Z`)
 * or a SQLite `datetime('now')` UTC string (e.g. `2026-11-27 09:40:12`).
 */
export function parseUtcTimestamp(raw: string | null | undefined): DateTime | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const iso = DateTime.fromISO(trimmed, { zone: 'utc' });
  if (iso.isValid) return iso;
  const sql = DateTime.fromSQL(trimmed, { zone: 'utc' });
  return sql.isValid ? sql : null;
}

/** Formats a UTC trade entry timestamp in the user's configured timezone and 12h/24h format. */
export function formatEntryTimestamp(
  raw: string | null | undefined,
  timezone: string,
  format: TimeFormat,
  now: DateTime = DateTime.utc(),
): { short: string; full: string } {
  const dt = parseUtcTimestamp(raw);
  if (!dt) return { short: '--', full: '--' };

  const localDt = dt.setZone(timezone);
  const resolvedDt = localDt.isValid ? localDt : dt.toLocal();
  const localNow = now.setZone(resolvedDt.zoneName ?? 'local');
  const sameDay = resolvedDt.hasSame(localNow, 'day');

  const full =
    format === '12h'
      ? resolvedDt.toFormat('MMM dd, hh:mm:ss a')
      : resolvedDt.toFormat('MMM dd, HH:mm:ss');

  const short = sameDay
    ? format === '12h'
      ? resolvedDt.toFormat('hh:mm a')
      : resolvedDt.toFormat('HH:mm')
    : format === '12h'
      ? resolvedDt.toFormat('MMM dd hh:mm a')
      : resolvedDt.toFormat('MMM dd HH:mm');

  return { short, full };
}

/** Formats the elapsed duration a trade has been running since `openedAtRaw`. */
export function formatElapsedDuration(
  openedAtRaw: string | null | undefined,
  now: DateTime = DateTime.utc(),
): string {
  const dt = parseUtcTimestamp(openedAtRaw);
  if (!dt) return '--';

  const totalSec = Math.max(0, Math.floor((now.toMillis() - dt.toMillis()) / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

/** Converts an instant to `yyyy-MM-dd'T'HH:mm` in the requested timezone for `<input type="datetime-local">`. */
export function toZoneDateTimeLocalInput(dt: DateTime, timezone: string): string {
  const zoned = dt.setZone(timezone);
  const resolved = zoned.isValid ? zoned : dt.toLocal();
  return resolved.toFormat("yyyy-MM-dd'T'HH:mm");
}
