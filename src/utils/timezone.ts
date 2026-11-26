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
