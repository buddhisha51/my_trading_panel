import { DateTime } from 'luxon';
import {
  DEFAULT_SESSIONS,
  type SessionDefinition,
  type SessionStatus,
} from '../types/time';
import { NY_ZONE } from './killzoneEngine';

export interface SessionOverlap {
  label: string;
  sessionIds: string[];
  color: string;
}

/**
 * Checks whether the global retail FX market is in its weekend closure window
 * (Friday >= 17:00 NY until Sydney opens on Sunday evening NY).
 * Kept exposed so UI badges can show clear market-closed status alongside individual sessions.
 */
export function isFxWeekendClosed(now: DateTime): boolean {
  const ny = now.setZone(NY_ZONE);
  const minutes = ny.hour * 60 + ny.minute;
  if (ny.weekday === 6) return true; // Saturday NY
  if (ny.weekday === 5 && minutes >= 17 * 60) return true; // Fri >= 17:00 NY
  if (ny.weekday === 7) {
    // Check whether Sydney local market (Mon 08:00 Australia/Sydney) has opened yet
    const sydney = now.setZone('Australia/Sydney');
    const sydMin = sydney.hour * 60 + sydney.minute;
    const sydneyOpenToday = sydney.weekday === 1 && sydMin >= 8 * 60;
    return !sydneyOpenToday;
  }
  return false;
}

function buildSessionCandidates(def: SessionDefinition, now: DateTime) {
  const localNow = now.setZone(def.ianaTimezone);
  const localToday = localNow.startOf('day');
  const candidates: Array<{ start: DateTime; end: DateTime }> = [];

  for (let offset = -1; offset <= 3; offset++) {
    const day = localToday.plus({ days: offset });
    // Trading desks run Monday (1) .. Friday (5) in their local IANA timezone
    if (day.weekday < 1 || day.weekday > 5) continue;

    const start = day.set({
      hour: def.openHour,
      minute: def.openMinute,
      second: 0,
      millisecond: 0,
    });
    let end = day.set({
      hour: def.closeHour,
      minute: def.closeMinute,
      second: 0,
      millisecond: 0,
    });
    if (end <= start) end = end.plus({ days: 1 });
    candidates.push({ start, end });
  }

  return { localNow, candidates };
}

/**
 * Computes live status, true local hours projected into `userTimezone`,
 * and 24h overlap bar segments on `axisTimezone` for Sydney, Tokyo, London & NY.
 */
export function getCurrentSessions(
  now: DateTime,
  userTimezone: string,
  axisTimezone: string = userTimezone,
  definitions: SessionDefinition[] = DEFAULT_SESSIONS,
): SessionStatus[] {
  const targetZone = DateTime.local().setZone(userTimezone).isValid
    ? userTimezone
    : NY_ZONE;
  const axisZone = DateTime.local().setZone(axisTimezone).isValid
    ? axisTimezone
    : NY_ZONE;

  const axisDayStart = now.setZone(axisZone).startOf('day');
  const axisDayEnd = axisDayStart.plus({ days: 1 });
  const axisStartMs = axisDayStart.toMillis();
  const axisEndMs = axisDayEnd.toMillis();
  const axisSpanMs = Math.max(1, axisEndMs - axisStartMs);
  const nowMs = now.toMillis();

  return definitions.map((def) => {
    const { localNow, candidates } = buildSessionCandidates(def, now);
    const active = candidates.find(
      (c) => nowMs >= c.start.toMillis() && nowMs < c.end.toMillis(),
    );
    const next = candidates.find((c) => c.start.toMillis() > nowMs);
    const reference = active ?? next ?? candidates[0];

    const isOpen = Boolean(active);
    const totalMs = reference
      ? Math.max(1, reference.end.toMillis() - reference.start.toMillis())
      : 1;
    const elapsedMs = active ? Math.max(0, nowMs - active.start.toMillis()) : 0;
    const progressPct = isOpen
      ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))
      : 0;

    // Collect 24h axis segments for this session across the reference axis day
    const axisSegments: Array<{ leftPct: number; widthPct: number }> = [];
    for (const c of candidates) {
      const sMs = c.start.toMillis();
      const eMs = c.end.toMillis();
      if (eMs <= axisStartMs || sMs >= axisEndMs) continue;
      const cs = Math.max(sMs, axisStartMs);
      const ce = Math.min(eMs, axisEndMs);
      if (ce > cs) {
        axisSegments.push({
          leftPct: ((cs - axisStartMs) / axisSpanMs) * 100,
          widthPct: ((ce - cs) / axisSpanMs) * 100,
        });
      }
    }

    return {
      definition: def,
      isOpen,
      localNow,
      displayOpen: reference.start.setZone(targetZone),
      displayClose: reference.end.setZone(targetZone),
      nyOpen: reference.start.setZone(NY_ZONE),
      nyClose: reference.end.setZone(NY_ZONE),
      msToOpen: !isOpen && next ? Math.max(0, next.start.toMillis() - nowMs) : null,
      msToClose: active ? Math.max(0, active.end.toMillis() - nowMs) : null,
      progressPct,
      axisSegments,
    };
  });
}

export function getActiveSessionOverlap(statuses: SessionStatus[]): SessionOverlap | null {
  const open = statuses.filter((s) => s.isOpen);
  if (open.length < 2) return null;

  const ids = open.map((s) => s.definition.id);
  if (ids.includes('london') && ids.includes('new_york')) {
    return {
      label: 'London / NY Peak Overlap',
      sessionIds: ['london', 'new_york'],
      color: '#10B981',
    };
  }
  if (ids.includes('tokyo') && ids.includes('london')) {
    return {
      label: 'Tokyo / London Overlap',
      sessionIds: ['tokyo', 'london'],
      color: '#3B82F6',
    };
  }
  if (ids.includes('sydney') && ids.includes('tokyo')) {
    return {
      label: 'Sydney / Tokyo Overlap',
      sessionIds: ['sydney', 'tokyo'],
      color: '#06B6D4',
    };
  }

  return {
    label: `${open.map((s) => s.definition.shortLabel).join(' / ')} Overlap`,
    sessionIds: ids,
    color: open[0].definition.color,
  };
}
